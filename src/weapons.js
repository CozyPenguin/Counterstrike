import * as THREE from 'three';

/**
 * Weapon definitions. Spread/recoil in radians. Damage is per-bullet base damage
 * (CS-like values scaled slightly for fun).
 */
export const WEAPONS = {
  knife: {
    id: 'knife', name: 'Knife', slot: 'knife', kind: 'knife',
    damage: 55, headMult: 1.8, armorPen: 0.85,
    rpm: 120, auto: false, mag: Infinity, reserve: Infinity,
    reload: 0, spread: 0, moveSpread: 0, recoil: { up: 0, side: 0 },
    price: 0, killAward: 1500, speedMult: 1.07, range: 2.3, zoomFov: 0,
  },
  glock: {
    id: 'glock', name: 'Glock-18', slot: 'pistol', kind: 'pistol',
    damage: 26, headMult: 3.4, armorPen: 0.47,
    rpm: 400, auto: false, mag: 20, reserve: 120,
    reload: 2.1, spread: 0.0032, moveSpread: 0.02, recoil: { up: 0.011, side: 0.004 },
    price: 200, killAward: 300, speedMult: 1.0, zoomFov: 0,
  },
  usp: {
    id: 'usp', name: 'USP-S', slot: 'pistol', kind: 'pistol',
    damage: 33, headMult: 3.6, armorPen: 0.505,
    rpm: 352, auto: false, mag: 12, reserve: 24,
    reload: 2.2, spread: 0.0022, moveSpread: 0.018, recoil: { up: 0.012, side: 0.0038 },
    price: 200, killAward: 300, speedMult: 1.0, zoomFov: 0,
  },
  p250: {
    id: 'p250', name: 'P250', slot: 'pistol', kind: 'pistol',
    damage: 38, headMult: 3.5, armorPen: 0.645,
    rpm: 400, auto: false, mag: 13, reserve: 26,
    reload: 2.2, spread: 0.0026, moveSpread: 0.02, recoil: { up: 0.013, side: 0.0045 },
    price: 300, killAward: 300, speedMult: 1.0, zoomFov: 0,
  },
  deagle: {
    id: 'deagle', name: 'Desert Eagle', slot: 'pistol', kind: 'pistol',
    damage: 56, headMult: 3.8, armorPen: 0.66,
    rpm: 267, auto: false, mag: 7, reserve: 35,
    reload: 2.3, spread: 0.0035, moveSpread: 0.028, recoil: { up: 0.022, side: 0.009 },
    price: 700, killAward: 300, speedMult: 0.99, zoomFov: 0,
  },
  mac10: {
    id: 'mac10', name: 'MAC-10', slot: 'primary', kind: 'smg',
    damage: 22, headMult: 3.0, armorPen: 0.575,
    rpm: 800, auto: true, mag: 30, reserve: 100,
    reload: 2.6, spread: 0.006, moveSpread: 0.014, recoil: { up: 0.0075, side: 0.0055 },
    price: 1050, killAward: 600, speedMult: 1.02, zoomFov: 0,
  },
  ak47: {
    id: 'ak47', name: 'AK-47', slot: 'primary', kind: 'rifle',
    damage: 36, headMult: 4.0, armorPen: 0.775,
    rpm: 600, auto: true, mag: 30, reserve: 90,
    reload: 2.4, spread: 0.0021, moveSpread: 0.036, recoil: { up: 0.0125, side: 0.0052 },
    price: 2700, killAward: 300, speedMult: 0.96, zoomFov: 0,
  },
  m4a4: {
    id: 'm4a4', name: 'M4A4', slot: 'primary', kind: 'rifle',
    damage: 30, headMult: 3.8, armorPen: 0.7,
    rpm: 666, auto: true, mag: 30, reserve: 90,
    reload: 3.0, spread: 0.0017, moveSpread: 0.032, recoil: { up: 0.0095, side: 0.0042 },
    price: 3100, killAward: 300, speedMult: 0.96, zoomFov: 0,
  },
  awp: {
    id: 'awp', name: 'AWP', slot: 'primary', kind: 'sniper',
    damage: 115, headMult: 2.2, armorPen: 0.975,
    rpm: 41, auto: false, mag: 10, reserve: 30,
    reload: 3.6, spread: 0.0032, moveSpread: 0.09, recoil: { up: 0.03, side: 0.007 },
    price: 4750, killAward: 100, speedMult: 0.88, zoomFov: 22,
  },
};

