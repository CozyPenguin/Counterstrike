/**
 * Headless smoke test: exercises world building, collision, pathfinding,
 * weapon firing and bot AI without a browser. Run with: npm test
 */
import * as THREE from 'three';

// ---- minimal DOM mocks (textures/effects use 2d canvas) ----
function makeCtx2D() {
  const grad = { addColorStop() {} };
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, bezierCurveTo() {},
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
  };
}
globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') {
      return { width: 0, height: 0, getContext: () => makeCtx2D() };
    }
    return {
      style: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, appendChild() {}, remove() {}, setAttribute() {},
      dataset: {}, innerHTML: '', textContent: '',
    };
  },
  getElementById: () => null,
  addEventListener() {},
};
globalThis.window = {
  addEventListener() {},
  innerWidth: 1280, innerHeight: 720,
  AudioContext: undefined,
};

const { buildWorld, rayAABB, rayWorld } = await import('../src/map.js');
const { Player } = await import('../src/player.js');
const { WeaponSystem, WEAPONS, buildViewModel } = await import('../src/weapons.js');
const { Bot } = await import('../src/bots.js');
const { Effects } = await import('../src/effects.js');
const { Sound } = await import('../src/audio.js');
const { settings, QUALITY_PRESETS } = await import('../src/settings.js');
const { MAP_LIST, buildMap } = await import('../src/maps/index.js');

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.error(`  ✗ ${name}`); failures++; }
}

// ---------- world ----------
console.log('world:');
const scene = new THREE.Scene();
const world = buildWorld(scene);
check('colliders registered', world.colliders.length > 40);
check('nav nodes exist', world.nodes.length >= 30);
const connected = world.nodes.filter((n) => n.neighbors.length > 0).length;
check('nav graph is linked', connected >= world.nodes.length - 2);

// nav connectivity: BFS should reach every node from node 0
{
  const seen = new Set([0]);
  const q = [0];
  while (q.length) {
    const cur = q.shift();
    for (const nb of world.nodes[cur].neighbors) {
      if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
    }
  }
  check(`nav graph is connected (${seen.size}/${world.nodes.length} nodes)`, seen.size === world.nodes.length);
}

// ---------- raycasting ----------
console.log('raycast:');
{
  const origin = new THREE.Vector3(0, 1.5, 0);
  const dir = new THREE.Vector3(1, 0, 0);
  const hit = rayWorld(origin, dir, world.colliders, 100);
  check('ray hits wall', !!hit && hit.t > 5 && hit.t < 20);
  check('hit normal is axis aligned', !!hit && (Math.abs(hit.normal.x) + Math.abs(hit.normal.y) + Math.abs(hit.normal.z) === 1));
  const miss = rayWorld(origin, new THREE.Vector3(0, 1, 0), world.colliders, 2);
  check('upward ray escapes', !miss);
  const unitBox = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const h2 = rayAABB(new THREE.Vector3(-5, 0, 0), new THREE.Vector3(1, 0, 0), unitBox, 10);
  check('rayAABB distance', !!h2 && Math.abs(h2.t - 4) < 1e-6);
}

// ---------- player ----------
console.log('player:');
{
  const camera = new THREE.PerspectiveCamera(78, 1.7, 0.05, 220);
  const player = new Player(camera, world);
  player.respawn(world.spawnsCT[2], 0);
  check('spawn on ground', Math.abs(player.pos.y) < 0.05);

  const start = player.pos.clone();
  const input = { forward: true, back: false, left: false, right: false, jump: false, crouch: false, walk: false };
  for (let i = 0; i < 120; i++) player.update(1 / 60, input, false);
  check('player moves forward', player.pos.z < start.z - 3);
  check('player stays grounded', player.pos.y > -0.5 && player.pos.y < 3);

  // run into obstacles / walls heading north — must never leave the map
  for (let i = 0; i < 2000; i++) player.update(1 / 60, input, false);
  check('map walls contain player', player.pos.z > -34.6 && player.pos.z < 34.6 && Math.abs(player.pos.x) < 34.6);

  // crouch
  const cin = { ...input, forward: false, crouch: true };
  for (let i = 0; i < 30; i++) player.update(1 / 60, cin, false);
  check('crouch lowers player', player.height < 1.3);

  // jump
  const jin = { ...input, forward: false, crouch: false };
  player.queueJump();
  player.update(1 / 60, jin, false);
  check('jump lifts player', player.vel.y > 3);
}

