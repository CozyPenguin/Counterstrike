#!/usr/bin/env node
/**
 * Build the release archive that players download.
 *
 *   node scripts/pack.mjs [--no-build] [--out <name>]
 *
 * The archive is self contained: it ships the built game, the room server and
 * the runtime dependencies, plus `INSTALL-PLAY.sh` / `INSTALL-PLAY.bat` which
 * install (when needed) and host the game on the local network.
 *
 * Because everything the server needs is inside the archive, the installer
 * works completely offline — it only needs Node.js.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from './zip.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const argv = process.argv.slice(2);
const flag = name => argv.includes(name);
const value = (name, fallback) => {
  const index = argv.indexOf(name);
  if (index !== -1 && argv[index + 1]) return argv[index + 1];
  const inline = argv.find(arg => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
};

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const prefix = 'counterstrike-lan';
const outName = value('--out', `${prefix}-v${pkg.version}`);
const releaseDir = resolve(root, value('--dir', 'release'));
const outFile = join(releaseDir, `${outName}.zip`);

const say = (line = '') => process.stdout.write(`${line}\n`);

function runNpm(args, label) {
  say(`  ▸ ${label}`);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    say(`  ✖ ${label} failed.`);
    process.exit(1);
  }
}

function walk(dir, filter = () => true) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

const files = [];
const add = (name, data, mode) => files.push({ name: `${prefix}/${name}`, data, mode });
const addFile = (name, path, mode) => {
  if (!existsSync(path)) return false;
  add(name, readFileSync(path), mode);
  return true;
};
const addTree = (name, dir, filter) => {
  for (const file of walk(dir, filter)) {
    add(`${name}/${relative(dir, file).split('\\').join('/')}`, readFileSync(file));
  }
};

// ---------------------------------------------------------------- 1. build
if (!flag('--no-build')) {
  say('  ▸ Building the game …');
  runNpm(['run', 'build'], 'npm run build');
}
const gameDir = ['dist', 'game'].find(dir => existsSync(join(root, dir, 'index.html')));
if (!gameDir) {
  say('  ✖ There is no game build. Run "npm run build" first.');
  process.exit(1);
}

// ------------------------------------------------------------- 2. contents
// The game itself.
addTree('game', join(root, gameDir));

// The room server and the map data it needs.
addFile('server/lan.js', join(root, 'server', 'lan.js'));
for (const name of ['map.js', 'room.js', 'textures.js']) addFile(`src/${name}`, join(root, 'src', name));
addTree('src/maps', join(root, 'src', 'maps'));

// The installer.
addFile('scripts/host-lan.mjs', join(root, 'scripts', 'host-lan.mjs'), 0o755);
addFile('INSTALL-PLAY.sh', join(root, 'INSTALL-PLAY.sh'), 0o755);
addFile('INSTALL-PLAY.bat', join(root, 'INSTALL-PLAY.bat'));
addFile('INSTALL.md', join(root, 'INSTALL.md'));
addFile('README.md', join(root, 'README.md'));
addFile('package.json', join(root, 'package.json'));

// Runtime dependencies, so the archive works without internet access.
const threeDir = join(root, 'node_modules', 'three');
if (!existsSync(threeDir)) {
  say('  ✖ node_modules/three is missing — run "npm install" first.');
  process.exit(1);
}
const threeVersion = JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8')).version;
add('node_modules/three/package.json', Buffer.from(`${JSON.stringify({
  name: 'three',
  version: threeVersion,
  type: 'module',
  main: './build/three.module.js',
  module: './build/three.module.js',
  exports: {
    '.': { import: './build/three.module.js', default: './build/three.module.js' },
    './package.json': './package.json',
  },
  license: 'MIT',
}, null, 2)}\n`));
// The ESM build of three only needs these two files.
addFile('node_modules/three/build/three.module.js', join(threeDir, 'build', 'three.module.js'));
addFile('node_modules/three/build/three.core.js', join(threeDir, 'build', 'three.core.js'));
addFile('node_modules/three/LICENSE', join(threeDir, 'LICENSE'));
addTree('node_modules/ws', join(root, 'node_modules', 'ws'));

// --------------------------------------------------------------- 3. archive
mkdirSync(releaseDir, { recursive: true });
const result = writeZip(files, outFile);
const size = (statSync(outFile).size / 1024 / 1024).toFixed(2);
say();
say(`  ✔ ${relative(root, outFile)}  (${files.length} files, ${size} MB)`);
say(`    unzip it and run INSTALL-PLAY.sh (Linux/macOS) or INSTALL-PLAY.bat (Windows)`);
say();
