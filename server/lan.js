import { WebSocketServer, WebSocket } from 'ws';
import * as THREE from 'three';
import { buildWorld, rayAABB, rayWorld } from '../src/map.js';

// World generation also creates procedural textures; no pixels are needed by the server.
const context = new Proxy({}, { get: (_, key) => key.startsWith('create')
  ? () => ({ addColorStop() {} }) : () => {} });
const previous = globalThis.document;
globalThis.document = { createElement: () => ({ getContext: () => context }) };
const world = buildWorld(new THREE.Scene());
if (previous === undefined) delete globalThis.document;
else globalThis.document = previous;

export function attachLAN(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const players = new Map();
  let sequence = 0;
  const send = (ws, data) => { if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) ws.send(JSON.stringify(data)); };
  const broadcast = data => { for (const ws of players.keys()) send(ws, data); };
  const spawn = p => {
    const spots = [...world.spawnsCT, ...world.spawnsT];
    p.pos = spots[(sequence++) % spots.length].toArray();
    p.hp = 100; p.mag = 30; p.reloadAt = 0; p.lastShot = 0; p.height = 1.75;
    p.protectedUntil = Date.now() + 2000;
    p.lastMove = Date.now();
  };
  const upgrade = (req, socket, head) => {
    if (req.url?.split('?')[0] !== '/lan') return;
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  };
  server.on('upgrade', upgrade);
  wss.on('connection', ws => {
    if (players.size >= 10) { ws.close(1013, 'Server full (10 players)'); return; }
    const p = { id: String(++sequence), name: 'Player', kills: 0, deaths: 0, yaw: 0, joined: false };
    spawn(p); players.set(ws, p);
    send(ws, { type: 'welcome', id: p.id });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object') return;
      const now = Date.now(); p.seen = now;
      if (m.type === 'join' && !p.joined) {
        p.name = String(m.name || 'Player').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 20) || 'Player';
        p.joined = true; send(ws, { type: 'spawn', ...p }); return;
      }
      if (!p.joined || p.hp <= 0) return;
      if (m.type === 'move' && Array.isArray(m.pos) && m.pos.length === 3 && m.pos.every(Number.isFinite) && Number.isFinite(m.yaw)) {
        const next = new THREE.Vector3(...m.pos), old = new THREE.Vector3(...p.pos);
        const allowance = Math.min(1, (now - p.lastMove) / 1000) * 9 + 0.5;
        if (Math.abs(next.x) > 34 || Math.abs(next.z) > 34 || next.y < -1 || next.y > 12 || next.distanceTo(old) > allowance) {
          send(ws, { type: 'correct', pos: p.pos }); return;
        }
        p.pos = m.pos; p.yaw = m.yaw; p.height = m.crouch ? 1.05 : 1.75; p.lastMove = now;
      }
      if (m.type === 'reload' && !p.reloadAt && p.mag < 30) p.reloadAt = now + 2400;
      if (m.type !== 'shot' || p.reloadAt || !p.mag || now - p.lastShot < 95) return;
      if (!Array.isArray(m.dir) || m.dir.length !== 3 || !m.dir.every(Number.isFinite)) return;
      const dir = new THREE.Vector3(...m.dir);
      if (Math.abs(dir.length() - 1) > 0.01) return;
      p.lastShot = now; p.mag--;
      const origin = new THREE.Vector3(...p.pos); origin.y += p.height + 0.12;
      const wall = rayWorld(origin, dir, world.colliders, 150);
      let distance = wall?.t ?? 150, victim = null, head = false;
      for (const target of players.values()) {
        if (target === p || !target.joined || target.hp <= 0 || now < target.protectedUntil) continue;
        const [x,y,z] = target.pos;
        const box = new THREE.Box3(new THREE.Vector3(x-.32,y,z-.32), new THREE.Vector3(x+.32,y+target.height+.2,z+.32));
        const hit = rayAABB(origin, dir, box, distance);
        if (hit && hit.t < distance) { distance = hit.t; victim = target; head = hit.point.y > y + target.height - .25; }
      }
      broadcast({ type: 'shot', id: p.id, from: origin.toArray(), to: origin.clone().addScaledVector(dir, distance).toArray() });
      if (victim) {
        victim.hp = Math.max(0, victim.hp - 36 * (head ? 4 : 1));
        send(ws, { type: 'hit', killed: victim.hp === 0 });
        if (!victim.hp) {
          victim.deaths++; p.kills++; victim.respawnAt = now + 3000;
          broadcast({ type: 'kill', killer: p.name, victim: victim.name, head });
        }
      }
    });
    ws.on('close', () => players.delete(ws));
    ws.on('error', () => ws.close());
  });
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ws,p] of players) {
      if (now - (p.seen || p.lastMove) > 30000) { ws.terminate(); continue; }
      if (p.reloadAt && now >= p.reloadAt) { p.mag = 30; p.reloadAt = 0; }
      if (p.hp <= 0 && now >= p.respawnAt) { spawn(p); send(ws, { type: 'spawn', ...p }); }
    }
    broadcast({ type: 'state', players: [...players.values()].filter(p => p.joined).map(({id,name,pos,yaw,hp,kills,deaths,height}) => ({id,name,pos,yaw,hp,kills,deaths,height})) });
  }, 50);
  const close = () => { clearInterval(timer); server.off('upgrade', upgrade); for (const ws of players.keys()) ws.terminate(); wss.close(); };
  server.once('close', close);
  return { close, wss };
}
