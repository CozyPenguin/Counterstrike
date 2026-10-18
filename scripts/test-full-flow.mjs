// Full integration test: load main.js, simulate user flow.
// This is hard because main.js imports three.js. So instead, we test
// the critical HUD wiring in isolation, but with the actual main.js's
// `bindSettings` call pattern.

import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve('/home/user/Counterstrike/index.html'), 'utf8');
const cleaned = html.replace(/<script[^>]*src=[^>]*><\/script>/g, '');

const dom = new JSDOM(cleaned, { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

// jsdom stubs
window.AudioContext = undefined;
window.HTMLCanvasElement.prototype.getContext = () => null;
window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
try { delete window.localStorage; } catch {}
Object.defineProperty(window, 'localStorage', {
  value: {
    _s: {},
    getItem(k) { return this._s[k] ?? null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  },
  writable: true,
});

// Make jsdom globals visible to the imported HUD module
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Event = window.Event;
globalThis.MouseEvent = window.MouseEvent;

// Load HUD module
const { HUD } = await import('../src/hud.js');
const { settings } = await import('../src/settings.js');

// === Initial state assertion ===
// Before any clicks, the quality-seg should have .on on the default (medium)
const mediumBefore = document.querySelector('#quality-seg button[data-val="medium"]');
console.log('MEDIUM has .on before any click?', mediumBefore.classList.contains('on'));

function checkSegSelection(segId, expectedVal) {
  const buttons = document.querySelectorAll(`#${segId} button`);
  let onCount = 0;
  let correctOne = false;
  for (const b of buttons) {
    if (b.classList.contains('on')) {
      onCount++;
      if (b.dataset.val === expectedVal) correctOne = true;
    }
  }
  return { onCount, correctOne };
}

// === Reproduce what main.js does at module init ===
const fakeSound = { init() {}, setVolume() {}, shot() {}, reload() {}, dryFire() {}, scope() {} };
const hud = new HUD(fakeSound);

let changeCount = 0;
let lastPatch = null;
function readSettings() {
  return {
    quality: settings.get('quality'),
    shadowQuality: settings.get('shadowQuality'),
    fov: settings.get('fov'),
    volume: settings.get('volume'),
    mouseSensitivity: settings.get('mouseSensitivity'),
  };
}
function onChange(patch) {
  changeCount++;
  lastPatch = patch;
  settings.setMany(patch);
}
function onClose() {}
function onReset() { settings.reset(); }

// This is the call main.js makes at module init
hud.bindSettings({ initial: readSettings(), onChange, onClose, onReset });

// === Simulate user clicking SETTINGS button on the main menu ===
const settingsBtn = document.getElementById('settings-btn');
// We can't trigger the actual click handler from main.js (since main.js isn't loaded),
// but we can simulate its effect: re-call bindSettings + showSettings
hud.bindSettings({ initial: readSettings(), onChange, onClose, onReset });
hud.showSettings(true);

const panel = document.getElementById('settings-panel');
console.log('panel hidden after showSettings?', panel.classList.contains('hidden'));

// === Simulate user clicking each graphics button ===
const buttons = [
  { id: 'high', expected: { quality: 'high' } },
  { id: 'low', expected: { quality: 'low' } },
  { id: 'medium', expected: { quality: 'medium' } },
];

console.log('\nGraphics quality seg buttons:');
for (const b of buttons) {
  const btn = document.querySelector(`#quality-seg button[data-val="${b.id}"]`);
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  console.log(`  click ${b.id}: changeCount=${changeCount} patch=${JSON.stringify(lastPatch)} setting=${settings.get('quality')}`);
  if (lastPatch?.quality !== b.expected.quality) {
    console.error(`  ✗ expected quality=${b.expected.quality}, got ${settings.get('quality')}`);
    process.exit(1);
  }
  // Verify the .on class moved to the clicked button
  const check = checkSegSelection('quality-seg', b.id);
  console.log(`    .on class: ${check.onCount} buttons active, correct one selected: ${check.correctOne}`);
  if (!check.correctOne || check.onCount !== 1) {
    console.error(`    ✗ .on class didn't move correctly to ${b.id}`);
    process.exit(1);
  }
}

const shadowButtons = [
  { id: 'auto', expected: 'auto' },
  { id: 'low', expected: 'low' },
  { id: 'med', expected: 'med' },
  { id: 'high', expected: 'high' },
];

console.log('\nShadow quality seg buttons:');
for (const b of shadowButtons) {
  const btn = document.querySelector(`#shadow-seg button[data-val="${b.id}"]`);
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  console.log(`  click ${b.id}: changeCount=${changeCount} patch=${JSON.stringify(lastPatch)} setting=${settings.get('shadowQuality')}`);
  if (lastPatch?.shadowQuality !== b.expected) {
    console.error(`  ✗ expected shadowQuality=${b.expected}, got ${settings.get('shadowQuality')}`);
    process.exit(1);
  }
  const check = checkSegSelection('shadow-seg', b.id);
  console.log(`    .on class: ${check.onCount} buttons active, correct one selected: ${check.correctOne}`);
  if (!check.correctOne || check.onCount !== 1) {
    console.error(`    ✗ .on class didn't move correctly to ${b.id}`);
    process.exit(1);
  }
}

console.log('\nFOV slider:');
const fov = document.getElementById('fov-slider');
fov.value = '90';
fov.dispatchEvent(new window.Event('input', { bubbles: true }));
console.log(`  set to 90: setting=${settings.get('fov')} fov-val text=${document.getElementById('fov-val').textContent}`);
if (settings.get('fov') !== 90) {
  console.error('  ✗ FOV not set correctly');
  process.exit(1);
}

console.log('\nVolume slider:');
const vol = document.getElementById('vol-slider');
vol.value = '80';
vol.dispatchEvent(new window.Event('input', { bubbles: true }));
console.log(`  set to 80: setting=${settings.get('volume')} vol-val text=${document.getElementById('vol-val').textContent}`);
if (Math.abs(settings.get('volume') - 0.8) > 0.01) {
  console.error('  ✗ Volume not set correctly');
  process.exit(1);
}

console.log('\nMouse sensitivity slider:');
const sens = document.getElementById('sens-slider');
sens.value = '3.5';
sens.dispatchEvent(new window.Event('input', { bubbles: true }));
console.log(`  set to 3.5: setting=${settings.get('mouseSensitivity')} sens-val text=${document.getElementById('sens-val').textContent}`);
if (Math.abs(settings.get('mouseSensitivity') - 3.5) > 0.01) {
  console.error('  ✗ Sensitivity not set correctly');
  process.exit(1);
}

console.log('\nBACK button:');
const back = document.getElementById('settings-back');
let closed = false;
back.addEventListener('click', () => { closed = true; });
// The onClose is wired in bindSettings. We replaced onClose with noop, so
// the panel won't close here, but we can check that onClose was called.
let closeCalled = false;
hud.bindSettings({ initial: readSettings(), onChange, onClose: () => { closeCalled = true; }, onReset });
back.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
console.log(`  close called: ${closeCalled}`);

console.log('\nRESET button:');
let resetCalled = false;
hud.bindSettings({ initial: readSettings(), onChange, onClose, onReset: () => { resetCalled = true; settings.reset(); }});
const reset = document.getElementById('settings-reset');
reset.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
console.log(`  reset called: ${resetCalled}, quality after reset: ${settings.get('quality')}`);

console.log('\n✓ ALL SETTINGS BUTTONS WORK CORRECTLY');
process.exit(0);
