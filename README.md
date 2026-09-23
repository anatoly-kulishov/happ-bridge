# Happ Bridge

**macOS menu bar app** that keeps a stable local proxy for [Happ](https://happ.su) on your phone.

Set Telegram, Cursor, Firefox, and WebStorm to `127.0.0.1` once. When the phone IP changes on Wi‑Fi, Happ Bridge updates the tunnel automatically.

[Русский](#happ-bridge-рус) · [English](#happ-bridge-en) · [Download](#install) · [Site](https://anatoly-kulishov.github.io/happ-bridge/)

---

<a id="happ-bridge-рус"></a>

## Happ Bridge (рус)

### Зачем это нужно

Happ на iPhone раздаёт SOCKS5 / HTTP прокси в локальную сеть. IP телефона часто меняется - и в Telegram, Cursor, Firefox, WebStorm приходится править адрес вручную.

**Happ Bridge** находит телефон в Wi‑Fi и держит постоянные адреса на Mac:

| Тип    | Адрес (не меняется)   |
|--------|------------------------|
| SOCKS5 | `127.0.0.1:10808`      |
| HTTP   | `127.0.0.1:10809`      |

### Кому подойдёт

- macOS + телефон с Happ и включённым **«Разрешить LAN подключение»**
- кто устал обновлять прокси в Telegram / Cursor / IDE после смены Wi‑Fi

### Возможности

- автопоиск телефона в локальной сети
- локальный TCP-relay только на `127.0.0.1` (соседи по Wi‑Fi не видят прокси)
- иконка в строке меню: зелёная / жёлтая / красная
- мастер первого запуска на русском
- автозапуск при входе в macOS
- уведомление, если телефон пропал из сети

### Установка {#install}

#### Готовый .dmg

1. Скачайте релиз с [Releases](https://github.com/anatoly-kulishov/happ-bridge/releases) (когда появится) или соберите локально.
2. Откройте `.dmg` и перетащите **Happ Bridge** в Applications.
3. При первом запуске: ПКМ → **Открыть** (сборка без Apple Developer ID).
4. Разрешите доступ к локальной сети, если macOS спросит.

#### Сборка из исходников

```bash
git clone https://github.com/anatoly-kulishov/happ-bridge.git
cd happ-bridge
npm install
npm run dist
```

Готовый файл: `release/Happ Bridge-*-arm64.dmg`

Разработка:

```bash
npm run dev
npm test
```

### Как пользоваться

1. На телефоне включите Happ и тумблер **Разрешить LAN подключение**.
2. Запустите Happ Bridge, пройдите мастер, нажмите **Найти телефон**.
3. Один раз вставьте в приложения:

   - SOCKS5: `127.0.0.1:10808`
   - HTTP: `127.0.0.1:10809`

4. Окно можно закрыть - приложение остаётся в строке меню.

### Ключевые слова

Happ proxy, Happ LAN, SOCKS5 macOS, HTTP proxy iPhone, Telegram proxy, Cursor proxy, WebStorm proxy, Firefox proxy, локальный прокси, мост к телефону, смена IP Wi‑Fi, menu bar VPN helper.

### Безопасность

- слушатели только на localhost
- системный proxy macOS не меняется
- настройки хранятся локально в userData Electron
- исходный код открыт (MIT)

### Стек

Electron · Vite · React · TypeScript · Tailwind

### Лицензия

[MIT](LICENSE)

---

<a id="happ-bridge-en"></a>

## Happ Bridge (EN)

Stable localhost proxy bridge to a phone running Happ on your LAN. Stop editing proxy IPs in Telegram, Cursor, Firefox, and WebStorm every time DHCP moves your phone.

### Quick start

```bash
npm install
npm run dist   # builds macOS .dmg
npm run dev    # menu bar app in development
```

Point apps at `127.0.0.1:10808` (SOCKS5) and `127.0.0.1:10809` (HTTP). Happ Bridge discovers the phone and relays traffic.

### Keywords

Happ VPN LAN proxy, SOCKS5 bridge macOS, HTTP proxy phone, Telegram SOCKS5, Cursor HTTP proxy, menu bar proxy utility, local network phone discovery.

---

## Contributing

Issues and PRs welcome. Keep changes focused; run `npm test` and `npm run build` before opening a PR.

## Disclaimer

Happ Bridge is an independent open-source utility. It is not affiliated with Happ / Happ.su. Use only on networks and devices you own or administer.
