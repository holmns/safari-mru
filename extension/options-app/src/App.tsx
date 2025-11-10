import { useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  normalizeHudSettings,
  type HudSettings,
  type LayoutMode,
  type ThemeMode,
} from "@shared";

const FALLBACK_STORAGE_KEY = "swift-tab-options";

type ChromeLike = {
  storage?: { sync?: chrome.storage.SyncStorageArea };
  runtime?: { lastError?: { message?: string } };
};

const getChromeApi = (): ChromeLike | undefined =>
  (globalThis as typeof globalThis & { chrome?: ChromeLike }).chrome;

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

const readSettings = (): Promise<HudSettings> =>
  new Promise((resolve) => {
    const chromeApi = getChromeApi();
    const chromeSync = chromeApi?.storage?.sync;

    if (chromeSync) {
      chromeSync.get(DEFAULT_SETTINGS, (data) => {
        resolve(normalizeHudSettings(data));
      });
      return;
    }

    const local = typeof window !== "undefined" ? window.localStorage : undefined;
    if (!local) {
      resolve({ ...DEFAULT_SETTINGS });
      return;
    }

    try {
      const raw = local.getItem(FALLBACK_STORAGE_KEY);
      if (!raw) {
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }
      const parsed = JSON.parse(raw) as Partial<HudSettings>;
      resolve(normalizeHudSettings(parsed));
    } catch {
      resolve({ ...DEFAULT_SETTINGS });
    }
  });

const writeSettings = (settings: HudSettings): Promise<void> =>
  new Promise((resolve, reject) => {
    const chromeApi = getChromeApi();
    const chromeSync = chromeApi?.storage?.sync;
    const normalized = normalizeHudSettings(settings);

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

    const local = typeof window !== "undefined" ? window.localStorage : undefined;
    if (local) {
      local.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(normalized));
    }
    resolve();
  });

function App() {
  const [enabled, setEnabled] = useState<boolean>(DEFAULT_SETTINGS.enabled);
  const [hudDelay, setHudDelay] = useState<number>(DEFAULT_SETTINGS.hudDelay);
  const [layout, setLayout] = useState<LayoutMode>(DEFAULT_SETTINGS.layout);
  const [theme, setTheme] = useState<ThemeMode>(DEFAULT_SETTINGS.theme);
  const [isLoading, setIsLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const applyTheme = (isDark: boolean) => {
      root.classList.toggle("dark", isDark);
      root.dataset.optionsTheme = isDark ? "dark" : "light";
      root.style.colorScheme = isDark ? "dark" : "light";
    };

    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    applyTheme(media?.matches ?? false);

    if (!media) {
      return () => {
        root.classList.remove("dark");
        root.dataset.optionsTheme = "";
        root.style.colorScheme = "";
      };
    }

    const handleChange = (event: MediaQueryListEvent) => {
      applyTheme(event.matches);
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
    } else if (typeof media.addListener === "function") {
      media.addListener(handleChange);
    }

    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", handleChange);
      } else if (typeof media.removeListener === "function") {
        media.removeListener(handleChange);
      }
      root.classList.remove("dark");
      root.dataset.optionsTheme = "";
      root.style.colorScheme = "";
    };
  }, []);

  useEffect(() => {
    let active = true;
    readSettings()
      .then((settings) => {
        if (!active) return;
        setEnabled(settings.enabled);
        setHudDelay(settings.hudDelay);
        setLayout(settings.layout);
        setTheme(settings.theme);
        setHydrated(true);
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    writeSettings({ enabled, hudDelay, layout, theme }).catch((error) => {
      if (cancelled) return;
      console.warn("[SwiftTab] Failed to save settings", error);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, enabled, hudDelay, layout, theme]);

  const toggleEnabled = (): void => {
    if (isLoading) return;
    setEnabled((current) => !current);
  };

  const handleOpenApp = (): void => {
    try {
      if (typeof window !== "undefined") {
        window.open("https://swifttab.app", "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      console.warn("[SwiftTab] Failed to open website", error);
    }
  };

  return (
    <main className="min-h-screen p-2">
      <div className="mx-auto w-full max-w-sm p-5 text-slate-900 dark:text-white">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold leading-tight text-slate-900 dark:text-white">
            SwiftTab
          </h1>
          <p className="text-sm text-slate-500 dark:text-white/60">
            Applies everywhere unless overridden in the app.
          </p>
        </header>

        <form className="mt-6 space-y-5">
          <section className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Enabled</p>
            <button
              type="button"
              onClick={toggleEnabled}
              disabled={isLoading}
              className={`flex w-full items-center justify-between rounded-[30px] border px-4 py-2 text-base font-semibold transition ${
                enabled
                  ? "border-slate-200 bg-white text-slate-900 dark:border-white/30 dark:bg-white/10 dark:text-white"
                  : "border-slate-100 bg-slate-100 text-slate-400 dark:border-white/15 dark:bg-white/5 dark:text-white/60"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    enabled
                      ? "bg-fuchsia-500 shadow shadow-fuchsia-500/40"
                      : "bg-slate-300 dark:bg-white/30"
                  }`}
                />
                {enabled ? "Enabled" : "Disabled"}
              </span>
              <span className="text-sm text-slate-500 dark:text-white/80">
                {enabled ? "On" : "Off"}
              </span>
            </button>
            <p className="text-xs text-slate-500 dark:text-white/60">
              {enabled
                ? "SwiftTab will respond to Option+Tab and the search shortcut."
                : "SwiftTab stays idle until you turn it back on."}
            </p>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">HUD Layout</p>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-[28px] border border-slate-200 bg-white px-4 py-2 pr-10 text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white/95 dark:focus-visible:ring-white/30"
                value={layout}
                disabled={isLoading}
                onChange={(event) => {
                  setLayout(event.target.value as LayoutMode);
                }}
              >
                <option value="horizontal">Horizontal grid</option>
                <option value="vertical">Vertical list</option>
              </select>
              <CaretDownIcon className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-white/60" />
            </div>
            <p className="text-xs text-slate-500 dark:text-white/60">
              Vertical keeps long titles readable, horizontal fits more tabs on screen.
            </p>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">HUD Theme</p>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-[28px] border border-slate-200 bg-white px-4 py-2 pr-10 text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white/95 dark:focus-visible:ring-white/30"
                value={theme}
                disabled={isLoading}
                onChange={(event) => {
                  setTheme(event.target.value as ThemeMode);
                }}
              >
                <option value="system">Follow device</option>
                <option value="light">Light Mode</option>
                <option value="dark">Dark Mode</option>
              </select>
              <CaretDownIcon className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-white/60" />
            </div>
            <p className="text-xs text-slate-500 dark:text-white/60">
              Follow device tracks macOS appearance automatically.
            </p>
          </section>

          <section className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleOpenApp}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-900/20 bg-slate-900/10 px-4 py-1 text-sm font-semibold text-slate-900 transition hover:bg-slate-900/20 dark:border-white/25 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              <span aria-hidden="true" className="text-2xl translate-y-[-5px]">
                ↗︎
              </span>
              <span>Open SwiftTab App</span>
            </button>
            <p className="text-center text-xs text-slate-500 dark:text-white/60">
              Advanced settings live in the SwiftTab app.
            </p>
          </section>
        </form>
      </div>
    </main>
  );
}

export default App;
