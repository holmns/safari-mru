import {
  resolveHudTitle,
  type ContentCommandMessage,
  type HudItem,
  type HudMessage,
  type TabId,
  type WindowId,
} from "./shared/index";

const mruStore = (() => {
  const stacks = new Map<WindowId, TabId[]>();
  const storageArea = (chrome.storage.session ??
    chrome.storage.local) as chrome.storage.StorageArea;
  const MRU_STORAGE_KEY = "swiftTab.mruStacks";
  const PERSIST_DEBOUNCE_MS = 250;

  type SerializedStacks = Record<string, TabId[]>;

  let seedAllPromise: Promise<void> | null = null;
  let loadPromise: Promise<void> | null = null;
  let persistPromise: Promise<void> | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let loaded = false;

  function sanitizeStack(input: unknown): TabId[] {
    if (!Array.isArray(input)) return [];
    const seen = new Set<TabId>();
    const sanitized: TabId[] = [];
    for (const value of input) {
      if (typeof value !== "number" || !Number.isInteger(value)) continue;
      if (seen.has(value)) continue;
      seen.add(value);
      sanitized.push(value);
    }
    return sanitized;
  }

  function serializeStacks(): SerializedStacks {
    const serialized: SerializedStacks = {};
    for (const [windowId, stack] of stacks.entries()) {
      if (!Array.isArray(stack) || stack.length === 0) continue;
      serialized[String(windowId)] = [...stack];
    }
    return serialized;
  }

  async function persistStacks(): Promise<void> {
    const payload = serializeStacks();
    await new Promise<void>((resolve) => {
      const callback = () => {
        if (chrome.runtime.lastError) {
          console.warn("[SwiftTab] Failed to persist MRU stacks", chrome.runtime.lastError);
        }
        resolve();
      };
      if (Object.keys(payload).length === 0) {
        storageArea.remove(MRU_STORAGE_KEY, callback);
      } else {
        storageArea.set({ [MRU_STORAGE_KEY]: payload }, callback);
      }
    });
  }

  function schedulePersist(): void {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistPromise = persistStacks()
        .catch((error) => console.warn("[SwiftTab] Persist MRU failed unexpectedly", error))
        .finally(() => {
          persistPromise = null;
        });
    }, PERSIST_DEBOUNCE_MS);
  }

  async function flushPersist(): Promise<void> {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (persistPromise) {
      await persistPromise;
      return;
    }
    persistPromise = persistStacks()
      .catch((error) => console.warn("[SwiftTab] Persist MRU failed unexpectedly", error))
      .finally(() => {
        persistPromise = null;
      });
    await persistPromise;
  }

  async function loadStacks(): Promise<void> {
    await new Promise<void>((resolve) => {
      storageArea.get(MRU_STORAGE_KEY, (items) => {
        if (chrome.runtime.lastError) {
          console.warn("[SwiftTab] Failed to load MRU stacks", chrome.runtime.lastError);
          resolve();
          return;
        }
        const raw = items?.[MRU_STORAGE_KEY];
        if (raw && typeof raw === "object") {
          for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
            const windowId = Number(key);
            if (!Number.isInteger(windowId)) continue;
            const sanitized = sanitizeStack(value);
            if (sanitized.length === 0) continue;
            const existing = stacks.get(windowId);
            if (existing && existing.length > 0) continue;
            stacks.set(windowId, sanitized);
          }
        }
        resolve();
      });
    });
  }

  async function ensureLoaded(): Promise<void> {
    if (loaded) return;
    if (!loadPromise) {
      loadPromise = loadStacks().finally(() => {
        loaded = true;
        loadPromise = null;
      });
    }
    await loadPromise;
  }

  function ensure(windowId: WindowId): void {
    if (!loaded && !loadPromise) {
      void ensureLoaded();
    }
    if (!stacks.has(windowId)) stacks.set(windowId, []);
  }

  async function touch(windowId: WindowId, tabId: TabId): Promise<void> {
    await ensureLoaded();
    ensure(windowId);
    const stack = stacks.get(windowId);
    if (!stack) return;
    const existing = stack.indexOf(tabId);
    if (existing === 0) return;
    if (existing !== -1) stack.splice(existing, 1);
    stack.unshift(tabId);
    schedulePersist();
  }

  async function append(windowId: WindowId, tabId: TabId): Promise<void> {
    await ensureLoaded();
    ensure(windowId);
    const stack = stacks.get(windowId);
    if (!stack) return;
    if (stack.includes(tabId)) return;
    stack.push(tabId);
    schedulePersist();
  }

  async function remove(windowId: WindowId, tabId: TabId): Promise<void> {
    await ensureLoaded();
    const stack = stacks.get(windowId);
    if (!stack) return;
    const idx = stack.indexOf(tabId);
    if (idx === -1) return;
    stack.splice(idx, 1);
    if (stack.length === 0) {
      stacks.delete(windowId);
    }
    schedulePersist();
  }

  async function replace(windowId: WindowId, fromTabId: TabId, toTabId: TabId): Promise<boolean> {
    await ensureLoaded();
    ensure(windowId);
    const stack = stacks.get(windowId);
    if (!stack) return false;
    const idx = stack.indexOf(fromTabId);
    if (idx === -1) return false;
    stack.splice(idx, 1);
    let existingIdx = stack.indexOf(toTabId);
    while (existingIdx !== -1) {
      stack.splice(existingIdx, 1);
      existingIdx = stack.indexOf(toTabId);
    }
    stack.splice(idx, 0, toTabId);
    schedulePersist();
    return true;
  }

  async function backfill(windowId: WindowId): Promise<void> {
    await ensureLoaded();
    ensure(windowId);
    const stack = stacks.get(windowId);
    if (!stack) return;
    const tabs = await chrome.tabs.query({ windowId });
    let changed = false;
    for (const tab of tabs) {
      if (tab.id !== undefined && !stack.includes(tab.id)) {
        stack.push(tab.id);
        changed = true;
      }
    }
    if (changed) schedulePersist();
  }

  async function performSeedAll(): Promise<void> {
    await ensureLoaded();
    try {
      const currentWindow = await chrome.windows.getCurrent({ populate: true });
      if (currentWindow?.id !== undefined) {
        ensure(currentWindow.id);
        const tabs = currentWindow.tabs ?? [];
        const stack = stacks.get(currentWindow.id);
        if (!stack) return;
        let changed = false;
        for (const tab of tabs) {
          if (tab.id !== undefined && !stack.includes(tab.id)) {
            stack.push(tab.id);
            changed = true;
          }
        }
        if (changed) schedulePersist();
        return;
      }
    } catch {}

    const [firstWindow] = await chrome.windows.getAll({ populate: true });
    if (!firstWindow || firstWindow.id === undefined) return;
    ensure(firstWindow.id);
    const tabs = firstWindow.tabs ?? [];
    const stack = stacks.get(firstWindow.id);
    if (!stack) return;
    let changed = false;
    for (const tab of tabs) {
      if (tab.id !== undefined && !stack.includes(tab.id)) {
        stack.push(tab.id);
        changed = true;
      }
    }
    if (changed) schedulePersist();
  }

  async function seedAll(): Promise<void> {
    await ensureLoaded();
    if (!seedAllPromise) {
      seedAllPromise = performSeedAll().finally(() => {
        seedAllPromise = null;
      });
    }
    await seedAllPromise;
  }

  async function ensureSeeded(): Promise<void> {
    await ensureLoaded();
    if (stacks.size > 0) return;
    await seedAll();
  }

  function getStack(windowId: WindowId): TabId[] {
    ensure(windowId);
    return stacks.get(windowId) ?? [];
  }

  void ensureLoaded();

  return {
    ensure,
    touch,
    append,
    remove,
    replace,
    backfill,
    seedAll,
    ensureSeeded,
    getStack,
    stacks, // exposed for size checks
    flushPersist,
  };
})();

