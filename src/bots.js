import * as THREE from 'three';
import { rayAABB, overlaps } from './map.js';

const BOT_RADIUS = 0.42;
const BOT_HEIGHT = 1.8;
const GRAVITY = 22;

const SKIN = 0xc79b76;
const SHIRT = 0x7a6a4a;
const PANTS = 0x4c4436;
const VEST = 0x5c4d33;

function botMaterial(color, rough = 0.8) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.08 });
}

function buildBotMesh() {
  const g = new THREE.Group();

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.24), botMaterial(PANTS));
  legL.position.set(-0.16, 0.45, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.32), botMaterial(SHIRT));
  torso.position.y = 1.26;

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.36), botMaterial(VEST));
  vest.position.y = 1.32;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), botMaterial(SKIN, 0.65));
  head.position.y = 1.78;

  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.36), botMaterial(0x3a352a, 0.5));
  helmet.position.y = 1.94;

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), botMaterial(SHIRT));
  armL.position.set(-0.42, 1.28, -0.12);
  armL.rotation.x = -0.9;
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), botMaterial(SHIRT));
  armR.position.set(0.38, 1.28, -0.12);
  armR.rotation.x = -0.9;

  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.72), botMaterial(0x22252a, 0.45));
  gun.position.set(0.12, 1.32, -0.5);

  g.add(legL, legR, torso, vest, head, helmet, armL, armR, gun);
  g.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  g.userData.parts = { legL, legR, head, gun };
  return g;
}

export class Bot {
  constructor(scene, spawnPos, world, opts = {}) {
    this.world = world;
    this.scene = scene;
    this.mesh = buildBotMesh();
    this.mesh.position.copy(spawnPos);
    scene.add(this.mesh);

    this.pos = spawnPos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw ?? 0;
    this.hp = 100;
    this.armor = opts.armor ?? 50;
    this.alive = true;
    this.name = opts.name || 'Bot';
    this.kills = 0;
    this.deaths = 0;

    this.speed = 4.35;
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;

    this.state = 'patrol';
    this.alertLevel = 0;       // 0..1, decays
    this.lastKnown = null;     // THREE.Vector3
    this.seeTimer = 0;         // continuous vision time
    this.reaction = 0.28 + Math.random() * 0.34;
    this.shootCooldown = 0.4 + Math.random() * 0.4;
    this.burstLeft = 0;
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 0.6 + Math.random();
    this.onGround = true;
    this.walkPhase = Math.random() * 10;
    this.deathTimer = 0;
    this.hitFlash = 0;

    this.preferredRange = 9 + Math.random() * 8;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.traverse((m) => {
      if (m.isMesh) {
        m.geometry.dispose();
        m.material.dispose();
      }
    });
  }

