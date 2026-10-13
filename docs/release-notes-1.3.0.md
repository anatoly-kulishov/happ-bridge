## Happ Bridge 1.3.0

### Install
1. Download **Happ-Bridge-1.3.0-arm64.dmg**
2. Open **Install Happ Bridge.command** → Install

Если уже стоит 1.2.8/1.2.9 и обновление скачивалось, но версия не менялась - поставьте этот `.dmg` один раз вручную. Дальше кнопка «Установить» в настройках ставит обновление сама (без ShipIt).

### Fixed
- **Updater**: скачанный ZIP реально ставится на unsigned-сборке - замена `.app` после выхода процесса, снятие quarantine, перезапуск. `quitAndInstall` / Squirrel.Mac больше не оставляют старую версию.

### Changed
- **UI**: semantic CSS (карточки, кнопки, алерты, log-line), preflight без «белых рамок» и пропавших маркеров списка
- **UI**: иконки/отступы в мастере, логе inject, футере и блоке обновлений
- **Copy**: тексты без длинных тире, понятнее сообщения об ошибках и подсказки
- **Packaging**: lean `.app` (~197 MB), prune Framework `*.lproj`, metrics score ~92

### Added
- Тест пути установки обновления: `npx tsx scripts/test-mac-update-install.ts`