export const BUY_LIST = [
  { id: 'glock', cat: 'pistol', key: '1' },
  { id: 'usp', cat: 'pistol', key: '2' },
  { id: 'p250', cat: 'pistol', key: '3' },
  { id: 'deagle', cat: 'pistol', key: '4' },
  { id: 'mac10', cat: 'primary', key: '5' },
  { id: 'ak47', cat: 'primary', key: '6' },
  { id: 'm4a4', cat: 'primary', key: '7' },
  { id: 'awp', cat: 'primary', key: '8' },
  { id: 'armor', cat: 'gear', key: '9', name: 'Kevlar Vest', price: 650, sub: '+50 armor' },
  { id: 'helmet', cat: 'gear', key: '0', name: 'Kevlar + Helmet', price: 1000, sub: '+50 armor, head protection' },
];

// ---------------- View models ----------------

const GUN_DARK = 0x2a2d31;
const GUN_MID = 0x3c4046;
const GUN_WOOD = 0x6e4a26;
const GUN_BLACK = 0x17191c;

function box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.42 })
  );
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return m;
}

export function buildViewModel(kind) {
  const g = new THREE.Group();

  if (kind === 'rifle') {
    // AK-ish: wood furniture + long barrel
    g.add(box(0.075, 0.11, 0.62, GUN_DARK, 0, 0, -0.18));      // receiver
    g.add(box(0.06, 0.075, 0.34, GUN_WOOD, 0, -0.008, -0.02)); // handguard
    g.add(box(0.055, 0.085, 0.3, GUN_WOOD, 0, -0.02, 0.22));   // stock
    g.add(box(0.032, 0.032, 0.34, GUN_BLACK, 0, 0.028, -0.6)); // barrel
    g.add(box(0.045, 0.055, 0.05, GUN_BLACK, 0, 0.055, -0.72));// front sight
    g.add(box(0.045, 0.05, 0.05, GUN_BLACK, 0, 0.06, -0.34));  // rear sight
    g.add(box(0.055, 0.17, 0.11, GUN_DARK, 0, -0.115, -0.1));  // magazine (curved-ish)
    g.add(box(0.05, 0.13, 0.09, GUN_MID, 0, -0.21, -0.13));    // mag lower
    g.add(box(0.06, 0.1, 0.09, GUN_MID, 0, -0.1, 0.05));       // grip
    g.add(box(0.028, 0.045, 0.075, GUN_BLACK, 0, -0.075, 0.16)); // trigger guard
  } else if (kind === 'sniper') {
    g.add(box(0.08, 0.12, 0.95, GUN_DARK, 0, 0, -0.3));        // body
    g.add(box(0.07, 0.1, 0.42, GUN_WOOD, 0, -0.015, 0.28));    // stock
    g.add(box(0.035, 0.035, 0.5, GUN_BLACK, 0, 0.035, -0.92)); // barrel
    g.add(box(0.055, 0.055, 0.26, GUN_BLACK, 0, 0.115, -0.28));// scope tube
    g.add(box(0.075, 0.075, 0.05, GUN_BLACK, 0, 0.115, -0.44));// scope front
    g.add(box(0.075, 0.075, 0.05, GUN_BLACK, 0, 0.115, -0.13));// scope rear
    g.add(box(0.055, 0.16, 0.1, GUN_DARK, 0, -0.12, -0.05));   // magazine
    g.add(box(0.06, 0.1, 0.09, GUN_MID, 0, -0.1, 0.12));       // grip
    g.add(box(0.03, 0.05, 0.08, GUN_BLACK, 0, -0.07, 0.02));   // trigger guard
    g.add(box(0.05, 0.06, 0.05, GUN_BLACK, 0, 0.075, -1.12));  // muzzle brake
  } else if (kind === 'pistol') {
    g.add(box(0.055, 0.075, 0.28, GUN_DARK, 0, 0, -0.1));      // slide
    g.add(box(0.05, 0.055, 0.16, GUN_MID, 0, -0.065, -0.02));  // frame
    g.add(box(0.05, 0.14, 0.075, GUN_MID, 0, -0.135, 0.065));  // grip
    g.add(box(0.028, 0.028, 0.12, GUN_BLACK, 0, 0.012, -0.28));// barrel tip
    g.add(box(0.028, 0.035, 0.03, GUN_BLACK, 0, 0.055, -0.22));// front sight
    g.add(box(0.028, 0.03, 0.03, GUN_BLACK, 0, 0.052, -0.01)); // rear sight
  } else if (kind === 'smg') {
    g.add(box(0.07, 0.1, 0.42, GUN_DARK, 0, 0, -0.12));
    g.add(box(0.05, 0.055, 0.2, GUN_MID, 0, 0.02, -0.42));
    g.add(box(0.03, 0.03, 0.16, GUN_BLACK, 0, 0.02, -0.56));
    g.add(box(0.05, 0.16, 0.09, GUN_DARK, 0, -0.12, -0.14));
    g.add(box(0.05, 0.1, 0.08, GUN_MID, 0, -0.1, 0.06));
    g.add(box(0.04, 0.06, 0.16, GUN_BLACK, 0, 0.06, 0.16));
    g.add(box(0.03, 0.035, 0.03, GUN_BLACK, 0, 0.065, -0.32));
  } else {
    // knife
    const blade = box(0.02, 0.075, 0.34, 0xb8c0c8, 0, 0, -0.22);
    blade.material.roughness = 0.25;
    blade.material.metalness = 0.9;
    g.add(blade);
    g.add(box(0.03, 0.09, 0.12, GUN_BLACK, 0, -0.01, -0.02));  // guard
    g.add(box(0.035, 0.05, 0.16, GUN_MID, 0, -0.01, 0.11));    // handle
    g.add(box(0.04, 0.055, 0.03, GUN_WOOD, 0, -0.01, 0.2));    // pommel
    g.rotation.y = 0.5;
    g.rotation.z = -0.35;
    return g;
  }

  // subtle cant for non-knife
  g.rotation.y = 0.045;
  return g;
}

