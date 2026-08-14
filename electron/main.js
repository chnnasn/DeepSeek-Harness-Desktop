'use strict';

const { app, BrowserWindow, dialog } = require('electron');
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const APP_NAME = 'DeepSeek Harness';
const SERVER_URL = 'http://127.0.0.1:3080';
const SERVER_TIMEOUT_MS = 120 * 1000;
const POLL_INTERVAL_MS = 500;

// Keep user data (dsh profile/plugins) in the same place the old Go launcher
// used, so existing installations keep their state after upgrading.
const dataDir = path.join(
  process.env.LOCALAPPDATA || app.getPath('appData'),
  'DeepSeek-Harness-Desktop'
);
app.setPath('userData', dataDir);

let mainWindow = null;
let server = null; // ChildProcess we spawned for `dsh web`
let quitting = false;

// ---- single instance -------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() =>
    main().catch((err) => {
      dialog.showErrorBox(APP_NAME, 'Startup failed:\n' + (err && err.message ? err.message : err));
      app.quit();
    })
  );
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', shutdown);
}

// ---- helpers ---------------------------------------------------------------

function resourcePath(...segments) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...segments)
    : path.join(__dirname, '..', 'build', 'runtime', ...segments);
}

function dshBinPath() {
  return path.join(
    resourcePath('dsh'),
    'node_modules',
    '@deepseek-ai',
    'dsh',
    'lib',
    'bin.js'
  );
}

function isUp() {
  return new Promise((resolve) => {
    const req = http.get(SERVER_URL, { timeout: 1500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function waitUp(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp()) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return isUp();
}

// Kill the process tree we spawned. Unlike the old netstat/taskkill scanning,
// this only touches the PID we own, so it can never kill a foreign :3080 user.
function killServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const pid = server.pid;
  try {
    server.kill();
  } catch {
    /* ignore */
  }
  try {
    execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch {
    /* already gone */
  }
  server = null;
}

function shutdown() {
  if (quitting) return;
  quitting = true;
  stopPickerServer();
  killServer();
}


// ---- native folder picker bridge ------------------------------------------
// dsh's Windows native picker spawns worker.cjs (koffi/COM) which is unstable
// on some machines. We replace that worker with one that asks the Electron
// main process to show the OS folder dialog (dialog.showOpenDialog) and reply
// over this localhost socket. Only reachable from the bundled dsh runtime.

let pickerServer = null;

function startPickerServer() {
  return new Promise((resolve, reject) => {
    pickerServer = net.createServer((socket) => {
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let req;
          try {
            req = JSON.parse(line);
          } catch {
            continue;
          }
          handlePickRequest(req, socket);
        }
      });
    });
    pickerServer.on('error', reject);
    pickerServer.listen(0, '127.0.0.1', () => resolve(pickerServer.address().port));
  });
}

async function handlePickRequest(req, socket) {
  try {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const result = await dialog.showOpenDialog(win, {
      title: req.title || 'Select Workspace Directory',
      properties: ['openDirectory', 'createDirectory'],
    });
    const path =
      result && !result.canceled && result.filePaths && result.filePaths[0]
        ? result.filePaths[0]
        : null;
    socket.write(JSON.stringify({ id: req.id, path }) + '\n');
  } catch (err) {
    socket.write(
      JSON.stringify({ id: req.id, path: null, error: err && err.message ? err.message : String(err) }) + '\n'
    );
  } finally {
    try {
      socket.end();
    } catch {
      /* ignore */
    }
  }
}

function stopPickerServer() {
  if (pickerServer) {
    try {
      pickerServer.close();
    } catch {
      /* ignore */
    }
    pickerServer = null;
  }
}

// ---- app flow --------------------------------------------------------------

async function main() {
  const pickerPort = await startPickerServer();
  const bin = dshBinPath();
  if (!fs.existsSync(bin)) {
    throw new Error('Cannot find dsh entry:\n' + bin);
  }

  // If a server is already listening on :3080 (another instance, or a manual
  // `dsh web`), reuse it instead of starting a second one. In that case we do
  // NOT own it, so shutdown leaves it running.
  if (!(await isUp())) {
    server = spawn(process.execPath, [bin, 'web'], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DSH_PICKER_PORT: String(pickerPort),
        DSH_HOME: path.join(dataDir, 'dsh-home'),
      },
      cwd: path.dirname(bin),
      windowsHide: true,
      stdio: 'ignore',
    });
    server.on('error', (err) => {
      server = null;
      dialog.showErrorBox(APP_NAME, 'Failed to start service:\n' + err.message);
    });
    server.on('exit', (code, signal) => {
      server = null;
      if (quitting) return;
      dialog.showErrorBox(
        APP_NAME,
        'DeepSeek Harness service exited unexpectedly (code ' + (code ?? signal ?? 'unknown') + ').'
      );
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    });

    if (!(await waitUp(SERVER_TIMEOUT_MS))) {
      killServer();
      throw new Error(
        'Service did not become ready at ' +
          SERVER_URL +
          ' within ' +
          SERVER_TIMEOUT_MS / 1000 +
          's.'
      );
    }
  }

  // Smoke-test hook: start the service, print an OK line, then exit cleanly.
  if (process.argv.includes('--smoke')) {
    console.log('SMOKE_OK ' + SERVER_URL);
    app.quit();
    return;
  }

  createWindow();
}

function createWindow() {
  const icon = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '..', 'launcher', 'icon.ico');

  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Closing the window stops the app (and, via before-quit, the service),
  // matching the old "close window to stop the backend" behaviour.
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      app.quit();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(SERVER_URL);
}
