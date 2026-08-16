'use strict';

const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const https = require('https');
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

// Rolling tail of the dsh service's stderr, surfaced in the error dialog when
// the service dies unexpectedly, plus a full log file for support.
const DSH_STDERR_TAIL_LINES = 40;
const dshLogFile = path.join(dataDir, 'dsh-service.log');
let dshStderrTail = [];

function captureDshStderr(chunk) {
  try {
    fs.appendFileSync(dshLogFile, chunk.toString('utf8'));
  } catch {
    /* ignore */
  }
  dshStderrTail.push(...chunk.toString('utf8').split(/\r?\n/));
  if (dshStderrTail.length > DSH_STDERR_TAIL_LINES) {
    dshStderrTail = dshStderrTail.slice(dshStderrTail.length - DSH_STDERR_TAIL_LINES);
  }
}

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
  stopPluginServer();
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

// ---- plugin toggle bridge --------------------------------------------------
// The dsh web GUI lists plugins read-only; upstream has no "toggle a plugin"
// API. This Desktop shell fills that gap with a tiny localhost HTTP endpoint
// that the patched plugin-list page calls to flip `disabled` in the
// machine-local user patch layer ($DSH_HOME/cordis.patch.yml). The change only
// takes effect on the next `dsh web` start (closing the window restarts it).

const PLUGIN_PORT = 3091;
let pluginServer = null;

function dshNodeModule(name) {
  return path.join(resourcePath('dsh', 'node_modules'), name);
}

function setPluginDisabled(id, disabled) {
  const yaml = require(dshNodeModule('js-yaml'));
  const patchPath = path.join(dataDir, 'dsh-home', 'cordis.patch.yml');
  let patches = [];
  if (fs.existsSync(patchPath)) {
    try {
      patches = yaml.load(fs.readFileSync(patchPath, 'utf8')) || [];
    } catch (err) {
      throw new Error('Cannot parse ' + patchPath + ': ' + err.message);
    }
    if (!Array.isArray(patches)) {
      throw new Error(patchPath + ' must be a top-level YAML array');
    }
  }
  const existing = patches.find((p) => p && typeof p === 'object' && p.id === id);
  if (existing) {
    existing.disabled = disabled;
  } else {
    patches.push({ id, disabled });
  }
  fs.writeFileSync(patchPath, yaml.dump(patches));
  return patchPath;
}

// ---- plugin install (pnpm forwarder) ---------------------------------------
// dsh already ships `dsh plugin --profile web add <spec>` (a pnpm forwarder that
// also reconciles the profile's bundle layer). We re-run it through Electron's
// own Node so the app still needs no system Node/pnpm. Runs async and reports
// progress through /plugins/install/:id.

const installJobs = new Map(); // jobId -> { status, output, exitCode }

function startPluginJob(action, spec) {
  const jobId = Math.random().toString(16).slice(2, 10);
  const job = { status: 'running', output: '', exitCode: null };
  installJobs.set(jobId, job);
  const bin = dshBinPath();
  const nodeModulesBin = path.join(resourcePath('dsh', 'node_modules'), '.bin');
  const child = spawn(process.execPath, [bin, 'plugin', '--profile', 'web', action, spec], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DSH_HOME: path.join(dataDir, 'dsh-home'),
      PATH: nodeModulesBin + path.delimiter + (process.env.PATH || ''),
    },
    cwd: path.dirname(bin),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    job.output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    job.output += chunk.toString();
  });
  child.on('error', (err) => {
    job.status = 'failed';
    job.output += '\n' + (err && err.message ? err.message : String(err));
  });
  child.on('exit', (code) => {
    job.status = code === 0 ? 'done' : 'failed';
    job.exitCode = code;
  });
  return jobId;
}

// ---- plugin registry (marketplace) ----------------------------------------
// A "registry" is a JSON manifest listing plugins. The built-in one ships with
// the app; users subscribe to community registries (a GitHub repo, or any URL
// serving a dsh-plugins.json) and the marketplace merges their plugin lists.

function builtinRegistryPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'registries', 'official.json')
    : path.join(__dirname, 'registries', 'official.json');
}

function subscribedRegistriesPath() {
  return path.join(dataDir, 'dsh-home', 'registries.json');
}

