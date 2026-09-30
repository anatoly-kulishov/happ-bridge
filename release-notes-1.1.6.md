## Happ Bridge 1.1.6

Sleep-proof bridge, honest status, and a much calmer UI. The app runs in the menu bar 24/7 - this release fixes the cases where it lied about being connected or ignored your network.

### Install
1. Download **Happ Bridge-1.1.6-arm64.dmg**
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
- **Reacts to sleep / lid close** - live pipes drop on suspend and reconnect immediately on wake (no more dead proxy for ~30s)
- **Honest «Подключено»** - end-to-end LAN auth check before showing green; a wrong/missing Happ password no longer fakes a working bridge
- **No auto-connect on untrusted Wi-Fi** - won't silently bind the only reachable proxy when the network isn't home and no LAN password is set
- **Re-scan without dropping the connection** + a scan progress bar (`проверено N из M`)
- **Neutral states** - «Мост выключен» / «Отключено вами» as a grey badge and grey ring tray icon instead of alarm-red
- **LAN login/password in the first-run wizard** - fixes the «Happ requires a password» dead-end
- **«знакомый»** marker for previously used phone IPs, unsaved-changes indicator, copy-to-clipboard diagnostics, and disabled copy buttons when the bridge is off

### Changed
- **Tray menu trimmed to essentials** (status, copy SOCKS5/HTTP, enable/disable, disconnect phone, settings, quit) - rescan / find / diagnostics now live in the Settings window
- **Disabled tray icon is a grey ring** - stays visible on dark menu bars
