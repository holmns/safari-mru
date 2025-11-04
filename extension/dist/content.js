const HUD_DELAY_MIN = 0;
const HUD_DELAY_MAX = 1000;
const DEFAULT_SETTINGS = {
    hudDelay: 150,
    layout: "horizontal",
    theme: "system",
};
function clampHudDelay(value, fallback = DEFAULT_SETTINGS.hudDelay) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric))
        return fallback;
    const rounded = Math.round(numeric);
    if (rounded < HUD_DELAY_MIN)
        return HUD_DELAY_MIN;
    if (rounded > HUD_DELAY_MAX)
        return HUD_DELAY_MAX;
    return rounded;
}
function parseLayoutMode(value, fallback = DEFAULT_SETTINGS.layout) {
    if (value === "vertical" || value === "horizontal") {
        return value;
    }
    return fallback;
}
function parseThemeMode(value, fallback = DEFAULT_SETTINGS.theme) {
    if (value === "dark" || value === "light" || value === "system") {
        return value;
    }
    return fallback;
}
function normalizeHudSettings(input, fallback = DEFAULT_SETTINGS) {
    return {
        hudDelay: clampHudDelay(input === null || input === void 0 ? void 0 : input.hudDelay, fallback.hudDelay),
        layout: parseLayoutMode(input === null || input === void 0 ? void 0 : input.layout, fallback.layout),
        theme: parseThemeMode(input === null || input === void 0 ? void 0 : input.theme, fallback.theme),
    };
}

