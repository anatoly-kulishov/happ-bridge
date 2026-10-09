## Happ Bridge 1.2.7

### Install
1. Download **Happ Bridge-1.2.7-arm64.dmg**
2. Open **Install Happ Bridge.command** → Install

Or wait for the in-app updater if you already have 1.2.4+ (after this build is published).

### Fixed
- **Connection**: короткие паузы телефона (энергосбережение Wi‑Fi) больше не рвут мост - статус «Связь нестабильна» до ~45 с, затем быстрый reconnect
- **Discovery**: поиск не сканирует лишние подсети второго интерфейса (USB/hotspot/VPN) - меньше минут «телефон не найден»
- **Relay**: таймаут dial к телефону 5 с + TCP keepAlive, клиенты не висят ~75 с
- **Support**: кнопка «Отчёт» копирует снимок, диагностику и хвост лога для разбора сбоев

### Changed
- Логи подставляют аргументы (`%s` / `%d`) - проще читать `main.log`
