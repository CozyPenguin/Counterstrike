/**
 * Packaging test: builds the release archive, checks that it contains the
 * installer and the runtime, and starts the game from the extracted copy.
 *
 * Run with: npm run test:pack
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './zip.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'counterstrike-pack-'));
const delay = ms => new Promise(r => setTimeout(r, ms));

try {
  // ------------------------------------------------------------- build
  if (!existsSync(join(root, 'dist', 'index.html'))) {
    const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    });
    assert.equal(build.status, 0, 'the game builds');
  }

  // -------------------------------------------------------------- pack
  const pack = spawnSync(process.execPath, [join(root, 'scripts', 'pack.mjs'), '--no-build', '--dir', tmp], {
    cwd: root, stdio: 'inherit',
  });
  assert.equal(pack.status, 0, 'the pack script succeeds');
  const archive = readdirSync(tmp).find(file => file.endsWith('.zip'));
  assert.ok(archive, 'the archive was created');

  // ----------------------------------------------------------- contents
  const entries = readZip(join(tmp, archive));
  const names = entries.map(entry => entry.name);
  const required = [
    'counterstrike-lan/INSTALL-PLAY.sh',
    'counterstrike-lan/INSTALL-PLAY.bat',
    'counterstrike-lan/INSTALL.md',
    'counterstrike-lan/README.md',
    'counterstrike-lan/scripts/host-lan.mjs',
    'counterstrike-lan/server/lan.js',
    'counterstrike-lan/src/room.js',
    'counterstrike-lan/src/maps/dust.js',
    'counterstrike-lan/game/index.html',
    'counterstrike-lan/node_modules/three/package.json',
    'counterstrike-lan/node_modules/three/build/three.module.js',
    'counterstrike-lan/node_modules/ws/package.json',
  ];
  for (const name of required) {
    assert.ok(names.includes(name), `the archive contains ${name}`);
  }
  const shell = entries.find(entry => entry.name.endsWith('INSTALL-PLAY.sh')).data.toString();
  assert.match(shell, /host-lan\.mjs/, 'the installer starts the host script');
  const windows = entries.find(entry => entry.name.endsWith('INSTALL-PLAY.bat')).data.toString();
  assert.match(windows, /host-lan\.mjs/, 'the windows installer starts the host script');

  // ----------------------------------------------------------- extract
  const extracted = join(tmp, 'extracted');
  for (const entry of entries) {
    if (entry.directory) continue;
    const target = join(extracted, entry.name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.data);
  }
  const gameDir = join(extracted, 'counterstrike-lan');
  assert.ok(existsSync(join(gameDir, 'game', 'index.html')), 'the game was extracted');

  // ------------------------------------------------- run from the copy
  const port = 45000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, [join(gameDir, 'scripts', 'host-lan.mjs'), '--no-open', '--port', String(port)], {
    cwd: gameDir, stdio: 'ignore',
  });
  let index = 0;
  let api = null;
  for (let i = 0; i < 60; i++) {
    await delay(200);
    try {
      const page = await fetch(`http://127.0.0.1:${port}/`);
      const rooms = await fetch(`http://127.0.0.1:${port}/api/rooms`);
      index = page.status;
      api = await rooms.json();
      break;
    } catch { /* not up yet */ }
  }
  child.kill('SIGTERM');
  assert.equal(index, 200, 'the extracted copy serves the game');
  assert.ok(api && Array.isArray(api.rooms), 'the extracted copy serves the room list');
  assert.ok(Array.isArray(api.addresses), 'the extracted copy reports the LAN addresses');

  console.log(`Packaging passed: archive (${archive}), ${entries.length} entries, installer + runtime included, extracted copy hosts the game`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
