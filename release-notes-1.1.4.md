## Happ Bridge 1.1.4

Keychain LAN password, home Wi‑Fi warnings, peer remembered per SSID.

### Install
1. Download **Happ Bridge-1.1.4-arm64.dmg**
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
- LAN password in **macOS Keychain** (not settings.json); Settings is write-only for the secret
- Warning on non-home Wi‑Fi without Happ LAN credentials; mark SSID as home in Settings
- Tray / badge when LAN auth is on
- Last chosen phone IP remembered per Wi‑Fi SSID

### Tip
Enable LAN auth in Happ, enter the same login/password in Bridge, and mark trusted home networks so café Wi‑Fi stays noisy.
