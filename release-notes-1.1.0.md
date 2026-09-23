## Happ Bridge 1.1.0

macOS menu bar: stable `127.0.0.1` SOCKS5/HTTP bridge to Happ on your phone.

### Install
1. Download **Happ Bridge-1.1.0-arm64.dmg**
2. Open **Install Happ Bridge.command** → Install
3. If macOS blocks the installer:

```bash
xattr -cr "/Volumes/Happ Bridge/Install Happ Bridge.command" && open "/Volumes/Happ Bridge/Install Happ Bridge.command"
```

### Highlights
- Several Happ phones on LAN → pick one in the list
- Manual proxy inject for Cursor / WebStorm / Firefox + relaunch prompt
- Revert restores the phone’s direct Happ IP (not system proxy)
- Unsigned DMG installer clears Gatekeeper quarantine

Full notes: [CHANGELOG.md](https://github.com/anatoly-kulishov/happ-bridge/blob/main/CHANGELOG.md)
