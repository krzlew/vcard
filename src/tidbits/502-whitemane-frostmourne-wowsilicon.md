---
layout: layouts/tidbit.njk
pageNumber: P502
extensionText: "502: WOWSILICON FROSTMOURNE SETUP"
title: Running Whitemane Frostmourne WotLK on Apple Silicon via WoWSilicon
number: 502
date: 2026-09-19
updated: 2026-09-19
summary: Whitemane's macOS client for the new Frostmourne Rebuffed WotLK server just downloads the Windows binary - here's running that binary through WoWSilicon (Wine + Metal translation) instead.
permalink: /tidbits/whitemane-frostmourne-wowsilicon/
---
Whitemane's newsletter announced [Frostmourne](https://frostmourne.whitemane.gg/en), a remastered/rebuffed WotLK private server, with a dedicated macOS client. That macOS client turns out to just download the Windows binary - so on Apple Silicon it still needs a Windows-compatibility layer underneath. [WoWSilicon](https://wowsilicon.github.io/) ([GitHub](https://github.com/chambefc/wowsilicon)) handles that via Wine plus Metal translation.

*Guide originally shared by danysahne8012 on the Whitemane Discord `#support` channel; updated here with the config that actually worked for me.*

## WHAT YOU NEED

- Apple Silicon Mac (M1/M2/M3/M4)
- macOS
- Whitemane WotLK Rebuffed client
- [WoWSilicon](https://wowsilicon.github.io/)

You don't need to install the normal Battle.net launcher.

## SETUP

### 1. Install the Whitemane client

```bash
curl -fSL https://get.whitemane.gg/mac | bash
```

Install/download the Whitemane Frostmourne Rebuffed client normally. You should end up with a folder containing:

```text
FrostmourneRebuffed/
├── Data/
├── WTF/
├── Battle.net.dll
├── DivxDecoder.dll
├── rebuffed.dll
├── Wow.exe
├── WowError.exe
└── realmlist.wtf
```

The important file is `Wow.exe` - that's the actual WoW client.

### 2. Check the realmlist

Inside the client folder, open `realmlist.wtf`. For Whitemane it should contain:

```text
set realmlist auth.gamefreedom.org
set patchlist auth.gamefreedom.org
```

Don't change this unless Whitemane has provided a different server address.

### 3. Install WoWSilicon

Download and install WoWSilicon from [wowsilicon.github.io](https://wowsilicon.github.io/). If macOS refuses to open it (unidentified developer / "damaged" app), clear the quarantine attribute Gatekeeper adds to downloaded apps:

```bash
xattr -cr "/Applications/WoWSilicon.app"
```

Create the AddOns folder before first launch - WoWSilicon may complain if it doesn't exist:

```bash
mkdir -p "/Users/YOUR_USERNAME/Library/Games/Whitemane/FrostmourneRebuffed/Interface/AddOns"
```

Open WoWSilicon and create/select a WoW profile pointing to your client folder:

```text
/Users/YOUR_USERNAME/Library/Games/Whitemane/FrostmourneRebuffed
```

When it asks for the WoW executable, select `Wow.exe`. It may appear hidden - press `Cmd + Shift + .` to toggle hidden files, or use `Cmd + Shift + G` and paste the path to your client folder.

### 4. Patch the client

WoWSilicon may ask to patch the WoW client before launching - let it do this. Recommended: keep a backup of the original client before experimenting (`FrostmourneRebuffed` / `FrostmourneRebuffed-Backup`).

### 5. Use the Metal / MTLD3D renderer

The game may initially launch to a black screen with music and a cursor. In WoWSilicon settings, ensure:

- Graphics Backend: `MTLD3D` (not `DXVK`)
- HDR Mode: `true`
- Window Mode: fullscreen (or windowed for testing)

The Metal renderer is what makes the client work properly on Apple Silicon.

### 6. Don't manually add rebuffed.dll

The Rebuffed client already ships `rebuffed.dll` - you don't need to add DLLs manually to WoWSilicon's Mods folder. The Whitemane client loads its own `rebuffed.dll` along with custom files/MPQs. To verify it's loading:

```bash
pgrep -fl Wow.exe
lsof -p <WOW_PID> | grep -i rebuffed
```

You should see `rebuffed.dll` loaded by the WoW process.

### 7. Set your resolution

Close WoW first, then edit `WTF/Config.wtf`:

```bash
cp "/Users/YOUR_USERNAME/Library/Games/Whitemane/FrostmourneRebuffed/WTF/Config.wtf" \
   "/Users/YOUR_USERNAME/Library/Games/Whitemane/FrostmourneRebuffed/WTF/Config.wtf.backup"
```

Example for 2016x1310 windowed (2/3 of a 3024x1964 Retina panel, keeps the native aspect ratio):

```text
SET gxResolution "2016x1310"
SET gxWindow "1"
SET gxMaximize "0"
```

Once working, experiment with fullscreen/maximized.

### 8. Audio

If you get weird audio behavior, disable extra processing in WoWSilicon settings or via environment variables:

```text
WOWSILICON_SPATIAL_AUDIO_MODE=off
WOWSILICON_NORMALIZE_AUDIO=0
```

If audio already works, don't change anything.

## TROUBLESHOOTING

- **"Could not load kernel32.dll", game won't launch** - the Wine prefix (`~/WoWSilicon`) is corrupted. Quit WoWSilicon, kill any lingering Wine processes, delete `~/WoWSilicon`, and restart WoWSilicon to recreate it: `osascript -e 'tell application "WoWSilicon" to quit'; pkill -9 wineserver 2>/dev/null || true; pkill -9 -f "wine.*x86" 2>/dev/null || true; rm -rf ~/WoWSilicon; open -a WoWSilicon`
- **Black screen with music/cursor** - check that Graphics Backend is `MTLD3D` (not `DXVK`) in WoWSilicon, try windowed mode first (`SET gxWindow "1"` in `Config.wtf`), and confirm HDR mode is enabled.
- **ERROR #132 crash (ACCESS_VIOLATION in wined3d.dll)** - the game is using Wine's D3D implementation instead of Metal. Delete `dxvk.conf` from the client folder if present, verify Graphics Backend is `MTLD3D`, and launch `Wow.exe` directly rather than a manually patched copy.

## HOW IT WORKS

```text
Whitemane Rebuffed
        ⬇
     Wow.exe
        ⬇
   WoWSilicon
        ⬇
      Wine
        ⬇
 Rosetta / Apple Silicon
        ⬇
   Metal / MTLD3D
        ⬇
     macOS GPU
```

The important thing: you're running the actual WotLK 3.3.5a Windows client through WoWSilicon's Metal translation, not trying to get the Whitemane launcher itself working natively on macOS.

## NOTES

- Don't launch `Wow.exe` directly - always launch through the WoWSilicon app.
- If you renamed `Wow.exe` to something else (like `wow-patched.exe`), WoWSilicon may not patch/launch it correctly. Use the original `Wow.exe` and let WoWSilicon handle patching.
- The Wine prefix lives at `~/WoWSilicon`. If the game stops launching entirely, delete this folder and let WoWSilicon recreate it.
- Make sure no other Wine implementations (CrossOver, Homebrew Wine, etc.) are running simultaneously - they can interfere.
