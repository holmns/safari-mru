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
const faviconCache = new Map();
async function delay(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
async function getHudItems(windowId) {
    var _a;
    const stack = (_a = stacks.get(windowId)) !== null && _a !== void 0 ? _a : [];
    if (stack.length === 0)
        return [];
    // Small delay helps Safari populate favIconUrl for newly-active tabs
    await delay(50);
    const tabs = await chrome.tabs.query({ windowId });
    const typedTabs = tabs.filter((tab) => tab.id !== undefined);
    const byId = new Map(typedTabs.map((tab) => [tab.id, tab]));
    return stack
        .map((id) => byId.get(id))
        .filter((tab) => Boolean(tab === null || tab === void 0 ? void 0 : tab.id))
        .map((tab) => {
        var _a;
        let icon = tab.favIconUrl;
        if (!icon) {
            icon =
                faviconCache.get(tab.id) ||
                    (tab.url ? `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}` : undefined);
        }
        else {
            faviconCache.set(tab.id, icon);
        }
        return {
            id: tab.id,
            title: (_a = tab.title) !== null && _a !== void 0 ? _a : undefined,
            favIconUrl: icon,
            pinned: tab.pinned,
        };
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
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const items = (activeTab === null || activeTab === void 0 ? void 0 : activeTab.windowId) !== undefined ? await getHudItems(activeTab.windowId) : [];
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
