import { Loader2, RefreshCw, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { BridgeState } from '../../electron/types'
import { useBridgeActions } from '../hooks/useBridgeActions'
import { AlertBanner, parseBridgeError } from './AlertBanner'
import { BusyIcon } from './BusyIcon'
import { PeerList } from './PeerList'
import { ProxyCopyButton } from './ProxyCopyButton'
import { StatusBadge } from './StatusBadge'

type Props = {
  state: BridgeState
  onDone: () => Promise<void>
  /** Leave wizard without finishing (re-opened from Settings). */
  onDismiss?: () => void
  onState: (s: BridgeState) => void
}

export function Wizard({ state, onDone, onDismiss, onState }: Props) {
  const [step, setStep] = useState(0)
  const [lanUser, setLanUser] = useState('')
  const [lanPass, setLanPass] = useState('')
  const { busy, copied, findPhone, copy } = useBridgeActions(onState)

  const runFind = async () => {
    if (lanUser.trim() || lanPass) {
      await window.happBridge.saveSettings({
        proxyUser: lanUser.trim() || null,
        ...(lanPass ? { proxyPassword: lanPass } : {}),
      })
    }
    return findPhone()
  }

  const bridgeError = state.error ? parseBridgeError(state.error) : null

  const primary = useMemo(() => {
    if (step === 0) {
      return { label: 'Дальше', disabled: false, busy: false, icon: null as null, run: () => setStep(1) }
    }
    if (step === 1) {
      if (state.status === 'connected') {
        return { label: 'Дальше', disabled: false, busy: false, icon: null as null, run: () => setStep(2) }
      }
      return {
        label: busy ? 'Ищем…' : 'Найти телефон',
        disabled: busy,
        busy,
        icon: Search,
        run: () => {
          void runFind().then((next) => {
            if (next.status === 'connected') setStep(2)
          })
        },
      }
    }
    return {
      label: 'Готово',
      disabled: false,
      busy: false,
      icon: null as null,
      run: () => {
        void onDone()
      },
    }
  }, [step, state.status, busy, runFind, onDone])

  return (
    <div className="app-shell">
      <main className="app-scroll px-5">
        <header className="mb-5">
          <div className="flex items-start justify-between gap-2">
            <p className="section-label text-sky-300/90">Happ Bridge</p>
            {onDismiss && (
              <button
                type="button"
                className="icon-btn"
                title="Закрыть мастер"
                aria-label="Закрыть мастер"
                onClick={onDismiss}
              >
                <X size={16} aria-hidden />
              </button>
            )}
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-[var(--hb-text)] text-balance">
            {step === 0 && 'Подключите телефон'}
            {step === 1 && 'Найдите телефон'}
            {step === 2 && 'Скопируйте адреса'}
          </h1>
          <p className="mt-1 text-sm muted">Шаг {step + 1} из 3</p>
        </header>

        <div className="mb-5 flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                i <= step ? 'bg-sky-400' : 'bg-[var(--hb-border-strong)]'
              }`}
            />
          ))}
        </div>

        <div className="pb-2">
          {step === 0 && (
            <div className="space-y-4 text-sm leading-relaxed text-[var(--hb-text-muted)]">
              <p>На телефоне:</p>
              <ol className="list-decimal space-y-2.5 pl-5 text-[var(--hb-text)]">
                <li>
                  Откройте приложение <strong className="font-medium">Happ</strong>.
                </li>
                <li>Включите VPN / подключение.</li>
                <li>
                  Включите тумблер{' '}
                  <strong className="font-medium">Разрешить LAN подключение</strong>.
                  Если есть логин/пароль для LAN — позже укажите их в настройках Bridge.
                </li>
                <li>Телефон и компьютер должны быть в одной Wi‑Fi сети (или одном VPN).</li>
              </ol>
              <p className="surface rounded-[10px] px-3 py-2.5 text-xs muted">
                Адрес на компьютере не меняется — Happ Bridge сам следит за IP телефона.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <StatusBadge
                status={state.status}
                phoneIp={state.phoneIp}
                lanAuthOn={state.lanAuthOn}
                enabled={state.settings.enabled}
                scan={state.scan}
                compact
              />
              <p className="text-sm muted">
                Нажмите кнопку — найдём телефоны с Happ в сети. Если их несколько,
                выберите нужный.
              </p>
              {state.status !== 'connected' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-sm">
                    <span className="muted">Логин Happ LAN</span>
                    <input
                      type="text"
                      name="lanUser"
                      value={lanUser}
                      onChange={(e) => setLanUser(e.target.value)}
                      placeholder="если задан в Happ…"
                      autoComplete="off"
                      spellCheck={false}
                      className="field-input"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="muted">Пароль Happ LAN</span>
                    <input
                      type="password"
                      name="lanPassword"
                      value={lanPass}
                      onChange={(e) => setLanPass(e.target.value)}
                      placeholder="если задан в Happ…"
                      autoComplete="off"
                      spellCheck={false}
                      className="field-input"
                    />
                  </label>
                </div>
              )}
              {bridgeError && (
                <AlertBanner
                  tone={bridgeError.tone}
                  title={bridgeError.title}
                  actions={
                    bridgeError.kind === 'port-in-use' ||
                    bridgeError.kind === 'generic' ||
                    bridgeError.kind === 'guidance' ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="btn-secondary h-8 px-2.5 text-xs"
                        title="Снова поискать телефон в сети"
                        onClick={() => void runFind()}
                      >
                        <BusyIcon busy={busy} icon={RefreshCw} size={14} />
                        {busy ? 'Ищем…' : 'Повторить'}
                      </button>
                    ) : undefined
                  }
                >
                  {bridgeError.body}
                </AlertBanner>
              )}
              <PeerList
                peers={state.peers}
                selectedIp={state.phoneIp}
                busy={busy}
                onSelect={async (ip) => {
                  const next = await window.happBridge.selectPhone(ip)
                  onState(next)
                  if (next.status === 'connected') setStep(2)
                }}
                onDisconnect={async () => {
                  onState(await window.happBridge.disconnect())
                }}
              />
              {state.status === 'disconnected' && state.peers.length === 0 && !bridgeError && (
                <AlertBanner tone="danger" title="Телефон не виден">
                  Проверьте по порядку:
                  <br />
                  1) Телефон в той же Wi‑Fi / VPN сети, что и Mac
                  <br />
                  2) В Happ: «Разрешить LAN подключение» → вкл
                  <br />
                  3) На Mac: Локальная сеть → Happ Bridge включён
                  <br />
                  4) Нажмите «Найти» через 10–15 секунд после перезагрузки
                </AlertBanner>
              )}
              {state.status === 'connected' && (
                <AlertBanner tone="success" title="Телефон выбран">
                  {state.phoneIp
                    ? `${state.phoneIp} — можно переходить дальше.`
                    : 'Можно переходить дальше.'}
                </AlertBanner>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 text-sm text-[var(--hb-text-muted)]">
              <p>
                Вставьте эти адреса в Telegram, Cursor, Firefox или WebStorm{' '}
                <strong className="font-medium text-[var(--hb-text)]">один раз</strong>:
              </p>
              <ProxyCopyButton
                label="SOCKS5"
                value={state.socksLocal}
                copied={copied === 'socks'}
                onCopy={() => void copy('socks')}
              />
              <ProxyCopyButton
                label="HTTP"
                value={state.httpLocal}
                copied={copied === 'http'}
                onCopy={() => void copy('http')}
              />
              <ProxyCopyButton
                label="Telegram"
                value="SOCKS5 · шпаргалка"
                copied={copied === 'telegram'}
                onCopy={() => void copy('telegram')}
              />
              <ProxyCopyButton
                label="Cursor / IDE"
                value="HTTP · шпаргалка"
                copied={copied === 'cursor'}
                onCopy={() => void copy('cursor')}
              />
              <div className="rounded-[10px] border border-sky-400/25 bg-[var(--hb-accent-soft)] px-3 py-2.5 text-xs leading-relaxed text-sky-100">
                После «Готово» окно можно закрыть. Happ Bridge останется в строке меню.
                Адреса <code className="text-sky-50">127.0.0.1</code> больше не меняются.
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer px-5">
        {step > 0 && step < 2 ? (
          <button
            type="button"
            className="btn-ghost"
            title="Вернуться к предыдущему шагу"
            onClick={() => setStep((s) => s - 1)}
          >
            Назад
          </button>
        ) : onDismiss ? (
          <button
            type="button"
            className="btn-ghost"
            title="Закрыть мастер и вернуться к настройкам"
            onClick={onDismiss}
          >
            Закрыть
          </button>
        ) : (
          <div />
        )}
        <div className="flex-1" />
        <button
          type="button"
          disabled={primary.disabled}
          className="btn-primary min-w-[7.5rem]"
          title={
            step === 0
              ? 'Перейти к поиску телефона'
              : step === 1
                ? state.status === 'connected'
                  ? 'Перейти к адресам прокси'
                  : 'Найти телефон с Happ в сети'
                : 'Завершить мастер и открыть настройки'
          }
          onClick={primary.run}
        >
          {primary.icon ? (
            <BusyIcon busy={primary.busy} icon={primary.icon} size={16} />
          ) : primary.busy ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : null}
          {primary.label}
        </button>
      </footer>
    </div>
  )
}
