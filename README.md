# True Brainrot

A side panel for X and Instagram that slides in while Claude works on a long task, and steps
aside with a chime the moment Claude finishes or needs your permission. It only ever appears
beside Claude: switch to another app, minimise Claude or close it, and the panel goes too.

## Install

1. Download the installer from the [latest release](https://github.com/Yashh015/True-brainrot/releases/latest)
   and run it. It starts with Windows from then on.
2. In Claude Code, add the plugin that tells the app what Claude is doing:

   ```
   /plugin marketplace add Yashh015/True-brainrot
   /plugin install true-brainrot@true-brainrot
   ```

3. Log in to X and Instagram once inside the panel. Use a username and password:
   "Sign in with Google" refuses embedded browsers.
4. Turn off the Claude app's own notification sound, or you'll hear two chimes.

Size: about 116 MB to download and 360 MB installed, nearly all of it the built-in Chromium
that shows the feeds. Installs for your Windows account only and never asks for admin rights.
If Windows Firewall asks about True Brainrot, press Cancel: it needs no access from the network.

Windows only for now: the app follows Claude's window through Windows itself, and the
plugin's hooks run through `cmd`.

## Keys

| Key | Does |
|---|---|
| Ctrl+Q | Open or close the panel yourself |
| Ctrl+Alt+F | Pause the companion for focused work, and resume |
| Ctrl + wheel, Ctrl+= / Ctrl+- | Zoom the feed in or out; X and Instagram each remember their own |
| Ctrl+0 | Back to 100% (or click the % in the bar) |

Drag the panel's left edge to make it wider or narrower; it remembers that too.

## What it can and can't see

- The plugin sends one word to the app on your own PC (`127.0.0.1`): `prompt`, `stop`,
  `attention` or `end`. Nothing about your prompts or code is sent, and nothing leaves your PC.
- The app is told by Windows which window is in front. It never reads keystrokes or the screen.
- Your password is never stored. Only the login session is kept, encrypted with a key Windows
  ties to your Windows account, so it is useless if copied to another account or PC.
- The feed gets no camera, microphone, location, notification or clipboard access.
- The panel only ever shows X, Instagram and their sign-in pages. Any other link opens in your
  normal browser, so no other site runs with your logins.

## Develop

```
npm ci
npm test
npm start
```
