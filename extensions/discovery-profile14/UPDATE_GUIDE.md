# Updating FleetBridge without reinstalling the ZIP

Chrome supports a stable **unpacked-extension folder**. Installing from that
folder once preserves the extension identity across normal **Reload** actions.
Candidate records remain in Chrome's local IndexedDB; reloading does not erase
them. Keep normal exports/backups before making structural changes.

## One-time setup

1. Find the **current installed unpacked extension folder** in Chrome extension
   details (or the exact folder you used with **Load unpacked**).
2. Export a **Backup JSON** from your existing Workspace before updating.
3. Extract `FleetBridge_Discovery_v1.4.3.zip` to a temporary source folder. The `manifest.json` must be at the root of that extracted directory.
4. In PowerShell, from the extracted source folder, run:

   ```powershell
   Clear-Host
   .\Update-FleetBridge.ps1 -SourceFolder (Get-Location).Path -InstallFolder 'C:\REPLACE\WITH\EXISTING\EXTENSION\FOLDER'
   ```

5. Click **Reload** (circular-arrow) on the **existing** unpacked extension
   in `chrome://extensions`. Do not remove it or click **Load unpacked** again.

For Tarek's current setup, the installed directory was reported as
`C:\Users\tarek\Downloads\FleetBridge_Discovery_v1.4.0`, but its internal
manifest was subsequently updated to v1.4.1 (and may now be v1.4.2). The folder name does *not* need
to change for v1.4.3. Confirm Chrome still uses that same directory in its
extension details before updating.

The v1.4.3 updater is designed for Windows PowerShell 5.1 (the non-ASCII
text that caused the earlier unterminated-quote parser failure was removed).
It checks both extension names, saves an automatic timestamped backup of the
program files it is about to overwrite outside the Chrome extension folder,
copies the new files including the updater itself, and verifies the version.
It does not touch Chrome's IndexedDB. Keep a separate **Backup JSON** as well.

The path matters: an unpacked extension installed from a *different* folder
may get a *different extension ID*, so it will not see the old local database.
If you decide to move the extension to a permanent path, export JSON first,
install the new folder once, then **Restore** in the new Workspace.

## Updating later

For a source folder with newer files, run the same PowerShell command, naming
the same existing installation folder. It overwrites program files only,
**not local candidate storage**. Then click
the extension's **Reload** (circular-arrow) button in `chrome://extensions`.
Do not remove and reinstall the extension.

## No more ZIP deliveries (after a one-time Git setup)

Publish the **extension source** in a Git repository you control (separate
from any private candidate database). The installed folder must be a Git
checkout of that repository; after this one-time setup, run:

```powershell
Clear-Host
git -C 'C:\REPLACE\WITH\EXISTING\EXTENSION\FOLDER' pull --ff-only
Start-Process 'chrome://extensions/'
```

Click **Reload**. The extension cannot silently install code from ChatGPT or
an arbitrary website. Fully automatic code updates require distribution by
the Chrome Web Store (or approved managed-browser mechanisms). The ZIP in this
release is only a bootstrap and backup until a source repository is connected.

Do not commit your Chrome profile, stored candidates, exported CSV/JSON,
credentials or recruiting notes to a public Git repository.
