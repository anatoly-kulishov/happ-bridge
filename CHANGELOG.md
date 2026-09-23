# Changelog

## 1.1.1 - 2026-09-23

### Changed
- Landing page redesign: contrast-safe CTAs, transparent bridge logo, crisp CSS UI mocks
- Site download / install copy aligned with manual inject flow

## 1.1.0 - 2026-09-23

### Added
- Multi-peer discovery: list of Happ phones on LAN and manual select
- Manual proxy inject for Cursor, WebStorm, Firefox (apply / revert)
- After inject: offer to fully relaunch selected apps so prefs take effect
- Unsigned DMG installer (`Install Happ Bridge.command` + READ ME) with Gatekeeper quarantine clear
- Site / README tip for `xattr -cr` when macOS blocks the installer
- Tray status icon (@1x/@2x), click opens menu only (window via «Настройки…»)
- Diagnostics panel, GitHub Releases updater hook

### Changed
- Inject is **manual only** (no seamless auto apply on launch / revert on quit)
- Firefox revert restores **direct phone Happ IP**, not «use system proxy»
- Tray menu: copy SOCKS5/HTTP, find, diagnostics, settings, quit (presets live in Settings)
- Resource discipline: shared AbortSignal socket registry, single network poll, abortable watch sleep, tray menu rebuild cache

### Fixed
- Soft-disconnect and health probes (traffic mask, consecutive fails)
- Concurrent relay start race and same-port partial bind
- Abort during scan no longer drops a valid hit incorrectly

## 1.0.0 - 2026-09-23

Initial macOS menu-bar release: localhost SOCKS5/HTTP relay to Happ on the phone.
