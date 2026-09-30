## Happ Bridge 1.1.5

Bridge on/off + fix: traffic to Happ always uses SOCKS `:10808`.

### Install
1. Download **Happ Bridge-1.1.5-arm64.dmg**
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
- **Мост к Happ** toggle (Settings + tray) - fully disable auto-connect
- **Отключить телефон** - drop session without immediate reconnect
- Multi-peer: no silent auto-pick of the first IP - choose in the list
- **Fix:** local `:10809` no longer dials phone `:10809`; both ports tunnel to Happ SOCKS `:10808`
- Cursor inject / presets use `socks5://127.0.0.1:10808` (re-apply inject after upgrade)

### Tip
After upgrade, open Settings → **Прописать** for Cursor again so `http.proxy` is updated.
