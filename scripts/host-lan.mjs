#!/usr/bin/env node
/**
 * One command to install and host Counterstrike on a local network.
 *
 *   node scripts/host-lan.mjs [options]
 *
 * It performs the whole "get the game running and share it" flow:
 *
 *   1. checks that Node.js is new enough,
 *   2. installs the runtime dependencies when they are missing
 *      (`npm install`, needs internet the first time),
 *   3. builds the game when there is no build yet (`npm run build`),
 *   4. starts the game server together with the LAN room server,
 *   5. prints every URL the other players can use, and opens the browser.
 *
 * The release archive (see `scripts/pack.mjs`) ships the dependencies and the
 * build, so on a fresh copy the script goes straight to step 4 and works
 * completely offline.
 *
 * Options:
 *   --port <n>    port to listen on (default 5173, falls back to the next
 *                 free port when the chosen one is busy)
 *   --no-open     do not open the browser
 *   --no-build    never run the build step
 *   --dev         run the Vite dev server instead of the production build
 *   --help        show this text
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const argv = process.argv.slice(2);

const flag = name => argv.includes(name);
const value = (name, fallback) => {
  const index = argv.indexOf(name);
  if (index !== -1 && argv[index + 1] && !argv[index + 1].startsWith('--')) return argv[index + 1];
  const inline = argv.find(arg => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
};

const options = {
  port: Number(value('--port', process.env.PORT || 5173)) || 5173,
  open: !flag('--no-open'),
  build: !flag('--no-build'),
  dev: flag('--dev'),
  help: flag('--help') || flag('-h'),
};

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const useColor = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = {
  dim: s => paint(2, s),
  bold: s => paint(1, s),
  green: s => paint(32, s),
  yellow: s => paint(33, s),
  cyan: s => paint(36, s),
};

function say(line = '') { process.stdout.write(`${line}\n`); }

function banner(title) {
  say();
  say(c.bold(c.cyan('  ╔══════════════════════════════════════════════════════════╗')));
  for (const text of title) {
    const padded = `  ${text}`.padEnd(60, ' ');
    say(`${c.bold(c.cyan('  ║'))}${padded}${c.bold(c.cyan('║'))}`);
  }
  say(c.bold(c.cyan('  ╚══════════════════════════════════════════════════════════╝')));
  say();
}

function fail(message, hint) {
  say(c.yellow(`  ✖ ${message}`));
  if (hint) say(c.dim(`    ${hint}`));
  say();
  process.exit(1);
}

// ---------------------------------------------------------------- node check
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 18) {
  fail(`Node.js ${process.versions.node} is too old.`, 'Install Node.js 18 or newer from https://nodejs.org/');
}

// ------------------------------------------------------------------- helpers
function runNpm(args, label) {
  say(c.dim(`  ▸ ${label}`));
  const result = spawnSync(npmCommand, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) fail(`${label} failed.`, 'Check your internet connection and try again.');
}

const missingDeps = () => ['ws', 'three'].filter(dep => !existsSync(join(root, 'node_modules', dep)));
const findGameDir = () => ['dist', 'game'].find(dir => existsSync(join(root, dir, 'index.html'))) || null;
const hasVite = () => existsSync(join(root, 'node_modules', 'vite'));

// ------------------------------------------------------------------- install
function ensureDependencies() {
  const missing = missingDeps();
  if (!missing.length) {
    say(c.green('  ✔ Dependencies are installed.'));
    return;
  }
  say(c.yellow(`  ▸ Installing dependencies (${missing.join(', ')}) …`));
  const args = existsSync(join(root, 'package-lock.json')) ? ['ci'] : ['install'];
  runNpm([...args, '--no-audit', '--no-fund'], `npm ${args.join(' ')}`);
  const stillMissing = missingDeps();
  if (stillMissing.length) fail(`Could not install ${stillMissing.join(', ')}.`);
  say(c.green('  ✔ Dependencies are installed.'));
}

function ensureBuild() {
  const gameDir = findGameDir();
  if (gameDir) {
    say(c.green(`  ✔ Game build found (${gameDir}/).`));
    return gameDir;
  }
  if (!options.build) fail('There is no game build and --no-build was given.');
  if (!hasVite()) {
    say(c.dim('  ▸ The build tool is missing, installing it first …'));
    runNpm(['install', '--no-audit', '--no-fund'], 'npm install');
  }
  runNpm(['run', 'build'], 'npm run build');
  const built = findGameDir();
  if (!built) fail('The build did not produce a game folder.');
  say(c.green('  ✔ Game built.'));
  return built;
}

// -------------------------------------------------------------- static files
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function staticHandler(dir) {
  return async (req, res) => {
    if (res.writableEnded) return;
    try {
      const url = new URL(req.url, 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const target = normalize(join(dir, pathname));
      if (!target.startsWith(dir)) { res.writeHead(403); res.end('Forbidden'); return; }
      const info = await stat(target).catch(() => null);
      if (info?.isDirectory()) {
        res.writeHead(302, { Location: `${pathname.replace(/\/+$/, '')}/` });
        res.end();
        return;
      }
      if (info?.isFile()) {
        const body = await readFile(target);
        res.writeHead(200, {
          'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(body);
        return;
      }
      const fallback = await readFile(join(dir, 'index.html')).catch(() => null);
      if (fallback) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallback);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } catch {
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server error');
      }
    }
  };
}

// -------------------------------------------------------------------- URLs
function lanAddresses(port) {
  const urls = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      urls.push(`http://${net.address}:${port}`);
    }
  }
  return [...new Set(urls)];
}

function openBrowser(url) {
  try {
    const command = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'cmd'
        : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } catch { /* opening a browser is optional */ }
}

