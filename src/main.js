import * as THREE from 'three';
import { buildWorld } from './map.js';
import { Player } from './player.js';
import { WeaponSystem, WEAPONS } from './weapons.js';
import { Bot } from './bots.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { Sound } from './audio.js';
import { LANClient } from './lan.js';
import { skyTexture } from './textures.js';

// ================= Renderer / Scene =================

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9db9cf);
scene.fog = new THREE.Fog(0xbcc9c8, 55, 165);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

// sky dome (inside-out sphere with gradient)
{
  const skyGeo = new THREE.SphereGeometry(150, 16, 12);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTexture(),
    side: THREE.BackSide,
    fog: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
}

// lights
const hemi = new THREE.HemisphereLight(0xa8c4dd, 0xb89f72, 0.95);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2dc, 1.75);
sun.position.set(38, 58, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
sun.shadow.camera.near = 5;
sun.shadow.camera.far = 140;
sun.shadow.bias = -0.0006;
scene.add(sun);

const world = buildWorld(scene);
const sound = new Sound();
const player = new Player(camera, world);
const weapons = new WeaponSystem(camera, sound, world);
const effects = new Effects(scene, world);
const hud = new HUD(sound);

player.respawn(world.spawnsCT[2], 0);

// ================= Game state =================

const BOT_NAMES = ['Vitaliy', 'Yahn', 'Zach', 'Gunner', 'Ridgway', 'Opie', 'Cliffe', 'Minh', 'Gabe', 'Steve'];

const game = {
  state: 'menu', // menu | buy | live | roundEnd | matchEnd
  round: 0,
  scoreCT: 0,
  scoreT: 0,
  maxRounds: 8,
  money: 800,
  hp: 100,
  armor: 0,
  helmet: false,
  buyTime: 12,
  roundTime: 115,
  roundEndTimer: 0,
  lossStreak: 0,
  kills: 0,
  deaths: 0,
  headshots: 0,
  matchOver: false,
  freeze: false,
};

let bots = [];
let lan = null;
const input = {
  forward: false, back: false, left: false, right: false,
  jump: false, crouch: false, walk: false,
  fire: false, firePressed: false, fireHeld: false,
  zoomPressed: false,
};

let buyMenuOpen = false;
let paused = false;
let tabHeld = false;

// ================= Input =================

const keyMap = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ControlLeft: 'crouch', ControlRight: 'crouch',
  ShiftLeft: 'walk', ShiftRight: 'walk',
};

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Tab') {
    e.preventDefault();
    tabHeld = true;
    if (game.state !== 'menu') hud.showScoreboard(true, scoreboardRows());
    return;
  }
  if (e.repeat) return;

  const action = keyMap[e.code];
  if (action) {
    input[action] = true;
    if (action === 'jump') player.queueJump();
    e.preventDefault();
    return;
  }

  switch (e.code) {
    case 'Escape':
      if (buyMenuOpen) {
        toggleBuyMenu();
        e.preventDefault();
      }
      break;
    case 'KeyR':
      if (game.state === 'live' || game.state === 'buy') {
        if (weapons.startReload() && lan) lan.send({ type: 'reload' });
      }
      break;
    case 'KeyB':
      toggleBuyMenu();
      break;
    case 'KeyQ':
      if (lan) break;
      weapons.swapToLast();
      break;
    case 'Digit1':
      if (lan) break;
      if (buyMenuOpen) buyByKey('1');
      else weapons.selectSlot('primary');
      break;
    case 'Digit2':
      if (lan) break;
      if (buyMenuOpen) buyByKey('2');
      else weapons.selectSlot('pistol');
      break;
    case 'Digit3':
      if (lan) break;
      if (buyMenuOpen) buyByKey('3');
      else weapons.selectSlot('knife');
      break;
    case 'Digit4': if (buyMenuOpen) buyByKey('4'); break;
    case 'Digit5': if (buyMenuOpen) buyByKey('5'); break;
    case 'Digit6': if (buyMenuOpen) buyByKey('6'); break;
    case 'Digit7': if (buyMenuOpen) buyByKey('7'); break;
    case 'Digit8': if (buyMenuOpen) buyByKey('8'); break;
    case 'Digit9': if (buyMenuOpen) buyByKey('9'); break;
    case 'Digit0': if (buyMenuOpen) buyByKey('0'); break;
    default: break;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') {
    tabHeld = false;
    hud.showScoreboard(false);
    return;
  }
  const action = keyMap[e.code];
  if (action) input[action] = false;
});

