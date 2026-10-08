## Happ Bridge 1.2.3

### Install
1. Download **Happ Bridge-1.2.3-arm64.dmg**
2. Open **Install Happ Bridge.command** → Install

Or wait for the in-app updater if you already have 1.2.0+.

### Fixed
- UDP probe timeout увеличен 800→5000мс — телефон успевает ответить при медленном соединении
- Добавлен TCP fallback — если UDP не ответил, проверяем TCP connect на порт 10808
- watchdog-idle интервал ускорен 8000→3000мс — быстрее находит телефон после потери сети
- После startup/loss сети backoff больше не замедляет повторные попытки
- idleFailStreak сбрасывается при старте приложения
