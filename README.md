# Scroll Companion

A side panel for X and Instagram that slides in while Claude works on a long task, and steps
aside with a chime the moment Claude finishes or needs your permission. It only ever appears
beside Claude: switch to another app, minimise Claude or close it, and the panel goes too.

## Install

1. Install the Scroll Companion app and start it. It starts with Windows from then on.
2. In Claude Code, add the plugin that tells the app what Claude is doing:

   ```
   /plugin marketplace add <owner>/scroll-companion
   /plugin install scroll-companion@scroll-companion
   ```

3. Log in to X and Instagram once inside the panel. Use a username and password:
   "Sign in with Google" refuses embedded browsers.
4. Turn off the Claude app's own notification sound, or you'll hear two chimes.

Windows only for now: the app follows Claude's window through Windows itself, and the
plugin's hooks run through `cmd`.

## Keys

| Key | Does |
|---|---|
| Ctrl+Q | Open or close the panel yourself |
| Ctrl+Alt+F | Pause the companion for focused work, and resume |

## What it can and can't see

- The plugin sends one word to the app on your own PC (`127.0.0.1`): `prompt`, `stop`,
  `attention` or `end`. Nothing about your prompts or code is sent, and nothing leaves your PC.
- The app is told by Windows which window is in front. It never reads keystrokes or the screen.
- Your X and Instagram logins stay in the app's own browser profile on your PC.
- The feed gets no camera, microphone, location, notification or clipboard access.
- The panel only ever shows X, Instagram and their sign-in pages. Any other link opens in your
  normal browser, so no other site runs with your logins.

## Develop

```
npm ci
npm test
npm start
```
