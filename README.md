# SwiftTab – Safari MRU Tab Switcher

SwiftTab brings **Most Recently Used (MRU) tab switching** to Safari, mirroring the feel of macOS app switching with ⌥ (Option) + Tab.

This repository contains:

- `/extension` – the Safari WebExtension implementation.
- `/SwiftTabProject/SwiftTab` – the Xcode workspace that wraps, signs, and ships the extension.

## ✨ Features

- 🔁 **MRU ordering** — Cycle through tabs in the order you last viewed them.
- ⚡️ **Heads-up display** — Minimal overlay shows tab titles and favicons while you switch.
- 🧭 **Customizable delay** — Tune how long you hold ⌥ before the HUD appears.
- 🛠 **Native packaging** — Delivered as a signed Safari app extension, optimized for performance and battery usage.

## 🎮 Shortcuts

| Action          | Shortcut    |
| --------------- | ----------- |
| Switch forward  | ⌥ + Tab     |
| Switch backward | ⌥ + ⇧ + Tab |

## 🚀 Getting Started

1. Install the required tooling (macOS 14+, Safari 17+, Xcode 15+).
2. Open `SwiftTabProject/SwiftTab/SwiftTab.xcodeproj` in Xcode.
3. Select the `SwiftTab (App)` scheme and run it.  
   Xcode builds the helper app and installs the Safari extension.
4. When Safari prompts you, enable **SwiftTab** from Safari Settings → Extensions.

During development you can iterate on the WebExtension in `/extension`. Rebuilding the Xcode target bundles the latest assets.

## 🧑‍💻 Development Workflow

1. `cd extension && npm install`
2. `npm run build:extension` compiles the background and content scripts, inlines shared helpers, and writes to `dist/`.
3. `npm run build:options` (or the top-level `npm run build`) updates the options UI bundle.
4. Re-run the Xcode scheme or reload the extension in Safari to pick up the refreshed artifacts.

The background service worker reads MRU stacks from storage on launch and debounces writes back to `chrome.storage.session` (falling back to `chrome.storage.local`). An `onSuspend` hook flushes pending writes so state remains consistent even when Safari idles the worker.

## 🛠 Settings

Adjust SwiftTab’s options through Safari Settings → Extensions → SwiftTab → Settings….

## Credit

❤️ Developed by Nawat Suangburanakul