function listen(server, port, attempts = 12) {
  return new Promise((resolvePromise, rejectPromise) => {
    const tryPort = current => {
      const onError = error => {
        server.off('error', onError);
        if (error.code === 'EADDRINUSE' && current < port + attempts) tryPort(current + 1);
        else rejectPromise(error);
      };
      server.once('error', onError);
      server.listen(current, '0.0.0.0', () => {
        server.off('error', onError);
        resolvePromise(current);
      });
    };
    tryPort(port);
  });
}

// --------------------------------------------------------------------- dev
function startDevServer() {
  say(c.dim('  ▸ Starting the Vite dev server …'));
  const child = spawn(npmCommand, ['run', 'dev', '--', '--host', '0.0.0.0', '--port', String(options.port)], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const stop = () => child.kill('SIGINT');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', code => process.exit(code ?? 0));
}

// -------------------------------------------------------------------- main
async function main() {
  if (options.help) {
    say(`
  ${c.bold('Counterstrike — install & LAN host')}

    node scripts/host-lan.mjs [options]

    --port <n>   port to listen on (default ${options.port})
    --no-open    do not open the browser
    --no-build   never build the game
    --dev        run the Vite dev server instead of the production build
    --help       show this text
`);
    return;
  }

  banner(['COUNTERSTRIKE — install & LAN host', `Node ${process.versions.node} · ${process.platform}`]);

  if (options.dev) { startDevServer(); return; }

  ensureDependencies();
  const gameDir = ensureBuild();

  const { attachLAN } = await import('../server/lan.js');
  const server = createServer();
  const lan = attachLAN(server);
  const serve = staticHandler(join(root, gameDir));
  server.on('request', (req, res) => { if (!res.writableEnded) serve(req, res); });

  let port;
  try {
    port = await listen(server, options.port);
  } catch (error) {
    fail(`Could not start the server (${error.code || error.message}).`, 'Close whatever is using the port or pass --port <n>.');
  }

  const urls = lanAddresses(port);
  const local = `http://localhost:${port}`;

  banner([
    'The game is running.',
    '',
    `On this computer : ${local}`,
    ...(urls.length ? urls.map(url => `On your Wi-Fi   : ${url}`) : ['On your Wi-Fi   : no network adapter found']),
    '',
    'Friends: open one of the Wi-Fi URLs, click MULTIPLAYER,',
    'then CREATE a room (WEBRTC P2P for direct play) or JOIN one.',
  ]);

  if (!urls.length) {
    say(c.yellow('  ! No network interface found — other players cannot reach this computer.'));
    say(c.dim('    Connect to Wi-Fi or Ethernet and restart the script.'));
    say();
  } else {
    say(c.dim('  Allow inbound TCP ' + port + ' in the firewall if the players cannot connect.'));
    say(c.dim('  Guest Wi-Fi / client isolation blocks players even on the same network.'));
    say();
  }

  if (options.open) openBrowser(local);
  say(c.dim('  Press Ctrl+C to stop the server.'));
  say();

  const shutdown = () => {
    say();
    say(c.dim('  Stopping …'));
    lan.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(error => {
  fail(error?.message || String(error));
});
