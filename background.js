// --- MRU tracking ---
const stacks = new Map(); // windowId -> [tabIds], most recent at 0

function ensureWin(winId) {
  if (!stacks.has(winId)) stacks.set(winId, []);
}

async function pushActive(tabId, windowId) {
  ensureWin(windowId);
  const s = stacks.get(windowId);
  const idx = s.indexOf(tabId);
  if (idx !== -1) s.splice(idx, 1);
  s.unshift(tabId);
}

// Seed active tab into MRU when it changes
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  pushActive(tabId, windowId);
});

// Keep MRU when window focus changes and backfill that window
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  ensureWin(windowId);
  const [activeTab] = await chrome.tabs.query({ active: true, windowId });
  if (activeTab?.id) pushActive(activeTab.id, windowId);
  await backfillMissingTabs(windowId);
});

// Remove closed tabs from MRU
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  const { windowId } = removeInfo;
  const s = stacks.get(windowId);
  if (!s) return;
  const i = s.indexOf(tabId);
  if (i !== -1) s.splice(i, 1);
});

// When a tab is created, add it; if created active, promote immediately
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.windowId === undefined) return;
  ensureWin(tab.windowId);
  const s = stacks.get(tab.windowId);
  if (tab.active) {
    pushActive(tab.id, tab.windowId);
  } else if (!s.includes(tab.id)) {
    s.push(tab.id);
  }
});

// When a tab finishes navigating or URL changes, ensure it's tracked.
// If it's the active tab (Cmd+T → type URL → Enter), promote to MRU.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab || tab.windowId === undefined) return;

  // Only react to URL changes or load completion
  const urlChanged = Object.prototype.hasOwnProperty.call(changeInfo, "url");
  const loadDone = changeInfo.status === "complete";
  if (!urlChanged && !loadDone) return;

  ensureWin(tab.windowId);
  const s = stacks.get(tab.windowId);

  if (!s.includes(tabId)) {
    if (tab.active) {
      pushActive(tabId, tab.windowId);
    } else {
      s.push(tabId);
    }
  } else if (tab.active) {
    // Keep active tab at front if it navigated
    pushActive(tabId, tab.windowId);
  }
});

// Move MRU entries when a tab moves between windows
chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
  const s = stacks.get(detachInfo.oldWindowId);
  if (!s) return;
  const i = s.indexOf(tabId);
  if (i !== -1) s.splice(i, 1);
});
chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  ensureWin(attachInfo.newWindowId);
  const s = stacks.get(attachInfo.newWindowId);
  if (!s.includes(tabId)) s.push(tabId);
});

// Backfill any tabs in the window that aren't already tracked
async function backfillMissingTabs(windowId) {
  ensureWin(windowId);
  const s = stacks.get(windowId);
  const tabs = await chrome.tabs.query({ windowId });
  for (const t of tabs) {
    if (!s.includes(t.id)) s.push(t.id); // append to preserve existing MRU order
  }
}
chrome.runtime.onStartup.addListener(async () => {
  const wins = await chrome.windows.getAll({ populate: true });
  for (const w of wins) {
    ensureWin(w.id);
    await backfillMissingTabs(w.id);
  }
});
chrome.runtime.onInstalled.addListener(async () => {
  const wins = await chrome.windows.getAll({ populate: true });
  for (const w of wins) {
    ensureWin(w.id);
    await backfillMissingTabs(w.id);
  }
});

// --- HUD data & activation ---
const faviconCache = new Map();

async function getHudItems(windowId) {
  const s = stacks.get(windowId) || [];
  if (s.length === 0) return [];

  // Small delay helps Safari populate favIconUrl for newly-active tabs
  await new Promise((r) => setTimeout(r, 50));

  const tabs = await chrome.tabs.query({ windowId });
  const byId = new Map(tabs.map((t) => [t.id, t]));

  return s
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((t) => {
      let icon = t.favIconUrl;
      if (!icon) {
        icon =
          faviconCache.get(t.id) ||
          (t.url ? `https://www.google.com/s2/favicons?domain=${new URL(t.url).hostname}` : "");
      } else {
        faviconCache.set(t.id, icon);
      }
      return {
        id: t.id,
        title: t.title,
        favIconUrl: icon,
        pinned: t.pinned,
      };
    });
}

async function activateAt(windowId, pos) {
  const s = stacks.get(windowId) || [];
  if (s.length < 1) return;
  const clamped = Math.max(0, Math.min(s.length - 1, pos));
  if (clamped === 0) return; // 0 = current tab → no-op (cancel)
  const tabId = s[clamped];
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch {}
}

// --- Messages from content.js ---
chrome.runtime.onMessage.addListener(async (msg, _sender, sendResponse) => {
  if (msg?.type === "mru-request-active") {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const items = activeTab?.windowId ? await getHudItems(activeTab.windowId) : [];
    sendResponse({ items });
    return true;
  }
  if (msg?.type === "mru-request") {
    const win = await chrome.windows.getCurrent();
    const items = win?.id ? await getHudItems(win.id) : [];
    sendResponse({ items });
    return true;
  }
  if (msg?.type === "mru-finalize") {
    const win = await chrome.windows.getCurrent();
    if (win?.id != null) await activateAt(win.id, Math.max(0, msg.index ?? 1));
  }
});
