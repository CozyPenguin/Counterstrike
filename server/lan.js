import { WebSocketServer, WebSocket } from 'ws';
import { networkInterfaces } from 'node:os';
import { randomUUID } from 'node:crypto';
import * as THREE from 'three';
import { buildWorld } from '../src/map.js';
import { Room, ROOM_CAPACITY } from '../src/room.js';

// World generation also creates procedural textures; no pixels are needed by the server.
const context = new Proxy({}, { get: (_, key) => key.startsWith('create')
  ? () => ({ addColorStop() {} }) : () => {} });
const previous = globalThis.document;
globalThis.document = { createElement: () => ({ getContext: () => context }) };
const world = buildWorld(new THREE.Scene());
if (previous === undefined) delete globalThis.document;
else globalThis.document = previous;

const clean = value => String(value ?? '').replace(/[^a-zA-Z0-9 _-]/g, '').trim();

export function attachLAN(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  const players = new Map();     // ws -> player
  const byId = new Map();        // player id -> player
  const rooms = new Map();       // room id -> room

  const roomList = () => [...rooms.values()].map(room => ({
    id: room.id, name: room.name, capacity: room.capacity, method: room.method,
    players: room.members.size,
  }));
  const cleanRooms = () => {
    for (const id of rooms.keys()) if (!rooms.get(id).members.size) rooms.delete(id);
  };
  const request = (req, res) => {
    if (req.url?.split('?')[0] !== '/api/rooms') return;
    const port = server.address()?.port || 5173;
    const addresses = [...new Set(Object.values(networkInterfaces()).flat()
      .filter(a => a && a.family === 'IPv4' && !a.internal).map(a => `http://${a.address}:${port}`))];
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ rooms: roomList(), addresses }));
  };

  let sequence = 0;
  let spawnCounter = 0;
  const send = (ws, data) => { if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) ws.send(JSON.stringify(data)); };
  const broadcast = (roomId, data) => {
    for (const [ws, p] of players) if (p.joined && p.roomId === roomId) send(ws, data);
  };
  const deliver = (playerId, data) => {
    const target = byId.get(playerId);
    if (target) send(target.ws, data);
  };
  /** Tell every member of a peer-to-peer room who is in it and who hosts it. */
  const broadcastRoster = room => {
    const members = [...room.members]
      .map(id => byId.get(id))
      .filter(Boolean)
      .map(p => ({ id: p.id, name: p.name }));
    for (const p of players.values()) {
      if (p.joined && p.roomId === room.id) {
        send(p.ws, { type: 'rtc-roster', hostId: room.hostId, members, roomId: room.id, roomName: room.name, you: p.id });
      }
    }
  };
  const spawnPoint = () => {
    const spots = [...world.spawnsCT, ...world.spawnsT];
    return spots[spawnCounter++ % spots.length].toArray();
  };

  const upgrade = (req, socket, head) => {
    if (req.url?.split('?')[0] !== '/lan') return;
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  };
  server.on('upgrade', upgrade);

  wss.on('connection', ws => {
    if (players.size >= 100) { ws.close(1013, 'Server busy'); return; }
    const p = { id: String(++sequence), name: 'Player', kills: 0, deaths: 0, yaw: 0, joined: false, method: 'server', roomId: null, seen: Date.now(), ws };
    players.set(ws, p);
    byId.set(p.id, p);
    send(ws, { type: 'welcome', id: p.id });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object') return;
      const now = Date.now(); p.seen = now;

      if (m.type === 'join' && !p.joined) {
        const method = m.method === 'webrtc' ? 'webrtc' : 'server';
        let room = rooms.get(m.roomId);
        if (m.createRoom) {
          if (rooms.size >= 20) { send(ws, { type: 'error', message: 'Too many rooms. Join an existing room.' }); return; }
          room = {
            id: randomUUID(),
            name: clean(m.createRoom).slice(0, 32) || 'LAN Room',
            capacity: ROOM_CAPACITY,
            method,
            hostId: null,
            members: new Set(),
            sim: method === 'server' ? new Room(world, { capacity: ROOM_CAPACITY }) : null,
          };
          rooms.set(room.id, room);
        }
        if (!room) { send(ws, { type: 'error', message: 'This room has closed. Refresh and choose another room.' }); return; }
        if (room.members.size >= room.capacity) {
          send(ws, { type: 'error', message: `Room is full (${room.capacity} players).` }); return;
        }
        p.roomId = room.id; p.roomName = room.name; p.method = room.method;
        p.name = clean(m.name).slice(0, 20) || 'Player';
        p.joined = true;
        room.members.add(p.id);
        if (room.method === 'webrtc') {
          // The creator of a peer-to-peer room hosts it; if the host leaves,
          // the next member is promoted.
          if (!room.hostId) room.hostId = p.id;
          p.pos = spawnPoint();
          send(ws, { type: 'spawn', id: p.id, name: p.name, pos: p.pos, hp: 100, mag: 30, roomId: room.id, roomName: room.name });
          broadcastRoster(room);
        } else {
          const player = room.sim.add(p.id, p.name, { roomId: room.id, roomName: room.name });
          send(ws, room.sim.payload(player));
          broadcast(room.id, { type: 'state', players: room.sim.snapshot() });
        }
        return;
      }

      if (!p.joined) return;
      const room = rooms.get(p.roomId);
      if (!room) return;

      // ---- WebRTC signalling (peer-to-peer rooms) ----
      if (m.type === 'rtc') {
        if (room.method !== 'webrtc') return;
        const payload = m.payload;
        if (!payload || typeof payload !== 'object') return;
        if (m.to) {
          const target = byId.get(m.to);
          if (target && target.roomId === p.roomId) send(target.ws, { type: 'rtc', from: p.id, to: m.to, payload });
        } else {
          for (const other of players.values()) {
            if (other !== p && other.joined && other.roomId === p.roomId) {
              send(other.ws, { type: 'rtc', from: p.id, payload });
            }
          }
        }
        return;
      }
      if (m.type === 'ping') return;

      // ---- relayed rooms: the server stays authoritative ----
      if (!room.sim) return;
      const events = room.sim.handle(p.id, m);
      for (const event of events) {
        if (event.to === '*') broadcast(p.roomId, event.message);
        else deliver(event.to, event.message);
      }
    });
    ws.on('close', () => {
      players.delete(ws); byId.delete(p.id);
      const room = rooms.get(p.roomId);
      if (room) {
        room.members.delete(p.id);
        room.sim?.remove(p.id);
        if (room.method === 'webrtc' && room.hostId === p.id) {
          // Promote the next member so the room keeps running.
          const next = room.members.values().next().value;
          room.hostId = next ?? null;
        }
        if (room.method === 'webrtc') broadcastRoster(room);
      }
      cleanRooms();
    });
    ws.on('error', () => ws.close());
  });

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ws, p] of players) {
      if (now - (p.seen || now) > (p.method === 'webrtc' ? 60000 : 30000)) { ws.terminate(); continue; }
    }
    for (const room of rooms.values()) {
      if (!room.sim) continue;
      for (const event of room.sim.tick(now)) {
        if (event.to === '*') broadcast(room.id, event.message);
        else deliver(event.to, event.message);
      }
      broadcast(room.id, { type: 'state', players: room.sim.snapshot() });
    }
  }, 50);

  const close = () => {
    clearInterval(timer);
    server.off('upgrade', upgrade);
    server.off('request', request);
    for (const ws of players.keys()) ws.terminate();
    wss.close();
  };
  server.once('close', close);
  return { close, wss, request };
}
