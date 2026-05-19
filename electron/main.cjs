const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const apiPort = Number(process.env.PORT || 6397);

function configureLocalData() {
  process.env.FINANCEIRO_DATA_DIR = process.env.FINANCEIRO_DATA_DIR || app.getPath("userData");
  process.env.FINANCEIRO_DEFAULT_PASSWORD = process.env.FINANCEIRO_DEFAULT_PASSWORD || "123456";
  process.env.FINANCEIRO_SEED_PATH = process.env.FINANCEIRO_SEED_PATH || path.join(__dirname, "..", "seed-current-cadastros.json");
}

async function startApi() {
  configureLocalData();
  const serverEntry = path.join(__dirname, "..", "server", "index.js");
  await import(pathToFileURL(serverEntry).href);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#081016",
    title: "Financeiro Local",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(`http://127.0.0.1:${apiPort}`);
}

app.whenReady().then(async () => {
  await startApi();
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
