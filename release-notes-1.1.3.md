## Happ Bridge 1.1.3

LAN auth + relay security hardening.

### Install
1. Download **Happ Bridge-1.1.3-arm64.dmg**
2. Open **Install Happ Bridge.command** → Install
3. If macOS blocks the installer:

```bash
xattr -cr "/Volumes/Happ Bridge/Install Happ Bridge.command" && open "/Volumes/Happ Bridge/Install Happ Bridge.command"
```

4. If the app is installed but won't open:

```bash
xattr -cr "/Applications/Happ Bridge.app" && open "/Applications/Happ Bridge.app"
```

### Security / auth
- Optional Happ LAN login/password in Settings (same as phone)
- Discovery verifies SOCKS5 user/pass when set (anti-spoof)
- Inject + copy presets include credentials
- Soft-clear / peer switch drop live pipes
- SOCKS5 `0xff` no longer counts as Happ; probe hard timeout

### Tip
Enable LAN auth in Happ, then enter the same login/password in Bridge and re-apply inject.