function readSubscribedRegistries() {
  const p = subscribedRegistriesPath();
  if (!fs.existsSync(p)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeSubscribedRegistries(list) {
  const p = subscribedRegistriesPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(list, null, 2));
}

function registryManifestUrl(url) {
  if (url.startsWith('github:')) {
    return `https://raw.githubusercontent.com/${url.slice('github:'.length)}/HEAD/dsh-plugins.json`;
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
    return `https://raw.githubusercontent.com/${url}/HEAD/dsh-plugins.json`;
  }
  return url;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error('invalid JSON: ' + err.message));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function loadRegistry(url, source) {
  if (url.startsWith('builtin:')) {
    const p = builtinRegistryPath();
    if (!fs.existsSync(p)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      return { ...data, url, source };
    } catch {
      return null;
    }
  }
  try {
    const data = await fetchJson(registryManifestUrl(url));
    return { ...data, url, source };
  } catch (err) {
    return { url, source, title: url, error: err.message, plugins: [] };
  }
}

async function listRegistries() {
  const builtin = await loadRegistry('builtin:official', 'builtin');
  const subscribed = await Promise.all(readSubscribedRegistries().map((url) => loadRegistry(url, 'subscribed')));
  const registries = [builtin, ...subscribed].filter(Boolean);
  const plugins = [];
  for (const reg of registries) {
    for (const plugin of reg.plugins || []) {
      plugins.push({ ...plugin, registry: reg.name || reg.title || reg.url });
    }
  }
  return { registries, plugins };
}

function installedPlugins() {
  const p = path.join(dataDir, 'dsh-home', 'profiles', 'web', 'package.json');
  if (!fs.existsSync(p)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Object.keys(manifest.dependencies || {});
  } catch {
    return [];
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (err) {
        reject(new Error('invalid JSON: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

function startPluginServer() {
  return new Promise((resolve, reject) => {
    pluginServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      let pathname;
      try {
        pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      } catch {
        pathname = '';
      }
      if (req.method === 'GET' && pathname === '/registries') {
        listRegistries().then(
          (result) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          },
          (err) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        );
        return;
      }
      if (req.method === 'POST' && pathname === '/registries/subscribe') {
        readBody(req).then((payload) => {
          const url = payload.url;
          if (typeof url !== 'string' || !url) throw new Error('url is required');
          const list = readSubscribedRegistries();
          if (!list.includes(url)) {
            list.push(url);
            writeSubscribedRegistries(list);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, registries: list }));
        }).catch((err) => {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        });
        return;
      }
      if (req.method === 'POST' && pathname === '/registries/unsubscribe') {
        readBody(req).then((payload) => {
          const url = payload.url;
          if (typeof url !== 'string' || !url) throw new Error('url is required');
          const list = readSubscribedRegistries().filter((u) => u !== url);
          writeSubscribedRegistries(list);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, registries: list }));
        }).catch((err) => {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        });
        return;
      }
      if (req.method === 'POST' && pathname === '/plugins/remove') {
        readBody(req).then((payload) => {
          const spec = payload.spec;
          if (typeof spec !== 'string' || !spec) throw new Error('spec is required');
          const jobId = startPluginJob('remove', spec);
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, jobId }));
        }).catch((err) => {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        });
        return;
      }
      if (req.method === 'GET' && pathname === '/plugins/installed') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ installed: installedPlugins() }));
        return;
      }
      if (req.method === 'POST' && pathname === '/plugins/install') {
        readBody(req).then((payload) => {
          const spec = payload.spec;
          if (typeof spec !== 'string' || !spec) throw new Error('spec is required');
          const jobId = startPluginJob('add', spec);
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, jobId }));
        }).catch((err) => {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        });
        return;
      }
      if (req.method === 'GET' && pathname.startsWith('/plugins/install/')) {
        const jobId = pathname.slice('/plugins/install/'.length);
        const job = installJobs.get(jobId);
        if (!job) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'job not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jobId, status: job.status, exitCode: job.exitCode, output: job.output }));
        return;
      }
      if (req.method === 'POST' && pathname === '/plugins') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            const id = payload.id;
            const disabled = payload.disabled;
            if (typeof id !== 'string' || !id) throw new Error('id is required');
            if (typeof disabled !== 'boolean') throw new Error('disabled must be a boolean');
            setPluginDisabled(id, disabled);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, id, disabled, restartRequired: true }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
    });
    pluginServer.on('error', reject);
    pluginServer.listen(PLUGIN_PORT, '127.0.0.1', () => resolve(PLUGIN_PORT));
  });
}

function stopPluginServer() {
  if (pluginServer) {
    try {
      pluginServer.close();
    } catch {
      /* ignore */
    }
    pluginServer = null;
  }
}

// ---- app flow --------------------------------------------------------------

async function main() {
  const pickerPort = await startPickerServer();
  await startPluginServer();
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
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    dshStderrTail = [];
    server.stderr.on('data', captureDshStderr);
    server.on('error', (err) => {
      server = null;
      dialog.showErrorBox(APP_NAME, 'Failed to start service:\n' + err.message);
    });
    server.on('exit', (code, signal) => {
      server = null;
      if (quitting) return;
      const tail = dshStderrTail.filter((line) => line.trim()).slice(-10).join('\n');
      dialog.showErrorBox(
        APP_NAME,
        'DeepSeek Harness service exited unexpectedly (code ' +
          (code ?? signal ?? 'unknown') +
          ').' +
          (tail ? '\n\n' + tail : '') +
          '\n\nFull log: ' +
          dshLogFile
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

  // Open `target=_blank` / `window.open` links in the system default browser
  // instead of a new Electron window. In-window navigation to an external URL
  // is also handed to the browser, so the shell never navigates away from :3080.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(SERVER_URL)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.loadURL(SERVER_URL);
}
