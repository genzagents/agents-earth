"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose a minimal, typed API to the renderer process
electron_1.contextBridge.exposeInMainWorld("electronBridge", {
    // Platform info — useful for OS-specific UI tweaks
    platform: process.platform,
    // App version exposed for display in the UI
    getAppVersion: () => electron_1.ipcRenderer.invoke("app:get-version"),
});
