# SwiftTab – Safari MRU Tab Switcher

SwiftTab brings **Most Recently Used (MRU) tab switching** to Safari, mirroring the feel of macOS app switching with ⌥ (Option) + Tab.

This repository contains:

- `/extension` – the Safari WebExtension implementation.
- `/SwiftTabProject/SwiftTab` – the Xcode workspace that wraps, signs, and ships the extension.

## ✨ Features

- 🔁 **MRU ordering** — Cycle through tabs in the order you last viewed them.
- ⚡️ **Heads-up display** — Minimal overlay shows tab titles and favicons while you switch.
- 🎨 **Adaptive layout** — Centers on screen and respects light / dark appearance.
- 🧭 **Customizable delay** — Tune how long you hold ⌥ before the HUD appears.
- 🧩 **Window awareness** — Keeps the MRU list accurate as windows and tabs change.
- 🛠 **Native packaging** — Delivered as a signed Safari app extension.

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

## 🛠 Settings

Adjust SwiftTab’s options through Safari Settings → Extensions → SwiftTab → Settings….

## Credit

❤️ Developed by Nawat Suangburanakul