canvas.addEventListener('mousedown', (e) => {
  if (game.state === 'menu' || paused || buyMenuOpen) return;
  if (document.pointerLockElement !== canvas) {
    lockPointer();
    return;
  }
  if (e.button === 0) {
    input.fire = true;
    input.firePressed = true;
    input.fireHeld = true;
  } else if (e.button === 2) {
    input.zoomPressed = true;
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    input.fire = false;
    input.fireHeld = false;
  }
});

window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && !paused && !buyMenuOpen) {
    const sens = 0.0021 * (weapons.zoomed ? 0.45 : 1);
    player.applyMouse(e.movementX, e.movementY, sens);
  }
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked) {
    for (const key of Object.keys(input)) input[key] = false;
  }
  if (!locked && game.state !== 'menu' && game.state !== 'matchEnd' && !buyMenuOpen) {
    paused = true;
    hud.el.pauseMenu.classList.remove('hidden');
  }
  if (locked) {
    paused = false;
    hud.el.pauseMenu.classList.add('hidden');
    sound.init();
  }
});

// ================= UI buttons =================

document.getElementById('play-btn').addEventListener('click', () => {
  sound.init();
  hud.el.mainMenu.classList.add('hidden');
  hud.showHUD(true);
  lockPointer();
  startMatch();
});

document.getElementById('resume-btn').addEventListener('click', () => {
  lockPointer();
});

document.getElementById('restart-btn').addEventListener('click', () => {
  hud.showMatchEnd(false);
  hud.el.mainMenu.classList.add('hidden');
  hud.showHUD(true);
  lockPointer();
  startMatch();
});

hud.onBuy = (id) => tryBuy(id);
hud.onCloseBuy = () => {
  if (buyMenuOpen) toggleBuyMenu();
};

