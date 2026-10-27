// Tells the panel, the instant it happens, whether Claude's window is the one in front.
// Windows pushes the events (SetWinEventHook, the accessibility hook window tools use):
// no polling, no helper process, and it only ever hears which window moved, never keys
// or screen contents.
const koffi = require('koffi')

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')
const dwmapi = koffi.load('dwmapi.dll')

const WinEventProc = koffi.proto('void __stdcall WinEventProc(void *hook, uint32 event, void *hwnd, long idObject, long idChild, uint32 thread, uint32 time)')
const SetWinEventHook = user32.func('void * __stdcall SetWinEventHook(uint32 min, uint32 max, void *mod, WinEventProc *proc, uint32 pid, uint32 thread, uint32 flags)')
const UnhookWinEvent = user32.func('bool __stdcall UnhookWinEvent(void *hook)')
const GetForegroundWindow = user32.func('void * __stdcall GetForegroundWindow()')
const GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32 *pid)')
const OpenProcess = kernel32.func('void * __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)')
const QueryFullProcessImageNameW = kernel32.func('bool __stdcall QueryFullProcessImageNameW(void *process, uint32 flags, void *name, _Inout_ uint32 *size)')
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void *handle)')
const DwmSetWindowAttribute = dwmapi.func('int32 __stdcall DwmSetWindowAttribute(intptr hwnd, uint32 attr, _In_ int32 *value, uint32 size)')
const DWMWA_TRANSITIONS_FORCEDISABLED = 3

const EVENT_SYSTEM_FOREGROUND = 0x0003
const EVENT_SYSTEM_MINIMIZESTART = 0x0016
const EVENT_SYSTEM_MINIMIZEEND = 0x0017
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

function ownerPid(hwnd) {
  const pid = [0]
  GetWindowThreadProcessId(hwnd, pid)
  return pid[0]
}

function exePath(pid) {
  const proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
  if (!proc) return ''
  const buf = Buffer.alloc(1024)
  const size = [buf.length / 2]
  const ok = QueryFullProcessImageNameW(proc, 0, buf, size)
  CloseHandle(proc)
  return ok ? buf.toString('utf16le', 0, size[0] * 2) : ''
}

// The desktop app is Claude.exe; the CLI it runs is also claude.exe, under a claude-code folder.
const isClaudeApp = path => /\\claude\.exe$/i.test(path) && !/\\claude-code\\/i.test(path)

// onChange(true) when Claude or this panel is in front, onChange(false) when anything else is.
// Returns a stop function.
function watchClaude(onChange) {
  const claudePids = new Map() // ponytail: pids are cached forever; a reused pid could misjudge until restart
  const isClaude = pid => {
    if (!claudePids.has(pid)) claudePids.set(pid, isClaudeApp(exePath(pid)))
    return claudePids.get(pid)
  }
  const ours = hwnd => {
    const pid = ownerPid(hwnd)
    return pid === process.pid || isClaude(pid)
  }

  // Every switch is reported, repeats included: opening the panel by hand over another app
  // means the next switch away must still reach the panel. setPresent skips true repeats.
  const report = onChange

  const callback = koffi.register((hook, event, hwnd, idObject) => {
    if (idObject !== 0) return // OBJID_WINDOW only: the window itself, not a control inside it
    if (event === EVENT_SYSTEM_FOREGROUND) report(ours(hwnd))
    // A minimise can leave no window in front, so no foreground event follows: catch it directly.
    else if (event === EVENT_SYSTEM_MINIMIZESTART && isClaude(ownerPid(hwnd))) report(false)
    else if (event === EVENT_SYSTEM_MINIMIZEEND && isClaude(ownerPid(hwnd))) report(true)
  }, koffi.pointer(WinEventProc))

  // Out-of-context (flags 0): Windows queues the events onto this thread's message loop,
  // which Electron's main thread already runs. Nothing is injected into other apps.
  const hooks = [
    SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, null, callback, 0, 0, 0),
    SetWinEventHook(EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND, null, callback, 0, 0, 0),
  ]

  report(ours(GetForegroundWindow()))

  return () => {
    hooks.forEach(h => UnhookWinEvent(h))
    koffi.unregister(callback)
  }
}

// Windows fades a window out when it hides; for a panel that should step aside the instant
// Claude leaves, that fade reads as lag. `handle` is Electron's getNativeWindowHandle() buffer.
function noFade(handle) {
  const hwnd = Number(handle.length === 8 ? handle.readBigUInt64LE() : handle.readUInt32LE())
  return DwmSetWindowAttribute(hwnd, DWMWA_TRANSITIONS_FORCEDISABLED, [1], 4) === 0
}

module.exports = { watchClaude, isClaudeApp, noFade }