  get eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.62, this.pos.z);
  }

  headBox() {
    return new THREE.Box3(
      new THREE.Vector3(this.pos.x - 0.19, this.pos.y + 1.58, this.pos.z - 0.19),
      new THREE.Vector3(this.pos.x + 0.19, this.pos.y + 2.02, this.pos.z + 0.19)
    );
  }

  bodyBox() {
    return new THREE.Box3(
      new THREE.Vector3(this.pos.x - 0.34, this.pos.y + 0.25, this.pos.z - 0.24),
      new THREE.Vector3(this.pos.x + 0.34, this.pos.y + 1.58, this.pos.z + 0.24)
    );
  }

  /** hitscan against this bot: returns 'head' | 'body' | null */
  testRay(origin, dir, maxDist) {
    if (!this.alive) return null;
    const h = rayAABB(origin, dir, this.headBox(), maxDist);
    const b = rayAABB(origin, dir, this.bodyBox(), maxDist);
    if (h && (!b || h.t <= b.t)) return { part: 'head', t: h.t, point: h.point };
    if (b) return { part: 'body', t: b.t, point: b.point };
    return null;
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.hitFlash = 0.12;
    this.alertLevel = 1;
    if (this.hp <= 0) {
      this.alive = false;
      this.hp = 0;
      this.deathTimer = 0;
      this.deaths += 1;
      this.state = 'dead';
      return true; // died
    }
    return false;
  }

  canSee(targetPos, colliders) {
    const eye = this.eyePos;
    const to = new THREE.Vector3().subVectors(targetPos, eye);
    const dist = to.length();
    if (dist > 58) return false;
    to.normalize();

    // FOV ~160° when close, narrower when far
    const facing = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const flatTo = new THREE.Vector3(to.x, 0, to.z).normalize();
    const dot = facing.dot(flatTo);
    const fovLimit = dist < 6 ? -0.4 : 0.15;
    if (dot < fovLimit) return false;

    // vertical sanity
    if (Math.abs(to.y) > 0.85) return false;

    // LOS
    for (const c of colliders) {
      const hit = rayAABB(eye, to, c, dist - 0.35);
      if (hit) return false;
    }
    return true;
  }

  hear(pos) {
    this.lastKnown = pos.clone();
    this.alertLevel = Math.max(this.alertLevel, 0.75);
    if (this.state === 'patrol') this.state = 'hunt';
  }

  _computePath(targetPos) {
    const nodes = this.world.nodes;
    const nearest = (p) => {
      let best = 0, bestD = Infinity;
      for (const n of nodes) {
        const d = n.pos.distanceToSquared(p);
        if (d < bestD) { bestD = d; best = n.index; }
      }
      return best;
    };
    const start = nearest(this.pos);
    const goal = nearest(targetPos);

    if (start === goal) return [targetPos.clone()];

    // BFS
    const prev = new Array(nodes.length).fill(-1);
    const visited = new Array(nodes.length).fill(false);
    visited[start] = true;
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === goal) break;
      for (const nb of nodes[cur].neighbors) {
        if (!visited[nb]) {
          visited[nb] = true;
          prev[nb] = cur;
          queue.push(nb);
        }
      }
    }
    if (!visited[goal]) return [targetPos.clone()];

    const path = [];
    let cur = goal;
    while (cur !== -1 && cur !== start) {
      path.push(nodes[cur].pos.clone().setY(0));
      cur = prev[cur];
    }
    path.reverse();
    path.push(targetPos.clone().setY(0));
    return path;
  }

  _moveAlongPath(dt, colliders) {
    if (this.pathIndex >= this.path.length) return;
    const target = this.path[this.pathIndex];
    const to = new THREE.Vector3().subVectors(target, this.pos);
    to.y = 0;
    const dist = to.length();
    if (dist < 1.1) {
      this.pathIndex++;
      return;
    }
    to.normalize();
    this.yaw = Math.atan2(-to.x, -to.z);

    const step = this.speed * dt;
    const moveX = to.x * step;
    const moveZ = to.z * step;

    // simple slide collision
    const tryMove = (axis, amount) => {
      if (amount === 0) return false;
      this.pos[axis] += amount;
      const box = this._box();
      let blocked = false;
      for (const c of colliders) {
        if (!overlaps(box, c)) continue;
        blocked = true;
        if (amount > 0) this.pos[axis] = Math.min(this.pos[axis], c.min[axis] - BOT_RADIUS - 1e-3);
        else this.pos[axis] = Math.max(this.pos[axis], c.max[axis] + BOT_RADIUS + 1e-3);
        box.min.set(this.pos.x - BOT_RADIUS, this.pos.y, this.pos.z - BOT_RADIUS);
        box.max.set(this.pos.x + BOT_RADIUS, this.pos.y + BOT_HEIGHT, this.pos.z + BOT_RADIUS);
      }
      return blocked;
    };

    const bx = tryMove('x', moveX);
    const bz = tryMove('z', moveZ);

    // step up small ledges (stairs etc.)
    if (bx || bz) {
      const sx = this.pos.x, sz = this.pos.z, sy = this.pos.y;
      this.pos.y += 0.55;
      if (!this._collides(colliders)) {
        tryMove('x', moveX * 0.8);
        tryMove('z', moveZ * 0.8);
        // settle down onto the step; if we'd land inside geometry, revert
        this.pos.y = sy;
        if (this._collides(colliders)) {
          this.pos.y = sy + 0.55;
          this._resolveCollisions(colliders);
        }
      } else {
        this.pos.set(sx, sy, sz);
      }
    }

    // never leave the arena
    this.pos.x = Math.max(-33.4, Math.min(33.4, this.pos.x));
    this.pos.z = Math.max(-33.4, Math.min(33.4, this.pos.z));

    this.walkPhase += dt * 7.5;
  }

  _box() {
    return new THREE.Box3(
      new THREE.Vector3(this.pos.x - BOT_RADIUS, this.pos.y, this.pos.z - BOT_RADIUS),
      new THREE.Vector3(this.pos.x + BOT_RADIUS, this.pos.y + BOT_HEIGHT, this.pos.z + BOT_RADIUS)
    );
  }

  _collides(colliders) {
    const box = this._box();
    for (const c of colliders) {
      if (overlaps(box, c)) return true;
    }
    return false;
  }

  /**
   * @returns {{fire:boolean, target:THREE.Vector3}} if the bot wants to shoot this frame
   */
  update(dt, playerPos, playerAlive, colliders, sound) {
    const result = { fire: false, target: playerPos, from: this.eyePos };

    if (!this.alive) {
      this.deathTimer += dt;
      // fall over
      const t = Math.min(1, this.deathTimer / 0.45);
      this.mesh.rotation.x = -t * Math.PI / 2 * 0.96;
      this.mesh.position.set(this.pos.x, this.pos.y + 0.15 * Math.sin(t * Math.PI) - 0.12 * t, this.pos.z);
      return result;
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
    }

    // gravity-lite: keep on ground
    this.pos.y += (0 - this.pos.y) * Math.min(1, dt * 10);

    // ---- vision ----
    const eyeTarget = new THREE.Vector3(playerPos.x, playerPos.y + 1.55, playerPos.z);
    const sees = playerAlive && this.canSee(eyeTarget, colliders);

    // proximity awareness: enemies very close are heard/felt even without LOS
    if (playerAlive && this.pos.distanceTo(playerPos) < 4.5 && this.alertLevel < 0.6) {
      this.hear(playerPos);
    }

    if (sees) {
      this.lastKnown = playerPos.clone();
      this.alertLevel = 1;
      this.seeTimer += dt;
      if (this.state === 'patrol' || this.state === 'hunt') this.state = 'combat';
    } else {
      this.seeTimer = 0;
      this.alertLevel = Math.max(0, this.alertLevel - dt * 0.11);
      if (this.state === 'combat') {
        this.state = this.lastKnown ? 'hunt' : 'patrol';
        this.repathTimer = 0;
      }
    }

    // ---- behavior ----
    if (this.state === 'combat' && sees) {
      const toPlayer = new THREE.Vector3().subVectors(playerPos, this.pos);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      toPlayer.normalize();
      this.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);

      // strafe + range keeping
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 0.7 + Math.random() * 1.1;
        this.strafeDir = Math.random() > 0.5 ? 1 : -1;
      }
      const right = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      const move = new THREE.Vector3();
      move.addScaledVector(right, this.strafeDir * 0.85);
      if (dist > this.preferredRange + 4) move.addScaledVector(toPlayer, 0.9);
      else if (dist < this.preferredRange - 3) move.addScaledVector(toPlayer, -0.85);
      move.normalize().multiplyScalar(this.speed * 0.62 * dt);

      this.pos.x += move.x;
      this.pos.z += move.z;
      this._resolveCollisions(colliders);
      this.walkPhase += dt * 5;

      // ---- shooting ----
      this.shootCooldown -= dt;
      if (this.seeTimer > this.reaction && this.shootCooldown <= 0) {
        if (this.burstLeft <= 0) {
          this.burstLeft = 2 + ((Math.random() * 3) | 0);
          this.shootCooldown = 0.55 + Math.random() * 0.75;
          // Start of a fresh burst: reset the per-shot spray counter so
          // the bot's miss direction starts at the first pattern entry
          // (the famous first-shot-RNG bullet of a VALORANT-style spray).
          this.shotSinceSpray = 0;
        } else {
          this.burstLeft--;
          this.shootCooldown = 0.11 + Math.random() * 0.07;
          result.fire = true;
        }
      }
    } else if (this.state === 'hunt' && this.lastKnown) {
      this.repathTimer -= dt;
      if (this.repathTimer <= 0 || this.pathIndex >= this.path.length) {
        this.path = this._computePath(this.lastKnown);
        this.pathIndex = 0;
        this.repathTimer = 1.2 + Math.random();
      }
      this._moveAlongPath(dt, colliders);
      if (this.pos.distanceTo(this.lastKnown) < 2.2) {
        this.lastKnown = null;
        this.state = 'patrol';
      }
    } else {
      // patrol toward a random-ish site node
      this.repathTimer -= dt;
      if (this.repathTimer <= 0 || this.pathIndex >= this.path.length) {
        const nodes = this.world.nodes;
        const target = nodes[(Math.random() * nodes.length) | 0];
        this.path = this._computePath(target.pos);
        this.pathIndex = 0;
        this.repathTimer = 3 + Math.random() * 3;
      }
      this._moveAlongPath(dt, colliders);
    }

    // ---- visuals ----
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    const walking = this.state !== 'combat' || true;
    const parts = this.mesh.userData.parts;
    if (walking && (this.state === 'hunt' || this.state === 'patrol' || this.state === 'combat')) {
      const swing = Math.sin(this.walkPhase) * (this.state === 'combat' ? 0.35 : 0.55);
      parts.legL.rotation.x = swing;
      parts.legR.rotation.x = -swing;
    }

    return result;
  }

  _resolveCollisions(colliders) {
    const box = this._box();
    for (const c of colliders) {
      if (!overlaps(box, c)) continue;
      const cx = (c.min.x + c.max.x) / 2;
      const cz = (c.min.z + c.max.z) / 2;
      const dx = this.pos.x - cx;
      const dz = this.pos.z - cz;
      const px = (c.max.x - c.min.x) / 2 + BOT_RADIUS - Math.abs(dx);
      const pz = (c.max.z - c.min.z) / 2 + BOT_RADIUS - Math.abs(dz);
      if (px < pz) this.pos.x += (dx > 0 ? px : -px);
      else this.pos.z += (dz > 0 ? pz : -pz);
      box.min.set(this.pos.x - BOT_RADIUS, this.pos.y, this.pos.z - BOT_RADIUS);
      box.max.set(this.pos.x + BOT_RADIUS, this.pos.y + BOT_HEIGHT, this.pos.z + BOT_RADIUS);
    }
  }
}
