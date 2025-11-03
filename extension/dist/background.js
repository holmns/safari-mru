const FALLBACK_ICON_DATA_URI = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAAsTAAALEwEAmpwYAAAFX0lEQVR4nO2a228WVRTFC02xDWmtVV/wxXLzSRT1waQIXoi36IMXUEmUNngD1AZIKvgkeMGYaPQfsKhPUqOJSrzilQhi0YJJFUR5sYqIoeKFooSf2c06ye50vpnz9ZvSYlxJk87sNefMnnP2Ofus/VVV/Y84AKfZX9XJAmA6cDfwArAd6Gc4+mV7HrjLnqkaDwCagJVADyPHl8CKMRk14HTgSeCwe6HfgGPu+iVgjru+BNjoro/pmQBr6wn7OCfCgQnAEuCge4G3gFuBh3T9F3CHe2YQ7noxcES31wC3AW+79g4AbdbXaE6j11yHHwMtss0D/gGOAzcnnhviiO4tENeemad7NnqfuPZfLXy6AecA+9wUWOxsNcDXsj2c8uwwR3R/nUz2bI273wr8Ltt3wIyinLhAw23YkVxpFKiGb4BJZTgyCdgt88qEbYb6MvwMzC5iJIITHwD1CXuds19doo1UR2S71sVFXcJWD3zonJleSUyE6dQLTE7h2L5h6Mlop6Qjsu8U5c4U22Q3bfcCjSNZnXxgo2mw3DcGbJPt3gocWSbKVnfvVGCpm3oBr5S1mtnXcYHdoa8R8LeWyzWOU1+BIw0uuDuATcCA6+9bYJXbs1rL2ezCPrFM96ptWdWeYY54/CHHnrWRAa4CLgKm2ug5nn3lZi0eV2paPg286Rzxm+W7Wqar9Q42G0K85C/L2rHDPjGxROy0uiAvEr8oBzsjpd+Jbp9Zn+dEkxvClpwYCknhxcB1mhbP6Ut2A98Dh9xL9mvxsGX1PWADsBq4wfpynAkZ/Vqag1Kb0qOiuWj4LCLTNfyQ+WUiYsTxfhR1Wg7vU/Has0ghi70xpzGbu4bXC3TEgpxkipPR9468r/wnUJvT2OPiri3QkUdEfSyHV6fE1NBclbG5vRHR6cviLizQEcugDRsjuLbSGZakGe1kZ7g/oiFLVwyXFejI5aK+H8FtF3dDmvFzGS+NaOgrcc8t0JFZou6K4M4Xd1ua8VDJeTec2yfulAIdmSJqXwR3mri/Jg3VOugc82eDjIaOqqFTCnTE0np7h6MR3Bq96/Ehm7bSh5MVDf9JR6rLnFohO62N4A4iglcr6sCIp9Y4Cfazygh2y6yHB7uMpgDGLr+7xJ1VoCPni7ozgntF8jDmjSZjjuWGGF6unA2xM81o5wDDpoiGusS9ZRRSlK5KUxSfNA5RNDKSxnVjnDSeXYpkgrLhppzG7Ngbm2COVhrfnUUyZd2wPTJF6CvQkZ9EnZrD2yreA3lFmXDUnRN51G3RcdVUlRctWDWy+xI1kn4df/1R147H1+u4HDhZR925jpetcUnazxIfztTCYEJB0TggYaOphPiwJSaOvAARFJLlbudfCGxO1ECQlGOryFNycL4kn+aEHNSojexCyUH3AM9ISjJJycMkp3cSctB9su2PVhxVn0DTbJVEsoABBWaHc6Qho61B5Ah0h5VurJZ2FrLroMg/6Kb87VFOuBiw+oTHbglwDSmS6dIKHDFpNCmZNkpKNYXfI3ePKRX49jWQkDxaInZPjojdK/sey9LLdsTVKUyiRBJ/VlnhmoLLCg3ARy4uMvWuGGdmO2e+AGaOQqFnRcI2023O5sR5FTmRGJm9LrjbSpTe1pbhSEhJehOltzYnau+peCRSOm5UfSJgS9g0E8XQBXmOaCkPxdC5Ttfd4gN7xDERuZq1uqmG1vtFrjx9xNcwko7oeV+eXiThO2B/WUtshQ7ZirY+UfBP/mCgy6nn6P+gUCJu8gcHj5ZdXivQoXZXgR0JutXGiXcgDUpJ7FcRnVaWsPN0yksf1CbaKW76eWI8QovE+PjaVScB/gUcpqAaAuI+2AAAAABJRU5ErkJggg==`;
const mruStore = (() => {
    const stacks = new Map();
    let seedAllPromise = null;
    function ensure(windowId) {
        if (!stacks.has(windowId))
            stacks.set(windowId, []);
    }
    function touch(windowId, tabId) {
        ensure(windowId);
        const stack = stacks.get(windowId);
        if (!stack)
            return;
        const existing = stack.indexOf(tabId);
        if (existing !== -1)
            stack.splice(existing, 1);
        stack.unshift(tabId);
    }
    function append(windowId, tabId) {
        ensure(windowId);
        const stack = stacks.get(windowId);
        if (!stack)
            return;
        if (!stack.includes(tabId))
            stack.push(tabId);
    }
    function remove(windowId, tabId) {
        const stack = stacks.get(windowId);
        if (!stack)
            return;
        const idx = stack.indexOf(tabId);
        if (idx !== -1)
            stack.splice(idx, 1);
    }
    async function backfill(windowId) {
        ensure(windowId);
        const stack = stacks.get(windowId);
        if (!stack)
            return;
        const tabs = await chrome.tabs.query({ windowId });
        for (const tab of tabs) {
            if (tab.id !== undefined && !stack.includes(tab.id)) {
                stack.push(tab.id);
            }
        }
    }
    async function performSeedAll() {
        var _a, _b;
        try {
            const currentWindow = await chrome.windows.getCurrent({ populate: true });
            if ((currentWindow === null || currentWindow === void 0 ? void 0 : currentWindow.id) !== undefined) {
                ensure(currentWindow.id);
                const tabs = (_a = currentWindow.tabs) !== null && _a !== void 0 ? _a : [];
                const stack = stacks.get(currentWindow.id);
                if (!stack)
                    return;
                for (const tab of tabs) {
                    if (tab.id !== undefined && !stack.includes(tab.id)) {
                        stack.push(tab.id);
                    }
                }
                return;
            }
        }
        catch { }
        const [firstWindow] = await chrome.windows.getAll({ populate: true });
        if (!firstWindow || firstWindow.id === undefined)
            return;
        ensure(firstWindow.id);
        const tabs = (_b = firstWindow.tabs) !== null && _b !== void 0 ? _b : [];
        const stack = stacks.get(firstWindow.id);
        if (!stack)
            return;
        for (const tab of tabs) {
            if (tab.id !== undefined && !stack.includes(tab.id)) {
                stack.push(tab.id);
            }
        }
    }
    async function seedAll() {
        if (!seedAllPromise) {
            seedAllPromise = performSeedAll().finally(() => {
                seedAllPromise = null;
            });
        }
        await seedAllPromise;
    }
    async function ensureSeeded() {
        if (stacks.size > 0)
            return;
        await seedAll();
    }
    function getStack(windowId) {
        var _a;
        ensure(windowId);
        return (_a = stacks.get(windowId)) !== null && _a !== void 0 ? _a : [];
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
    const byHost = new Map();
    const byUrl = new Map();
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
                if (typeof reader.result === "string")
                    resolve(reader.result);
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
            if (!response.ok && response.type !== "opaque")
                return null;
            const blob = await response.blob();
            return await blobToDataUrl(blob);
        }
        catch {
            return null;
        }
    }
    async function resolve(tab) {
        var _a, _b, _c;
        if ((_a = tab.favIconUrl) === null || _a === void 0 ? void 0 : _a.startsWith("data:")) {
            return tab.favIconUrl;
        }
        const canonicalUrl = (_c = (_b = tab.url) !== null && _b !== void 0 ? _b : tab.pendingUrl) !== null && _c !== void 0 ? _c : undefined;
        const hostname = extractHostname(canonicalUrl);
        if (tab.favIconUrl) {
            const cachedByUrl = byUrl.get(tab.favIconUrl);
            if (cachedByUrl)
                return cachedByUrl;
        }
        if (hostname) {
            const cachedByHost = byHost.get(hostname);
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
            const cached = byUrl.get(url);
            if (cached)
                return cached;
            const dataUrl = await fetchAsDataUrl(url);
            if (dataUrl) {
                byUrl.set(url, dataUrl);
                if (hostname)
                    byHost.set(hostname, dataUrl);
                return dataUrl;
            }
        }
        if (hostname)
            byHost.set(hostname, FALLBACK_ICON_DATA_URI);
        return FALLBACK_ICON_DATA_URI;
    }
    return {
        resolve,
    };
})();
async function getHudItems(windowId) {
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
    if (stack.length === 0)
        return [];
    const tabs = await chrome.tabs.query({ windowId });
    const typedTabs = tabs.filter((tab) => tab.id !== undefined);
    const byId = new Map(typedTabs.map((tab) => [tab.id, tab]));
    const orderedTabs = stack
        .map((id) => byId.get(id))
        .filter((tab) => Boolean(tab === null || tab === void 0 ? void 0 : tab.id));
    const icons = await Promise.all(orderedTabs.map((tab) => faviconStore.resolve(tab)));
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
    const stack = mruStore.getStack(windowId);
    if (!stack.length)
        return;
    const normalized = ((position % stack.length) + stack.length) % stack.length;
    const tabId = stack[normalized];
    if (normalized === 0)
        return;
    try {
        await chrome.tabs.update(tabId, { active: true });
    }
    catch {
        // tab may have been closed; swallow the error
    }
}
function registerListeners() {
    chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
        mruStore.touch(windowId, tabId);
    });
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
        if (windowId === chrome.windows.WINDOW_ID_NONE)
            return;
        const [activeTab] = await chrome.tabs.query({ active: true, windowId });
        if ((activeTab === null || activeTab === void 0 ? void 0 : activeTab.id) !== undefined) {
            mruStore.touch(windowId, activeTab.id);
        }
        await mruStore.backfill(windowId);
    });
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
        mruStore.remove(removeInfo.windowId, tabId);
    });
    chrome.tabs.onCreated.addListener((tab) => {
        if (tab.id === undefined || tab.windowId === undefined)
            return;
        if (tab.active) {
            mruStore.touch(tab.windowId, tab.id);
        }
        else {
            mruStore.append(tab.windowId, tab.id);
        }
    });
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (!tab || tab.windowId === undefined)
            return;
        const urlChanged = Object.prototype.hasOwnProperty.call(changeInfo, "url");
        const loadFinished = changeInfo.status === "complete";
        if (!urlChanged && !loadFinished)
            return;
        if (tab.active) {
            mruStore.touch(tab.windowId, tabId);
        }
        else {
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
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if ((msg === null || msg === void 0 ? void 0 : msg.type) === "mru-request") {
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
}
registerListeners();
export {};
