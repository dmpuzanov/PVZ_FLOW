/**
 * PVZ.FLOW launcher.
 *
 * Runs the local server with the bundled Node runtime, waits for the port it
 * actually bound (the preferred 8783 can be reserved by Windows), opens the
 * default browser and keeps the console open until the app is closed.
 *
 * No global Node installation, npm package or internet access is required.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Opens `url` in the default browser without assuming a browser is installed. */
function openInBrowser(url) {
  return new Promise((resolve) => {
    try {
      const child =
        process.platform === 'win32'
          ? spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' })
          : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], {
              detached: true,
              stdio: 'ignore',
            });
      child.on('error', () => resolve(false));
      child.unref();
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(ROOT, 'server', 'index.mjs');
const RUNTIME_FILE = path.join(ROOT, 'app', 'runtime.json');
const HOST = 'http://localhost';
/** --no-browser is used by the automated package test so it never opens a window. */
const NO_BROWSER = process.argv.includes('--no-browser');

function clearRuntimeFile() {
  try {
    fs.rmSync(RUNTIME_FILE, { force: true });
  } catch {
    /* ignore */
  }
}

function waitForRuntimeFile(timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      try {
        const info = JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8'));
        if (info && info.port) return resolve(info);
      } catch {
        /* not written yet */
      }
      if (Date.now() - started > timeoutMs) return resolve(null);
      setTimeout(tick, 150);
    };
    tick();
  });
}

async function main() {
  if (!fs.existsSync(SERVER)) {
    console.error('Не найден server/index.mjs — комплект собран неверно.');
    process.exit(1);
  }
  clearRuntimeFile();

  // execPath is the bundled runtime/node.exe, never a system Node.
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PVZ_FLOW_DATA_DIR: process.env.PVZ_FLOW_DATA_DIR || path.join(ROOT, 'data') },
  });

  let closing = false;
  const shutdown = (code = 0) => {
    if (closing) return;
    closing = true;
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    clearRuntimeFile();
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  child.on('exit', (code) => shutdown(code ?? 0));

  const info = await waitForRuntimeFile();
  if (!info) {
    console.error('\nСервер не сообщил о запуске за 30 секунд. Смотрите сообщения выше.\n');
    shutdown(1);
    return;
  }

  const url = info.url || `${HOST}:${info.port}/`;
  console.log('');
  console.log('  PVZ.FLOW запущен');
  console.log(`  ${url}`);
  console.log('');
  console.log('  Закройте это окно, чтобы остановить приложение.');
  console.log('');

  // Best effort — a machine without a default browser still runs the server.
  if (NO_BROWSER) {
    console.log(`  (--no-browser) Откройте адрес вручную: ${url}`);
  } else {
    const opened = await openInBrowser(url);
    if (!opened) console.log(`  Не удалось открыть браузер автоматически — откройте адрес вручную: ${url}`);
  }
}

main().catch((err) => {
  console.error(`Ошибка запуска: ${err.message}`);
  process.exit(1);
});
