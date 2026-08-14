'use strict';
// Replacement worker for @deepseek-ai/dsh-host-directory-picker-native/lib/worker.cjs
//
// dsh spawns this file as a child process (IPC channel) and expects:
//   {kind:'showing', threadId}   before the dialog opens
//   then exactly one of {kind:'done', path} (path null = cancelled) or {kind:'error', message}
//
// Instead of driving the Win32 COM IFileOpenDialog directly through koffi
// (which is unstable and crashes on some Windows machines), we delegate to
// the Electron main process over a localhost socket. Electron shows the OS
// folder picker via dialog.showOpenDialog (IFileDialog) and replies with the
// chosen path. No koffi, no COM vtable calls, no extra native code.

const net = require('net');

const title = process.env.DSH_DIALOG_TITLE ?? '';
if (title === '') throw new Error('win32-dialog-worker: DSH_DIALOG_TITLE is required');
if (process.send === void 0) throw new Error('win32-dialog-worker must run as a child process with an IPC channel');

const port = Number(process.env.DSH_PICKER_PORT || 0);
if (!port) throw new Error('win32-dialog-worker: DSH_PICKER_PORT is required (Electron host not running)');

const send = process.send.bind(process);
let settled = false;
let socket = null;

function settle(message) {
  if (settled) return;
  settled = true;
  send(message, () => {
    try {
      process.disconnect();
    } catch {
      /* ignore */
    }
  });
}

// Parent's abort lever posts WM_CLOSE to this thread id; the real dialog
// lives in the Electron process, so this is just a protocol placeholder.
send({ kind: 'showing', threadId: 0 });

process.on('disconnect', () => {
  try {
    if (socket) socket.destroy();
  } catch {
    /* ignore */
  }
  process.exit(0);
});

socket = net.connect(port, '127.0.0.1', () => {
  socket.write(JSON.stringify({ id: 0, title }) + '\n');
});

let buffer = '';
socket.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.id === 0) {
      settle({ kind: 'done', path: message.path ?? null });
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      process.exit(0);
    }
  }
});
socket.on('error', (err) => {
  settle({ kind: 'error', message: err && err.message ? err.message : String(err) });
  process.exit(1);
});
