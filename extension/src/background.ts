import type { HudItem, HudMessage, TabId, WindowId } from "./shared/index";

const FALLBACK_ICON_DATA_URI = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAAsTAAALEwEAmpwYAAAFX0lEQVR4nO2a228WVRTFC02xDWmtVV/wxXLzSRT1waQIXoi36IMXUEmUNngD1AZIKvgkeMGYaPQfsKhPUqOJSrzilQhi0YJJFUR5sYqIoeKFooSf2c06ye50vpnz9ZvSYlxJk87sNefMnnP2Ofus/VVV/Y84AKfZX9XJAmA6cDfwArAd6Gc4+mV7HrjLnqkaDwCagJVADyPHl8CKMRk14HTgSeCwe6HfgGPu+iVgjru+BNjoro/pmQBr6wn7OCfCgQnAEuCge4G3gFuBh3T9F3CHe2YQ7noxcES31wC3AW+79g4AbdbXaE6j11yHHwMtss0D/gGOAzcnnhviiO4tENeemad7NnqfuPZfLXy6AecA+9wUWOxsNcDXsj2c8uwwR3R/nUz2bI273wr8Ltt3wIyinLhAw23YkVxpFKiGb4BJZTgyCdgt88qEbYb6MvwMzC5iJIITHwD1CXuds19doo1UR2S71sVFXcJWD3zonJleSUyE6dQLTE7h2L5h6Mlop6Qjsu8U5c4U22Q3bfcCjSNZnXxgo2mw3DcGbJPt3gocWSbKVnfvVGCpm3oBr5S1mtnXcYHdoa8R8LeWyzWOU1+BIw0uuDuATcCA6+9bYJXbs1rL2ezCPrFM96ptWdWeYY54/CHHnrWRAa4CLgKm2ug5nn3lZi0eV2paPg286Rzxm+W7Wqar9Q42G0K85C/L2rHDPjGxROy0uiAvEr8oBzsjpd+Jbp9Zn+dEkxvClpwYCknhxcB1mhbP6Ut2A98Dh9xL9mvxsGX1PWADsBq4wfpynAkZ/Vqag1Kb0qOiuWj4LCLTNfyQ+WUiYsTxfhR1Wg7vU/Has0ghi70xpzGbu4bXC3TEgpxkipPR9468r/wnUJvT2OPiri3QkUdEfSyHV6fE1NBclbG5vRHR6cviLizQEcugDRsjuLbSGZakGe1kZ7g/oiFLVwyXFejI5aK+H8FtF3dDmvFzGS+NaOgrcc8t0JFZou6K4M4Xd1ua8VDJeTec2yfulAIdmSJqXwR3mri/Jg3VOugc82eDjIaOqqFTCnTE0np7h6MR3Bq96/Ehm7bSh5MVDf9JR6rLnFohO62N4A4iglcr6sCIp9Y4Cfazygh2y6yHB7uMpgDGLr+7xJ1VoCPni7ozgntF8jDmjSZjjuWGGF6unA2xM81o5wDDpoiGusS9ZRRSlK5KUxSfNA5RNDKSxnVjnDSeXYpkgrLhppzG7Ngbm2COVhrfnUUyZd2wPTJF6CvQkZ9EnZrD2yreA3lFmXDUnRN51G3RcdVUlRctWDWy+xI1kn4df/1R147H1+u4HDhZR925jpetcUnazxIfztTCYEJB0TggYaOphPiwJSaOvAARFJLlbudfCGxO1ECQlGOryFNycL4kn+aEHNSojexCyUH3AM9ISjJJycMkp3cSctB9su2PVhxVn0DTbJVEsoABBWaHc6Qho61B5Ah0h5VurJZ2FrLroMg/6Kb87VFOuBiw+oTHbglwDSmS6dIKHDFpNCmZNkpKNYXfI3ePKRX49jWQkDxaInZPjojdK/sey9LLdsTVKUyiRBJ/VlnhmoLLCg3ARy4uMvWuGGdmO2e+AGaOQqFnRcI2023O5sR5FTmRGJm9LrjbSpTe1pbhSEhJehOltzYnau+peCRSOm5UfSJgS9g0E8XQBXmOaCkPxdC5Ttfd4gN7xDERuZq1uqmG1vtFrjx9xNcwko7oeV+eXiThO2B/WUtshQ7ZirY+UfBP/mCgy6nn6P+gUCJu8gcHj5ZdXivQoXZXgR0JutXGiXcgDUpJ7FcRnVaWsPN0yksf1CbaKW76eWI8QovE+PjaVScB/gUcpqAaAuI+2AAAAABJRU5ErkJggg==`;

const mruStore = (() => {
  const stacks = new Map<WindowId, TabId[]>();
  let seedAllPromise: Promise<void> | null = null;

  function ensure(windowId: WindowId): void {
    if (!stacks.has(windowId)) stacks.set(windowId, []);
  }

  function touch(windowId: WindowId, tabId: TabId): void {
    ensure(windowId);
    const stack = stacks.get(windowId);
    if (!stack) return;
    const existing = stack.indexOf(tabId);
    if (existing !== -1) stack.splice(existing, 1);
    stack.unshift(tabId);
  }

  function append(windowId: WindowId, tabId: TabId): void {
    ensure(windowId);
    const stack = stacks.get(windowId);
    if (!stack) return;
    if (!stack.includes(tabId)) stack.push(tabId);
  }

  function remove(windowId: WindowId, tabId: TabId): void {
    const stack = stacks.get(windowId);
    if (!stack) return;
    const idx = stack.indexOf(tabId);
    if (idx !== -1) stack.splice(idx, 1);
  }

  async function backfill(windowId: WindowId): Promise<void> {
    ensure(windowId);
    const stack = stacks.get(windowId);
    if (!stack) return;
    const tabs = await chrome.tabs.query({ windowId });
    for (const tab of tabs) {
      if (tab.id !== undefined && !stack.includes(tab.id)) {
        stack.push(tab.id);
      }
    }
  }

  async function performSeedAll(): Promise<void> {
    try {
      const currentWindow = await chrome.windows.getCurrent({ populate: true });
      if (currentWindow?.id !== undefined) {
        ensure(currentWindow.id);
        const tabs = currentWindow.tabs ?? [];
        const stack = stacks.get(currentWindow.id);
        if (!stack) return;
        for (const tab of tabs) {
          if (tab.id !== undefined && !stack.includes(tab.id)) {
            stack.push(tab.id);
          }
        }
        return;
      }
    } catch {}

    const [firstWindow] = await chrome.windows.getAll({ populate: true });
    if (!firstWindow || firstWindow.id === undefined) return;
    ensure(firstWindow.id);
    const tabs = firstWindow.tabs ?? [];
    const stack = stacks.get(firstWindow.id);
    if (!stack) return;
    for (const tab of tabs) {
      if (tab.id !== undefined && !stack.includes(tab.id)) {
        stack.push(tab.id);
      }
    }
  }

  async function seedAll(): Promise<void> {
    if (!seedAllPromise) {
      seedAllPromise = performSeedAll().finally(() => {
        seedAllPromise = null;
      });
    }
    await seedAllPromise;
  }

  async function ensureSeeded(): Promise<void> {
    if (stacks.size > 0) return;
    await seedAll();
  }

  function getStack(windowId: WindowId): TabId[] {
    ensure(windowId);
    return stacks.get(windowId) ?? [];
  }

  return {
    ensure,
    touch,
    append,
    remove,
    backfill,
    seedAll,
    ensureSeeded,
    getStack,
    stacks, // exposed for size checks
  };
})();

const faviconStore = (() => {
  const byHost = new Map<string, string>();
  const byUrl = new Map<string, string>();

  function extractHostname(rawUrl?: string | null): string | null {
    if (!rawUrl) return null;
    try {
      const url = new URL(rawUrl);
      return url.hostname ? url.hostname.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onloadend = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Unable to read favicon blob"));
      };
      reader.readAsDataURL(blob);
    });
  }

  async function fetchAsDataUrl(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        credentials: "omit",
        mode: "no-cors",
      });
      if (!response.ok && response.type !== "opaque") return null;
      const blob = await response.blob();
      return await blobToDataUrl(blob);
    } catch {
      return null;
    }
  }

  async function resolve(
    tab: chrome.tabs.Tab & { id: number }
  ): Promise<string> {
    if (tab.favIconUrl?.startsWith("data:")) {
      return tab.favIconUrl;
    }

    const canonicalUrl = tab.url ?? tab.pendingUrl ?? undefined;
    const hostname = extractHostname(canonicalUrl);

    if (tab.favIconUrl) {
      const cachedByUrl = byUrl.get(tab.favIconUrl);
      if (cachedByUrl) return cachedByUrl;
    }

    if (hostname) {
      const cachedByHost = byHost.get(hostname);
      if (cachedByHost) return cachedByHost;
    }

    const candidateUrls = [
      tab.favIconUrl,
      hostname
        ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(
            hostname
          )}`
        : undefined,
      hostname ? `https://icons.duckduckgo.com/ip3/${hostname}.ico` : undefined,
    ].filter((url): url is string => Boolean(url));

    for (const url of candidateUrls) {
      const cached = byUrl.get(url);
      if (cached) return cached;

      const dataUrl = await fetchAsDataUrl(url);
      if (dataUrl) {
        byUrl.set(url, dataUrl);
        if (hostname) byHost.set(hostname, dataUrl);
        return dataUrl;
      }
    }

    if (hostname) byHost.set(hostname, FALLBACK_ICON_DATA_URI);
    return FALLBACK_ICON_DATA_URI;
  }

  return {
    resolve,
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
  const byId = new Map<TabId, (typeof typedTabs)[number]>(
    typedTabs.map((tab) => [tab.id, tab])
  );

  const orderedTabs = stack
    .map((id) => byId.get(id))
    .filter((tab): tab is (typeof typedTabs)[number] => Boolean(tab?.id));

  const icons = await Promise.all(
    orderedTabs.map((tab) => faviconStore.resolve(tab))
  );

  return orderedTabs.map((tab, idx) => ({
    id: tab.id,
    title: tab.title ?? undefined,
    favIconUrl: icons[idx],
    pinned: tab.pinned,
  }));
}