function lockPointer() {
  const p = canvas.requestPointerLock();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

// audio hooks for movement
player.onFootstep = () => {
  if (game.state === 'live' || game.state === 'buy') sound.footstep(0, player.crouching);
};
player.onLand = () => {
  if (game.state === 'live' || game.state === 'buy') sound.land();
};

document.addEventListener('pointerlockerror', () => {
  if (game.state !== 'menu' && game.state !== 'matchEnd' && !buyMenuOpen) {
    paused = true;
    hud.el.pauseMenu.classList.remove('hidden');
  }
});


// LAN deathmatch runs continuously on the host, even when a browser releases its mouse.
function lanSpawn(message) {
  player.respawn(new THREE.Vector3(...message.pos), 0);
  game.hp = 100; game.armor = 0;
  weapons.giveWeapon('ak47');
  weapons.reloading = false; weapons.cooldown = 0;
  hud.showSpectator(false);
  hud.announce('LAN DEATHMATCH · 2s spawn protection', 'neutral', 2);
}
function lanMessage(m) {
  if (!lan) return;
  if (m.type === 'spawn') lanSpawn(m);
  if (m.type === 'correct') player.pos.fromArray(m.pos);
  if (m.type === 'state') {
    const me = m.players.find(p => p.id === lan.id);
    if (me) {
      if (me.hp < game.hp) { hud.showDamage(0); sound.flesh(); }
      game.hp = me.hp; player.dead = me.hp <= 0;
      hud.showSpectator(player.dead);
    }
    hud.el.roundInfo.textContent = `LAN DEATHMATCH · ${m.players.length}/10 PLAYERS · TAB FOR SCORES`;
  }
  if (m.type === 'shot') {
    effects.spawnTracer(new THREE.Vector3(...m.from), new THREE.Vector3(...m.to));
    if (m.id !== lan.id) sound.shot('rifle', 0, 0.4);
  }
  if (m.type === 'hit') { hud.showHitmarker(m.killed); sound.hit(); }
  if (m.type === 'kill') {
    hud.addKillFeed(m.killer, m.victim, 'AK-47', m.head, false, false);
    hud.announce(`${m.killer} eliminated ${m.victim}`, 'neutral', 2);
  }
}
function leaveLAN() {
  lan?.dispose(); lan = null;
  leaveButton.hidden = true;
  game.state = 'menu'; paused = false;
  hud.showHUD(false); hud.showSpectator(false); hud.showScoreboard(false);
  hud.el.pauseMenu.classList.add('hidden');
  hud.el.mainMenu.classList.remove('hidden');
  document.exitPointerLock();
  document.getElementById('lan-status').textContent = 'Disconnected. Join again to reconnect.';
}
document.getElementById('lan-btn').addEventListener('click', async () => {
  const button = document.getElementById('lan-btn');
  const status = document.getElementById('lan-status');
  button.disabled = true; status.textContent = 'Connecting…';
  const client = new LANClient({ scene, world, onMessage: lanMessage, onClose: leaveLAN });
  try {
    const spawn = await client.connect(document.getElementById('lan-name').value);
    lan = client; leaveButton.hidden = false; clearBots(); effects.clear(); sound.init();
    game.state = 'live'; game.money = 0; game.roundTime = 115;
    buyMenuOpen = false; paused = false;
    for (const key of Object.keys(input)) input[key] = false;
    hud.showBuyMenu(false); hud.showHUD(true); hud.setScore(0, 0);
    hud.el.mainMenu.classList.add('hidden');
    lanSpawn(spawn); lockPointer(); status.textContent = '';
  } catch (error) { client.dispose(); status.textContent = error.message; }
  finally { button.disabled = false; }
});
const leaveButton = document.createElement('button');
leaveButton.textContent = 'LEAVE LAN GAME';
leaveButton.hidden = true;
leaveButton.addEventListener('click', () => { if (lan) leaveLAN(); });
document.querySelector('#pause-menu .menu-inner').appendChild(leaveButton);

// ================= Buy logic =================

function toggleBuyMenu() {
  if (lan) return;
  if (game.state !== 'buy' && game.state !== 'live') return;
  if (game.state === 'live' && game.roundTime < 115 - 20) {
    // late in the round: buying disabled
    sound.deny();
    return;
  }
  buyMenuOpen = !buyMenuOpen;
  hud.showBuyMenu(buyMenuOpen, game.state === 'buy' ? game.buyTime : 0);
  if (buyMenuOpen) {
    document.exitPointerLock();
    hud.refreshBuyMenu(game.money, ownedItems());
  } else if (!paused) {
    lockPointer();
  }
}

function ownedItems() {
  const o = {};
  if (game.armor > 0) o.armor = true;
  if (game.helmet) o.helmet = true;
  if (weapons.slots.primary) o[weapons.slots.primary.def.id] = true;
  if (weapons.slots.pistol) o[weapons.slots.pistol.def.id] = true;
  return o;
}

function buyByKey(key) {
  const entry = hud.buyItems.find((i) => i.entry.key === key);
  if (entry) tryBuy(entry.id);
}

function tryBuy(id) {
  if (lan) return;
  if (game.state !== 'buy' && game.state !== 'live') return;
  if (game.state === 'live' && game.roundTime < 115 - 20) return;

  if (id === 'armor') {
    if (game.money < 650) { sound.deny(); return; }
    if (game.armor >= 100) { sound.deny(); return; }
    game.money -= 650;
    game.armor = Math.min(100, game.armor + 50);
    sound.buy();
  } else if (id === 'helmet') {
    if (game.money < 1000) { sound.deny(); return; }
    if (game.armor >= 100 && game.helmet) { sound.deny(); return; }
    game.money -= 1000;
    game.armor = Math.min(100, game.armor + 50);
    game.helmet = true;
    sound.buy();
  } else {
    const def = WEAPONS[id];
    if (!def) return;
    if (game.money < def.price) { sound.deny(); return; }
    const slotEntry = weapons.slots[def.slot];
    if (slotEntry && slotEntry.def.id === id &&
        slotEntry.mag === def.mag && slotEntry.reserve === def.reserve) {
      sound.deny();
      return;
    }
    game.money -= def.price;
    weapons.giveWeapon(id);
    sound.buy();
  }
  hud.setMoney(game.money);
  hud.refreshBuyMenu(game.money, ownedItems());
}

// ================= Match / round flow =================

function startMatch() {
  game.round = 0;
  game.scoreCT = 0;
  game.scoreT = 0;
  game.money = 800;
  game.hp = 100;
  game.armor = 0;
  game.helmet = false;
  game.kills = 0;
  game.deaths = 0;
  game.headshots = 0;
  game.lossStreak = 0;
  game.matchOver = false;
  hud.setScore(0, 0);
  startRound();
}

function clearBots() {
  for (const b of bots) b.dispose();
  bots = [];
}

function startRound() {
  game.round += 1;
  clearBots();
  effects.clear();

  game.hp = 100;
  game.roundTime = 115;

  const spawnIdx = (game.round - 1) % world.spawnsCT.length;
  player.respawn(world.spawnsCT[spawnIdx], 0);

  // spawn bots
  const shuffled = [...BOT_NAMES].sort(() => Math.random() - 0.5).slice(0, 5);
  for (let i = 0; i < 5; i++) {
    const pos = world.spawnsT[i % world.spawnsT.length];
    const bot = new Bot(scene, pos, world, {
      name: shuffled[i],
      armor: Math.random() < 0.6 ? 50 + ((Math.random() * 50) | 0) : 0,
      yaw: Math.PI,
    });
    bots.push(bot);
  }

  hud.setRound(game.round, game.maxRounds);
  hud.setScore(game.scoreCT, game.scoreT);
  hud.setHealth(game.hp, game.armor);
  hud.setMoney(game.money);

  game.state = 'buy';
  game.buyTime = 12;
  buyMenuOpen = false;
  hud.showBuyMenu(true, game.buyTime);
  buyMenuOpen = true;
  document.exitPointerLock();
  hud.refreshBuyMenu(game.money, ownedItems());
  hud.announce(`ROUND ${game.round} — BUY PHASE`, 'neutral', 3);
  sound.roundStart();
}

function endRound(ctWin) {
  if (game.state !== 'live') return;
  game.state = 'roundEnd';
  game.roundEndTimer = 4.5;

  if (ctWin) {
    game.scoreCT += 1;
    game.money = Math.min(16000, game.money + 3250);
    game.lossStreak = 0;
    hud.announce('COUNTER-TERRORISTS WIN', 'ct-win', 4);
    sound.roundWin();
  } else {
    game.scoreT += 1;
    game.lossStreak = Math.min(4, game.lossStreak + 1);
    game.money = Math.min(16000, game.money + 1400 + 500 * game.lossStreak);
    hud.announce('TERRORISTS WIN', 't-win', 4);
    sound.roundLose();
  }
  hud.setScore(game.scoreCT, game.scoreT);
  hud.setMoney(game.money);

  if (buyMenuOpen) {
    buyMenuOpen = false;
    hud.showBuyMenu(false);
    if (document.pointerLockElement !== canvas) lockPointer();
  }

  if (game.scoreCT >= game.maxRounds || game.scoreT >= game.maxRounds) {
    game.matchOver = true;
  }
}

function finishMatch() {
  game.state = 'matchEnd';
  const won = game.scoreCT > game.scoreT;
  hud.showMatchEnd(true,
    won ? 'COUNTER-TERRORISTS WIN' : 'TERRORISTS WIN',
    `Final score &nbsp; <b>${game.scoreCT} — ${game.scoreT}</b><br/>
     Kills: <b>${game.kills}</b> &nbsp; Deaths: <b>${game.deaths}</b> &nbsp; Headshots: <b>${game.headshots}</b>
     &nbsp; Money earned: <b>$${game.money}</b>`
  );
  document.exitPointerLock();
}

// ================= Combat =================

function falloff(dist) {
  if (dist <= 15) return 1;
  return Math.max(0.72, 1 - (dist - 15) * 0.0035);
}

function applyDamageToBot(bot, rawDamage, part, armorPen) {
  let dmg = rawDamage;
  if (bot.armor > 0) {
    const hpDmg = dmg * Math.max(armorPen, 0.25);
    const armorDmg = (dmg - hpDmg) * 0.55;
    bot.armor = Math.max(0, bot.armor - armorDmg);
    dmg = hpDmg;
  }
  return bot.takeDamage(dmg);
}

function resolvePlayerShot(shot) {
  let bestBot = null;
  let bestT = Infinity;
  let bestPart = null;
  let bestPoint = null;

  for (const bot of bots) {
    const hit = bot.testRay(shot.origin, shot.dir, shot.range);
    if (hit && hit.t < bestT) {
      bestBot = bot;
      bestT = hit.t;
      bestPart = hit.part;
      bestPoint = hit.point;
    }
  }

  const worldHit = world.rayWorld(shot.origin, shot.dir, shot.range);
  const worldT = worldHit ? worldHit.t : Infinity;

  // tracer origin: approximate muzzle
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const muzzle = camera.position.clone()
    .addScaledVector(fwd, 0.55)
    .addScaledVector(right, 0.16)
    .add(new THREE.Vector3(0, -0.12, 0));

  if (bestBot && bestT < worldT) {
    const dist = bestT;
    let dmg = shot.damage * (bestPart === 'head' ? shot.headMult : 1);
    dmg *= falloff(dist);

    const died = applyDamageToBot(bestBot, dmg, bestPart, shot.armorPen);
    effects.spawnBlood(bestPoint);
    effects.spawnTracer(muzzle, bestPoint);

    if (died) {
      hud.showHitmarker(true);
      if (bestPart === 'head') {
        sound.headshot();
        game.headshots += 1;
      } else {
        sound.flesh();
      }
      sound.death();
      game.kills += 1;
      game.money = Math.min(16000, game.money + (WEAPONS[weapons.current.def.id]?.killAward ?? 300));
      hud.addKillFeed('You', bestBot.name, weapons.current.def.name, bestPart === 'head', true, false);
      hud.setMoney(game.money);

      if (bots.every((b) => !b.alive)) {
        setTimeout(() => endRound(true), 600);
      }
    } else {
      hud.showHitmarker(false);
      if (bestPart === 'head') sound.headshot();
      else sound.hit();
      bestBot.hear(player.pos);
      // shot alerts nearby bots
      alertBots(player.pos, 30);
    }
    hud.setHealth(game.hp, game.armor);
  } else if (worldHit) {
    effects.spawnImpact(worldHit.point, worldHit.normal);
    effects.spawnTracer(muzzle, worldHit.point);
    alertBots(player.pos, 38);
  } else {
    effects.spawnTracer(muzzle, shot.origin.clone().addScaledVector(shot.dir, shot.range));
    alertBots(player.pos, 38);
  }
}

function alertBots(pos, radius) {
  for (const bot of bots) {
    if (!bot.alive) continue;
    if (bot.pos.distanceTo(pos) < radius) bot.hear(pos);
  }
}

function damagePlayer(amount, fromPos, attacker = null, headshot = false) {
  if (game.hp <= 0) return;
  let dmg = amount;
  if (game.armor > 0) {
    const hpDmg = dmg * 0.62;
    const armorDmg = (dmg - hpDmg) * 0.55;
    game.armor = Math.max(0, game.armor - armorDmg);
    dmg = hpDmg;
  }
  game.hp -= dmg;

  // damage direction indicator
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const d = new THREE.Vector3().subVectors(fromPos, player.pos);
  d.y = 0;
  if (d.lengthSq() > 0.001) {
    d.normalize();
    const ang = Math.atan2(d.dot(right), d.dot(forward));
    hud.showDamage(ang);
  }
  sound.flesh();

  hud.setHealth(game.hp, game.armor);

  if (game.hp <= 0) {
    game.hp = 0;
    player.dead = true;
    game.deaths += 1;
    if (attacker) attacker.kills += 1;
    sound.death();
    hud.addKillFeed(attacker ? attacker.name : 'Terrorist', 'You', 'AK-47', headshot, false, true);
    hud.showSpectator(true);
    setTimeout(() => endRound(false), 1200);
  }
}

function botShoot(bot) {
  const from = bot.eyePos;
  const to = new THREE.Vector3(player.pos.x, player.pos.y + player.height * 0.82, player.pos.z);
  const dist = from.distanceTo(to);

  // sound with panning
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const toBot = new THREE.Vector3().subVectors(from, camera.position).normalize();
  const rightV = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();
  const pan = Math.max(-1, Math.min(1, toBot.dot(rightV)));
  const vol = Math.max(0.15, 1 - dist / 70);
  sound.shot('rifle', pan, vol);

  const playerMoving = player.speed2D > 3.2;
  let hitChance = 0.66 - dist * 0.0052;
  if (playerMoving) hitChance -= 0.14;
  if (player.crouching) hitChance += 0.07;
  if (player.onGround === false) hitChance -= 0.1;
  hitChance = Math.max(0.1, Math.min(0.74, hitChance));

  const hit = Math.random() < hitChance;
  const end = to.clone();
  if (!hit) {
    end.add(new THREE.Vector3(
      (Math.random() - 0.5) * (0.6 + dist * 0.028),
      (Math.random() - 0.5) * (0.6 + dist * 0.028),
      (Math.random() - 0.5) * (0.6 + dist * 0.028)
    ));
  }
  effects.spawnTracer(from, end, 0xffd0a0);

  if (hit) {
    let dmg = 17 + Math.random() * 11;
    const headshot = Math.random() < 0.13;
    if (headshot) dmg *= 3.1;
    damagePlayer(dmg, from, bot, headshot);
  }
}

// ================= Scoreboard =================

function scoreboardRows() {
  if (lan) return lan.players.map(p => ({ name: p.name, ct: false, me: p.id === lan.id, kills: p.kills, deaths: p.deaths, score: p.kills * 2 - p.deaths }));
  const rows = [{
    name: 'You', ct: true, me: true,
    kills: game.kills, deaths: game.deaths, score: game.kills * 2 - game.deaths,
  }];
  for (const b of bots) {
    rows.push({
      name: b.name, ct: false, me: false,
      kills: b.kills, deaths: b.deaths,
      score: b.kills * 2 - b.deaths,
    });
  }
  return rows;
}

// ================= Main loop =================

const clock = new THREE.Clock();
let crosshairGap = 6;

function update() {
  requestAnimationFrame(update);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const frozen = paused || game.state === 'menu' || game.state === 'matchEnd';
  const dt = frozen ? 0 : rawDt;

  // ---- weapon recoil recovery ----
  if (dt > 0) {
    const [dp, dy] = weapons.recover(dt);
    player.pitch -= dp;
    player.yaw -= dy;
    // hard clamp: recoil can never flip the camera
    const lim = Math.PI / 2 - 0.015;
    player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
  }

  // ---- player ----
  const canMove = !frozen && (game.state === 'buy' || game.state === 'live') && !player.dead;
  const playerInput = { ...input, crouch: input.crouch };
  if (dt > 0) {
    const wasDead = player.dead;
    player.update(dt, playerInput, !canMove);
    if (wasDead && !player.dead) hud.showSpectator(false);
  }

  // ---- firing ----
  if (!frozen && game.state === 'live' && !player.dead && !buyMenuOpen) {
    const def = weapons.current.def;
    const wantFire = def.auto ? input.fire : input.firePressed;
    if (wantFire) {
      const shot = weapons.fire(player, player.speed2D > 0.5, !player.onGround, player.crouching);
      if (shot) {
        if (lan) lan.send({ type: 'shot', dir: shot.dir.toArray() });
        else resolvePlayerShot(shot);
      }
    }
  }
  input.firePressed = false;

  // ---- zoom ----
  if (input.zoomPressed && !frozen && !player.dead) {
    weapons.toggleZoom();
  }
  input.zoomPressed = false;

  const targetFov = weapons.zoomed ? weapons.current.def.zoomFov : 78;
  camera.fov += (targetFov - camera.fov) * Math.min(1, rawDt * 14);
  camera.updateProjectionMatrix();

  // ---- bots ----
  if (dt > 0 && (game.state === 'live' || game.state === 'roundEnd')) {
    const playerAlive = game.state === 'live' && !player.dead;
    for (const bot of bots) {
      const r = bot.update(dt, player.pos, playerAlive, world.colliders, sound);
      if (r.fire && playerAlive) botShoot(bot);
    }
  }

  // ---- round timers ----
  if (lan) {
    weapons.current.reserve = 90; // Unlimited reserve ammunition in deathmatch.
    lan.update(rawDt, player);
    if (tabHeld) hud.showScoreboard(true, scoreboardRows());
  } else if (game.state === 'buy') {
    game.buyTime -= dt;
    if (buyMenuOpen) {
      hud.buyTimeLeft = game.buyTime;
      hud.refreshBuyMenu(game.money, ownedItems());
    }
    if (game.buyTime <= 0) {
      if (buyMenuOpen) {
        buyMenuOpen = false;
        hud.showBuyMenu(false);
        if (!paused && document.pointerLockElement !== canvas) lockPointer();
      }
      game.state = 'live';
      hud.announce('GO GO GO', 'neutral', 1.8);
    }
  } else if (game.state === 'live') {
    game.roundTime -= dt;
    if (game.roundTime <= 0) {
      game.roundTime = 0;
      endRound(false);
    }
  } else if (game.state === 'roundEnd') {
    game.roundEndTimer -= dt;
    if (game.roundEndTimer <= 0) {
      if (game.matchOver) {
        finishMatch();
      } else {
        startRound();
      }
    }
  }

  // ---- weapons viewmodel ----
  if (dt > 0 || frozen) weapons.update(rawDt, player);

  // ---- effects ----
  if (dt > 0) effects.update(dt);

  // ---- HUD ----
  hud.update(rawDt);
  if (lan) hud.el.timer.textContent = 'LAN';
  else hud.setTimer(game.state === 'buy' ? game.buyTime : game.roundTime);
  hud.setHealth(game.hp, game.armor);
  const w = weapons.current;
  hud.setAmmo(w.mag, w.reserve, w.def.name, w.def.mag === Infinity);
  hud.setMoney(game.money);

  const speedFrac = Math.min(1, player.speed2D / 6.1);
  const spreadPx = 4 + weapons.spread * 1400 + speedFrac * 9 + (player.onGround ? 0 : 12);
  crosshairGap += (spreadPx - crosshairGap) * Math.min(1, rawDt * 12);
  hud.setCrosshair(weapons.reloading ? crosshairGap + 8 : crosshairGap, weapons.zoomed);

  // ---- render ----
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

update();
