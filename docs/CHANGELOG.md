# Changelog

## 1.2.8 - 2026-10-09

### Fixed
- **Updater**: скачанное обновление реально ставится - кнопка «Установить» и `quitAndInstall` после cleanup (просто «Выйти» больше не оставляло старую версию)

### Changed
- В менюбаре при готовом обновлении пункт «Установить обновление и выйти»

## 1.2.7 - 2026-10-09

### Fixed
- **Connection**: короткие паузы телефона больше не рвут мост - grace ~45 с («Связь нестабильна»), затем быстрый опрос известных IP
- **Discovery**: скан только /24, где уже бывали телефоны - не тратить время на tether/VPN-подсети
- **Relay**: connect timeout 5 с + keepAlive/noDelay
- **Support**: «Отчёт» включает debug-снимок и хвост `main.log`
- **CI/tests**: `test:stress` не падает без `scripts/adversarial`

### Changed
- Логи форматируются через `util.format`

## 1.2.6 - 2026-10-08

### Fixed
- **Updater**: прогресс больше не зависает на «Скачиваем… 0%» — слушатели скачивания остаются до конца загрузки
- **Updater**: `latest-mac.yml` публикуется с Base64 `sha512` и корректным `releaseDate`

## 1.2.5 - 2026-10-08

### Added
- **UX**: во время поиска теперь показывается, какой IP сейчас сканируется

### Changed
- **Landing**: обновлена актуальная версия до 1.2.5

## 1.2.4 - 2026-10-08

### Fixed
- **Updater**: обновление зависало на 0% — отключено дифференциальное обновление (blockmap), теперь качается полный архив ZIP

## 1.2.3 - 2026-10-08

### Fixed
- **Network**: UDP probe timeout увеличен 800→5000мс — телефон успевает ответить при медленном соединении
- **Network**: добавлен TCP fallback — если UDP не ответил, проверяется TCP connect на порт 10808
- **UX**: watchdog-idle интервал ускорен 8000→3000мс — быстрее находит телефон после потери сети
- **UX**: после startup/loss сети backoff больше не замедляет повторные попытки
- **UX**: idleFailStreak сбрасывается при старте приложения

## 1.2.2 - 2026-10-08

### Fixed
- **UI**: footer исправлен — кнопки «Мастер» и «Сохранить» по краям, версия по центру
- **UI**: убран лишний экспорт из header — информация уже доступна через «Скопировать отчёт»
- **UI**: «Пароль Happ (LAN)» теперь аккордеон — не мешает если пароль не нужен
- **UX**: диагностика теперь копирует полное состояние (версия, сеть, настройки, SSID) в JSON для отправки в поддержку

## 1.2.1 - 2026-10-08

### Changed
- **UI**: версия в футере теперь кликабельная ссылка на страницу релизов
- **UI**: блок «Пароль Happ (LAN)» теперь сворачиваемый аккордеон — не мешает если пароль не нужен
- **UI**: кнопка «Экспорт для поддержки» внизу настроек — копирует полное состояние приложения в буфер

### Fixed
- **Updater**: `check()` now uses one-shot listeners (`.once()`) instead of persistent ones (`.on()`) — multiple consecutive checks no longer fire callbacks multiple times
- **Updater**: `update-available` now properly closes all download-progress listeners so they don't fire after the update is downloaded
- **Session**: `healthCheck()` guards against calling `connect('watchdog-lost')` when another `connect()` is already running — eliminates a TOCTOU race
- **Relay**: pipe socket added to tracking set only after error/close handlers are registered — prevents leak on synchronous remote errors
- **UI**: пошаговая инструкция когда телефон не виден в сети (4 пункта: Wi-Fi, LAN в Happ, Local Network в Mac, ожидание после перезагрузки)
- **TCC**: детальные инструкции для каждого типа доступа — Local Network, Full Disk Access, где искать и что включать

