const { app, BrowserWindow, Menu, Tray, nativeImage, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const http = require("node:http");

let mainWindow = null;
let tray = null;
let isQuitting = false;

function configureLocalData() {
  process.env.FINANCEIRO_DATA_DIR = process.env.FINANCEIRO_DATA_DIR || app.getPath("userData");
  process.env.FINANCEIRO_DEFAULT_PASSWORD = process.env.FINANCEIRO_DEFAULT_PASSWORD || "123456";
  process.env.FINANCEIRO_SEED_PATH = process.env.FINANCEIRO_SEED_PATH || path.join(__dirname, "..", "seed-current-cadastros.json");
}

function getConfiguredApiPort() {
  if (process.env.PORT) return Number(process.env.PORT);
  try {
    const configPath = path.join(process.env.FINANCEIRO_DATA_DIR || app.getPath("userData"), "runtime-config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return Number(config.apiPort || 6397);
  } catch {
    return 6397;
  }
}

async function startApi() {
  configureLocalData();
  const serverEntry = path.join(__dirname, "..", "server", "index.js");
  await import(pathToFileURL(serverEntry).href);
}

function waitForApi(port, retries = 80) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts += 1;
      const req = http.get({ host: "127.0.0.1", port, path: "/api/auth/status", timeout: 800 }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => {
        if (attempts >= retries) return resolve(false);
        setTimeout(check, 250);
      });
      req.on("timeout", () => {
        req.destroy();
        if (attempts >= retries) return resolve(false);
        setTimeout(check, 250);
      });
    };
    check();
  });
}

function getIconPath() {
  return path.join(__dirname, "..", "assets", process.platform === "win32" ? "app-icon.ico" : "app-icon.png");
}

function showMainWindow() {
  if (!mainWindow) createWindow();
  if (!mainWindow) return;
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  const trayIcon = nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip("Financeiro Local");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir Financeiro Local", click: showMainWindow },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
  tray.on("double-click", showMainWindow);
  tray.on("click", showMainWindow);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#081016",
    title: "Financeiro Local",
    icon: getIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("minimize", (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(`http://127.0.0.1:${getConfiguredApiPort()}`);
  createTray();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);
}

app.whenReady().then(async () => {
  app.setName("Financeiro Local");
  await startApi();
  await waitForApi(getConfiguredApiPort());
  createWindow();
});

app.on("activate", () => {
  showMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin") return;
});

app.on("before-quit", () => {
  isQuitting = true;
});
