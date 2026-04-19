import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain
} from "electron";
import { launchQianxinBrowser } from "./browser-launcher.mjs";
import { loadSettings, saveSettings } from "./config.mjs";
import { buildResultArtifact, writeResultToFile } from "./exporters.mjs";
import { startLocalHttpServer } from "./http-server.mjs";
import { createJobManager } from "./jobs/job-manager.mjs";
import { TIKA_IMPORT_EXTENSIONS } from "./tika.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererDistPath = path.resolve(__dirname, "../dist/index.html");
const rendererDistDir = path.resolve(__dirname, "../dist");
const isDev = !app.isPackaged;
const isBrowserMode = process.argv.includes("--browser");
let browserServerHandle = null;
let desktopJobManager = null;

function createDesktopWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#08131f",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: "detach" });
    return window;
  }

  window.loadFile(rendererDistPath);
  return window;
}

async function createBrowserModeControllerWindow(url, browserCommand) {
  const window = new BrowserWindow({
    width: 520,
    height: 320,
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    title: "SplitAll Browser Mode",
    backgroundColor: "#08131f",
    webPreferences: {
      sandbox: true
    }
  });

  const html = `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <title>SplitAll Browser Mode</title>
        <style>
          :root {
            color-scheme: dark;
            font-family: "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif;
            background:
              radial-gradient(circle at top right, rgba(89, 223, 193, 0.2), transparent 34%),
              linear-gradient(180deg, #08121d, #0b1826);
            color: #ecf3ff;
          }

          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
          }

          main {
            width: 100%;
            border: 1px solid rgba(176, 209, 255, 0.14);
            background: rgba(12, 26, 42, 0.82);
            padding: 20px;
          }

          h1 {
            margin: 0 0 12px;
            font-size: 24px;
            letter-spacing: -0.04em;
          }

          p {
            margin: 0 0 10px;
            color: #98adc8;
            line-height: 1.5;
          }

          code {
            display: block;
            padding: 10px 12px;
            background: rgba(7, 16, 27, 0.9);
            color: #7cf0d8;
            margin: 12px 0;
            word-break: break-all;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>已启动奇安信浏览器模式</h1>
          <p>本地服务正在运行。关闭这个控制窗口会同时停止本地服务。</p>
          <p>访问地址：</p>
          <code>${url}</code>
          <p>拉起命令：</p>
          <code>${browserCommand}</code>
        </main>
      </body>
    </html>
  `;

  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return window;
}

async function startBrowserMode() {
  const userDataPath = app.getPath("userData");
  const settings = await loadSettings(userDataPath);
  browserServerHandle = await startLocalHttpServer({
    userDataPath,
    distPath: rendererDistDir
  });
  const launched = await launchQianxinBrowser({
    url: browserServerHandle.url,
    settings
  });
  const controllerWindow = await createBrowserModeControllerWindow(
    browserServerHandle.url,
    launched.command
  );

  controllerWindow.on("closed", async () => {
    if (browserServerHandle) {
      try {
        await browserServerHandle.close();
      } catch {
        // Ignore close errors during shutdown.
      }
    }

    app.quit();
  });
}

app.whenReady().then(async () => {
  if (isBrowserMode) {
    try {
      await startBrowserMode();
    } catch (error) {
      const message = error instanceof Error ? error.message : "启动浏览器模式失败";
      await dialog.showErrorBox("SplitAll Browser Mode", message);
      app.quit();
    }

    return;
  }

  desktopJobManager = createJobManager({
    userDataPath: app.getPath("userData")
  });
  createDesktopWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDesktopWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  if (browserServerHandle) {
    try {
      await browserServerHandle.close();
    } catch {
      // Ignore close errors during shutdown.
    }
  }

  if (desktopJobManager) {
    try {
      await desktopJobManager.close();
    } catch {
      // Ignore close errors during shutdown.
    }
  }
});

ipcMain.handle("settings:get", async () => {
  return loadSettings(app.getPath("userData"));
});

ipcMain.handle("settings:save", async (_event, settings) => {
  return saveSettings(app.getPath("userData"), settings);
});

ipcMain.handle("files:pick", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择要拆分的文件",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "支持的文件",
        extensions: [
          "txt",
          "md",
          "markdown",
          "csv",
          "json",
          "yaml",
          "yml",
          "xml",
          "html",
          "htm",
          "js",
          "ts",
          "tsx",
          "jsx",
          "py",
          "java",
          "c",
          "cpp",
          "h",
          "hpp",
          "ini",
          "log",
          ...TIKA_IMPORT_EXTENSIONS,
          "png",
          "jpg",
          "jpeg",
          "webp",
          "gif",
          "bmp",
          "tif",
          "tiff"
        ]
      }
    ]
  });

  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("folders:pick", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择要递归导入的文件夹",
    properties: ["openDirectory", "multiSelections"]
  });

  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("jobs:create", async (_event, payload) => {
  if (!desktopJobManager) {
    throw new Error("后台任务管理器尚未初始化。");
  }

  return desktopJobManager.createJob(payload);
});

ipcMain.handle("jobs:get", async (_event, jobId) => {
  if (!desktopJobManager) {
    throw new Error("后台任务管理器尚未初始化。");
  }

  return desktopJobManager.getJob(jobId);
});

ipcMain.handle("jobs:result", async (_event, jobId) => {
  if (!desktopJobManager) {
    throw new Error("后台任务管理器尚未初始化。");
  }

  return desktopJobManager.getJobResult(jobId);
});

ipcMain.handle("result:export", async (_event, payload) => {
  const artifact = await buildResultArtifact(payload.result, payload.format);
  const extension = artifact.fileName.split(".").pop() || payload.format;
  const saveDialog = await dialog.showSaveDialog({
    title: "导出结果",
    defaultPath: artifact.fileName,
    filters: [
      {
        name: extension.toUpperCase(),
        extensions: [extension]
      }
    ]
  });

  if (saveDialog.canceled || !saveDialog.filePath) {
    return {
      canceled: true
    };
  }

  await writeResultToFile(payload.result, payload.format, saveDialog.filePath);

  return {
    canceled: false,
    filePath: saveDialog.filePath
  };
});
