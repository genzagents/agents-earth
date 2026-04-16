import { contextBridge, ipcRenderer } from "electron";

// Expose a minimal, typed API to the renderer process
contextBridge.exposeInMainWorld("electronBridge", {
  // Platform info — useful for OS-specific UI tweaks
  platform: process.platform,

  // App version exposed for display in the UI
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke("app:get-version"),
});
