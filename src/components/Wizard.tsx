import { useMemo, useState } from 'react'
import type { BridgeState } from '../../electron/types'
import { useBridgeActions } from '../hooks/useBridgeActions'
import { PeerList } from './PeerList'
import { ProxyCopyButton } from './ProxyCopyButton'
import { StatusBadge } from './StatusBadge'

type Props = {
  state: BridgeState
  onDone: () => Promise<void>
  onState: (s: BridgeState) => void
}

export function Wizard({ state, onDone, onState }: Props) {
  const [step, setStep] = useState(0)
  const { busy, copied, findPhone, copy } = useBridgeActions(onState)

  const primary = useMemo(() => {
    if (step === 0) {
      return { label: 'Дальше', disabled: false, run: () => setStep(1) }
    }
    if (step === 1) {
      if (state.status === 'connected') {
        return { label: 'Дальше', disabled: false, run: () => setStep(2) }
      }
      return {
        label: busy ? 'Ищем…' : 'Найти телефон',
        disabled: busy,
        run: () => {
          void findPhone().then((next) => {
            if (next.status === 'connected') setStep(2)
          })
        },
      }
    }
    return {
      label: 'Готово',
      disabled: false,
      run: () => {
        void onDone()
      },
    }
  }, [step, state.status, busy, findPhone, onDone])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-sky-400">
            Happ Bridge
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white text-balance">
            {step === 0 && 'Подключите телефон'}
            {step === 1 && 'Найдите телефон'}
            {step === 2 && 'Скопируйте адреса'}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">Шаг {step + 1} из 3</p>
        </header>

        <div className="mb-4 flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                i <= step ? 'bg-sky-500' : 'bg-zinc-700'
              }`}
            />
          ))}
        </div>

        <div className="pb-2">
          {step === 0 && (
            <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
              <p>На телефоне:</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Откройте приложение <strong className="text-white">Happ</strong>.
                </li>
                <li>Включите VPN / подключение.</li>
                <li>
                  Включите тумблер{' '}
                  <strong className="text-white">Разрешить LAN подключение</strong>.
                  Если есть логин/пароль для LAN - позже укажите их в настройках Bridge.
                </li>
                <li>Телефон и компьютер должны быть в одной Wi‑Fi сети.</li>
              </ol>
              <p className="rounded-lg bg-zinc-800/80 px-3 py-2 text-zinc-400">
                Адрес на компьютере не меняется - Happ Bridge сам следит за IP телефона.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <StatusBadge
                status={state.status}
                phoneIp={state.phoneIp}
                lanAuthOn={state.lanAuthOn}
              />
              <p className="text-sm text-zinc-400">
                Нажмите кнопку - найдём телефоны с Happ в сети. Если их несколько,
                выберите нужный.
              </p>
              {state.error && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  {state.error}
                </p>
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
              />
              {state.status === 'disconnected' && state.peers.length === 0 && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  Телефон не виден. Проверьте Wi‑Fi и Happ.
                </p>
              )}
              {state.status === 'connected' && (
                <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                  Телефон выбран
                  {state.phoneIp ? `: ${state.phoneIp}` : ''}.
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 text-sm text-zinc-300">
              <p>
                Вставьте эти адреса в Telegram, Cursor, Firefox или WebStorm{' '}
                <strong className="text-white">один раз</strong>:
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
              <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-sky-100">
                После «Готово» окно можно закрыть. Happ Bridge останется в строке меню
                (цветная точка справа вверху). Адреса{' '}
                <code className="text-sky-200">127.0.0.1</code> больше не меняются.
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-zinc-800/80 bg-[var(--hb-bg)] px-6 pb-6 pt-3">
        {step > 0 && step < 2 ? (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setStep((s) => s - 1)}
          >
            Назад
          </button>
        ) : (
          <div />
        )}
        <div className="flex-1" />
        <button
          type="button"
          disabled={primary.disabled}
          className="btn-primary min-w-[7.5rem]"
          onClick={primary.run}
        >
          {primary.label}
        </button>
      </footer>
    </div>
  )
}