const FALLBACK_FAVICON_DATA_URI = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#4b5563"/><path d="M5.5 4h5a2.5 2.5 0 0 1 0 5h-5v3H4V4.75A.75.75 0 0 1 4.75 4H5.5zm1 1.5v2h4a1 1 0 1 0 0-2h-4z" fill="#f8fafc"/></svg>';
(() => {
    const state = {
        hud: null,
        list: null,
        items: [],
        index: 1,
        visible: false,
        hudTimer: null,
        cycled: false,
        settings: { ...DEFAULT_SETTINGS },
        optionKeys: new Set(),
        sessionActive: false,
        initializing: false,
        pendingMoves: 0,
        colorSchemeQuery: null,
    };
    const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
    function readSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(DEFAULT_SETTINGS, (data) => {
                resolve(normalizeHudSettings(data));
            });
        });
    }
    function applyLayout() {
        if (!state.hud)
            return;
        state.hud.classList.remove("horizontal", "vertical");
        state.hud.classList.add(state.settings.layout);
    }
    function applySettings(settings) {
        state.settings = { ...settings };
        updateColorSchemeListener();
        applyLayout();
        applyTheme();
    }
    function ensureHud() {
        if (state.hud)
            return;
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
    function render() {
        ensureHud();
        if (!state.list)
            return;
        state.list.innerHTML = "";
        state.items.forEach((tab, i) => {
            const li = document.createElement("li");
            if (i === state.index)
                li.classList.add("selected");
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
            state.list.appendChild(li);
        });
    }
    function show() {
        ensureHud();
        if (!state.hud)
            return;
        state.hud.style.display = "block";
        state.visible = true;
    }
    function hide() {
        if (!state.hud)
            return;
        state.hud.style.display = "none";
        state.visible = false;
    }
    async function requestItems() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "mru-request" }, (resp) => {
                var _a;
                resolve((_a = resp === null || resp === void 0 ? void 0 : resp.items) !== null && _a !== void 0 ? _a : []);
            });
        });
    }
    function wrapIndex(nextIndex) {
        if (!state.items.length)
            return 0;
        const size = state.items.length;
        return ((nextIndex % size) + size) % size;
    }
    function moveSelection(delta) {
        state.index = wrapIndex(state.index + delta);
        if (state.visible)
            render();
    }
    function flushPendingMoves() {
        while (state.pendingMoves !== 0) {
            const step = state.pendingMoves > 0 ? 1 : -1;
            moveSelection(step);
            state.pendingMoves -= step;
        }
    }
    async function finalize() {
        chrome.runtime.sendMessage({
            type: "mru-finalize",
            index: state.index,
        });
        hide();
    }
    function markOptionHeld(event) {
        if (event.code === "AltLeft" || event.code === "AltRight") {
            state.optionKeys.add(event.code);
        }
    }
    function releaseOption(event) {
        if ((event === null || event === void 0 ? void 0 : event.code) === "AltLeft" || (event === null || event === void 0 ? void 0 : event.code) === "AltRight") {
            state.optionKeys.delete(event.code);
        }
        else if (!(event === null || event === void 0 ? void 0 : event.altKey)) {
            state.optionKeys.clear();
        }
    }
    function optionIsHeld(event) {
        if (event === null || event === void 0 ? void 0 : event.altKey)
            return true;
        return state.optionKeys.has("AltLeft") || state.optionKeys.has("AltRight");
    }
    function cancelHudTimer() {
        if (!state.hudTimer)
            return;
        clearTimeout(state.hudTimer);
        state.hudTimer = null;
    }
    function resolveTheme() {
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
    function applyTheme() {
        if (!state.hud)
            return;
        const theme = resolveTheme();
        state.hud.dataset.theme = theme;
    }
    function handleColorSchemeChange(_event) {
        applyTheme();
    }
    function attachColorSchemeListener(query) {
        var _a;
        if (typeof query.addEventListener === "function") {
            query.addEventListener("change", handleColorSchemeChange);
            return;
        }
        const legacyQuery = query;
        (_a = legacyQuery.addListener) === null || _a === void 0 ? void 0 : _a.call(legacyQuery, handleColorSchemeChange);
    }
    function detachColorSchemeListener(query) {
        var _a;
        if (typeof query.removeEventListener === "function") {
            query.removeEventListener("change", handleColorSchemeChange);
            return;
        }
        const legacyQuery = query;
        (_a = legacyQuery.removeListener) === null || _a === void 0 ? void 0 : _a.call(legacyQuery, handleColorSchemeChange);
    }
    function updateColorSchemeListener() {
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
        var _a, _b, _c;
        if (areaName !== "sync")
            return;
        const nextSettings = { ...state.settings };
        if (Object.prototype.hasOwnProperty.call(changes, "hudDelay")) {
            const maybeDelay = (_a = changes.hudDelay) === null || _a === void 0 ? void 0 : _a.newValue;
            if (typeof maybeDelay === "number" && Number.isFinite(maybeDelay)) {
                nextSettings.hudDelay = maybeDelay;
            }
        }
        if (Object.prototype.hasOwnProperty.call(changes, "layout")) {
            const maybeLayout = (_b = changes.layout) === null || _b === void 0 ? void 0 : _b.newValue;
            if (maybeLayout === "vertical" || maybeLayout === "horizontal") {
                nextSettings.layout = maybeLayout;
            }
        }
        if (Object.prototype.hasOwnProperty.call(changes, "theme")) {
            const maybeTheme = (_c = changes.theme) === null || _c === void 0 ? void 0 : _c.newValue;
            if (maybeTheme === "dark" ||
                maybeTheme === "light" ||
                maybeTheme === "system") {
                nextSettings.theme = maybeTheme;
            }
        }
        applySettings(nextSettings);
        if (state.visible)
            render();
    });
    window.addEventListener("keydown", async (event) => {
        var _a;
        if (event.key === "Alt") {
            markOptionHeld(event);
            return;
        }
        if (event.key.toLowerCase() === "tab" && optionIsHeld(event)) {
            event.preventDefault();
            (_a = event.stopImmediatePropagation) === null || _a === void 0 ? void 0 : _a.call(event);
            event.stopPropagation();
            markOptionHeld(event);
            if (event.repeat)
                return;
            const delta = event.shiftKey ? -1 : 1;
            if (!state.sessionActive) {
                state.pendingMoves += delta;
                if (state.initializing)
                    return;
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
            }
            else {
                state.cycled = true;
                moveSelection(delta);
            }
        }
        else if (optionIsHeld(event)) {
            markOptionHeld(event);
            cancelHudTimer();
        }
    }, true);
    window.addEventListener("keyup", (event) => {
        if (event.key === "Alt") {
            releaseOption(event);
        }
        else if (!optionIsHeld(event)) {
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
    }, true);
    void readSettings().then(applySettings);
})();
