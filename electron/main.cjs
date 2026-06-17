const { app, BrowserWindow, net, protocol } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function resolveAppFile(requestUrl) {
  const root = app.getAppPath();
  const { pathname } = new URL(requestUrl);
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(root, relativePath);
  const allowedRoot = path.resolve(root);

  if (filePath !== allowedRoot && !filePath.startsWith(`${allowedRoot}${path.sep}`)) {
    return null;
  }

  return filePath;
}

async function registerAppProtocol() {
  protocol.handle("app", async (request) => {
    const filePath = resolveAppFile(request.url);

    if (!filePath) {
      return new Response("Not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL("app://local/index.html");
}

app.whenReady().then(async () => {
  await registerAppProtocol();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
