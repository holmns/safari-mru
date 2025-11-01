# Safari MRU Tab Switcher

A lightweight Safari WebExtension that brings **MRU-style (Most Recently Used)** tab switching — similar to macOS app switching with ⌥ (Option) + Tab — directly into Safari.

This project includes:

- A full **WebExtension** (in `/extension`)
- A **macOS Xcode wrapper project** (in `/SafariMRUProject`) that packages and signs the extension for Safari.

---

## ✨ Features

- 🔁 **MRU tab switching** — Switch tabs in order of _most recently used_.
- ⚡️ **Smooth HUD (Heads-Up Display)** — Displays a visual overlay of open tabs with icons.
- 🎨 **Auto-adaptive design** — Modern, minimal UI centered on screen.
- 🧭 **Configurable delay** — Adjust how long you hold ⌥ before the HUD appears.
- 🧩 **Cross-tab awareness** — Works with new tabs, bookmark tabs, and window changes.
- 🛠 **Safari-native** — Built using WebExtension APIs and Xcode integration.

---

## 🧩 Shortcuts

| Action          | Shortcut    |
| --------------- | ----------- |
| Switch forward  | ⌥ + Tab     |
| Switch backward | ⌥ + ⇧ + Tab |

---

## 🎛 Configurations

The extension’s settings can be adjusted from its Options page (Safari → Preferences → Extensions → Safari MRU → Settings…):

---

## 🧾 Requirements

- macOS 14+
- Safari 17+
- Xcode 15+
- Safari Web Extensions enabled

---

## Credit

❤️ Developed by Nawat Suangburanakul