async function activateAt(windowId: WindowId, position: number): Promise<void> {
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
  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    mruStore.touch(windowId, tabId);
  });

  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    const [activeTab] = await chrome.tabs.query({ active: true, windowId });
    if (activeTab?.id !== undefined) {
      mruStore.touch(windowId, activeTab.id);
    }
    await mruStore.backfill(windowId);
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    mruStore.remove(removeInfo.windowId, tabId);
  });

  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id === undefined || tab.windowId === undefined) return;
    if (tab.active) {
      mruStore.touch(tab.windowId, tab.id);
    } else {
      mruStore.append(tab.windowId, tab.id);
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab || tab.windowId === undefined) return;
    const urlChanged = Object.prototype.hasOwnProperty.call(changeInfo, "url");
    const loadFinished = changeInfo.status === "complete";
    if (!urlChanged && !loadFinished) return;

    if (tab.active) {
      mruStore.touch(tab.windowId, tabId);
    } else {
      mruStore.append(tab.windowId, tabId);
    }
  });

  chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
    mruStore.remove(detachInfo.oldWindowId, tabId);
  });

  chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
    mruStore.append(attachInfo.newWindowId, tabId);
  });

  chrome.runtime.onStartup.addListener(() => {
    void mruStore.seedAll();
  });

  chrome.runtime.onInstalled.addListener(() => {
    void mruStore.seedAll();
  });

  chrome.runtime.onMessage.addListener(
    (msg: HudMessage, _sender, sendResponse) => {
      if (msg?.type === "mru-request") {
        void (async () => {
          const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          const items =
            activeTab?.windowId !== undefined
              ? await getHudItems(activeTab.windowId)
              : [];
          sendResponse({ items });
        })();
        return true;
      }

      if (msg?.type === "mru-finalize") {
        void (async () => {
          const win = await chrome.windows.getCurrent();
          if (win?.id !== undefined) {
            await activateAt(win.id, Math.max(0, msg.index ?? 1));
          }
        })();
      }

      return false;
    }
  );
}

registerListeners();

export {};