// ---------------- Weapon system ----------------

export class WeaponSystem {
  constructor(camera, sound, world) {
    this.camera = camera;
    this.sound = sound;
    this.world = world;

    this.slots = {
      primary: null,
      pistol: null,
      knife: null,
    };
    this.slots.knife = { def: WEAPONS.knife, mag: Infinity, reserve: Infinity };

    this.current = this.slots.knife;
    this.lastWeapon = null;

    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.kick = 0;           // viewmodel punchback
    this.recoverPitch = 0;
    this.recoverYaw = 0;
    this.shotIndex = 0;      // for recoil pattern
    this.timeSinceShot = 99;
    this.spread = 0;
    this.zoomed = false;

    this.viewModel = buildViewModel('knife');
    this.viewModel.position.set(0.26, -0.27, -0.5);
    this.camera.add(this.viewModel);

    // muzzle flash sprite (hidden entirely on low quality)
    this.flashEnabled = true;
    const flashMat = new THREE.SpriteMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: 0,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.flash = new THREE.Sprite(flashMat);
    this.flash.scale.set(0.32, 0.32, 1);
    this.flash.position.set(0, 0.03, -0.85);
    if (this.flashEnabled) this.viewModel.add(this.flash);
    this.flashTimer = 0;
  }

  /** Toggle the muzzle flash on/off (called by main.js when quality changes). */
  setFlashEnabled(on) {
    this.flashEnabled = on;
    if (!on && this.flash.parent) {
      this.flash.parent.remove(this.flash);
      this.flash.material.opacity = 0;
    } else if (on && this.flash.parent !== this.viewModel) {
      this.viewModel.add(this.flash);
    }
  }

  giveWeapon(id) {
    const def = WEAPONS[id];
    if (!def) return false;
    const entry = { def, mag: def.mag, reserve: def.reserve };
    if (def.slot === 'knife') return false;
    if (this.slots[def.slot]) {
      // refilling reserve for same weapon is fine
      if (this.slots[def.slot].def.id === id) {
        this.slots[def.slot].mag = def.mag;
        this.slots[def.slot].reserve = def.reserve;
        this.selectSlot(def.slot);
        return true;
      }
    }
    this.slots[def.slot] = entry;
    this.selectSlot(def.slot);
    return true;
  }

  selectSlot(slot) {
    const entry = this.slots[slot];
    if (!entry) return false;
    if (entry === this.current) return true;
    this.lastWeapon = this.current;
    this.current = entry;
    this.reloading = false;
    this.reloadTimer = 0;
    this.zoomed = false;
    this._rebuildViewModel();
    this.swapAnim = 1;
    return true;
  }

  swapToLast() {
    if (this.lastWeapon) {
      const slot = this.lastWeapon.def.slot;
      this.selectSlot(slot);
    }
  }

