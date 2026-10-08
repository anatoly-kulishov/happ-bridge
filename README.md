# Happ Bridge

**macOS menu bar app** that keeps a stable local proxy for [Happ](https://happ.su) on your phone.

Set Telegram, Cursor, Firefox, and WebStorm to `127.0.0.1` once. When the phone IP changes on Wi‑Fi, Happ Bridge updates the tunnel automatically.

[Русский](#happ-bridge-рус) · [English](#happ-bridge-en) · [Download](#install) · [Site](https://anatoly-kulishov.github.io/happ-bridge/) · [Changelog](docs/CHANGELOG.md)

**Текущая версия:** 1.2.4

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

- macOS (Apple Silicon) + телефон с Happ и включённым **«Разрешить LAN подключение»**
- кто устал обновлять прокси в Telegram / Cursor / IDE после смены Wi‑Fi

### Возможности (1.2.1)

- автопоиск Happ в Wi‑Fi; если телефонов несколько - список и выбор вручную
- устойчивый поиск после перезагрузки Mac (ожидание Wi‑Fi, мягкий backoff, подсказка Local Network в диагностике)
- один тумблер **«Мост к Happ»** - включение/отключение без дублирующих кнопок
- **реальные иконки** установленных Cursor / WebStorm / Firefox в списке прописки
- прописка SOCKS видит установленные `.app`, даже если конфиг Application Support ещё не создан
- **автообновление** через GitHub Releases (zip + `latest-mac.yml`)
- локальный TCP-relay только на `127.0.0.1` (соседи по Wi‑Fi не видят прокси)
- опциональный **логин/пароль Happ LAN** - проверка при поиске и прописка в приложения
- пароль LAN в **Keychain**; домашние SSID и peer на сеть; предупреждение в чужой Wi‑Fi без пароля
- soft-reconnect: смена IP телефона без обрыва слушателей
- устойчивость: 3 неудачных probe, пропуск probe при живом трафике, backoff
- реакция на смену сети
- иконка в строке меню (клик открывает меню, не отдельное окно)
- **ручная** прописка прокси в Cursor / WebStorm / Firefox + предложение перезапустить приложения
- откат прописки к прямому IP телефона (не «системный прокси»)
- мастер первого запуска, диагностика, автозапуск при входе в macOS
- проверка обновлений через GitHub Releases

### Установка {#install}

Сборка **без Apple Developer ID**. Установщик копирует приложение в «Программы» и снимает quarantine Gatekeeper.

#### Готовый .dmg

1. Скачайте `.dmg` с [Releases](https://github.com/anatoly-kulishov/happ-bridge/releases) (файл вида `Happ Bridge-1.1.9-arm64.dmg`).
2. Откройте диск: двойной клик по `.dmg` (появится диск **Happ Bridge**) и дважды нажмите **Install Happ Bridge.command** → «Установить».
3. Если macOS блокирует **установщик**, в Терминале (диск из шага 2 должен быть открыт):

```bash
if [ ! -d "/Volumes/Happ Bridge" ]; then
  echo "Диск «Happ Bridge» не открыт. Двойной клик по .dmg в Загрузках, дождитесь диска и повторите."
  exit 1
fi
xattr -cr "/Volumes/Happ Bridge/Install Happ Bridge.command"
open "/Volumes/Happ Bridge/Install Happ Bridge.command"
```

4. Если приложение уже в «Программах», но **не запускается**:

```bash
if [ ! -d "/Applications/Happ Bridge.app" ]; then
  echo "Приложение не установлено. Сначала выполните шаг 2 (Install Happ Bridge.command)."
  exit 1
fi
xattr -cr "/Applications/Happ Bridge.app"
open "/Applications/Happ Bridge.app"
```

5. Разрешите доступ к локальной сети, если система спросит. Иконка - в строке меню.

Подробности - в **READ ME.txt** на диске образа.

#### Сборка из исходников

```bash
git clone https://github.com/anatoly-kulishov/happ-bridge.git
cd happ-bridge
npm install
npm test
npm run dist
```

Готовый файл: `release/Happ Bridge-1.2.1-arm64.dmg`

Разработка: `npm run dev`

### Как пользоваться

1. На телефоне: Happ + **Разрешить LAN подключение**.
2. Запустите Happ Bridge, пройдите мастер, дождитесь статуса «Подключено».
3. Вставьте в приложения `127.0.0.1:10808` (SOCKS5) / `127.0.0.1:10809` (HTTP)  
   **или** в настройках выберите Cursor / WebStorm / Firefox → **Прописать** → согласитесь на перезапуск.
4. Окно можно закрыть - приложение остаётся в строке меню. Откат прописки - кнопка **Откатить** (вручную).

### Как это работает (технически)

- **Локальный релей.** Два слушателя только на `127.0.0.1`: SOCKS5 `:10808` и HTTP `:10809`; оба форвардят TCP в SOCKS5 телефона по LAN. Системный прокси macOS не меняется.
- **Поиск без broadcast.** Никакого mDNS/ARP/ICMP: только TCP-проба SOCKS5-порта. Кандидаты: ручной IP → IP, запомненный для текущего Wi-Fi (SSID) → недавние IP → последний IP → вся `/24` подсети (приоритет адресов `.2`–`.80` как типичные DHCP-аренды).
- **«Пинг» = рукопожатие SOCKS5.** Клиент шлёт greeting (`05 01 00`, с паролем `05 01 02`); принимается только `VER=5` + метод no-auth/user-pass. Ответ `0xff` или мусор — не Happ: чужой открытый SOCKS не подставится. С включённым паролем требуется успешная user/pass-авторизация.
- **Сканирование.** До 64 параллельных проб, таймаут 350 мс (500 мс с паролем; ~800 мс после старта/пробуждения). Перед первым поиском после логина ждём появления локального IPv4 (холодный старт Wi‑Fi). Полный скан собирает всех пиров в список «Телефоны в сети», быстрый реконнект — стоп на первом попадании. Прогресс `N/254` виден в UI.
- **Выбор телефона.** Ручной IP → запомненный по SSID → единственный найденный → текущий. Если найдено несколько и предпочтения нет — мост ждёт выбора в списке, а не гадает.
- **Watchdog.** В подключённом состоянии каждые ~8 с health-check той же SOCKS5-пробой; 3 промаха подряд — переподключение. Смена сети (fingerprint локальных IP), sleep/wake — реконнект после короткого ожидания Wi‑Fi; при недоступности телефона — бэкофф (мягче, пока есть LAN IP; иначе до 2 мин).
- **Память.** Успешный IP привязывается к SSID и в список недавних: на своей Wi-Fi коннект мгновенный, без скана подсети.
- **Ограничения.** Только `/24` и IPv4; телефон обязан отвечать по TCP (спящий/выключенный не найдётся — укажите IP вручную в настройках).

### Ключевые слова

Happ proxy, Happ LAN, SOCKS5 macOS, HTTP proxy iPhone, Telegram proxy, Cursor proxy, WebStorm proxy, Firefox proxy, локальный прокси, мост к телефону, смена IP Wi‑Fi, menu bar VPN helper.

### Безопасность

- слушатели только на localhost
- системный proxy macOS не меняется
- прописка в приложениях - только по вашей кнопке
- опциональный логин/пароль Happ LAN (антиспуф при поиске + прописка в приложения)
- смена/сброс телефона рвёт живые TCP-pipe
- настройки: пароль LAN в Keychain; домашние SSID; peer на сеть
- мост **не шифрует** Wi‑Fi Mac↔телефон; туннель шифрует Happ
- исходный код открыт (MIT) - см. [SECURITY.md](docs/SECURITY.md)

### Стек

Electron · Vite · React · TypeScript · Tailwind

### Лицензия

[MIT](LICENSE)

---

<a id="happ-bridge-en"></a>

## Happ Bridge (EN)

Stable localhost proxy bridge to a phone running Happ on your LAN. Stop editing proxy IPs in Telegram, Cursor, Firefox, and WebStorm every time DHCP moves your phone.

**Version 1.2.1** - richer diagnostics: precise Happ reachability (auth-required / auth-failed / unreachable), end-to-end relay check, automatic subnet scan when phone IP changes, informative copyable report. Install script guards now give clear instructions instead of silent "No such file".

**Version 1.1.9** - update download progress; 1.1.8 macOS hardening (cold-boot discovery, inject TCC, simpler connection UI).

**Version 1.1.6** - bridge on/off, SOCKS port fix to Happ, Keychain LAN password, peer-per-SSID, Gatekeeper-friendly DMG.

### Quick start

1. Download the `.dmg` from [Releases](https://github.com/anatoly-kulishov/happ-bridge/releases).
2. Open the disk: double-click the `.dmg` (a **Happ Bridge** disk appears), then open **Install Happ Bridge.command** → Install (copies to `/Applications`; unsigned, no Apple Developer ID).
3. If macOS blocks the **installer** (disk from step 2 must be open):

```bash
if [ ! -d "/Volumes/Happ Bridge" ]; then
  echo "Disk «Happ Bridge» not mounted. Double-click the .dmg in Downloads, wait for the disk, then retry."
  exit 1
fi
xattr -cr "/Volumes/Happ Bridge/Install Happ Bridge.command"
open "/Volumes/Happ Bridge/Install Happ Bridge.command"
```

4. If the app is installed but **won't open**:

```bash
if [ ! -d "/Applications/Happ Bridge.app" ]; then
  echo "App not installed yet. Run step 2 first (Install Happ Bridge.command)."
  exit 1
fi
xattr -cr "/Applications/Happ Bridge.app"
open "/Applications/Happ Bridge.app"
```

5. Allow Local Network access if prompted. The icon lives in the menu bar.

Point apps at `127.0.0.1:10808` (SOCKS5) and `127.0.0.1:10809` (HTTP), or use **Прописать** in Settings for Cursor / WebStorm / Firefox, then restart those apps when offered.

Build from source: `npm install && npm test && npm run dist`

### Keywords

Happ VPN LAN proxy, SOCKS5 bridge macOS, HTTP proxy phone, Telegram SOCKS5, Cursor HTTP proxy, menu bar proxy utility, local network phone discovery.

---

## Contributing

Issues and PRs welcome. Keep changes focused; run `npm test` and `npm run build` before opening a PR.

## Disclaimer

Happ Bridge is an independent open-source utility. It is not affiliated with Happ / Happ.su. Use only on networks and devices you own or administer.
