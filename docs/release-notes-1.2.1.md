## Happ Bridge 1.2.1

### Install
1. Download **Happ Bridge-1.2.1-arm64.dmg**
2. Open **Install Happ Bridge.command** → Install

Or wait for the in-app updater if you already have 1.2.0+ (after this build is published).

### Performance
- **Discovery**: preferred IPs и subnet scan теперь запускаются одновременно — при старте или поиске телефоны появляются быстрее (ранее preferred IPs проверялись последовательно, блокируя subnet scan)

### Changed
- Версия в футере теперь кликабельная ссылка на страницу релизов на GitHub
- Детальные пошаговые инструкции когда телефон не виден в сети
- Детальные инструкции по предоставлению доступа к локальной сети (Local Network) и полному доступу к диску (Full Disk Access)
- **UI**: блок «Пароль Happ (LAN)» теперь сворачиваемый аккордеон — не мешает если пароль не нужен
- **UI**: кнопка «Экспорт для поддержки» внизу настроек — копирует полное состояние приложения (версия, сеть, настройки, диагностика) в буфер обмена для отправки в поддержку

### Fixed
- **Updater**: multiple `check()` calls no longer accumulate event listeners — error/progress callbacks now properly removed after each check
- **Updater**: `update-available` no longer leaves dangling download-progress listeners open
- **Session**: `healthCheck()` guards against calling `connect('watchdog-lost')` when another `connect()` is already running — eliminates a race condition
- **Relay**: pipe sockets added to tracking set only after error/close handlers are registered — prevents potential leak on very early network errors
