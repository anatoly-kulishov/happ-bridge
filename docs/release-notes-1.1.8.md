## Happ Bridge 1.1.8

macOS-upgrade hardening: faster phone find after reboot, and SOCKS inject that sees installed apps even before their config folders exist.

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
1. **Local Network:** Системные настройки → Конфиденциальность и безопасность → Локальная сеть → включите **Happ Bridge** (после крупного обновления macOS доступ часто сбрасывается).
2. **Location (optional):** разрешите геолокацию для Happ Bridge, если нужен SSID (домашние сети / быстрый peer по Wi‑Fi).
3. **Inject apps:** один раз откройте Cursor / WebStorm / Firefox, если прописка SOCKS жалуется на отсутствие профиля (Firefox) — конфиги Cursor/WebStorm Bridge может создать сам, если `.app` уже в `/Applications`.

### What's new
- **Cold-boot discovery** — wait for a local IPv4 before the first scan; longer probe timeout after startup / wake; softer retry backoff while Wi‑Fi is up
- **IPv4 family** — accept both `'IPv4'` and numeric `4` from `os.networkInterfaces()`
- **Wi‑Fi SSID** — resolve real Wi‑Fi devices via `networksetup -listallhardwareports`; `NSLocationWhenInUseUsageDescription` for Sequoia+
- **Inject «не найдено»** — apps count as available when the `.app` is installed, not only when Application Support config already exists; Cursor/WebStorm configs created on «Прописать»
- **Diagnostics** — Local Network TCC hint when LAN IP is present but the phone does not answer
