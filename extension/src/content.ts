import {
  DEFAULT_SETTINGS,
  FALLBACK_FAVICON_DARK_URI,
  FALLBACK_FAVICON_LIGHT_URI,
  normalizeHudSettings,
  type ContentCommandMessage,
  type HudItem,
  type HudItemsResponse,
  type HudMessage,
  type HudSettings,
} from "./shared/index";

type ModifierKeyCode = "AltLeft" | "AltRight";
type SessionMode = "altTab" | "command" | null;

(() => {
  const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

  interface ScoredItem {
    item: HudItem;
    score: number;
    order: number;
  }

  const state = {
    hud: null as HTMLDivElement | null,
    header: null as HTMLDivElement | null,
    search: null as HTMLInputElement | null,
    list: null as HTMLUListElement | null,
    items: [] as HudItem[],
    filteredItems: [] as HudItem[],
    index: 1,
    filterIndex: -1,
    visible: false,
    hudTimer: null as ReturnType<typeof setTimeout> | null,
    cycled: false,
    settings: { ...DEFAULT_SETTINGS },
    optionKeys: new Set<ModifierKeyCode>(),
    sessionActive: false,
    initializing: false,
    pendingMoves: 0,
    colorSchemeQuery: null as MediaQueryList | null,
    mode: null as SessionMode,
    query: "",
    isFetchingCommand: false,
  };

  async function exitFullscreenIfNeeded(): Promise<void> {
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      webkitFullscreenElement?: Element | null;
    };
    const fullscreenElement = doc.fullscreenElement ?? doc.webkitFullscreenElement;
    if (!fullscreenElement) return;
    try {
      if (typeof doc.exitFullscreen === "function") {
        await doc.exitFullscreen();
      } else if (typeof doc.webkitExitFullscreen === "function") {
        await Promise.resolve(doc.webkitExitFullscreen());
      }
    } catch (error) {
      console.warn("[SwiftTab] Failed to exit fullscreen", error);
    }
  }

  function readSettings(): Promise<HudSettings> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (data: Partial<HudSettings>) => {
        resolve(normalizeHudSettings(data));
      });
    });
  }

  function applyLayout(): void {
    if (!state.hud) return;
    state.hud.classList.remove("horizontal", "vertical");
    state.hud.classList.add(state.settings.layout);
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

  function handleColorSchemeChange(): void {
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

  function applySettings(settings: HudSettings): void {
    state.settings = { ...settings };
    updateColorSchemeListener();
    applyLayout();
    applyTheme();
    if (state.visible) {
      render();
    }
  }

  function ensureHud(): void {
    if (state.hud) return;

    const hudEl = document.createElement("div");
    hudEl.id = "swift-tab-hud";

    const headerEl = document.createElement("div");
    headerEl.className = "swift-tab-header";

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "swift-tab-search";
    searchInput.placeholder = "Search tabs by title or URL";
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;
    searchInput.setAttribute("autocapitalize", "none");
    searchInput.setAttribute("aria-label", "Search tabs");
    headerEl.appendChild(searchInput);

    const listElement = document.createElement("ul");

    hudEl.appendChild(headerEl);
    hudEl.appendChild(listElement);
    document.documentElement.appendChild(hudEl);

    state.hud = hudEl;
    state.header = headerEl;
    state.search = searchInput;
    state.list = listElement;

    applyLayout();
    applyTheme();

    searchInput.addEventListener("input", () => {
      if (state.mode !== "command") return;
      state.query = searchInput.value;
      updateFilter();
    });

    searchInput.addEventListener("keydown", (event) => {
      if (state.mode !== "command" || !state.visible) return;

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        moveSelection(1);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        moveSelection(-1);
        return;
      }

      if (event.key.toLowerCase() === "tab") {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        moveSelection(event.shiftKey ? -1 : 1);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        void finalizeSelection();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        hide();
      }
    });
  }

  function getFaviconFallback(): string {
    const theme = resolveTheme();
    return theme === "dark" ? FALLBACK_FAVICON_DARK_URI : FALLBACK_FAVICON_LIGHT_URI;
  }

  function getRenderItems(): HudItem[] {
    if (state.mode === "command") {
      return state.filteredItems;
    }
    return state.items;
  }

  function refreshCommandSelection(): void {
    if (state.mode !== "command" || !state.list) return;
    const children = Array.from(state.list.children);
    children.forEach((node, index) => {
      if (!(node instanceof HTMLElement)) return;
      if (index === state.filterIndex) {
        node.classList.add("selected");
      } else {
        node.classList.remove("selected");
      }
    });
  }

  function scrollCommandSelectionIntoView(): void {
    if (state.mode !== "command" || !state.list) return;
    if (state.filterIndex < 0 || state.filterIndex >= state.list.children.length) return;
    const selected = state.list.children.item(state.filterIndex);
    if (selected instanceof HTMLElement) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }

  function render(): void {
    ensureHud();
    if (!state.list || !state.hud) return;

    const renderItems = getRenderItems();
    state.list.innerHTML = "";

    const commandMode = state.mode === "command";
    state.hud.classList.toggle("with-search", commandMode);

    if (commandMode && renderItems.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "empty";
      emptyItem.textContent =
        state.query.trim().length > 0 ? "No matching tabs" : "No tabs available";
      state.list.appendChild(emptyItem);
      return;
    }

    renderItems.forEach((tab, index) => {
      const li = document.createElement("li");
      const isSelected = commandMode ? index === state.filterIndex : index === state.index;
      if (isSelected) li.classList.add("selected");

      const img = document.createElement("img");
      img.className = "favicon";
      img.src = tab.favIconUrl ?? getFaviconFallback();
      img.referrerPolicy = "no-referrer";
      img.loading = "lazy";

      const text = document.createElement("div");
      text.className = "tab-text";

      const titleSpan = document.createElement("span");
      titleSpan.className = "title";
      titleSpan.textContent = tab.title;
      text.appendChild(titleSpan);

      if (commandMode) {
        const metaValue = tab.hostname ?? tab.url;
        if (metaValue) {
          const metaSpan = document.createElement("span");
          metaSpan.className = "meta";
          metaSpan.textContent = metaValue;
          text.appendChild(metaSpan);
        }
      }

      li.appendChild(img);
      li.appendChild(text);

      if (commandMode) {
        li.addEventListener("mouseenter", () => {
          if (!state.visible || state.mode !== "command") return;
          state.filterIndex = index;
          refreshCommandSelection();
        });

        li.addEventListener("click", (event) => {
          event.preventDefault();
          if (!state.visible || state.mode !== "command") return;
          state.filterIndex = index;
          refreshCommandSelection();
          void finalizeSelection();
        });
      }

      state.list!.appendChild(li);
    });

    if (commandMode) {
      requestAnimationFrame(() => {
        scrollCommandSelectionIntoView();
      });
    }
  }

  function show(): void {
    ensureHud();
    if (!state.hud) return;
    state.hud.style.display = "block";
    state.visible = true;
    state.hud.classList.toggle("with-search", state.mode === "command");

    if (state.mode === "command") {
      requestAnimationFrame(() => {
        state.search?.focus();
        state.search?.select();
        scrollCommandSelectionIntoView();
      });
    }
  }

  function resetCommandUi(): void {
    state.query = "";
    state.filteredItems = [];
    state.filterIndex = -1;
    if (state.search) {
      state.search.value = "";
      state.search.blur();
    }
  }

  function hide(): void {
    if (!state.hud) return;
    state.hud.style.display = "none";
    state.visible = false;
    state.hud.classList.remove("with-search");
    resetCommandUi();
    state.mode = null;
    state.sessionActive = false;
    state.pendingMoves = 0;
    state.cycled = false;
  }

  function requestItems(): Promise<HudItem[]> {
    return new Promise<HudItem[]>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "mru-request" } satisfies HudMessage,
        (resp?: HudItemsResponse) => {
          resolve(resp?.items ?? []);
        }
      );
    });
  }

  function wrapIndex(size: number, index: number): number {
    if (size <= 0) return 0;
    return ((index % size) + size) % size;
  }

  function moveSelection(delta: number): void {
    if (state.mode === "command") {
      if (state.filteredItems.length === 0) return;
      const next = wrapIndex(state.filteredItems.length, state.filterIndex + delta);
      state.filterIndex = next;
      refreshCommandSelection();
      scrollCommandSelectionIntoView();
      return;
    }

    if (!state.items.length) return;
    state.index = wrapIndex(state.items.length, state.index + delta);
    if (state.visible) render();
  }

  function computeTermScore(term: string, text: string): number {
    if (!term || !text) return 0;

    const contiguousIndex = text.indexOf(term);
    if (contiguousIndex !== -1) {
      let score = term.length * 120;
      score += Math.max(0, 600 - contiguousIndex * 40);
      if (contiguousIndex === 0) score += 160;
      return score;
    }

    let total = 0;
    let matched = 0;
    let consecutive = 0;
    let firstMatch = -1;

    for (let i = 0; i < text.length && matched < term.length; i += 1) {
      if (text[i] === term[matched]) {
        if (firstMatch === -1) firstMatch = i;
        consecutive += 1;
        matched += 1;
        total += 40 + consecutive * 12;
      } else {
        consecutive = 0;
      }
    }

    if (matched !== term.length) return 0;
    const proximity = firstMatch === -1 ? 0 : Math.max(0, 200 - firstMatch * 10);
    return total + proximity;
  }

  function computeItemScore(item: HudItem, terms: string[], order: number): number {
    const title = item.title?.toLowerCase() ?? "";
    const hostname = item.hostname?.toLowerCase() ?? "";
    const url = item.url?.toLowerCase() ?? "";

    const sources = [
      { text: title, weight: 3 },
      { text: hostname, weight: 2 },
      { text: url, weight: 1 },
    ];

    let total = 0;
    for (const term of terms) {
      let best = 0;
      for (const { text, weight } of sources) {
        if (!text) continue;
        const score = computeTermScore(term, text);
        if (score > best) {
          best = score * weight;
        }
      }
      if (best === 0) {
        return 0;
      }
      total += best;
    }

    if (item.pinned) total += 150;
    total += Math.max(0, 200 - order * 4);
    return total;
  }

  function updateFilter(): void {
    if (state.mode !== "command") return;

    const previousSelectedId = state.filteredItems[state.filterIndex]?.id ?? null;

    const normalized = state.query.trim().toLowerCase();
    if (!normalized) {
      state.filteredItems = [...state.items];
      if (previousSelectedId !== null) {
        const preservedIndex = state.filteredItems.findIndex(
          (item) => item.id === previousSelectedId
        );
        state.filterIndex =
          preservedIndex >= 0 ? preservedIndex : state.filteredItems.length > 0 ? 0 : -1;
      } else {
        state.filterIndex = state.filteredItems.length > 0 ? 0 : -1;
      }
      render();
      return;
    }

    const terms = normalized.split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      state.filteredItems = [...state.items];
      state.filterIndex = state.filteredItems.length > 0 ? 0 : -1;
      render();
      return;
    }

    const scored: ScoredItem[] = state.items.map((item, index) => ({
      item,
      order: index,
      score: computeItemScore(item, terms, index),
    }));

    const matches = scored.filter((entry) => entry.score > 0);
    matches.sort((a, b) => {
      if (a.score === b.score) {
        return a.order - b.order;
      }
      return b.score - a.score;
    });

    state.filteredItems = matches.map((entry) => entry.item);
    if (previousSelectedId !== null) {
      const preservedIndex = state.filteredItems.findIndex(
        (item) => item.id === previousSelectedId
      );
      state.filterIndex =
        preservedIndex >= 0 ? preservedIndex : state.filteredItems.length > 0 ? 0 : -1;
    } else {
      state.filterIndex = state.filteredItems.length > 0 ? 0 : -1;
    }
    render();
  }

  async function startCommandSession(): Promise<void> {
    if (state.isFetchingCommand) return;
    state.isFetchingCommand = true;

    cancelHudTimer();
    state.optionKeys.clear();
    state.sessionActive = false;
    state.pendingMoves = 0;
    state.cycled = false;
    state.mode = "command";

    try {
      const items = await requestItems();
      state.items = items;
      state.query = "";
      state.filteredItems = [...items];
      state.filterIndex = state.filteredItems.length > 0 ? 0 : -1;
      state.index = 0;

      if (state.search) {
        state.search.value = "";
      }

      render();

      if (state.filteredItems.length > 0) {
        show();
      } else {
        hide();
      }
    } finally {
      state.isFetchingCommand = false;
    }
  }

  async function finalizeSelection(): Promise<void> {
    let selected: HudItem | undefined;
    if (state.mode === "command") {
      selected = state.filteredItems[state.filterIndex];
    } else {
      selected = state.items[state.index];
    }

    if (!selected) {
      hide();
      return;
    }

    await exitFullscreenIfNeeded();

    const fallbackIndex = state.items.findIndex((item) => item.id === selected.id);
    chrome.runtime.sendMessage({
      type: "mru-finalize",
      tabId: selected.id,
      index: fallbackIndex >= 0 ? fallbackIndex : state.mode === "command" ? 0 : state.index,
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

  function optionIsHeld(): boolean {
    return state.optionKeys.has("AltLeft") || state.optionKeys.has("AltRight");
  }

  function cancelHudTimer(): void {
    if (!state.hudTimer) return;
    clearTimeout(state.hudTimer);
    state.hudTimer = null;
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
      if (maybeTheme === "dark" || maybeTheme === "light" || maybeTheme === "system") {
        nextSettings.theme = maybeTheme;
      }
    }
    applySettings(nextSettings);
    if (state.mode === "command") {
      updateFilter();
    }
  });

  window.addEventListener(
    "keydown",
    async (event: KeyboardEvent) => {
      if (state.mode === "command" && state.visible) {
        const searchFocused = state.search !== null && event.target === state.search;
        const keyLower = event.key.toLowerCase();

        if (event.key === "Escape") {
          event.preventDefault();
          hide();
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          void finalizeSelection();
          return;
        }

        if (keyLower === "tab") {
          event.preventDefault();
          moveSelection(event.shiftKey ? -1 : 1);
          return;
        }

        if (!searchFocused && (event.key === "ArrowDown" || event.key === "ArrowRight")) {
          event.preventDefault();
          moveSelection(1);
          return;
        }

        if (!searchFocused && (event.key === "ArrowUp" || event.key === "ArrowLeft")) {
          event.preventDefault();
          moveSelection(-1);
          return;
        }

        const handledBySearch = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]);
        if (searchFocused && handledBySearch.has(event.key)) {
          return;
        }

        return;
      }

      if (event.key === "Alt") {
        markOptionHeld(event);
        return;
      }

      if (event.key.toLowerCase() === "tab" && optionIsHeld()) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation();

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
            state.mode = null;
            return;
          }

          state.items = fetched;
          state.index = 0;
          state.sessionActive = true;
          state.mode = "altTab";

          cancelHudTimer();
          state.hudTimer = setTimeout(() => {
            if (optionIsHeld() && state.sessionActive && !state.visible) {
              render();
              show();
            }
            state.hudTimer = null;
          }, state.settings.hudDelay);

          state.cycled = true;
          moveSelection(state.pendingMoves);
          state.pendingMoves = 0;
        } else {
          state.cycled = true;
          moveSelection(delta);
        }
      }
    },
    true
  );

  window.addEventListener(
    "keyup",
    (event: KeyboardEvent) => {
      if (state.mode === "command" && state.visible) {
        if (event.key === "Escape") {
          event.preventDefault();
          hide();
        }
        return;
      }

      if (event.key === "Alt") {
        releaseOption(event);
      }

      if (!optionIsHeld()) {
        cancelHudTimer();
        if (state.cycled && state.mode === "altTab") {
          void finalizeSelection();
        } else if (state.mode === "altTab" && state.visible) {
          hide();
        }
        state.sessionActive = false;
        state.pendingMoves = 0;
        state.initializing = false;
        state.cycled = false;
        if (state.mode === "altTab") {
          state.mode = null;
        }
      }
    },
    true
  );

  chrome.runtime.onMessage.addListener((message: HudMessage | ContentCommandMessage) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "hud-activate") {
      void startCommandSession();
    }
  });

  void readSettings().then(applySettings);
})();
