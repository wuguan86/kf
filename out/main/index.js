"use strict";
const electron = require("electron");
const path = require("path");
const promises = require("fs/promises");
const fs = require("fs");
const child_process = require("child_process");
const os = require("os");
const utils = require("@electron-toolkit/utils");
let mainWindow = null;
let captureWindow = null;
let wechatBridgeProcess = null;
const killProcessTree = (pid) => {
  try {
    if (process.platform === "win32") {
      child_process.execSync(`taskkill /pid ${pid} /T /F`);
    } else {
      process.kill(-pid);
    }
  } catch (e) {
    console.log(`Failed to kill process ${pid}:`, e);
  }
};
const getSidecarWeChatDir = () => {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "sidecar");
  }
  const appPath = electron.app.getAppPath();
  return path.join(path.dirname(appPath), "sidecar_wechat");
};
const getWeChatBridgeExecutable = () => {
  if (electron.app.isPackaged) {
    return path.join(getSidecarWeChatDir(), "wechat_bridge.exe");
  }
  return path.join(getSidecarWeChatDir(), "wechat_bridge.py");
};
const getWeChatBridgeConfig = () => {
  return path.join(getSidecarWeChatDir(), "config.yaml");
};
const getWeChatBridgeBaseUrl = () => {
  return "http://127.0.0.1:51234";
};
const waitForWeChatBridgeReady = async (timeoutMs) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${getWeChatBridgeBaseUrl()}/health`, { method: "GET" });
      if (res.ok) {
        return;
      }
    } catch (e) {
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("WeChat bridge not ready");
};
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    frame: false,
    // Disable native title bar
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      webSecurity: false
    }
  });
  electron.ipcMain.on("window-minimize", () => {
    mainWindow?.minimize();
  });
  electron.ipcMain.on("window-maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow?.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  electron.ipcMain.on("window-close", () => {
    mainWindow?.close();
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function createCaptureWindow() {
  const { width, height } = electron.screen.getPrimaryDisplay().bounds;
  captureWindow = new electron.BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    fullscreen: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  captureWindow.setIgnoreMouseEvents(false);
  captureWindow.setAlwaysOnTop(true, "screen-saver");
  captureWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  captureWindow.once("ready-to-show", () => {
    captureWindow?.show();
    captureWindow?.focus();
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    captureWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/#/capture`);
  } else {
    captureWindow.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "capture" });
  }
}
electron.ipcMain.on("start-capture", () => {
  if (!captureWindow) {
    createCaptureWindow();
  }
});
electron.ipcMain.on("close-capture", () => {
  if (captureWindow) {
    captureWindow.close();
    captureWindow = null;
  }
});
electron.ipcMain.handle("do-capture", async (_, coords) => {
  const primaryDisplay = electron.screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const scaleFactor = primaryDisplay.scaleFactor;
  const sources = await electron.desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height }
  });
  const primarySource = sources[0];
  if (primarySource) {
    const cropRect = {
      x: Math.max(0, Math.round(coords.x * scaleFactor)),
      y: Math.max(0, Math.round(coords.y * scaleFactor)),
      width: Math.max(1, Math.round(coords.w * scaleFactor)),
      height: Math.max(1, Math.round(coords.h * scaleFactor))
    };
    const image = primarySource.thumbnail.crop(cropRect);
    const scaledImage = image.resize({
      width: image.getSize().width * 2,
      height: image.getSize().height * 2,
      quality: "best"
    });
    const dataUrl = scaledImage.toDataURL();
    let isManual = false;
    if (captureWindow) {
      captureWindow.close();
      captureWindow = null;
      isManual = true;
    }
    if (isManual) {
      mainWindow?.webContents.send("capture-image", { dataUrl, bounds: coords });
    }
    return { dataUrl, bounds: coords };
  }
  return null;
});
electron.ipcMain.handle("perform-ocr", async (_, dataUrl) => {
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const tempPath = path.join(os.tmpdir(), `ocr_temp_${Date.now()}.png`);
  try {
    await promises.writeFile(tempPath, buffer);
    const binDir = electron.app.isPackaged ? path.join(process.resourcesPath, "bin") : path.join(__dirname, "../../resources/bin");
    const ocrPath = path.join(binDir, "PaddleOCR-json.exe");
    const modelsPath = path.join(binDir, "models");
    return new Promise((resolve, reject) => {
      const args = [
        `--image_path=${tempPath}`,
        `--models_path=${modelsPath}`
      ];
      console.log("Running OCR with:", ocrPath, args);
      let ocrProcess = null;
      const timeoutTimer = setTimeout(() => {
        if (ocrProcess) {
          try {
            ocrProcess.kill();
          } catch (e) {
          }
        }
        reject(new Error("OCR Timeout (10s) - Process took too long"));
      }, 1e4);
      try {
        ocrProcess = child_process.spawn(ocrPath, args, {
          cwd: os.tmpdir()
        });
      } catch (spawnError) {
        clearTimeout(timeoutTimer);
        reject(new Error(`Failed to spawn OCR process: ${spawnError.message}`));
        return;
      }
      let stdoutData = "";
      let stderrData = "";
      ocrProcess.stdout.on("data", (data) => {
        stdoutData += data.toString();
      });
      ocrProcess.stderr.on("data", (data) => {
        stderrData += data.toString();
      });
      ocrProcess.on("close", async (code) => {
        clearTimeout(timeoutTimer);
        try {
          if (fs.existsSync(tempPath)) await promises.unlink(tempPath);
        } catch (e) {
        }
        console.log("OCR Process exited with code:", code);
        const lines = stdoutData.split(/\r?\n/);
        let result = { text: "", items: [] };
        let hasJson = false;
        for (const line of lines) {
          try {
            if (!line.trim()) continue;
            const parsed = JSON.parse(line.trim());
            if (parsed.code === 100 && parsed.data) {
              hasJson = true;
              result.text = parsed.data.map((item) => item.text).join("\n");
              result.items = parsed.data;
              break;
            }
          } catch (e) {
          }
        }
        if (hasJson) {
          resolve(result);
        } else {
          const debugInfo = [
            "识别失败。调试信息：",
            `Exit Code: ${code}`,
            "--- Stdout ---",
            stdoutData.slice(0, 500) + (stdoutData.length > 500 ? "..." : ""),
            "--- Stderr ---",
            stderrData.slice(0, 500) + (stderrData.length > 500 ? "..." : "")
          ].join("\n");
          resolve({ text: debugInfo, items: [] });
        }
      });
      ocrProcess.on("error", async (err) => {
        clearTimeout(timeoutTimer);
        try {
          if (fs.existsSync(tempPath)) await promises.unlink(tempPath);
        } catch (e) {
        }
        console.error("OCR Process Error:", err);
        reject(new Error(`OCR Process Error: ${err.message}`));
      });
    });
  } catch (error) {
    console.error("OCR Error:", error);
    return { text: "OCR 识别出错", items: [] };
  }
});
electron.ipcMain.handle("simulate-reply", async (_, { text, focusCoords, sendCoords }) => {
  const escapePs = (s) => s.replace(/'/g, "''").replace(/"/g, '\\"');
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    
    $mouse_code = @'
      [DllImport("user32.dll",CharSet=CharSet.Auto, CallingConvention=CallingConvention.StdCall)]
      public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);
      
      [DllImport("user32.dll")]
      public static extern bool SetCursorPos(int X, int Y);
'@
    $win32 = Add-Type -MemberDefinition $mouse_code -Name "Win32" -Namespace Win32Functions -PassThru

    function Click-At($x, $y) {
       [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
       $win32::mouse_event(0x0002, 0, 0, 0, 0) # LeftDown
       Start-Sleep -Milliseconds 50
       $win32::mouse_event(0x0004, 0, 0, 0, 0) # LeftUp
    }

    # 1. Click to focus (if coords provided)
    ${focusCoords ? `Click-At ${Math.round(focusCoords.x)} ${Math.round(focusCoords.y)}` : ""}
    
    Start-Sleep -Milliseconds 200

    # 2. Paste text (Clipboard method)
    $text = '${escapePs(text)}'
    try {
        [System.Windows.Forms.Clipboard]::SetText($text)
        Start-Sleep -Milliseconds 100
        [System.Windows.Forms.SendKeys]::SendWait("^v")
    } catch {
        Write-Host "Clipboard paste failed: $_"
    }

    Start-Sleep -Milliseconds 500

    # 3. Click Send (if coords provided)
    ${sendCoords ? `Click-At ${Math.round(sendCoords.x)} ${Math.round(sendCoords.y)}` : ""}
  `;
  try {
    const child = child_process.spawn("powershell", ["-Sta", "-Command", psScript]);
    child.stdout.on("data", (d) => console.log("PS stdout:", d.toString()));
    child.stderr.on("data", (d) => console.log("PS stderr:", d.toString()));
    return new Promise((resolve) => {
      child.on("close", (code) => {
        resolve({ success: code === 0 });
      });
    });
  } catch (e) {
    console.error("Simulation failed:", e);
    return { success: false, error: e };
  }
});
electron.ipcMain.handle("wechat-bridge-start", async () => {
  if (wechatBridgeProcess && !wechatBridgeProcess.killed) {
    try {
      await waitForWeChatBridgeReady(2e3);
    } catch (e) {
    }
    return { ok: true };
  }
  const execPath = getWeChatBridgeExecutable();
  const configPath = getWeChatBridgeConfig();
  if (!fs.existsSync(execPath)) {
    return { ok: false, error: `WeChat bridge executable not found: ${execPath}` };
  }
  if (!fs.existsSync(configPath)) {
    return { ok: false, error: `config.yaml not found: ${configPath}` };
  }
  if (electron.app.isPackaged) {
    wechatBridgeProcess = child_process.spawn(execPath, ["--config", configPath], {
      cwd: getSidecarWeChatDir(),
      windowsHide: true
    });
  } else {
    wechatBridgeProcess = child_process.spawn("python", [execPath, "--config", configPath], {
      cwd: getSidecarWeChatDir(),
      windowsHide: true
    });
  }
  wechatBridgeProcess.on("exit", () => {
    wechatBridgeProcess = null;
  });
  try {
    await waitForWeChatBridgeReady(8e3);
  } catch (e) {
  }
  return { ok: true };
});
electron.ipcMain.handle("wechat-bridge-stop", async () => {
  if (wechatBridgeProcess && wechatBridgeProcess.pid) {
    try {
      console.log("Stopping WeChat Bridge Process:", wechatBridgeProcess.pid);
      killProcessTree(wechatBridgeProcess.pid);
    } catch (e) {
      console.error("Failed to stop WeChat Bridge:", e);
    }
  }
  wechatBridgeProcess = null;
  return { ok: true };
});
electron.ipcMain.handle("wechat-bridge-poll", async () => {
  const res = await fetch(`${getWeChatBridgeBaseUrl()}/poll`, { method: "GET" });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { ok: false, error: "invalid_json", raw: text };
  }
});
electron.ipcMain.handle("wechat-bridge-send", async (_, payload) => {
  const res = await fetch(`${getWeChatBridgeBaseUrl()}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { ok: false, error: "invalid_json", raw: text };
  }
});
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.electron");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
  if (wechatBridgeProcess && wechatBridgeProcess.pid) {
    try {
      console.log("Killing WeChat Bridge before quit...");
      killProcessTree(wechatBridgeProcess.pid);
    } catch (e) {
      console.error("Failed to kill WeChat Bridge before quit:", e);
    }
  }
  wechatBridgeProcess = null;
});
