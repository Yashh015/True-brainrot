# Releasing True Brainrot

## What a user does (about 2 minutes)

1. Download `True Brainrot Setup x.y.z.exe` from
   https://github.com/Yashh015/True-brainrot/releases/latest and run it.
   It installs for their account only, with no admin prompt, and opens beside Claude.
2. In Claude Code, run these, one at a time:
   ```
   /plugin marketplace add Yashh015/True-brainrot
   /plugin install true-brainrot@true-brainrot
   ```
3. Log in to X and Instagram once in the panel. Done: from now on the app starts with Windows
   and shows up only while Claude is working.

Uninstall from Settings → Apps. That removes the app, its startup entry and the saved logins.

## What we do for each release

1. Bump `version` in `package.json` (for example 0.1.0 → 0.2.0) and commit.
2. `npm ci && npm test`, then `npm run dist`.
3. Install `dist\True Brainrot Setup x.y.z.exe` on this PC and check the panel beside Claude.
4. Tag and publish:
   ```
   git tag vx.y.z
   git push origin main vx.y.z
   gh release create vx.y.z "dist/True Brainrot Setup x.y.z.exe" --title "True Brainrot x.y.z" --notes "What changed"
   ```

## Screens Windows may show on first run

- **"Windows protected your PC" (SmartScreen):** shown because the installer isn't code-signed.
  Users click **More info → Run anyway**. Say this in the release notes. To remove it, sign the
  build with Azure Trusted Signing (a monthly fee; needs a verified organisation or individual
  identity). electron-builder signs with it once `win.azureSignOptions` is set in `package.json`.
- **Windows Firewall "allow access" dialog:** the app needs no inbound network access (its only
  listener is `127.0.0.1`, which the firewall doesn't cover), so users can press Cancel.

## Not done yet

- Auto-update: users download each new version by hand. Add `electron-updater` once there are
  regular releases.
- Mac/Linux: the window-following code is Windows-only.
