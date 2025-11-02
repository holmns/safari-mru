interface MruItem {
  id: number;
  title?: string;
  favIconUrl?: string;
}

interface MruResponse {
  items?: MruItem[];
}

type RuntimeMessage =
  | { type: "mru-request-active" }
  | { type: "mru-finalize"; index: number };

type LayoutMode = "horizontal" | "vertical";

(() => {
  // --- UI state ---
  let hud: HTMLDivElement | null = null;
  let listEl: HTMLUListElement | null = null;
  let items: MruItem[] = [];
  let index = 1;
  let visible = false;
  let hudTimer: ReturnType<typeof setTimeout> | null = null;
  let cycled = false;
  const DEFAULT_SETTINGS = { hudDelay: 150, layout: "horizontal" as LayoutMode };
  let HUD_DELAY = DEFAULT_SETTINGS.hudDelay;
  let layout: LayoutMode = DEFAULT_SETTINGS.layout;

  function isLayout(value: unknown): value is LayoutMode {
    return value === "horizontal" || value === "vertical";
  }

  function applyLayout(): void {
    if (!hud) return;
    hud.classList.remove("horizontal", "vertical");
    hud.classList.add(layout);
  }

  chrome.storage.sync.get(
    { hudDelay: DEFAULT_SETTINGS.hudDelay, layout: DEFAULT_SETTINGS.layout },
    (data: { hudDelay?: unknown; layout?: unknown }) => {
      const delayValue =
        typeof data.hudDelay === "number" && Number.isFinite(data.hudDelay)
          ? data.hudDelay
          : DEFAULT_SETTINGS.hudDelay;
      HUD_DELAY = delayValue;

      const nextLayout = isLayout(data.layout) ? data.layout : DEFAULT_SETTINGS.layout;
      layout = nextLayout;
      applyLayout();
    }
  );

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    if (Object.prototype.hasOwnProperty.call(changes, "hudDelay")) {
      const next = changes.hudDelay?.newValue;
      if (typeof next === "number" && Number.isFinite(next)) {
        HUD_DELAY = next;
      }
    }
    if (Object.prototype.hasOwnProperty.call(changes, "layout")) {
      const next = changes.layout?.newValue;
      if (isLayout(next)) {
        layout = next;
        applyLayout();
        if (visible) render();
      }
    }
  });

  // Track modifier keys to detect Option hold and release
  type ModifierKeyCode = "AltLeft" | "AltRight";
  const optionKeys = new Set<ModifierKeyCode>();
  let sessionActive = false;
  let initializing = false;
  let pendingMoves = 0;

  function markOptionHeld(event: KeyboardEvent): void {
    if (event.code === "AltLeft" || event.code === "AltRight") {
      optionKeys.add(event.code);
    }
  }

  function releaseOption(event?: KeyboardEvent): void {
    if (event?.code === "AltLeft" || event?.code === "AltRight") {
      optionKeys.delete(event.code);
    } else if (!event?.altKey) {
      optionKeys.clear();
    }
  }

  function optionIsHeld(event?: KeyboardEvent): boolean {
    if (event?.altKey) return true;
    return optionKeys.has("AltLeft") || optionKeys.has("AltRight");
  }

  function ensureHud(): void {
    if (hud) return;
    const hudEl = document.createElement("div");
    hudEl.id = "safari-mru-hud";
    const listElement = document.createElement("ul");
    hudEl.appendChild(listElement);
    document.documentElement.appendChild(hudEl);
    hud = hudEl;
    listEl = listElement;
    applyLayout();
  }

  function render(): void {
    ensureHud();
    if (!listEl) return;
    const listElement = listEl;
    listElement.innerHTML = "";
    items.forEach((t, i) => {
      const li = document.createElement("li");
      if (i === index) li.classList.add("selected");
      const img = document.createElement("img");
      img.className = "favicon";
      img.src = t.favIconUrl || "";
      img.referrerPolicy = "no-referrer";
      img.loading = "lazy";
      img.onerror = () => {
        img.style.opacity = "0.3";
        img.src =
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="gray"/></svg>';
      };
      const span = document.createElement("span");
      span.className = "title";
      span.textContent = t.title ?? "Untitled";
      li.appendChild(img);
      li.appendChild(span);
      listElement.appendChild(li);
    });
  }

  function show(): void {
    ensureHud();
    if (!hud) return;
    hud.style.display = "block";
    visible = true;
  }

  function hide(): void {
    if (!hud) return;
    hud.style.display = "none";
    visible = false;
  }

  async function requestItems(): Promise<MruItem[]> {
    return new Promise<MruItem[]>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "mru-request-active" } satisfies RuntimeMessage,
        (resp?: MruResponse) => {
          resolve(resp?.items ?? []);
        }
      );
    });
  }

  function wrapIndex(n: number): number {
    if (!items.length) return 0;
    const max = items.length;
    const wrapped = ((n % max) + max) % max;
    return wrapped;
  }

  // --- Keyboard handling ---
  function moveSelection(delta: number): void {
    index = wrapIndex(index + delta);
    if (visible) render();
  }

  function flushPendingMoves(): void {
    while (pendingMoves !== 0) {
      const step = pendingMoves > 0 ? 1 : -1;
      moveSelection(step);
      pendingMoves -= step;
    }
  }

  async function finalize(): Promise<void> {
    chrome.runtime.sendMessage({
      type: "mru-finalize",
      index,
    } satisfies RuntimeMessage);
    hide();
  }

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

        if (!sessionActive) {
          pendingMoves += delta;
          if (initializing) return;

          initializing = true;
          const fetched = await requestItems();
          initializing = false;

          if (fetched.length < 1) {
            pendingMoves = 0;
            sessionActive = false;
            return;
          }

          items = fetched;
          index = 0;
          sessionActive = true;

          if (hudTimer) clearTimeout(hudTimer);
          hudTimer = setTimeout(() => {
            if (optionIsHeld() && sessionActive && !visible) {
              render();
              show();
            }
            hudTimer = null;
          }, HUD_DELAY);

          cycled = true;
          flushPendingMoves();
        } else {
          cycled = true;
          moveSelection(delta);
        }
      } else if (optionIsHeld(event)) {
        markOptionHeld(event);
        if (hudTimer) {
          clearTimeout(hudTimer);
          hudTimer = null;
        }
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
        if (hudTimer) {
          clearTimeout(hudTimer);
          hudTimer = null;
        }
        if (cycled) {
          void finalize();
        }
        sessionActive = false;
        pendingMoves = 0;
        initializing = false;
        cycled = false;
      }
    },
    true
  );
})();