  _rebuildViewModel() {
    this.camera.remove(this.viewModel);
    const kind = this.current.def.kind;
    this.viewModel = buildViewModel(kind);
    const base = kind === 'sniper'
      ? new THREE.Vector3(0.22, -0.245, -0.42)
      : kind === 'pistol'
        ? new THREE.Vector3(0.21, -0.235, -0.42)
        : kind === 'knife'
          ? new THREE.Vector3(0.27, -0.27, -0.42)
          : new THREE.Vector3(0.25, -0.265, -0.46);
    this.viewModel.position.copy(base);
    this.camera.add(this.viewModel);

    const flashMat = new THREE.SpriteMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: 0,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.flash = new THREE.Sprite(flashMat);
    this.flash.scale.set(0.32, 0.32, 1);
    const mz = kind === 'sniper' ? -1.15 : kind === 'pistol' ? -0.34 : kind === 'smg' ? -0.62 : -0.82;
    this.flash.position.set(0, 0.03, mz);
    if (this.flashEnabled) this.viewModel.add(this.flash);
  }

  /** Speed multiplier from the equipped weapon. */
  get speedMult() {
    return this.current.def.speedMult;
  }

  get isReloading() {
    return this.reloading;
  }

  startReload() {
    const d = this.current.def;
    if (this.reloading || d.mag === Infinity) return false;
    if (this.current.mag >= d.mag || this.current.reserve <= 0) return false;
    this.reloading = true;
    this.reloadTimer = d.reload;
    this.zoomed = false;
    // Per-class reload: pistol/smg/rifle/sniper each get a distinct sound
    // (mag release, drop, insert, bolt/slide rack). Knife is excluded.
    this.sound.reload(d.kind, d.reload);
    return true;
  }

  toggleZoom() {
    const d = this.current.def;
    if (!d.zoomFov) return false;
    this.zoomed = !this.zoomed;
    this.sound.scope();
    return true;
  }

  /** Try to fire. Returns { origin, dir, damage, headMult, armorPen, isKnife, soundKind } or null. */
  fire(player, moving, airborne, crouching) {
    const d = this.current.def;
    if (this.reloading || this.cooldown > 0) return null;

    if (d.mag !== Infinity && this.current.mag <= 0) {
      // Per-class dry-fire click (pistol slide lock, rifle/smg/sniper bolt).
      this.sound.dryFire(d.kind);
      this.cooldown = 0.35;
      return null;
    }

    // ---- spread ----
    const speedFrac = Math.min(1, player.speed2D / d.speedMult / 6.1);
    let spread = d.spread + d.moveSpread * speedFrac * (0.35 + 0.65 * speedFrac);
    if (airborne) spread += 0.055;
    if (crouching) spread *= 0.72;
    if (this.zoomed) spread *= 0.12;
    this.spread = spread;

    // ---- ammo ----
    if (d.mag !== Infinity) this.current.mag -= 1;

    // ---- recoil kick to camera ----
    const t = Math.min(this.shotIndex, 9);
    const upKick = d.recoil.up * (1 + t * 0.09);
    const sideKick = d.recoil.side * (Math.sin(this.shotIndex * 2.4) * 0.9 + (Math.random() - 0.5) * 0.8);
    player.pitch += upKick * (this.zoomed ? 1.6 : 1);
    player.yaw += sideKick * (this.zoomed ? 1.2 : 1);
    this.recoverPitch += upKick * (this.zoomed ? 1.6 : 1);
    this.recoverYaw += sideKick * (this.zoomed ? 1.2 : 1);
    this.shotIndex = (this.shotIndex + 1) % 40;
    this.kick = 1;
    this.flashTimer = 0.05;

    this.cooldown = 60 / d.rpm;
    this.timeSinceShot = 0;

    this.sound.shot(d.kind);

    // ---- direction with spread ----
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    if (spread > 0) {
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(dir, up).normalize();
      const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.cos(theta) * r);
      dir.addScaledVector(upv, Math.sin(theta) * r);
      dir.normalize();
    }

