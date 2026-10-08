## Happ Bridge 1.2.0

Richer diagnostics and robust install scripts.

### Install
1. Download **Happ Bridge-1.2.0-arm64.dmg**
2. Open **Install Happ Bridge.command** → Install

Or wait for the in-app updater if you already have 1.1.9+ (after this build is published).

### Changed
- **Diagnostics** — the "Happ on phone" check now distinguishes: reachable / auth required / auth failed / unreachable (instead of a single "no response"). The "Local bridge" check is now end-to-end: it performs a real SOCKS5 handshake through `127.0.0.1:10808` to the phone, not just "port is listening". If the configured phone IP is unreachable, diagnostics automatically scans the subnet and tells you the new IP if found.
- **Copyable report** now starts with a header: version, timestamp, Wi‑Fi SSID (home/foreign), status, bridge addresses, number of phones found, last error.

### Fixed
- **Install scripts on the landing page** no longer silently fail with `xattr: No such file` when the DMG is not mounted or the app is not yet installed — both the installer and launch commands now check their preconditions and give a clear hint instead.
