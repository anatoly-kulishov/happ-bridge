import { useMemo, useState } from 'react'
import type { BridgeState } from '../../electron/types'
import { useBridgeActions } from '../hooks/useBridgeActions'
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
    <div className="flex h-full flex-col px-6 py-5">
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

      <div className="flex-1 overflow-auto">
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
            <StatusBadge status={state.status} phoneIp={state.phoneIp} />
            <p className="text-sm text-zinc-400">
              Нажмите кнопку - найдём телефон в сети и откроем локальный мост.
            </p>
            {state.status === 'disconnected' && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                Телефон не виден. Проверьте Wi‑Fi и Happ.
              </p>
            )}
            {state.status === 'connected' && (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                Телефон найден
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
            <div className="rounded-lg bg-zinc-800/80 px-3 py-2 text-zinc-400">
              <p className="font-medium text-zinc-200">Куда вставить</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>Telegram → Настройки → Данные и память → Прокси</li>
                <li>Cursor / WebStorm → настройки HTTP Proxy</li>
                <li>Firefox → Настройки → Сеть → Настроить</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <footer className="mt-4 flex gap-2">
        {step > 0 && step < 2 && (
          <button
            type="button"
            className="rounded-lg px-4 py-2.5 text-sm text-zinc-300 transition-colors duration-150 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 active:scale-[0.98]"
            onClick={() => setStep((s) => s - 1)}
          >
            Назад
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          disabled={primary.disabled}
          className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 active:scale-[0.98] disabled:opacity-50"
          onClick={primary.run}
        >
          {primary.label}
        </button>
      </footer>
    </div>
  )
}
