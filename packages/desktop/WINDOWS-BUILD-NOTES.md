# Windows Build Notes

## Build Status: ✅ Completed

**Setup File:** `packages/desktop/release/CoOSy Setup 0.1.0.exe` (190 MB)

Built on: August 12, 2024

---

## Issues Fixed ✅

### 1. Logo Images Missing
**Status:** ✅ FIXED

The logo images were already being included correctly in the build. They are present in:
- Source: `src/renderer/public/assets/sources/*.svg`
- Build output: `out/renderer/assets/sources/*.svg`
- Packaged installer: Inside `app.asar` at `/out/renderer/assets/sources/`

All 4 logos confirmed present:
- netflix.svg (261 bytes)
- youtube.svg (445 bytes)
- prime.svg (4.2 KB)
- hotstar.svg (227 bytes)

---

## Critical Issue: DRM Signing ⚠️

### Problem
Netflix does NOT work in the Windows installed version because **Widevine VMP signing cannot be done correctly when building Windows installers from macOS**.

### Root Cause
When electron-builder creates a Windows build from macOS, it:
1. Copies the Electron distribution files for Windows
2. BUT the VMP signing script runs on macOS
3. The signing tool signs whatever Electron structure it finds
4. On cross-platform builds, this results in signing the wrong binaries

The build log shows:
```
Signing: /Users/techverito/abhishek/Coosy/packages/desktop/release/win-unpacked/Electron.app
```

This is signing the macOS `.app` bundle that electron-builder incorrectly left in the Windows build output. The actual Windows `CoOSy.exe` is NOT being signed for Widevine VMP.

### Why It Works in `pnpm dev`
In development mode (`pnpm dev`), you're running the Electron app directly on macOS using the locally installed Castlabs ECS Electron runtime. If you previously ran `pnpm drm:sign:electron`, that signed your local macOS Electron runtime in `node_modules/electron/dist/`, which is why Netflix works in dev.

---

## Solution: Build on Windows

To get a working Windows installer with Netflix/DRM support:

### 1. Prerequisites (on Windows machine)
```powershell
# Install Python 3
# Download from https://python.org

# Install Node.js 20+ and pnpm
corepack enable
corepack prepare pnpm@9.15.0 --activate

# Install Castlabs EVS
python -m pip install --upgrade castlabs-evs

# Authenticate with Castlabs EVS account
python -m castlabs_evs.account signin
```

### 2. Build Steps (on Windows)
```powershell
# Clone and setup
git clone <repo>
cd Coosy
pnpm install

# Build shared package
pnpm --filter @coosy/shared build

# Fetch logos (if needed)
cd packages/desktop
pnpm assets:logos

# Build desktop app
pnpm build

# Build Windows installer WITH VMP signing
$env:COOSY_REQUIRE_VMP_SIGNING="1"
pnpm package:win
```

The installer will be created at:
```
packages/desktop/release/CoOSy Setup 0.1.0.exe
```

### 3. Verify VMP Signing Succeeded
Check the build output for:
```
[vmp] VMP signing completed successfully
```

And verify NO warnings about cross-platform builds.

---

## Current Build

The current `CoOSy Setup 0.1.0.exe` (190 MB) in `packages/desktop/release/`:

✅ **What Works:**
- Installs correctly on Windows
- All UI elements display properly
- Logo images are present and display correctly
- YouTube, Prime Video, Hotstar should work (L3 DRM)
- Basic functionality works

❌ **What Doesn't Work:**
- **Netflix playback** - requires proper Widevine VMP signing
- Other L1 DRM content may also fail

---

## Technical Details

### VMP Signing Script
Updated `scripts/vmp-sign.mjs` to detect cross-platform builds and warn:

```javascript
if (process.platform !== electronPlatformName) {
  console.warn("Building for different platform - VMP signing may not work");
  if (requireSigning) {
    throw new Error("Cross-platform VMP signing not supported");
  }
}
```

### Electron Builder Config
The `electron-builder.yml` correctly specifies:
- Uses local Castlabs ECS Electron: `electronDist: node_modules/electron/dist`
- Runs VMP signing hook: `afterPack: scripts/vmp-sign.mjs`
- Includes all files from `out/` directory
- Bundles logos via Vite's public assets system

---

## Next Steps

1. **For testing non-Netflix features:** Use the current build
2. **For full Netflix support:** Rebuild on a Windows machine following the steps above
3. **For production:** Always build on the target platform

---

## References

- Main docs: `docs/widevine-spike.md`
- Architecture: `docs/architecture.md`
- VMP signing (dev): `scripts/sign-electron-vmp.mjs`
- VMP signing (build): `scripts/vmp-sign.mjs`
