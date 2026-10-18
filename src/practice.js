/**
 * Practice range: a static target room where the player can warm up
 * spray control against dead targets, with a running accuracy readout
 * and a per-weapon pull-down hint. No bots, no economy, no round timer.
 *
 * Spawns the player in a corridor with three target walls at 15m, 25m
 * and 35m, each wall made of square targets with head + body zones.
 * Targets are visual-only: raycasts check the same AABBs the player
 * would hit to register hits.
 */
import * as THREE from 'three';
import { overlaps, rayAABB } from './map.js';
import { WEAPONS } from './weapons.js';
import { verticalCompensationPerSecond } from './recoil.js';

const ROOM_HALF = 18;
const TARGET_W = 1.6;
const TARGET_H = 2.4;
const HEAD_FRAC = 0.32;

// Each "wall" is a row of N targets. Layout: (z, count)
const WALLS = [
  { z: -15, count: 5 },
  { z: -25, count: 7 },
  { z: -35, count: 9 },
];

function makeTargetMaterial() {
  // Painted plywood look — warm tan with a darker bullseye.
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d6b48a';
  ctx.fillRect(0, 0, 256, 256);
  // wood grain streaks
  for (let i = 0; i < 80; i++) {
    ctx.strokeStyle = `rgba(${100 + Math.random() * 60},${70 + Math.random() * 40},${40 + Math.random() * 30},${0.15 + Math.random() * 0.2})`;
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    const y = Math.random() * 256;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(85, y + (Math.random() * 6 - 3), 170, y + (Math.random() * 6 - 3), 256, y + (Math.random() * 4 - 2));
    ctx.stroke();
  }
  // concentric bullseye
  const cx = 128, cy = 200;
  const rings = [
    [70, '#222'],
    [54, '#f1f1f1'],
    [38, '#222'],
    [22, '#ff5252'],
    [10, '#ffd23f'],
  ];
  for (const [r, color] of rings) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // "HEAD" label band on top half
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 24, 256, 60);
  ctx.fillStyle = '#ff5252';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HEAD', 128, 64);
  ctx.fillStyle = '#ddd';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('BODY', 128, 200 + 80);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFloorMaterial() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(0, 0, 128, 128);
  // scuffed concrete
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${100 + Math.random() * 50},${100 + Math.random() * 50},${100 + Math.random() * 50},${0.05 + Math.random() * 0.1})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.05 });
}

function makeWallMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.95, metalness: 0.05 });
}

export class PracticeRange {
  constructor(scene, camera, weapons, sound, player) {
    this.scene = scene;
    this.camera = camera;
    this.weapons = weapons;
    this.sound = sound;
    this.player = player;
    this.colliders = [];
    this.targets = [];   // visual meshes
    this.hitboxes = [];  // AABB hitboxes for raycast
    this.spawnPos = new THREE.Vector3(0, 0, 12);
    this.active = false;
    this.hits = 0;
    this.shots = 0;
    this.hud = null;
    this._weaponsAtStart = null;
  }