    return {
      origin,
      dir,
      damage: d.damage,
      headMult: d.headMult,
      armorPen: d.armorPen,
      isKnife: d.kind === 'knife',
      range: d.range || 150,
      soundKind: d.kind,
    };
  }

  /** Recover some recoil pitch/yaw. Returns [dPitch, dYaw] to subtract from player look. */
  recover(dt) {
    const rate = 1 - Math.exp(-7.5 * dt);
    const dp = this.recoverPitch * rate;
    const dy = this.recoverYaw * rate;
    this.recoverPitch -= dp;
    this.recoverYaw -= dy;
    return [dp, dy];
  }

  update(dt, player, moving) {
    if (this.cooldown > 0) this.cooldown -= dt;
    this.timeSinceShot += dt;

    // spread relaxes back toward base when not firing
    const baseSpread = this.current.def.spread;
    if (this.timeSinceShot > 0.12) {
      this.spread += (baseSpread - this.spread) * Math.min(1, dt * 6);
    }

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const d = this.current.def;
        const need = d.mag - this.current.mag;
        const take = Math.min(need, this.current.reserve);
        this.current.mag += take;
        if (d.mag !== Infinity) this.current.reserve -= take;
        this.reloading = false;
      }
    }

    // view model animation
    this.kick = Math.max(0, this.kick - dt * 9);
    if (this.swapAnim) this.swapAnim = Math.max(0, this.swapAnim - dt * 3.2);
    const bob = player ? player.bobAmount : 0;
    const phase = player ? player.bobPhase : 0;

    const kind = this.current.def.kind;
    const base = this.viewModel.userData.basePos
      || (this.viewModel.userData.basePos = this.viewModel.position.clone());

    let px = base.x + Math.cos(phase) * 0.012 * bob;
    let py = base.y + Math.sin(phase * 2) * 0.01 * bob;
    let pz = base.z + this.kick * 0.075;
    let rx = -this.kick * 0.22;
    let ry = 0.045;
    let rz = -this.kick * 0.06;

    if (this.reloading) {
      const d = this.current.def;
      // 0 -> 1 over the reload duration. We split it into three phases that
      // mirror the audio (mag drop ~0.0-0.2, mag insert ~0.55-0.7,
      // bolt/slide rack ~0.85-0.95) and use a piecewise blend.
      const p = 1 - Math.max(0, this.reloadTimer / d.reload);

      // Phase 1 (0.0 - 0.2): weapon tilts down, mag drops away
      const phase1 = p < 0.2 ? (1 - p / 0.2) : 0;
      // Phase 2 (0.55 - 0.75): mag slides in (slight forward push)
      const phase2 = p > 0.55 && p < 0.75 ? Math.sin(((p - 0.55) / 0.2) * Math.PI) : 0;
      // Phase 3 (0.85 - 0.96): bolt / slide rack (sharp back-then-forward)
      const phase3 = p > 0.85 && p < 0.96
        ? Math.sin(((p - 0.85) / 0.11) * Math.PI)
        : 0;

      // Per-kind tuning: snipers move further, pistols lighter
      const isPistol = d.kind === 'pistol';
      const isSniper = d.kind === 'sniper';
      const dropDepth = isPistol ? 0.18 : isSniper ? 0.34 : 0.26;
      const tiltDrop = isPistol ? 0.55 : isSniper ? 1.1 : 0.85;
      const rollDrop = isPistol ? 0.4 : isSniper ? 0.6 : 0.55;
      const insertDepth = isPistol ? 0.06 : isSniper ? 0.14 : 0.1;
      const rackBack = isPistol ? 0.14 : isSniper ? 0.22 : 0.18;

      py -= phase1 * dropDepth;
      pz += phase1 * 0.06;
      rx += phase1 * tiltDrop;
      rz += phase1 * rollDrop;

      py -= phase2 * insertDepth;
      pz -= phase2 * 0.04;
      rx -= phase2 * 0.18;

      // Rack: pull back then forward (sin starts positive = back)
      pz += phase3 * rackBack;
      rx -= phase3 * 0.4;
    }

    if (this.swapAnim) {
      const s = this.swapAnim;
      py -= s * 0.35;
      rx += s * 1.1;
    }

    if (this.zoomed) {
      px += (0 - px) * 0.85;
      py += (0.02 - py) * 0.85;
      pz += (-0.18 - pz) * 0.85;
      ry = 0;
    }

    this.viewModel.position.set(px, py, pz);
    this.viewModel.rotation.set(rx, ry + (kind === 'knife' ? 0.5 : 0), rz + (kind === 'knife' ? -0.35 : 0));

    // muzzle flash
    if (!this.flashEnabled) {
      // ensure opacity stays 0 if flash was disabled mid-shot
    } else if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.flash.material.opacity = this.flashTimer > 0 ? 0.85 : 0;
      this.flash.material.rotation = Math.random() * Math.PI;
      this.flash.scale.setScalar(0.26 + Math.random() * 0.18);
    } else {
      this.flash.material.opacity = 0;
    }
  }
}