function createReplacementTracker() {
  const pending = new Set<TabId>();
  return {
    track(tabId: TabId) {
      pending.add(tabId);
      let released = false;
      return {
        release() {
          if (released) return;
          pending.delete(tabId);
          released = true;
        },
      };
    },
    consume(tabId: TabId): boolean {
      if (!pending.has(tabId)) return false;
      pending.delete(tabId);
      return true;
    },
  };
}

const faviconStore = (() => {
  const storageArea = chrome.storage.local;
  const STORAGE_KEY = "swiftTab.faviconCache";
  const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
  const MAX_HOST_ENTRIES = 256;
  const MAX_URL_ENTRIES = 256;
  const PERSIST_DEBOUNCE_MS = 250;

  interface CacheEntry {
    dataUri: string | null;
    expiresAt: number;
  }

  type SerializedEntries = Record<string, CacheEntry>;
  interface SerializedCache {
    hosts?: SerializedEntries;
    urls?: SerializedEntries;
  }

  const byHost = new Map<string, CacheEntry>();
  const byUrl = new Map<string, CacheEntry>();
  const pendingByHost = new Map<string, Promise<string | null>>();
  const pendingByUrl = new Map<string, Promise<string | null>>();
  let loaded = false;
  let loadPromise: Promise<void> | null = null;
  let persistPromise: Promise<void> | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  function extractHostname(rawUrl?: string | null): string | null {
    if (!rawUrl) return null;
    try {
      const url = new URL(rawUrl);
      return url.hostname ? url.hostname.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  function sanitizeEntry(input: unknown): CacheEntry | null {
    if (!input || typeof input !== "object") return null;
    const maybeValue = (input as { dataUri?: unknown }).dataUri;
    const maybeExpiresAt = (input as { expiresAt?: unknown }).expiresAt;
    const expiresAt = typeof maybeExpiresAt === "number" ? maybeExpiresAt : Number(maybeExpiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    if (maybeValue !== null && typeof maybeValue !== "string") return null;
    return {
      dataUri: maybeValue ?? null,
      expiresAt,
    };
  }

  function sanitizeEntries(input: unknown, target: Map<string, CacheEntry>): void {
    if (!input || typeof input !== "object") return;
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const entry = sanitizeEntry(value);
      if (!entry) continue;
      target.set(key, entry);
    }
  }

  function serializeEntries(map: Map<string, CacheEntry>): SerializedEntries {
    const serialized: SerializedEntries = {};
    const cutoff = Date.now();
    for (const [key, entry] of map.entries()) {
      if (entry.expiresAt <= cutoff) {
        map.delete(key);
        continue;
      }
      serialized[key] = { ...entry };
    }
    return serialized;
  }

  function pruneMap(map: Map<string, CacheEntry>, maxEntries: number): void {
    const cutoff = Date.now();
    for (const [key, entry] of map.entries()) {
      if (entry.expiresAt <= cutoff) {
        map.delete(key);
      }
    }
    if (map.size <= maxEntries) return;
    const orderedKeys = [...map.entries()]
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
      .map(([key]) => key);
    while (map.size > maxEntries && orderedKeys.length > 0) {
      const key = orderedKeys.shift();
      if (key) {
        map.delete(key);
      }
    }
  }

  async function persistCache(): Promise<void> {
    const payload: SerializedCache = {};
    const hosts = serializeEntries(byHost);
    const urls = serializeEntries(byUrl);
    if (Object.keys(hosts).length > 0) payload.hosts = hosts;
    if (Object.keys(urls).length > 0) payload.urls = urls;

    await new Promise<void>((resolve) => {
      const callback = () => {
        if (chrome.runtime.lastError) {
          console.warn("[SwiftTab] Failed to persist favicon cache", chrome.runtime.lastError);
        }
        resolve();
      };
      if (!payload.hosts && !payload.urls) {
        storageArea.remove(STORAGE_KEY, callback);
      } else {
        storageArea.set({ [STORAGE_KEY]: payload }, callback);
      }
    });
  }

  function schedulePersist(): void {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistPromise = persistCache()
        .catch((error) => console.warn("[SwiftTab] Persist favicon cache failed", error))
        .finally(() => {
          persistPromise = null;
        });
    }, PERSIST_DEBOUNCE_MS);
  }

  async function flushPersist(): Promise<void> {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (persistPromise) {
      await persistPromise;
      return;
    }
    persistPromise = persistCache()
      .catch((error) => console.warn("[SwiftTab] Persist favicon cache failed", error))
      .finally(() => {
        persistPromise = null;
      });
    await persistPromise;
  }

  async function loadCache(): Promise<void> {
    await new Promise<void>((resolve) => {
      storageArea.get(STORAGE_KEY, (items) => {
        if (chrome.runtime.lastError) {
          console.warn("[SwiftTab] Failed to load favicon cache", chrome.runtime.lastError);
          resolve();
          return;
        }
        const raw = items?.[STORAGE_KEY];
        if (raw && typeof raw === "object") {
          sanitizeEntries((raw as SerializedCache).hosts, byHost);
          sanitizeEntries((raw as SerializedCache).urls, byUrl);
        }
        resolve();
      });
    });
    pruneMap(byHost, MAX_HOST_ENTRIES);
    pruneMap(byUrl, MAX_URL_ENTRIES);
  }

  async function ensureLoaded(): Promise<void> {
    if (loaded) return;
    if (!loadPromise) {
      loadPromise = loadCache()
        .catch((error) => console.warn("[SwiftTab] Failed to initialize favicon cache", error))
        .finally(() => {
          loaded = true;
          loadPromise = null;
        });
    }
    await loadPromise;
  }

  function readCache(map: Map<string, CacheEntry>, key: string): string | null | undefined {
    const entry = map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      map.delete(key);
      schedulePersist();
      return undefined;
    }
    return entry.dataUri;
  }

  function writeCache(
    map: Map<string, CacheEntry>,
    key: string,
    dataUri: string | null,
    maxEntries: number
  ): void {
    map.set(key, {
      dataUri,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    pruneMap(map, maxEntries);
    schedulePersist();
  }

  async function fetchAsDataURI(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    const blob = await res.blob();
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onloadend = () =>
        typeof reader.result === "string" && reader.result.startsWith("data:")
          ? resolve(reader.result)
          : reject(new Error("Invalid result"));
      reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchAndCacheUrl(url: string): Promise<string | null> {
    await ensureLoaded();
    const cached = readCache(byUrl, url);
    if (cached !== undefined) return cached;

    const pending = pendingByUrl.get(url);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const dataUri = await fetchAsDataURI(url);
        writeCache(byUrl, url, dataUri, MAX_URL_ENTRIES);
        return dataUri;
      } catch (error) {
        console.warn("[SwiftTab] Failed to fetch favicon URL", url, error);
        writeCache(byUrl, url, null, MAX_URL_ENTRIES);
        return null;
      } finally {
        pendingByUrl.delete(url);
      }
    })();

    pendingByUrl.set(url, promise);
    return promise;
  }

  async function resolveHostFavicon(hostname: string): Promise<string | null> {
    await ensureLoaded();
    const cached = readCache(byHost, hostname);
    if (cached !== undefined) return cached;

    const pending = pendingByHost.get(hostname);
    if (pending) return pending;

    const promise = (async () => {
      const ddgFaviconUrl = `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
      try {
        const dataUri = await fetchAsDataURI(ddgFaviconUrl);
        writeCache(byHost, hostname, dataUri, MAX_HOST_ENTRIES);
        return dataUri;
      } catch (error) {
        console.warn("[SwiftTab] Failed to fetch DuckDuckGo favicon", hostname, error);
        writeCache(byHost, hostname, null, MAX_HOST_ENTRIES);
        return null;
      } finally {
        pendingByHost.delete(hostname);
      }
    })();

    pendingByHost.set(hostname, promise);
    return promise;
  }

  async function resolve(tab: chrome.tabs.Tab & { id: number }): Promise<string | null> {
    await ensureLoaded();

    if (tab.favIconUrl?.startsWith("data:")) {
      console.log("[SwiftTab] Using data URI favicon for tab", tab.id);
      return tab.favIconUrl;
    }

    if (tab.favIconUrl) {
      const cachedByUrl = readCache(byUrl, tab.favIconUrl);
      if (cachedByUrl !== undefined) return cachedByUrl;
      return fetchAndCacheUrl(tab.favIconUrl);
    }

    const canonicalUrl = tab.url ?? tab.pendingUrl ?? undefined;
    const hostname = extractHostname(canonicalUrl);

    if (!hostname) {
      console.log("[SwiftTab] No Hostname. Fallback favicon for tab", tab.title);
      return null;
    }

    const cachedByHost = readCache(byHost, hostname);
    if (cachedByHost !== undefined) return cachedByHost;

    return resolveHostFavicon(hostname);
  }

  void ensureLoaded();

  return {
    resolve,
    flushPersist,
  };
})();

async function getHudItems(windowId: WindowId): Promise<HudItem[]> {
  await mruStore.ensureSeeded();
  mruStore.ensure(windowId);

  let stack = [...mruStore.getStack(windowId)];
  if (stack.length === 0) {
    await mruStore.backfill(windowId);
    stack = [...mruStore.getStack(windowId)];
  }

  if (stack.length === 0 && mruStore.stacks.size === 0) {
    await mruStore.seedAll();
    stack = [...mruStore.getStack(windowId)];
  }

  if (stack.length === 0) return [];

  const tabs = await chrome.tabs.query({ windowId });
  const typedTabs = tabs.filter(
    (tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined
  );
  const byId = new Map<TabId, (typeof typedTabs)[number]>(typedTabs.map((tab) => [tab.id, tab]));

  const orderedTabs = stack
    .map((id) => byId.get(id))
    .filter((tab): tab is (typeof typedTabs)[number] => Boolean(tab?.id));

  const icons = await Promise.all(orderedTabs.map((tab) => faviconStore.resolve(tab)));

  return orderedTabs.map((tab, idx) => {
    const canonicalUrl = tab.url ?? tab.pendingUrl ?? null;
    const hostname = (() => {
      if (!canonicalUrl) return null;
      try {
        const url = new URL(canonicalUrl);
        return url.hostname || null;
      } catch {
        return null;
      }
    })();

    return {
      id: tab.id,
      title: resolveHudTitle({
        title: tab.title,
        url: tab.url ?? null,
        pendingUrl: tab.pendingUrl ?? null,
      }),
      url: canonicalUrl,
      hostname,
      favIconUrl: icons[idx] ?? null,
      pinned: tab.pinned,
    } satisfies HudItem;
  });
}

async function activateAt(windowId: WindowId, position: number): Promise<void> {
  await mruStore.ensureSeeded();
  const stack = mruStore.getStack(windowId);
  if (!stack.length) return;
  const normalized = ((position % stack.length) + stack.length) % stack.length;
  const tabId = stack[normalized];
  if (normalized === 0) return;
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    // tab may have been closed; swallow the error
  }
}

function registerListeners(): void {
  const replacementTracker = createReplacementTracker();

  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    void mruStore.touch(windowId, tabId);
  });

  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    const [activeTab] = await chrome.tabs.query({ active: true, windowId });
    if (activeTab?.id !== undefined) {
      void mruStore.touch(windowId, activeTab.id);
    }
    await mruStore.backfill(windowId);
  });

  chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    const guard = replacementTracker.track(removedTabId);
    void (async () => {
      try {
        const tab = await chrome.tabs.get(addedTabId);
        if (tab.windowId === undefined) return;
        const replaced = await mruStore.replace(tab.windowId, removedTabId, addedTabId);
        if (!replaced) {
          if (tab.active) {
            await mruStore.touch(tab.windowId, addedTabId);
          } else {
            await mruStore.append(tab.windowId, addedTabId);
          }
        }
      } catch (error) {
        console.warn(
          "[SwiftTab] Failed to handle tab replacement",
          { addedTabId, removedTabId },
          error
        );
      } finally {
        guard.release();
      }
    })();
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    // Preserve MRU focus order when the currently active tab is closed.
    void (async () => {
      const { windowId, isWindowClosing } = removeInfo;
      const stack = mruStore.getStack(windowId);
      const closedActiveTab = stack[0] === tabId;

      await mruStore.remove(windowId, tabId);
      if (replacementTracker.consume(tabId)) {
        return;
      }
      if (isWindowClosing || !closedActiveTab) {
        return;
      }

      const fallbackTabId = mruStore.getStack(windowId)[0];
      if (typeof fallbackTabId !== "number") return;

      try {
        await chrome.tabs.update(fallbackTabId, { active: true });
      } catch (error) {
        const message = (error as { message?: string } | undefined)?.message ?? "";
        if (!message.includes("No tab with id")) {
          console.warn("[SwiftTab] Failed to activate MRU tab after close", fallbackTabId, error);
        }
      }
    })();
  });

  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id === undefined || tab.windowId === undefined) return;
    if (tab.active) {
      void mruStore.touch(tab.windowId, tab.id);
    } else {
      void mruStore.append(tab.windowId, tab.id);
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab || tab.windowId === undefined) return;
    const urlChanged = Object.prototype.hasOwnProperty.call(changeInfo, "url");
    const loadFinished = changeInfo.status === "complete";
    if (!urlChanged && !loadFinished) return;

    if (tab.active) {
      void mruStore.touch(tab.windowId, tabId);
    } else {
      void mruStore.append(tab.windowId, tabId);
    }
  });

  chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
    void mruStore.remove(detachInfo.oldWindowId, tabId);
  });

  chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
    void mruStore.append(attachInfo.newWindowId, tabId);
  });

  chrome.runtime.onStartup.addListener(() => {
    void mruStore.seedAll();
  });

  chrome.runtime.onInstalled.addListener(() => {
    void mruStore.seedAll();
  });

  if (chrome.runtime.onSuspend) {
    chrome.runtime.onSuspend.addListener(() => {
      void (async () => {
        await Promise.all([mruStore.flushPersist(), faviconStore.flushPersist()]);
      })();
    });
  }

  chrome.runtime.onMessage.addListener((msg: HudMessage, _sender, sendResponse) => {
    if (msg?.type === "mru-request") {
      void (async () => {
        const win = await chrome.windows.getCurrent();
        if (win?.id !== undefined) {
          const items = await getHudItems(win.id);
          sendResponse({ items });
        } else {
          sendResponse({ items: [] });
        }
      })();
      return true;
    }

    if (msg?.type === "mru-finalize") {
      void (async () => {
        const win = await chrome.windows.getCurrent();
        if (win?.id !== undefined) {
          if (typeof msg.tabId === "number") {
            try {
              await chrome.tabs.update(msg.tabId, { active: true });
            } catch {
              // tab may no longer exist; ignore
            }
            return;
          }
          await activateAt(win.id, Math.max(0, msg.index ?? 1));
        }
      })();
    }

    return false;
  });

  if (chrome.commands) {
    chrome.commands.onCommand.addListener(async (command) => {
      if (command !== "swift-tab-toggle-search") return;
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) return;
      try {
        await chrome.tabs.sendMessage(activeTab.id, {
          type: "hud-toggle-search",
        } satisfies ContentCommandMessage);
      } catch (error) {
        const message = (error as { message?: string } | undefined)?.message;
        if (message && message.includes("Receiving end does not exist")) {
          return;
        }
        console.warn("[SwiftTab] Failed to notify content script", error);
      }
    });
  }
}

registerListeners();

export {};