  build() {
    this._weaponsAtStart = {
      primary: this.weapons.slots.primary ? { ...this.weapons.slots.primary } : null,
      pistol: this.weapons.slots.pistol ? { ...this.weapons.slots.pistol } : null,
    };
    // Track every mesh we add so we can show/hide them as a group when
    // entering / leaving the practice range (cheaper than rebuilding).
    this._meshes = [];
    this._lights = [];
    // Floor
    const floorGeo = new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2);
    const floor = new THREE.Mesh(floorGeo, makeFloorMaterial());
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this._meshes.push(floor);
    // Side walls
    const wallMat = makeWallMaterial();
    const wallH = 6;
    const left = new THREE.Mesh(new THREE.BoxGeometry(1, wallH, ROOM_HALF * 2), wallMat);
    left.position.set(-ROOM_HALF, wallH / 2, -ROOM_HALF + 12);
    left.receiveShadow = true;
    this.scene.add(left); this._meshes.push(left);
    const right = left.clone(); right.position.x = ROOM_HALF; this.scene.add(right); this._meshes.push(right);
    const back = new THREE.Mesh(new THREE.BoxGeometry(ROOM_HALF * 2, wallH, 1), wallMat);
    back.position.set(0, wallH / 2, 12); back.receiveShadow = true; this.scene.add(back); this._meshes.push(back);
    const front = new THREE.Mesh(new THREE.BoxGeometry(ROOM_HALF * 2, wallH, 1), wallMat);
    front.position.set(0, wallH / 2, -ROOM_HALF * 2 + 12); front.receiveShadow = true; this.scene.add(front); this._meshes.push(front);
    // Practice range is darker / moodier than the main maps
    const oldBg = this.scene.background?.clone();
    const oldFog = this.scene.fog ? { ...this.scene.fog } : null;
    this._savedSceneState = { bg: oldBg, fog: oldFog };
    this.scene.background = new THREE.Color(0x2c2e36);
    this.scene.fog = new THREE.Fog(0x2c2e36, 30, 80);
    this.colliders = [
      new THREE.Box3(
        new THREE.Vector3(-ROOM_HALF, -1, -ROOM_HALF * 2 + 12),
        new THREE.Vector3(ROOM_HALF, wallH, 12),
      ),
    ];
    // Targets
    const targetMat = new THREE.MeshStandardMaterial({ map: makeTargetMaterial(), roughness: 0.9, metalness: 0.04 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.3 });
    for (const wall of WALLS) {
      const totalW = wall.count * (TARGET_W + 0.4);
      for (let i = 0; i < wall.count; i++) {
        const x = -totalW / 2 + i * (TARGET_W + 0.4) + TARGET_W / 2;
        const body = new THREE.Mesh(new THREE.PlaneGeometry(TARGET_W, TARGET_H), targetMat);
        body.position.set(x, TARGET_H / 2 + 0.1, wall.z);
        this.scene.add(body); this._meshes.push(body); this.targets.push(body);
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(TARGET_W + 0.1, TARGET_H + 0.1, 0.05),
          frameMat
        );
        frame.position.set(x, TARGET_H / 2 + 0.1, wall.z - 0.05);
        this.scene.add(frame); this._meshes.push(frame);
        this.hitboxes.push({
          part: 'body',
          box: new THREE.Box3(
            new THREE.Vector3(x - TARGET_W / 2, 0.1, wall.z - 0.04),
            new THREE.Vector3(x + TARGET_W / 2, TARGET_H * (1 - HEAD_FRAC) + 0.1, wall.z + 0.04),
          ),
          wall,
        });
        this.hitboxes.push({
          part: 'head',
          box: new THREE.Box3(
            new THREE.Vector3(x - TARGET_W / 2, TARGET_H * (1 - HEAD_FRAC) + 0.1, wall.z - 0.04),
            new THREE.Vector3(x + TARGET_W / 2, TARGET_H + 0.1, wall.z + 0.04),
          ),
          wall,
        });
      }
    }
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(-ROOM_HALF, 0, -ROOM_HALF * 2 + 11.5),
      new THREE.Vector3(ROOM_HALF, wallH, -ROOM_HALF * 2 + 12.5),
    ));
    // Start hidden; practice.start() reveals them
    this._setVisible(false);
  }

  _setVisible(v) {
    for (const m of this._meshes) m.visible = v;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.hits = 0;
    this.shots = 0;
    this._weaponsAtStart = {
      primary: this.weapons.slots.primary ? {
        def: this.weapons.slots.primary.def,
        mag: this.weapons.slots.primary.mag,
        reserve: this.weapons.slots.primary.reserve,
      } : null,
      pistol: this.weapons.slots.pistol ? {
        def: this.weapons.slots.pistol.def,
        mag: this.weapons.slots.pistol.mag,
        reserve: this.weapons.slots.pistol.reserve,
      } : null,
    };
    this.player.respawn(this.spawnPos, 0);
    this.weapons.slots.knife = { def: WEAPONS.knife, mag: Infinity, reserve: Infinity };
    this.weapons.selectSlot('primary');
    this.weapons.reloading = false;
    this.weapons.shotIndex = 0;
    this._setVisible(true);
    if (this.hud) this.hud.showPractice(true);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    // Restore weapons
    this.weapons.slots.primary = this._weaponsAtStart.primary;
    this.weapons.slots.pistol = this._weaponsAtStart.pistol;
    this.weapons.selectSlot(this.weapons.slots.primary ? 'primary' : (this.weapons.slots.pistol ? 'pistol' : 'knife'));
    this._setVisible(false);
    // Restore saved scene state
    if (this._savedSceneState?.bg) this.scene.background = this._savedSceneState.bg;
    if (this._savedSceneState?.fog) this.scene.fog = new THREE.Fog(
      this._savedSceneState.fog.color,
      this._savedSceneState.fog.near,
      this._savedSceneState.fog.far,
    );
    if (this.hud) this.hud.showPractice(false);
  }

  /**
   * Test a ray from the player camera against practice targets. Called
   * from main.js when a shot fires. Returns { part, target, point } or null.
   * Also bumps the shot counter; main.js calls reportHit() if the same shot
   * also hit a wall or a target.
   */
  testRay(origin, dir, maxDist) {
    if (!this.active) return null;
    this.shots += 1;
    let bestT = Infinity;
    let best = null;
    for (const h of this.hitboxes) {
      const hit = rayAABB(origin, dir, h.box, maxDist);
      if (hit && hit.t < bestT) {
        bestT = hit.t;
        best = { ...h, t: hit.t, point: hit.point };
      }
    }
    return best;
  }

  /** Called by main.js when a player shot also passed through a target. */
  registerHit(part) {
    if (!this.active) return;
    this.hits += 1;
    if (this.hud) this.hud.setPracticeStats(this.hits, this.shots, part);
  }

  setHUD(hud) {
    this.hud = hud;
  }
}
