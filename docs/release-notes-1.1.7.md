## Happ Bridge 1.1.7

Redesigned UI, one honest bridge toggle, real app icons, and a working auto-updater.

### Install
1. Download **Happ Bridge-1.1.7-arm64.dmg**
2. Open **Install Happ Bridge.command** → Install
3. If macOS blocks the installer:

```bash
xattr -cr "/Volumes/Happ Bridge/Install Happ Bridge.command" && open "/Volumes/Happ Bridge/Install Happ Bridge.command"
```

4. If the app is installed but won't open:

```bash
xattr -cr "/Applications/Happ Bridge.app" && open "/Applications/Happ Bridge.app"
```

### What's new
- **Redesigned Settings UI** - compact dark macOS-utility layout: cards, lucide icons, clear hierarchy
- **One bridge toggle** - «Мост к Happ» is now the single way to turn the bridge on/off; the duplicate «Отключить телефон» button (window + tray menu) is gone
- **Real app icons** - Cursor / WebStorm / Firefox are shown with their actual bundle icons (read from the .app, not hardcoded glyphs)
- **Auto-update that works** - macOS zip target + `latest-mac.yml` are published to GitHub Releases; electron-updater CJS/ESM interop fixed
  - Users on 1.1.6 need one manual reinstall (1.1.6 has no updater artifacts), later updates are automatic

### Fixed
- Raw Node errors in the UI («listen EADDRINUSE…») are now human-readable Russian hints
- «Сохранить ●» label no longer wraps the dot onto a second line; unsaved-changes moved to a hover informer (amber dot)
