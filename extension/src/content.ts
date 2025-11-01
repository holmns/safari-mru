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

(() => {
  // --- UI state ---
  let hud: HTMLDivElement | null = null;
  let listEl: HTMLUListElement | null = null;
  let items: MruItem[] = [];
  let index = 1;
  let visible = false;
  let hudTimer: ReturnType<typeof setTimeout> | null = null;
  let cycled = false;
  let HUD_DELAY = 150;

  chrome.storage.sync.get({ hudDelay: 150 }, (data: { hudDelay?: unknown }) => {
    const value = typeof data.hudDelay === "number" ? data.hudDelay : 150;
    HUD_DELAY = value;
  });

  // Track modifier keys to detect Option hold and release
  type ModifierKeyCode = "AltLeft" | "AltRight";
  const down = new Set<ModifierKeyCode>();

  function ensureHud(): void {
    if (hud) return;
    const hudEl = document.createElement("div");
    hudEl.id = "safari-mru-hud";
    const listElement = document.createElement("ul");
    hudEl.appendChild(listElement);
    document.documentElement.appendChild(hudEl);
    hud = hudEl;
    listEl = listElement;
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

  function clampIndex(n: number): number {
    if (!items.length) return 0;
    const max = Math.max(0, items.length - 1);
    return Math.max(0, Math.min(max, n));
  }

  function isOptionHeld(): boolean {
    return down.has("AltLeft") || down.has("AltRight");
  }

  // --- Keyboard handling ---
  function moveSelection(delta: number): void {
    index = clampIndex(index + delta);
    if (visible) render();
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
    async (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        if (e.code === "AltLeft" || e.code === "AltRight") {
          down.add(e.code);
        }
        return;
      }

      if (e.key.toLowerCase() === "tab" && isOptionHeld()) {
        e.preventDefault();
        e.stopPropagation();

        if (e.repeat) return;

        if (!visible) {
          items = await requestItems();
          if (items.length < 1) return;
          index = 0;
          if (hudTimer) clearTimeout(hudTimer);
          hudTimer = setTimeout(() => {
            if (isOptionHeld() && !visible) {
              render();
              show();
            }
            hudTimer = null;
          }, HUD_DELAY);
          cycled = true;
          moveSelection(e.shiftKey ? -1 : 1);
        } else {
          cycled = true;
          moveSelection(e.shiftKey ? -1 : 1);
        }
      } else if (isOptionHeld()) {
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
    (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        if (e.code === "AltLeft" || e.code === "AltRight") {
          down.delete(e.code);
        }
        if (!isOptionHeld()) {
          if (hudTimer) {
            clearTimeout(hudTimer);
            hudTimer = null;
          }
          if (cycled) {
            void finalize();
          }
          cycled = false;
        }
      }
    },
    true
  );
})();
