function show(platform, enabled, useSettingsInsteadOfPreferences) {
    document.body.classList.add(`platform-${platform}`);

    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('platform-mac state-on')[0].innerText = "SwiftTab’s extension is currently on. You can turn it off in Safari Extensions preferences.";
        document.getElementsByClassName('platform-mac state-off')[0].innerText = "SwiftTab’s extension is currently off. You can turn it on in Safari Extensions preferences.";
        document.getElementsByClassName('platform-mac state-unknown')[0].innerText = "You can turn on SwiftTab’s extension in Safari Extensions preferences.";
        document.getElementsByClassName('platform-mac open-preferences')[0].innerText = "Quit and Open Safari Extensions Preferences…";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
