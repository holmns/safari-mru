import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import sunIcon from "./assets/icons/sun.svg";
import moonIcon from "./assets/icons/moon.svg";

const MIN_DELAY = 0;
const MAX_DELAY = 1000;
const FALLBACK_STORAGE_KEY = "swift-tab-options";
const OPTIONS_THEME_STORAGE_KEY = "swift-tab-options-theme";

type LayoutMode = "horizontal" | "vertical";
type ThemeMode = "dark" | "light" | "system";
type OptionsTheme = "light" | "dark";

type Settings = {
  hudDelay: number;
  layout: LayoutMode;
  theme: ThemeMode;
};

const DEFAULT_SETTINGS: Settings = {
  hudDelay: 150,
  layout: "horizontal",
  theme: "system",
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

const parseTheme = (value: unknown): ThemeMode => {
  if (value === "light" || value === "system" || value === "dark") {
    return value;
  }
  return DEFAULT_SETTINGS.theme;
};

const getChromeApi = (): ChromeLike | undefined =>
  (globalThis as typeof globalThis & { chrome?: ChromeLike }).chrome;

const readOptionsTheme = (): OptionsTheme => {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage?.getItem(OPTIONS_THEME_STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
};

const CaretDownIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill="currentColor"
      d="M6.47 9.97a.75.75 0 0 1 1.06 0L12 14.44l4.47-4.47a.75.75 0 0 1 1.06 1.06l-5 5a.75.75 0 0 1-1.06 0l-5-5a.75.75 0 0 1 0-1.06Z"
    />
  </svg>
);

const CaretUpIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill="currentColor"
      d="M6.47 14.53a.75.75 0 0 0 1.06 0L12 10.06l4.47 4.47a.75.75 0 1 0 1.06-1.06l-5-5a.75.75 0 0 0-1.06 0l-5 5a.75.75 0 0 0 0 1.06Z"
    />
  </svg>
);

const readSettings = (): Promise<Settings> =>
  new Promise((resolve) => {
    const chromeApi = getChromeApi();
    const chromeSync = chromeApi?.storage?.sync;

    if (chromeSync) {
      chromeSync.get(DEFAULT_SETTINGS, (data) => {
        const hudDelayValue = clampDelay(Number(data.hudDelay));
        const layoutValue = parseLayout(data.layout);
        const themeValue = parseTheme(data.theme);
        resolve({
          hudDelay: hudDelayValue,
          layout: layoutValue,
          theme: themeValue,
        });
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
        theme: parseTheme(parsed.theme),
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
      theme: parseTheme(settings.theme),
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
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [optionsTheme, setOptionsTheme] = useState<OptionsTheme>(() =>
    readOptionsTheme()
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<{ message: string; tone: StatusTone }>();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", optionsTheme === "dark");
    root.dataset.optionsTheme = optionsTheme;
    root.style.colorScheme = optionsTheme;
    try {
      window.localStorage?.setItem(OPTIONS_THEME_STORAGE_KEY, optionsTheme);
    } catch {
      // ignore write errors (private mode, etc.)
    }
    return () => {
      if (optionsTheme === "dark") {
        root.classList.remove("dark");
      }
      root.dataset.optionsTheme = "";
      root.style.colorScheme = "";
    };
  }, [optionsTheme]);

  useEffect(() => {
    let active = true;
    readSettings()
      .then((settings) => {
        if (!active) return;
        setHudDelay(String(settings.hudDelay));
        setLayout(settings.layout);
        setTheme(settings.theme);
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
        await writeSettings({ hudDelay: parsedDelay, layout, theme });
        setStatus({
          message:
            "Saved! The new settings apply to the next Option+Tab cycle.",
          tone: "info",
        });
        setTimeout(() => {
          setStatus((current) =>
            current?.tone === "info" ? undefined : current
          );
        }, 3000);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.";
        setStatus({ message, tone: "error" });
      }
    },
    [layout, parsedDelay, theme]
  );

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 py-10">
        <header className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                SwiftTab Settings
              </h1>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Tune the HUD layout, appearance, and advanced behavior.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white hover:bg-slate-200 p-2 shadow-sm transition dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              onClick={() =>
                setOptionsTheme((current) =>
                  current === "light" ? "dark" : "light"
                )
              }
              aria-label={
                optionsTheme === "light"
                  ? "Switch to dark theme"
                  : "Switch to light theme"
              }
            >
              <img
                src={optionsTheme === "dark" ? sunIcon : moonIcon}
                alt=""
                aria-hidden="true"
                className="h-5 w-5"
              />
            </button>
          </div>
        </header>

        <form
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-lg/30"
          onSubmit={handleSubmit}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-200 pb-2">
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
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-slate-800/70 dark:text-blue-200"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500"
                  }`}
                >
                  <input
                    type="radio"
                    className="h-4 w-4 border-slate-400 text-blue-600 dark:border-slate-500 dark:bg-slate-900"
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
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Vertical layout keeps titles readable in tall lists; horizontal
              fits more tabs across the screen.
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-200 pb-2">
              HUD Theme
            </legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              {(
                [
                  { value: "dark", label: "Dark Mode" },
                  { value: "light", label: "Light Mode" },
                  { value: "system", label: "Follow device" },
                ] satisfies Array<{ value: ThemeMode; label: string }>
              ).map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                    theme === value
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-slate-800/70 dark:text-blue-200"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500"
                  }`}
                >
                  <input
                    type="radio"
                    className="h-4 w-4 border-slate-400 text-blue-600 dark:border-slate-500 dark:bg-slate-900"
                    name="theme"
                    value={value}
                    checked={theme === value}
                    onChange={() => {
                      setTheme(value);
                      setStatus(undefined);
                    }}
                    disabled={isLoading}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Light mode uses a brighter palette; follow device automatically
              tracks macOS appearance.
            </p>
          </fieldset>

          <section className="space-y-3">
            <button
              type="button"
              className="flex items-center gap-2 py-1 text-sm font-light text-slate-700 transition border-b border-transparent dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500"
              onClick={() => setShowAdvanced((current) => !current)}
              aria-expanded={showAdvanced}
              aria-controls="advanced-settings"
            >
              <div className="flex gap-1 items-center">
                <span>Advanced settings</span>
                {showAdvanced ? (
                  <CaretUpIcon className="h-4 w-4 shrink-0 text-slate-700 dark:text-slate-200" />
                ) : (
                  <CaretDownIcon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                )}
              </div>
            </button>
            <div
              id="advanced-settings"
              className={showAdvanced ? "space-y-3" : "hidden"}
            >
              <fieldset className="flex flex-col gap-2">
                <label className="flex flex-col gap-2" htmlFor="hud-delay">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    HUD Delay (milliseconds)
                  </span>
                  <input
                    id="hud-delay"
                    className="w-40 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base shadow-inner transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-wait disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus-visible:ring-offset-slate-900"
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
                    aria-describedby={
                      delayHint && showAdvanced ? "hud-delay-hint" : undefined
                    }
                  />
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Delay before the HUD appears after pressing Option+Tab.
                </p>
              </fieldset>
              {delayHint && showAdvanced ? (
                <p
                  id="hud-delay-hint"
                  className="text-xs text-slate-500 dark:text-slate-400"
                >
                  {delayHint}
                </p>
              ) : null}
            </div>
          </section>

          <div className="flex flex-row gap-2 items-center">
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
                  status.tone === "error"
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {status.message}
              </p>
            ) : null}
          </div>
        </form>
      </div>
    </main>
  );
}

export default App;
