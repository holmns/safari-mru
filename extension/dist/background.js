"use strict";
// --- MRU tracking ---
const stacks = new Map(); // windowId -> [tabIds], most recent at 0
function ensureWin(windowId) {
    if (!stacks.has(windowId))
        stacks.set(windowId, []);
}
function pushActive(tabId, windowId) {
    ensureWin(windowId);
    const stack = stacks.get(windowId);
    if (!stack)
        return;
    const existingIndex = stack.indexOf(tabId);
    if (existingIndex !== -1)
        stack.splice(existingIndex, 1);
    stack.unshift(tabId);
}
// Seed active tab into MRU when it changes
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    pushActive(tabId, windowId);
});
// Keep MRU when window focus changes and backfill that window
chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE)
        return;
    ensureWin(windowId);
    const [activeTab] = await chrome.tabs.query({ active: true, windowId });
    if ((activeTab === null || activeTab === void 0 ? void 0 : activeTab.id) !== undefined)
        pushActive(activeTab.id, windowId);
    await backfillMissingTabs(windowId);
});
// Remove closed tabs from MRU
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    const { windowId } = removeInfo;
    const stack = stacks.get(windowId);
    if (!stack)
        return;
    const idx = stack.indexOf(tabId);
    if (idx !== -1)
        stack.splice(idx, 1);
});
// When a tab is created, add it; if created active, promote immediately
chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id === undefined || tab.windowId === undefined)
        return;
    ensureWin(tab.windowId);
    const stack = stacks.get(tab.windowId);
    if (!stack)
        return;
    if (tab.active) {
        pushActive(tab.id, tab.windowId);
    }
    else if (!stack.includes(tab.id)) {
        stack.push(tab.id);
    }
});
// When a tab finishes navigating or URL changes, ensure it's tracked.
// If it's the active tab (Cmd+T → type URL → Enter), promote to MRU.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab || tab.windowId === undefined)
        return;
    // Only react to URL changes or load completion
    const urlChanged = Object.prototype.hasOwnProperty.call(changeInfo, "url");
    const loadDone = changeInfo.status === "complete";
    if (!urlChanged && !loadDone)
        return;
    ensureWin(tab.windowId);
    const stack = stacks.get(tab.windowId);
    if (!stack)
        return;
    if (!stack.includes(tabId)) {
        if (tab.active) {
            pushActive(tabId, tab.windowId);
        }
        else {
            stack.push(tabId);
        }
    }
    else if (tab.active) {
        pushActive(tabId, tab.windowId);
    }
});
// Move MRU entries when a tab moves between windows
chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
    const stack = stacks.get(detachInfo.oldWindowId);
    if (!stack)
        return;
    const idx = stack.indexOf(tabId);
    if (idx !== -1)
        stack.splice(idx, 1);
});
chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
    ensureWin(attachInfo.newWindowId);
    const stack = stacks.get(attachInfo.newWindowId);
    if (!stack)
        return;
    if (!stack.includes(tabId))
        stack.push(tabId);
});
// Backfill any tabs in the window that aren't already tracked
async function backfillMissingTabs(windowId) {
    ensureWin(windowId);
    const stack = stacks.get(windowId);
    if (!stack)
        return;
    const tabs = await chrome.tabs.query({ windowId });
    for (const tab of tabs) {
        if (tab.id !== undefined && !stack.includes(tab.id)) {
            stack.push(tab.id); // append to preserve existing MRU order
        }
    }
}
async function seedAllWindows() {
    const wins = await chrome.windows.getAll({ populate: true });
    for (const window of wins) {
        if (window.id === undefined)
            continue;
        ensureWin(window.id);
        await backfillMissingTabs(window.id);
    }
}
chrome.runtime.onStartup.addListener(() => {
    void seedAllWindows();
});
chrome.runtime.onInstalled.addListener(() => {
    void seedAllWindows();
});
// --- HUD data & activation ---
const faviconCacheByHost = new Map();
const faviconCacheByUrl = new Map();
async function delay(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
function extractHostname(rawUrl) {
    if (!rawUrl)
        return null;
    try {
        const url = new URL(rawUrl);
        return url.hostname ? url.hostname.toLowerCase() : null;
    }
    catch {
        return null;
    }
}
function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onloadend = () => {
            const result = typeof reader.result === "string" ? reader.result : null;
            if (result)
                resolve(result);
            else
                reject(new Error("Unable to read favicon blob"));
        };
        reader.readAsDataURL(blob);
    });
}
async function fetchAsDataUrl(url) {
    try {
        const response = await fetch(url, {
            credentials: "omit",
            mode: "no-cors",
        });
        if (!response.ok && response.type !== "opaque") {
            return null;
        }
        const blob = await response.blob();
        return await blobToDataUrl(blob);
    }
    catch {
        return null;
    }
}
async function resolveIcon(tab) {
    var _a, _b, _c, _d;
    if ((_a = tab.favIconUrl) === null || _a === void 0 ? void 0 : _a.startsWith("data:")) {
        return tab.favIconUrl;
    }
    const canonicalUrl = (_c = (_b = tab.url) !== null && _b !== void 0 ? _b : tab.pendingUrl) !== null && _c !== void 0 ? _c : undefined;
    const hostname = extractHostname(canonicalUrl);
    if (tab.favIconUrl) {
        const cachedByUrl = faviconCacheByUrl.get(tab.favIconUrl);
        if (cachedByUrl)
            return cachedByUrl;
    }
    if (hostname) {
        const cachedByHost = faviconCacheByHost.get(hostname);
        if (cachedByHost)
            return cachedByHost;
    }
    const candidateUrls = [
        tab.favIconUrl,
        hostname
            ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname)}`
            : undefined,
        hostname ? `https://icons.duckduckgo.com/ip3/${hostname}.ico` : undefined,
    ].filter((url) => Boolean(url));
    for (const url of candidateUrls) {
        const cached = faviconCacheByUrl.get(url);
        if (cached) {
            return cached;
        }
        const dataUrl = await fetchAsDataUrl(url);
        if (dataUrl) {
            faviconCacheByUrl.set(url, dataUrl);
            if (hostname)
                faviconCacheByHost.set(hostname, dataUrl);
            return dataUrl;
        }
    }
    if (hostname) {
        const fallback = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname)}`;
        faviconCacheByHost.set(hostname, fallback);
        return fallback;
    }
    return (_d = tab.favIconUrl) !== null && _d !== void 0 ? _d : undefined;
}
async function getHudItems(windowId) {
    var _a, _b, _c;
    ensureWin(windowId);
    let stack = (_a = stacks.get(windowId)) !== null && _a !== void 0 ? _a : [];
    if (stack.length === 0) {
        await backfillMissingTabs(windowId);
        stack = (_b = stacks.get(windowId)) !== null && _b !== void 0 ? _b : [];
    }
    if (stack.length === 0 && stacks.size === 0) {
        await seedAllWindows();
        stack = (_c = stacks.get(windowId)) !== null && _c !== void 0 ? _c : [];
    }
    if (stack.length === 0)
        return [];
    await delay(75);
    const tabs = await chrome.tabs.query({ windowId });
    const typedTabs = tabs.filter((tab) => tab.id !== undefined);
    const byId = new Map(typedTabs.map((tab) => [tab.id, tab]));
    const orderedTabs = stack
        .map((id) => byId.get(id))
        .filter((tab) => Boolean(tab === null || tab === void 0 ? void 0 : tab.id));
    const icons = await Promise.all(orderedTabs.map((tab) => resolveIcon(tab)));
    return orderedTabs.map((tab, idx) => {
        var _a;
        return ({
            id: tab.id,
            title: (_a = tab.title) !== null && _a !== void 0 ? _a : undefined,
            favIconUrl: icons[idx],
            pinned: tab.pinned,
        });
    });
}
async function activateAt(windowId, position) {
    var _a;
    const stack = (_a = stacks.get(windowId)) !== null && _a !== void 0 ? _a : [];
    if (stack.length < 1)
        return;
    const clamped = Math.max(0, Math.min(stack.length - 1, position));
    if (clamped === 0)
        return; // 0 = current tab → no-op (cancel)
    const tabId = stack[clamped];
    try {
        await chrome.tabs.update(tabId, { active: true });
    }
    catch {
        // Ignore failures (tab may no longer exist)
    }
}
// --- Messages from content.ts ---
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if ((msg === null || msg === void 0 ? void 0 : msg.type) === "mru-request-active") {
        void (async () => {
            const [activeTab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            const items = (activeTab === null || activeTab === void 0 ? void 0 : activeTab.windowId) !== undefined
                ? await getHudItems(activeTab.windowId)
                : [];
            sendResponse({ items });
        })();
        return true;
    }
    if ((msg === null || msg === void 0 ? void 0 : msg.type) === "mru-request") {
        void (async () => {
            const win = await chrome.windows.getCurrent();
            const items = (win === null || win === void 0 ? void 0 : win.id) !== undefined ? await getHudItems(win.id) : [];
            sendResponse({ items });
        })();
        return true;
    }
    if ((msg === null || msg === void 0 ? void 0 : msg.type) === "mru-finalize") {
        void (async () => {
            var _a;
            const win = await chrome.windows.getCurrent();
            if ((win === null || win === void 0 ? void 0 : win.id) !== undefined) {
                await activateAt(win.id, Math.max(0, (_a = msg.index) !== null && _a !== void 0 ? _a : 1));
            }
        })();
    }
    return false;
});
