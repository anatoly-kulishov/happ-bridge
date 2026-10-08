## Happ Bridge 1.2.1

### Install
1. Download **Happ Bridge-1.2.1-arm64.dmg**
2. Open **Install Happ Bridge.command** → Install

Or wait for the in-app updater if you already have 1.2.0+ (after this build is published).

### Fixed
- **Updater**: multiple `check()` calls no longer accumulate event listeners — error/progress callbacks are now properly removed after each check
- **Updater**: `update-available` no longer leaves dangling download listeners open
- **Connection race**: `healthCheck()` no longer triggers a redundant reconnect when another connect is already in-flight
- **Relay**: pipe sockets are now added to the internal tracking set only after error handlers are registered, preventing a potential leak on very early network errors
