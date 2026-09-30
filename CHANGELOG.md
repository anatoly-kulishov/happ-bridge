# Changelog

## 1.1.6 - 2026-09-30

### Added
- Re-scan button for the peer list («Обновить» in Settings / Wizard) - refreshes found phones without dropping the current relay connection
- Scan progress bar while searching (`проверено N из M`)
- Suspend/resume handling: live pipes dropped on sleep, immediate reconnect on wake (no more dead proxy for ~30s after opening the lid)
- Neutral «Отключено вами» / «Мост выключен» states - grey badge and grey tray icon instead of alarm-red
- LAN login/password fields in the first-run wizard (fixes «Happ requires a password» dead-end)
- «знакомый» marker for previously used phone IPs in the peer list
- Diagnostics report: copy to clipboard + hide
- «Обновить статус» button in «Прописать в приложения»
- Update downloaded notification («перезапустите приложение для установки»)
- Unsaved-changes indicator in Settings footer («Сохранить ●»); «Запускать при входе» applies immediately
- Tray menu shows the connected phone IP

### Fixed
- End-to-end LAN auth check before reporting «Подключено» - no more green status when Happ will reject all traffic (wrong/missing password)
- No silent auto-connect to the only reachable proxy on an untrusted network (not home + no LAN password); explicit choice (peer select / manual IP / per-SSID peer) still auto-reconnects
- Selecting a peer no longer overwrites «IP телефона вручную»
- Copy buttons (SOCKS5/HTTP) disabled while the bridge is off or disconnected - no more dead addresses in clipboard
- Clicking the already-selected peer no longer re-connects
- Password placeholder «оставлен в Keychain» only when a password actually exists
- «Откатить», «Найти снова», «Диагностика» are now visible buttons, not faint text links
- Typo in the ready notification

### Changed
- Tray menu trimmed to essentials (status, copy SOCKS5/HTTP, enable/disable bridge, disconnect phone, settings, quit) - rescan / find / diagnostics now live in the Settings window
- Disabled-menu-bar tray icon is now a grey ring instead of a solid dot, so it stays visible on dark menu bars

## 1.1.5 - 2026-09-24

### Added
- Toggle to disable the Happ bridge entirely (Settings + tray); persists across restarts
- «Отключить телефон» - soft disconnect without auto-reconnect until Find / peer select

### Fixed
- Local HTTP listener (`:10809`) forwarded to phone `:10809`; Happ only serves SOCKS on `:10808` - both local ports now tunnel to phone SOCKS
- Cursor inject / presets used `http://…:10809`; now `socks5://…:10808`

### Changed
- Multi-peer discovery no longer auto-binds the first IP; choose from the list (or preferred / single peer)

## 1.1.4 - 2026-09-24

### Added
- Warn when on non-home Wi‑Fi without Happ LAN credentials
- Status / tray badge when LAN auth is on
- LAN password stored in macOS Keychain (not settings.json)
- Remember selected phone IP per Wi‑Fi SSID; mark home SSIDs explicitly in Settings

### Changed
- Settings password field is write-only (secret never sent to renderer)
- Peer bind no longer auto-seeds current SSID as home

## 1.1.3 - 2026-09-24

### Added
- Optional Happ LAN login/password: discovery verifies SOCKS5 user/pass; inject and presets include credentials
- Settings UI for LAN credentials; diagnostics note when auth is set
- `npm run test:stress` / `test:adversarial` - selfcheck + adversarial suite

### Fixed
- Soft-clear / peer switch tear down live relay pipes (no stale proxy to old phone)
- SOCKS5 method `0xff` no longer treated as Happ identity
- Empty password does not force auth; whitespace password no longer silently disables anti-spoof
- `updateSettings` runs through `normalizeSettings`
- SOCKS/HTTP copy presets include credentials when set
- Probe hard timeout so filtered hosts cannot hang discovery

## 1.1.2 - 2026-09-23

### Changed
- Install docs: one-line `xattr && open` for installer unblock and app launch, with copy buttons
- Landing install section layout (roomier panels) and header surface / border polish
- DMG READ ME + Install script tip aligned with the same one-line commands

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