### Performance
- **Discovery**: preferred IPs и subnet scan теперь запускаются параллельно — при 2 недоступных preferred IP экономия до 1-2 секунд при старте

## 1.2.0 - 2026-10-08

### Changed
- **Диагностика**: проверка «Happ на телефоне» теперь различает причину — «нет ответа», «нужен логин/пароль LAN», «неверный логин/пароль» (вместо единственного «нет ответа»). Проверка «Локальный мост» стала сквозной: реальный SOCKS5 handshake через `127.0.0.1:порт` до телефона, а не только «порт слушает». Если настроенный IP телефона недоступен, диагностика сама сканирует подсеть и подсказывает, что телефон, вероятно, сменил адрес.
- Скопированный диагностический отчёт получил шапку: версия, время, SSID (домашняя/чужая), статус, адреса моста, число найденных телефонов, последняя ошибка.

### Fixed
- Команды установки/запуска на лендинге и в README больше не падают немым `xattr: No such file`: добавлена проверка предусловий (диск смонтирован / приложение установлено) с понятной подсказкой.

## 1.1.9 - 2026-10-08

### Fixed
- Auto-update download no longer sticks on «Скачиваем…» without feedback: progress bar + %, keep download listeners until finish/error (previously `update-downloaded` was detached when the update was found)

## 1.1.8 - 2026-10-08

### Fixed
- Cold-boot / post-restart phone discovery: wait for local IPv4 before first scan, longer wake/startup probe timeout, softer idle backoff while LAN is up
- `os.networkInterfaces()` family check accepts both `'IPv4'` and numeric `4` (empty subnet scan otherwise)
- Wi‑Fi SSID: discover real Wi‑Fi devices via `networksetup -listallhardwareports` instead of hardcoded `en0`–`en2`
- Inject «не найдено»: Cursor / WebStorm / Firefox are available when the `.app` is installed even if Application Support config is missing; Cursor and WebStorm configs are created on «Прописать»
- Inject status no longer blanks **all** apps when Firefox `profiles.ini` is blocked by TCC (`EPERM`) — Cursor/WebStorm stay selectable; Firefox shows «нет доступа» + Full Disk Access hint
- Diagnostics: Local Network permission hint when Wi‑Fi IP exists but Happ does not answer (common after macOS upgrades)
- Error banner no longer frames auth / peer-pick / home-network hold-off as «Не удалось подключиться» with a blind rescan
- Connection UI: overloaded find button removed; peer click switches or disconnects; ↻ rescans

### Added
- `NSLocationWhenInUseUsageDescription` for SSID reads on modern macOS
- Structured `AlertBanner` tones/actions; loading spinners on primary busy controls
- Release notes / upgrade checklist in `docs/release-notes-1.1.8.md`

## 1.1.7 - 2026-09-30

### Added
- Redesigned Settings UI: compact dark macOS-utility layout with cards, lucide icons and clear hierarchy
- One bridge toggle «Мост к Happ» - single on/off control in the window and tray
- Real app icons for Cursor / WebStorm / Firefox (read from the installed .app bundles; hardcoded glyph fallback stays)
- Auto-update end-to-end: macOS zip target + `latest-mac.yml` published to GitHub Releases; electron-updater CJS/ESM interop fixed (users on 1.1.6 need one manual reinstall - that build ships no updater artifacts)
- Dev-mode window auto-open (`npm run dev` + electron shows the Settings window immediately)
- Technical docs: connection/discovery/ping mechanism described in README and on the landing page

### Fixed
- Raw Node errors in the UI («listen EADDRINUSE…») replaced with localized Russian hints (EADDRINUSE / EACCES)
- «Сохранить ●» button label wrapped the dot to a second line; unsaved-changes indicator is now an amber dot with a hover tooltip

### Changed
- «Отключить телефон» button and tray item removed - redundant with the bridge toggle (backend disconnect API kept for compatibility)
- Docs moved to `docs/` (landing page, changelog, security, release notes); README and LICENSE stay in the root

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
