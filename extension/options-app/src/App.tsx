import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

const DEFAULT_DELAY = 150
const MIN_DELAY = 0
const MAX_DELAY = 1000
const STORAGE_KEY = 'hudDelay'
const FALLBACK_STORAGE_KEY = 'safari-mru-options'

type StatusTone = 'info' | 'error'

type ChromeLike = {
  storage?: { sync?: chrome.storage.SyncStorageArea }
  runtime?: { lastError?: { message?: string } }
}

const readHudDelay = (): Promise<number> =>
  new Promise((resolve) => {
    const chromeApi = (globalThis as typeof globalThis & {
      chrome?: ChromeLike
    }).chrome

    const chromeSync = chromeApi?.storage?.sync

    if (chromeSync) {
      chromeSync.get(
        { [STORAGE_KEY]: DEFAULT_DELAY },
        (data: { [STORAGE_KEY]?: unknown }) => {
          const raw = data?.[STORAGE_KEY]
          const numeric = Number(raw)
          resolve(
            Number.isFinite(numeric) ? clampDelay(numeric) : DEFAULT_DELAY,
          )
        },
      )
      return
    }

    const local =
      typeof window !== 'undefined' ? window.localStorage : undefined
    if (!local) {
      resolve(DEFAULT_DELAY)
      return
    }
    const stored = Number(
      local.getItem(`${FALLBACK_STORAGE_KEY}:${STORAGE_KEY}`),
    )
    resolve(Number.isFinite(stored) ? clampDelay(stored) : DEFAULT_DELAY)
  })

const writeHudDelay = (value: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const chromeApi = (globalThis as typeof globalThis & {
      chrome?: ChromeLike
    }).chrome

    const chromeSync = chromeApi?.storage?.sync

    if (chromeSync) {
      chromeSync.set({ [STORAGE_KEY]: clampDelay(value) }, () => {
        const runtimeError = chromeApi?.runtime?.lastError
        if (runtimeError) {
          reject(
            typeof runtimeError.message === 'string'
              ? new Error(runtimeError.message)
              : new Error('Unable to save setting.'),
          )
        } else {
          resolve()
        }
      })
      return
    }

    const local =
      typeof window !== 'undefined' ? window.localStorage : undefined
    if (local) {
      local.setItem(
        `${FALLBACK_STORAGE_KEY}:${STORAGE_KEY}`,
        String(clampDelay(value)),
      )
    }
    resolve()
  })

const clampDelay = (value: number) =>
  Math.min(MAX_DELAY, Math.max(MIN_DELAY, Math.round(value)))

function App() {
  const [hudDelay, setHudDelay] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [status, setStatus] = useState<{ message: string; tone: StatusTone }>()

  useEffect(() => {
    let active = true
    readHudDelay()
      .then((value) => {
        if (!active) return
        setHudDelay(String(value))
      })
      .finally(() => {
        if (!active) return
        setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const parsedDelay = useMemo(() => {
    const numeric = Number(hudDelay)
    if (!Number.isFinite(numeric)) return null
    return clampDelay(numeric)
  }, [hudDelay])

  const inputHint = useMemo(() => {
    if (parsedDelay === null) return 'Enter a number between 0 and 1000'
    if (parsedDelay !== Number(hudDelay)) {
      return `Will be clamped to ${parsedDelay} ms`
    }
    return ''
  }, [parsedDelay, hudDelay])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (parsedDelay === null) {
        setStatus({
          message: 'Please enter a numeric value.',
          tone: 'error',
        })
        return
      }

      try {
        await writeHudDelay(parsedDelay)
        setStatus({
          message: 'Saved. The new delay applies to the next Option+Tab cycle.',
          tone: 'info',
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'An unexpected error occurred.'
        setStatus({ message, tone: 'error' })
      }
    },
    [parsedDelay],
  )

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 py-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            MRU Switcher Settings
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">
            Adjust how long the HUD waits before appearing while you cycle tabs
            with Option + Tab.
          </p>
        </header>

        <form
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          onSubmit={handleSubmit}
        >
          <label className="flex flex-col gap-2" htmlFor="hud-delay">
            <span className="text-sm font-medium text-slate-700">
              HUD Delay (milliseconds)
            </span>
            <input
              id="hud-delay"
              className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base shadow-inner transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-wait disabled:bg-slate-100 disabled:text-slate-500"
              type="number"
              min={MIN_DELAY}
              max={MAX_DELAY}
              step={10}
              inputMode="numeric"
              value={hudDelay}
              onChange={(event) => {
                setHudDelay(event.target.value)
                setStatus(undefined)
              }}
              disabled={isLoading}
              aria-describedby={inputHint ? 'hud-delay-hint' : undefined}
            />
          </label>
          {inputHint ? (
            <p id="hud-delay-hint" className="text-xs text-slate-500">
              {inputHint}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={isLoading}
            >
              {isLoading ? 'Loading…' : 'Save'}
            </button>
            <span className="text-xs text-slate-500">
              Values outside {MIN_DELAY}-{MAX_DELAY} ms are clamped automatically.
            </span>
          </div>
          {status ? (
            <p
              className={`text-sm font-medium ${
                status.tone === 'error' ? 'text-red-600' : 'text-emerald-600'
              }`}
            >
              {status.message}
            </p>
          ) : null}
        </form>
      </div>
    </main>
  )
}

export default App
