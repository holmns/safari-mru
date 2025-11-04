import {
  DEFAULT_SETTINGS,
  normalizeHudSettings,
  type HudItem,
  type HudItemsResponse,
  type HudMessage,
  type HudSettings,
} from "./shared/index";

type ModifierKeyCode = "AltLeft" | "AltRight";

const FALLBACK_FAVICON_DATA_URI =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#4b5563"/><path d="M5.5 4h5a2.5 2.5 0 0 1 0 5h-5v3H4V4.75A.75.75 0 0 1 4.75 4H5.5zm1 1.5v2h4a1 1 0 1 0 0-2h-4z" fill="#f8fafc"/></svg>';

(() => {
  const state = {
    hud: null as HTMLDivElement | null,
    list: null as HTMLUListElement | null,
    items: [] as HudItem[],
    index: 1,
    visible: false,
    hudTimer: null as ReturnType<typeof setTimeout> | null,
    cycled: false,
    settings: { ...DEFAULT_SETTINGS },
    optionKeys: new Set<ModifierKeyCode>(),
    sessionActive: false,
    initializing: false,
    pendingMoves: 0,
    colorSchemeQuery: null as MediaQueryList | null,
  };

  const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

  function readSettings(): Promise<HudSettings> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        DEFAULT_SETTINGS,
        (data: Partial<HudSettings>) => {
          resolve(normalizeHudSettings(data));
        }
      );
    });
  }

  function applyLayout(): void {
    if (!state.hud) return;
    state.hud.classList.remove("horizontal", "vertical");
    state.hud.classList.add(state.settings.layout);
  }

  function applySettings(settings: HudSettings): void {
    state.settings = { ...settings };
    updateColorSchemeListener();
    applyLayout();
    applyTheme();
  }

  function ensureHud(): void {
    if (state.hud) return;
    const hudEl = document.createElement("div");
    hudEl.id = "swift-tab-hud";
    const listElement = document.createElement("ul");
    hudEl.appendChild(listElement);
    document.documentElement.appendChild(hudEl);
    state.hud = hudEl;
    state.list = listElement;
    applyLayout();
    applyTheme();
  }

  function render(): void {
    ensureHud();
    if (!state.list) return;
    state.list.innerHTML = "";
    state.items.forEach((tab, i) => {
      const li = document.createElement("li");
      if (i === state.index) li.classList.add("selected");

      const img = document.createElement("img");
      img.className = "favicon";
      img.src = tab.favIconUrl || FALLBACK_FAVICON_DATA_URI;
      img.referrerPolicy = "no-referrer";
      img.loading = "lazy";
      img.onerror = () => {
        img.src = FALLBACK_FAVICON_DATA_URI;
        img.style.opacity = "0.75";
      };

      const span = document.createElement("span");
      span.className = "title";
      span.textContent = tab.title;

      li.appendChild(img);
      li.appendChild(span);
      state.list!.appendChild(li);
    });
  }

  function show(): void {
    ensureHud();
    if (!state.hud) return;
    state.hud.style.display = "block";
    state.visible = true;
  }

  function hide(): void {
    if (!state.hud) return;
    state.hud.style.display = "none";
    state.visible = false;
  }

  async function requestItems(): Promise<HudItem[]> {
    return new Promise<HudItem[]>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "mru-request" } satisfies HudMessage,
        (resp?: HudItemsResponse) => {
          resolve(resp?.items ?? []);
        }
      );
    });
  }

  function wrapIndex(nextIndex: number): number {
    if (!state.items.length) return 0;
    const size = state.items.length;
    return ((nextIndex % size) + size) % size;
  }

  function moveSelection(delta: number): void {
    state.index = wrapIndex(state.index + delta);
    if (state.visible) render();
  }

  function flushPendingMoves(): void {
    while (state.pendingMoves !== 0) {
      const step = state.pendingMoves > 0 ? 1 : -1;
      moveSelection(step);
      state.pendingMoves -= step;
    }
  }

  async function finalize(): Promise<void> {
    chrome.runtime.sendMessage({
      type: "mru-finalize",
      index: state.index,
    } satisfies HudMessage);
    hide();
  }

  function markOptionHeld(event: KeyboardEvent): void {
    if (event.code === "AltLeft" || event.code === "AltRight") {
      state.optionKeys.add(event.code);
    }
  }

  function releaseOption(event?: KeyboardEvent): void {
    if (event?.code === "AltLeft" || event?.code === "AltRight") {
      state.optionKeys.delete(event.code);
    } else if (!event?.altKey) {
      state.optionKeys.clear();
    }
  }

  function optionIsHeld(event?: KeyboardEvent): boolean {
    if (event?.altKey) return true;
    return state.optionKeys.has("AltLeft") || state.optionKeys.has("AltRight");
  }

  function cancelHudTimer(): void {
    if (!state.hudTimer) return;
    clearTimeout(state.hudTimer);
    state.hudTimer = null;
  }

  function resolveTheme(): "dark" | "light" {
    if (state.settings.theme === "system") {
      if (state.colorSchemeQuery) {
        return state.colorSchemeQuery.matches ? "dark" : "light";
      }
      if (typeof window.matchMedia === "function") {
        return window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light";
      }
      return "dark";
    }
    return state.settings.theme;
  }

  function applyTheme(): void {
    if (!state.hud) return;
    const theme = resolveTheme();
    state.hud.dataset.theme = theme;
  }

  function handleColorSchemeChange(_event?: MediaQueryListEvent): void {
    applyTheme();
  }

  function attachColorSchemeListener(query: MediaQueryList): void {
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", handleColorSchemeChange);
      return;
    }

    const legacyQuery = query as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    legacyQuery.addListener?.(handleColorSchemeChange);
  }

  function detachColorSchemeListener(query: MediaQueryList): void {
    if (typeof query.removeEventListener === "function") {
      query.removeEventListener("change", handleColorSchemeChange);
      return;
    }

    const legacyQuery = query as MediaQueryList & {
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    legacyQuery.removeListener?.(handleColorSchemeChange);
  }

  function updateColorSchemeListener(): void {
    if (state.settings.theme === "system") {
      if (!state.colorSchemeQuery && typeof window.matchMedia === "function") {
        const query = window.matchMedia(COLOR_SCHEME_QUERY);
        attachColorSchemeListener(query);
        state.colorSchemeQuery = query;
      }
      return;
    }

    if (state.colorSchemeQuery) {
      detachColorSchemeListener(state.colorSchemeQuery);
      state.colorSchemeQuery = null;
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    const nextSettings: HudSettings = { ...state.settings };
    if (Object.prototype.hasOwnProperty.call(changes, "hudDelay")) {
      const maybeDelay = changes.hudDelay?.newValue;
      if (typeof maybeDelay === "number" && Number.isFinite(maybeDelay)) {
        nextSettings.hudDelay = maybeDelay;
      }
    }
    if (Object.prototype.hasOwnProperty.call(changes, "layout")) {
      const maybeLayout = changes.layout?.newValue;
      if (maybeLayout === "vertical" || maybeLayout === "horizontal") {
        nextSettings.layout = maybeLayout;
      }
    }
    if (Object.prototype.hasOwnProperty.call(changes, "theme")) {
      const maybeTheme = changes.theme?.newValue;
      if (
        maybeTheme === "dark" ||
        maybeTheme === "light" ||
        maybeTheme === "system"
      ) {
        nextSettings.theme = maybeTheme;
      }
    }
    applySettings(nextSettings);
    if (state.visible) render();
  });

  window.addEventListener(
    "keydown",
    async (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        markOptionHeld(event);
        return;
      }

      if (event.key.toLowerCase() === "tab" && optionIsHeld(event)) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation();

        markOptionHeld(event);
        if (event.repeat) return;

        const delta = event.shiftKey ? -1 : 1;

        if (!state.sessionActive) {
          state.pendingMoves += delta;
          if (state.initializing) return;

          state.initializing = true;
          const fetched = await requestItems();
          state.initializing = false;

          if (fetched.length < 1) {
            state.pendingMoves = 0;
            state.sessionActive = false;
            return;
          }

          state.items = fetched;
          state.index = 0;
          state.sessionActive = true;

          cancelHudTimer();
          state.hudTimer = setTimeout(() => {
            if (optionIsHeld() && state.sessionActive && !state.visible) {
              render();
              show();
            }
            state.hudTimer = null;
          }, state.settings.hudDelay);

          state.cycled = true;
          flushPendingMoves();
        } else {
          state.cycled = true;
          moveSelection(delta);
        }
      } else if (optionIsHeld(event)) {
        markOptionHeld(event);
        cancelHudTimer();
      }
    },
    true
  );

  window.addEventListener(
    "keyup",
    (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        releaseOption(event);
      } else if (!optionIsHeld(event)) {
        releaseOption(event);
      }

      if (!optionIsHeld(event)) {
        cancelHudTimer();
        if (state.cycled) {
          void finalize();
        }
        state.sessionActive = false;
        state.pendingMoves = 0;
        state.initializing = false;
        state.cycled = false;
      }
    },
    true
  );

  void readSettings().then(applySettings);
})();
