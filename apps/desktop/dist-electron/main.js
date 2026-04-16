"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
const path_1 = __importDefault(require("path"));
// Keep a global reference to prevent garbage collection
let mainWindow = null;
const isDev = process.env.NODE_ENV === "development" || !electron_1.app.isPackaged;
// The Vite dev server URL (only used in development)
const DEV_SERVER_URL = "http://localhost:5173";
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 600,
        title: "AgentColony",
        backgroundColor: "#0f172a",
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
        // Hide frame on mac for cleaner look; keep on other platforms
        titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
        show: false,
    });
    if (isDev) {
        mainWindow.loadURL(DEV_SERVER_URL);
        mainWindow.webContents.openDevTools();
    }
    else {
        // Load the built web app from disk
        mainWindow.loadFile(path_1.default.join(__dirname, "../dist/index.html"));
    }
    // Show window once ready to avoid visual flash
    mainWindow.once("ready-to-show", () => {
        mainWindow?.show();
    });
    // Open external links in the system browser, not in Electron
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://") || url.startsWith("http://")) {
            electron_1.shell.openExternal(url);
        }
        return { action: "deny" };
    });
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}
// IPC handlers
electron_1.ipcMain.handle("app:get-version", () => electron_1.app.getVersion());
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on("activate", () => {
        // macOS: re-create window when dock icon is clicked and no windows are open
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
    // Check for updates in production
    if (!isDev) {
        electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
    }
});
// Quit on all windows closed (non-macOS)
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
// Auto-updater events
electron_updater_1.autoUpdater.on("update-available", () => {
    console.warn("[updater] Update available — downloading in background");
});
electron_updater_1.autoUpdater.on("update-downloaded", () => {
    console.warn("[updater] Update downloaded — will install on next restart");
});
electron_updater_1.autoUpdater.on("error", (err) => {
    console.error("[updater] Error:", err.message);
});