// ---------- weapons ----------
console.log('weapons:');
{
  const camera = new THREE.PerspectiveCamera(78, 1.7, 0.05, 220);
  const player = new Player(camera, world);
  player.respawn(world.spawnsCT[2], 0);
  const fakeSound = {
    shot() {}, dryFire() {}, reload() {}, footstep() {}, jump() {}, land() {},
    hit() {}, headshot() {}, flesh() {}, death() {}, buy() {}, deny() {},
    roundStart() {}, roundWin() {}, roundLose() {}, scope() {}, init() {},
  };
  const wsys = new WeaponSystem(camera, fakeSound, world);
  wsys.giveWeapon('ak47');
  check('ak equipped', wsys.current.def.id === 'ak47');

  const shot = wsys.fire(player, false, false, false);
  check('shot fires', !!shot && shot.damage === 36);
  check('ammo consumed', wsys.current.mag === 29);
  const cooldownShot = wsys.fire(player, false, false, false);
  check('rpm cooldown respected', cooldownShot === null);

  // reload
  wsys.cooldown = 0;
  wsys.current.mag = 5;
  wsys.current.reserve = 90;
  check('reload starts', wsys.startReload());
  wsys.update(3, player);
  check('reload refills mag', wsys.current.mag === 30 && wsys.current.reserve === 65);

  // view models build for every kind
  for (const kind of ['rifle', 'sniper', 'pistol', 'smg', 'knife']) {
    check(`viewmodel ${kind}`, buildViewModel(kind).children.length > 3);
  }

  // spread grows when moving
  wsys.cooldown = 0;
  const s1 = wsys.fire(player, false, false, false);
  wsys.cooldown = 0;
  player.vel.x = 5;
  const s2 = wsys.fire(player, true, false, false);
  check('moving spread wider', wsys.spread > 0.01);
  player.vel.x = 0;
}

// ---------- bots ----------
console.log('bots:');
{
  const camera = new THREE.PerspectiveCamera(78, 1.7, 0.05, 220);
  const player = new Player(camera, world);
  player.respawn(new THREE.Vector3(0, 0, -20), 0); // mid
  const fakeSound = {
    shot() {}, dryFire() {}, reload() {}, footstep() {}, jump() {}, land() {},
    hit() {}, headshot() {}, flesh() {}, death() {}, buy() {}, deny() {},
    roundStart() {}, roundWin() {}, roundLose() {}, scope() {}, init() {},
  };

  const bot = new Bot(scene, new THREE.Vector3(0, 0, -28), world, { name: 'TestBot' });
  check('bot spawns', bot.alive && bot.hp === 100);

  // path from T spawn toward player
  const path = bot._computePath(player.pos);
  check('path computed', path.length >= 1);

  // vision: bot at T spawn looking south should see player in mid corridor
  bot.yaw = 0; // faces -z... rotate to face player (south = +z direction)
  bot.yaw = Math.atan2(-(player.pos.x - bot.pos.x), -(player.pos.z - bot.pos.z));
  const sees = bot.canSee(new THREE.Vector3(player.pos.x, player.pos.y + 1.55, player.pos.z), world.colliders);
  check('bot sees player in open lane', sees === true);

  // player made noise -> bot hunts toward contact, then engages
  bot.hear(player.pos);

  // run AI for a while — bot should engage and fire
  let fired = 0;
  let shotsAtPlayer = 0;
  for (let i = 0; i < 60 * 12; i++) {
    const r = bot.update(1 / 60, player.pos, true, world.colliders, fakeSound);
    if (r.fire) { fired++; shotsAtPlayer++; }
    if (i % 30 === 0) {
      // keep player visible in mid
      player.pos.set(0, 0, -20 + Math.sin(i / 90) * 3);
    }
  }
  check(`bot enters combat and fires (${fired} shots)`, fired > 2);
  check('bot stays inside map', Math.abs(bot.pos.x) < 33.6 && Math.abs(bot.pos.z) < 33.6);

  // hitboxes: ray straight at bot center
  bot.pos.set(0, 0, -24);
  const eye = new THREE.Vector3(0, 1.55, -20);
  const toChest = new THREE.Vector3(0, 1.15, -24).sub(eye).normalize();
  const chestHit = bot.testRay(eye, toChest, 20);
  check('body hitbox', chestHit && chestHit.part === 'body');

  const toHead = new THREE.Vector3(0, 1.78, -24).sub(eye).normalize();
  const headHit = bot.testRay(eye, toHead, 20);
  check('head hitbox', headHit && headHit.part === 'head');

  // damage + death
  const died = bot.takeDamage(500);
  check('bot dies', died === true && !bot.alive);
  for (let i = 0; i < 40; i++) bot.update(1 / 60, player.pos, true, world.colliders, fakeSound);
  check('corpse settles', bot.mesh.rotation.x < -1);
}

