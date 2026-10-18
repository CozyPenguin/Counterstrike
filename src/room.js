/**
 * Authoritative room simulation shared by every multiplayer transport.
 *
 * The exact same rules run in two places:
 *   - `server/lan.js` (Node) relays the messages of a "server" room over
 *     WebSockets, and
 *   - `src/webrtc.js` (browser) runs the room inside the peer that hosts the
 *     room and replicates it to the other players over a WebRTC data channel.
 *
 * Because both transports share this module a WebRTC room behaves exactly
 * like a relayed room: same damage, same spawns, same validation.
 */
import * as THREE from 'three';
import { rayAABB, rayWorld } from './map.js';

export const ROOM_CAPACITY = 10;
export const RESPAWN_DELAY = 3000;
export const SPAWN_PROTECTION = 2000;
export const RELOAD_TIME = 2400;
export const SHOT_INTERVAL = 95;
export const MAG_SIZE = 30;
export const SHOT_DAMAGE = 36;
export const HEADSHOT_MULTIPLIER = 4;
export const WORLD_LIMIT = 34;
export const STAND_HEIGHT = 1.75;
export const CROUCH_HEIGHT = 1.05;

export class Room {
  constructor(world, { capacity = ROOM_CAPACITY } = {}) {
    this.world = world;
    this.capacity = capacity;
    this.players = new Map();
    // Spawn rotation starts at 1 so the first player lands on the same spot
    // the original server used (player ids and the spawn index shared one
    // counter there).
    this.spawnIndex = 1;
  }

  get size() { return this.players.size; }
  get full() { return this.players.size >= this.capacity; }

  get(id) { return this.players.get(id); }

  /** Add a player to the room and place them at a spawn point. */
  add(id, name, extra = {}) {
    const player = {
      id, name: name || 'Player',
      kills: 0, deaths: 0, yaw: 0, hp: 100, mag: MAG_SIZE,
      reloadAt: 0, lastShot: 0, respawnAt: 0, height: STAND_HEIGHT,
      protectedUntil: 0, lastMove: Date.now(), seen: Date.now(),
      pos: [0, 0, 0], ...extra,
    };
    this.players.set(id, player);
    this.spawn(player);
    return player;
  }

  remove(id) { this.players.delete(id); }

  /** Place a player at the next spawn point with a fresh loadout. */
  spawn(player) {
    const spots = [...(this.world.spawnsCT || []), ...(this.world.spawnsT || [])];
    const spot = spots.length ? spots[this.spawnIndex++ % spots.length] : new THREE.Vector3();
    player.pos = spot.toArray();
    player.hp = 100;
    player.mag = MAG_SIZE;
    player.reloadAt = 0;
    player.lastShot = 0;
    player.height = STAND_HEIGHT;
    player.protectedUntil = Date.now() + SPAWN_PROTECTION;
    player.lastMove = Date.now();
    player.respawnAt = 0;
    return player;
  }

  /** The `spawn` message a freshly joined / respawned player receives. */
  payload(player) {
    return {
      type: 'spawn',
      id: player.id,
      name: player.name,
      pos: player.pos,
      yaw: player.yaw,
      hp: player.hp,
      mag: player.mag,
      height: player.height,
      kills: player.kills,
      deaths: player.deaths,
      roomId: player.roomId,
      roomName: player.roomName,
    };
  }

  /**
   * Apply one client message. Returns the events the transport has to
   * deliver. `to` is a player id for a private event or '*' for a broadcast.
   */
  handle(id, message, now = Date.now()) {
    const p = this.players.get(id);
    if (!p || !message || typeof message !== 'object') return [];
    p.seen = now;
    const events = [];
    if (p.hp <= 0) return events; // dead players cannot act

    if (message.type === 'move'
      && Array.isArray(message.pos) && message.pos.length === 3
      && message.pos.every(Number.isFinite) && Number.isFinite(message.yaw)) {
      const next = new THREE.Vector3(...message.pos);
      const old = new THREE.Vector3(...p.pos);
      const allowance = Math.min(1, (now - p.lastMove) / 1000) * 9 + 0.5;
      if (Math.abs(next.x) > WORLD_LIMIT || Math.abs(next.z) > WORLD_LIMIT
        || next.y < -1 || next.y > 12 || next.distanceTo(old) > allowance) {
        events.push({ to: id, message: { type: 'correct', pos: p.pos } });
      } else {
        p.pos = message.pos;
        p.yaw = message.yaw;
        p.height = message.crouch ? CROUCH_HEIGHT : STAND_HEIGHT;
        p.lastMove = now;
      }
    }

    if (message.type === 'reload' && !p.reloadAt && p.mag < MAG_SIZE) p.reloadAt = now + RELOAD_TIME;

    if (message.type !== 'shot' || p.reloadAt || !p.mag || now - p.lastShot < SHOT_INTERVAL) return events;
    if (!Array.isArray(message.dir) || message.dir.length !== 3 || !message.dir.every(Number.isFinite)) return events;
    const dir = new THREE.Vector3(...message.dir);
    if (Math.abs(dir.length() - 1) > 0.01) return events;

    p.lastShot = now;
    p.mag--;
    const origin = new THREE.Vector3(...p.pos);
    origin.y += p.height + 0.12;
    const wall = rayWorld(origin, dir, this.world.colliders, 150);
    let distance = wall?.t ?? 150;
    let victim = null;
    let head = false;
    for (const target of this.players.values()) {
      if (target === p || target.hp <= 0 || now < target.protectedUntil) continue;
      const [x, y, z] = target.pos;
      const box = new THREE.Box3(
        new THREE.Vector3(x - 0.32, y, z - 0.32),
        new THREE.Vector3(x + 0.32, y + target.height + 0.2, z + 0.32),
      );
      const hit = rayAABB(origin, dir, box, distance);
      if (hit && hit.t < distance) {
        distance = hit.t;
        victim = target;
        head = hit.point.y > y + target.height - 0.25;
      }
    }

    events.push({
      to: '*',
      message: {
        type: 'shot',
        id: p.id,
        from: origin.toArray(),
        to: origin.clone().addScaledVector(dir, distance).toArray(),
      },
    });

    if (victim) {
      victim.hp = Math.max(0, victim.hp - SHOT_DAMAGE * (head ? HEADSHOT_MULTIPLIER : 1));
      events.push({ to: p.id, message: { type: 'hit', killed: victim.hp === 0 } });
      if (!victim.hp) {
        victim.deaths++;
        p.kills++;
        victim.respawnAt = now + RESPAWN_DELAY;
        events.push({
          to: '*',
          message: { type: 'kill', killer: p.name, victim: victim.name, head },
        });
      }
    }
    return events;
  }

  /** Timers: reload completion and respawns. */
  tick(now = Date.now()) {
    const events = [];
    for (const p of this.players.values()) {
      if (p.reloadAt && now >= p.reloadAt) { p.mag = MAG_SIZE; p.reloadAt = 0; }
      if (p.hp <= 0 && now >= p.respawnAt) {
        this.spawn(p);
        events.push({ to: p.id, message: this.payload(p) });
      }
    }
    return events;
  }

  /** The state snapshot broadcast to every player. */
  snapshot() {
    return [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, pos: p.pos, yaw: p.yaw, hp: p.hp,
      kills: p.kills, deaths: p.deaths, height: p.height,
    }));
  }
}
