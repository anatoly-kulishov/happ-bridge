## Happ Bridge 1.2.6

### Install
1. Download **Happ Bridge-1.2.6-arm64.dmg**
2. Open **Install Happ Bridge.command** → Install

Or wait for the in-app updater if you already have 1.2.4+ (after this build is published).

### Fixed
- **Updater**: прогресс больше не зависает на «Скачиваем… 0%» — слушатели скачивания остаются до конца загрузки
- **Updater**: `latest-mac.yml` публикуется с Base64 `sha512` (как ожидает electron-updater) и корректным `releaseDate`