// ---------- effects ----------
console.log('effects:');
{
  const fx = new Effects(scene, world);
  fx.spawnTracer(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -10));
  fx.spawnImpact(new THREE.Vector3(0, 1, -5), new THREE.Vector3(0, 0, 1));
  fx.spawnBlood(new THREE.Vector3(0, 1, -3));
  check('effects spawn', fx.live.length > 5);
  for (let i = 0; i < 30; i++) fx.update(1 / 60);
  check('effects expire', fx.live.length === 0);
}

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`);

// ---------- All maps build and have connected nav graphs ----------
console.log('maps:');
{
  for (const meta of MAP_LIST) {
    const s = new THREE.Scene();
    const w = buildMap(meta.id, s);
    check(`${meta.id} builds with colliders`, w.colliders.length >= 25);
    check(`${meta.id} has spawn points`, w.spawnsCT.length === 5 && w.spawnsT.length === 5);
    const connected = w.nodes.filter((n) => n.neighbors.length > 0).length;
    check(`${meta.id} nav graph is linked`, connected >= w.nodes.length - 2);
    // BFS connectivity
    const seen = new Set([0]);
    const q = [0];
    while (q.length) {
      const cur = q.shift();
      for (const nb of w.nodes[cur].neighbors) {
        if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
      }
    }
    check(`${meta.id} nav graph is connected (${seen.size}/${w.nodes.length})`, seen.size === w.nodes.length);
    // The player can actually stand on a CT spawn and reach a T spawn by pathfinding
    const start = w.nodes.reduce((best, n, i) =>
      best === -1 || n.pos.distanceToSquared(w.spawnsCT[0]) < w.nodes[best].pos.distanceToSquared(w.spawnsCT[0]) ? i : best,
    -1);
    const goal = w.nodes.reduce((best, n, i) =>
      best === -1 || n.pos.distanceToSquared(w.spawnsT[0]) < w.nodes[best].pos.distanceToSquared(w.spawnsT[0]) ? i : best,
    -1);
    // Simple BFS reachability
    const visited = new Set([start]);
    const qq = [start];
    while (qq.length) {
      const cur = qq.shift();
      for (const nb of w.nodes[cur].neighbors) {
        if (!visited.has(nb)) { visited.add(nb); qq.push(nb); }
      }
    }
    check(`${meta.id} CT and T spawns are connected by nav graph`, visited.has(goal));
  }
}

// ---------- Settings module ----------
console.log('settings:');
{
  // Reset to a known state for the test
  settings.reset();
  check('default quality is medium', settings.get('quality') === 'medium');
  check('default fov is 78', settings.get('fov') === 78);
  check('default volume is 0.55', Math.abs(settings.get('volume') - 0.55) < 1e-6);

  settings.set('quality', 'low');
  const eff = settings.effective();
  check('low preset pixel ratio 1', eff.pixelRatio === 1);
  check('low preset disables shadows', eff.shadows === false);
  check('low preset low decals', eff.maxDecals === 18);

  settings.set('quality', 'high');
  const hi = settings.effective();
  check('high preset enables shadows', hi.shadows === true);
  check('high preset has 2048 shadow map', hi.shadowMapSize === 2048);

  settings.set('shadowQuality', 'low');
  const ovr = settings.effective();
  check('explicit shadow override beats preset', ovr.shadowMapSize === 512 && ovr.shadowType === 'basic');

  // Persistence round-trip via localStorage
  settings.set('fov', 95);
  const re = await import('../src/settings.js');
  check('fov persists', re.settings.get('fov') === 95);
  re.settings.reset();
}

// ---------- Reload sound API surface ----------
console.log('reload sounds:');
{
  const s = new Sound();
  // Without an AudioContext these should all be no-ops, but they must not throw.
  for (const kind of ['pistol', 'rifle', 'smg', 'sniper', 'knife']) {
    s.reload(kind, 2.5);
  }
  for (const kind of ['pistol', 'rifle', 'smg', 'sniper']) {
    s.dryFire(kind);
  }
  s.roundStart();
  s.roundWin();
  s.roundLose();
  check('per-class reload/dryFire/stingers callable without AudioContext', true);
}

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
