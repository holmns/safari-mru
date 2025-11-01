import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

const MIN_DELAY = 0;
const MAX_DELAY = 1000;
const FALLBACK_STORAGE_KEY = "safari-mru-options";

type LayoutMode = "horizontal" | "vertical";

type Settings = {
  hudDelay: number;
  layout: LayoutMode;
};

const DEFAULT_SETTINGS: Settings = {
  hudDelay: 150,
  layout: "horizontal",
};

type StatusTone = "info" | "error";

type ChromeLike = {
  storage?: { sync?: chrome.storage.SyncStorageArea };
  runtime?: { lastError?: { message?: string } };
};

const clampDelay = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.hudDelay;
  return Math.min(MAX_DELAY, Math.max(MIN_DELAY, Math.round(value)));
};

const parseLayout = (value: unknown): LayoutMode =>
  value === "vertical" ? "vertical" : "horizontal";

const getChromeApi = (): ChromeLike | undefined =>
  (globalThis as typeof globalThis & { chrome?: ChromeLike }).chrome;

const readSettings = (): Promise<Settings> =>
  new Promise((resolve) => {
    const chromeApi = getChromeApi();
    const chromeSync = chromeApi?.storage?.sync;

    if (chromeSync) {
      chromeSync.get(DEFAULT_SETTINGS, (data) => {
        const hudDelayValue = clampDelay(Number(data.hudDelay));
        const layoutValue = parseLayout(data.layout);
        resolve({ hudDelay: hudDelayValue, layout: layoutValue });
      });
      return;
    }

    const local =
      typeof window !== "undefined" ? window.localStorage : undefined;
    if (!local) {
      resolve(DEFAULT_SETTINGS);
      return;
    }

    try {
      const raw = local.getItem(FALLBACK_STORAGE_KEY);
      if (!raw) {
        resolve(DEFAULT_SETTINGS);
        return;
      }
      const parsed = JSON.parse(raw) as Partial<Settings>;
      resolve({
        hudDelay: clampDelay(
          Number(parsed.hudDelay ?? DEFAULT_SETTINGS.hudDelay)
        ),
        layout: parseLayout(parsed.layout),
      });
    } catch {
      resolve(DEFAULT_SETTINGS);
    }
  });

const writeSettings = (settings: Settings): Promise<void> =>
  new Promise((resolve, reject) => {
    const chromeApi = getChromeApi();
    const chromeSync = chromeApi?.storage?.sync;
    const normalized: Settings = {
      hudDelay: clampDelay(settings.hudDelay),
      layout: parseLayout(settings.layout),
    };

    if (chromeSync) {
      chromeSync.set(normalized, () => {
        const runtimeError = chromeApi?.runtime?.lastError;
        if (runtimeError) {
          reject(
            typeof runtimeError.message === "string"
              ? new Error(runtimeError.message)
              : new Error("Unable to save setting.")
          );
        } else {
          resolve();
        }
      });
      return;
    }

    const local =
      typeof window !== "undefined" ? window.localStorage : undefined;
    if (local) {
      local.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(normalized));
    }
    resolve();
  });

function App() {
  const [hudDelay, setHudDelay] = useState<string>("");
  const [layout, setLayout] = useState<LayoutMode>("horizontal");
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<{ message: string; tone: StatusTone }>();

  useEffect(() => {
    let active = true;
    readSettings()
      .then((settings) => {
        if (!active) return;
        setHudDelay(String(settings.hudDelay));
        setLayout(settings.layout);
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const parsedDelay = useMemo(() => {
    const numeric = Number(hudDelay);
    if (!Number.isFinite(numeric)) return null;
    return clampDelay(numeric);
  }, [hudDelay]);

  const delayHint = useMemo(() => {
    if (parsedDelay === null) return "Enter a number between 0 and 1000";
    if (parsedDelay !== Number(hudDelay)) {
      return `Will be clamped to ${parsedDelay} ms`;
    }
    return "";
  }, [parsedDelay, hudDelay]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (parsedDelay === null) {
        setStatus({
          message: "Please enter a numeric value.",
          tone: "error",
        });
        return;
      }

      try {
        await writeSettings({ hudDelay: parsedDelay, layout });
        setStatus({
          message:
            "Saved. The new settings apply to the next Option+Tab cycle.",
          tone: "info",
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.";
        setStatus({ message, tone: "error" });
      }
    },
    [layout, parsedDelay]
  );

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 py-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            MRU Switcher Settings
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">
            Tune the HUD delay and choose whether tabs are listed horizontally
            or vertically.
          </p>
        </header>

        <form
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
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
                setHudDelay(event.target.value);
                setStatus(undefined);
              }}
              disabled={isLoading}
              aria-describedby={delayHint ? "hud-delay-hint" : undefined}
            />
          </label>
          {delayHint ? (
            <p id="hud-delay-hint" className="text-xs text-slate-500">
              {delayHint}
            </p>
          ) : null}

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-slate-700">
              HUD Layout
            </legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              {(
                [
                  { value: "horizontal", label: "Horizontal grid" },
                  { value: "vertical", label: "Vertical list" },
                ] satisfies Array<{ value: LayoutMode; label: string }>
              ).map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                    layout === value
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                  }`}
                >
                  <input
                    type="radio"
                    className="h-4 w-4 border-slate-400 text-blue-600"
                    name="layout"
                    value={value}
                    checked={layout === value}
                    onChange={() => {
                      setLayout(value);
                      setStatus(undefined);
                    }}
                    disabled={isLoading}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Vertical layout keeps titles readable in tall lists; horizontal
              fits more tabs across the screen.
            </p>
          </fieldset>

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
            disabled={isLoading}
          >
            {isLoading ? "Loading…" : "Save"}
          </button>

          {status ? (
            <p
              className={`text-sm font-medium ${
                status.tone === "error" ? "text-red-600" : "text-emerald-600"
              }`}
            >
              {status.message}
            </p>
          ) : null}
        </form>
      </div>
    </main>
  );
}

export default App;
