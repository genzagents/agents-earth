import { app, BrowserWindow, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";

// Keep a global reference to prevent garbage collection
let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

// The Vite dev server URL (only used in development)
const DEV_SERVER_URL = "http://localhost:5173";

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: "AgentColony",
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
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
  } else {
    // Load the built web app from disk
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Show window once ready to avoid visual flash
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Open external links in the system browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// IPC handlers
ipcMain.handle("app:get-version", () => app.getVersion());

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    // macOS: re-create window when dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Check for updates in production
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

// Quit on all windows closed (non-macOS)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Auto-updater events
autoUpdater.on("update-available", () => {
  console.warn("[updater] Update available — downloading in background");
});

autoUpdater.on("update-downloaded", () => {
  console.warn("[updater] Update downloaded — will install on next restart");
});

autoUpdater.on("error", (err) => {
  console.error("[updater] Error:", err.message);
});
