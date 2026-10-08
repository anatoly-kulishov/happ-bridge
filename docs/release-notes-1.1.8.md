## Happ Bridge 1.1.8

macOS-upgrade hardening, clearer errors, and a simpler connection UI.

### Install
1. Download **Happ Bridge-1.1.8-arm64.dmg**
2. Open **Install Happ Bridge.command** → Install
3. If macOS blocks the installer:

```bash
xattr -cr "/Volumes/Happ Bridge/Install Happ Bridge.command" && open "/Volumes/Happ Bridge/Install Happ Bridge.command"
```

4. If the app is installed but won't open:

```bash
xattr -cr "/Applications/Happ Bridge.app" && open "/Applications/Happ Bridge.app"
```

### After a macOS update — checklist
1. **Local Network:** Системные настройки → Конфиденциальность и безопасность → Локальная сеть → включите **Happ Bridge**.
2. **Full Disk Access (Firefox inject):** Полный доступ к диску → Happ Bridge, затем перезапуск.
3. **Location (optional):** для SSID / домашних сетей.
4. Quit any old menu-bar copy before opening the new build (port 10808/10809 conflict).

### What's new
- **Cold-boot discovery** — wait for local IPv4; longer wake/startup probes; softer backoff while LAN is up
- **IPv4 family** — accept `'IPv4'` and numeric `4`
- **Wi‑Fi SSID** — real Wi‑Fi devices via `networksetup`; Location usage string
- **Inject** — `.app` counts as available; Cursor/WebStorm configs created on «Прописать»; Firefox TCC no longer blanks the whole list
- **Connection UI** — bridge toggle only; ↻ for rescan; click peer to switch, active peer to disconnect
- **Alerts** — structured banners with the right actions (ports / LAN password / guidance), not a blind «Повторить»
- **Loading** — spinners instead of bare «…»

### Fixed
- Phones hard to find right after Mac reboot / lid open
- All inject apps shown as «не найдено» when Firefox `profiles.ini` is blocked (`EPERM`)
- Misleading «Не удалось подключиться» for auth, peer-pick, and home-network hold-off
