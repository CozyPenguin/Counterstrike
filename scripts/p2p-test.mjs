/**
 * Peer-to-peer (WebRTC) integration test.
 *
 * The test drives the real browser code (`src/webrtc.js`) against the real
 * game server (`server/lan.js`). Only `RTCPeerConnection` is replaced by a
 * mock that behaves like the browser API, so the signalling flow, the
 * handshake, the data channel and the whole game protocol are exercised
 * without a browser.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { WebSocket } from 'ws';

// ---------- minimal DOM mock (procedural textures need a 2d context) ----------
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
    if (tag === 'canvas') return { width: 0, height: 0, getContext: () => makeCtx2D() };
    return {
      style: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, appendChild() {}, remove() {}, setAttribute() {},
      dataset: {}, innerHTML: '', textContent: '',
    };
  },
  getElementById: () => null,
  addEventListener() {},
};
globalThis.window = { addEventListener() {}, innerWidth: 1280, innerHeight: 720 };

// ---------- mock RTCPeerConnection ----------
let pcSeq = 0;
const mockPCs = [];

class MockDataChannel {
  constructor(label) {
    this.label = label;
    this.readyState = 'connecting';
    this.bufferedAmount = 0;
    this.onopen = null; this.onmessage = null; this.onclose = null;
    this.peer = null;
  }
  send(data) {
    if (this.readyState !== 'open') return;
    const target = this.peer;
    queueMicrotask(() => { if (target && target.readyState === 'open') target.onmessage?.({ data }); });
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    if (this.peer) this.peer.readyState = 'closed';
    this.onclose?.();
  }
}

class MockRTCPeerConnection {
  constructor(config) {
    this.config = config ?? {};
    this.id = ++pcSeq;
    this.localDescription = null;
    this.remoteDescription = null;
    this.signalingState = 'stable';
    this.onicecandidate = null;
    this.ondatachannel = null;
    this.channels = [];
    this.paired = false;
    mockPCs.push(this);
  }
  createDataChannel(label) {
    const channel = new MockDataChannel(label);
    this.channels.push(channel);
    return channel;
  }
  async createOffer() { this.signalingState = 'have-local-offer'; return { type: 'offer', sdp: `mock-offer-${this.id}` }; }
  async createAnswer() { return { type: 'answer', sdp: `mock-answer-${this.id}` }; }
  async setLocalDescription(desc) {
    this.localDescription = { type: desc.type, sdp: desc.sdp };
    this.signalingState = desc.type === 'offer' ? 'have-local-offer' : 'stable';
    // trickle one candidate, like a browser does
    this.onicecandidate?.({
      candidate: { toJSON: () => ({ candidate: `mock-candidate-${this.id}`, sdpMid: '0', sdpMLineIndex: 0 }) },
    });
  }
  async setRemoteDescription(desc) {
    this.remoteDescription = { type: desc.type, sdp: desc.sdp };
    if (desc.type === 'offer') {
      this.signalingState = 'have-remote-offer';
      const offerer = mockPCs.find(pc => pc !== this && !pc.paired
        && pc.localDescription?.type === 'offer' && pc.channels.length);
      if (!offerer) throw new Error('mock: no offerer to pair with');
      offerer.paired = true;
      this.pair = offerer;
      const a = offerer.channels[0];
      const b = new MockDataChannel(a.label);
      a.peer = b; b.peer = a;
      this.channels.push(b);
      this.ondatachannel?.({ channel: b });
      setTimeout(() => {
        a.readyState = 'open'; b.readyState = 'open';
        a.onopen?.(); b.onopen?.();
      }, 0);
    } else {
      this.signalingState = 'stable';
    }
  }
  async addIceCandidate() {}
  close() { for (const channel of this.channels) channel.readyState = 'closed'; }
}

globalThis.RTCPeerConnection = MockRTCPeerConnection;
globalThis.WebSocket = WebSocket;

// ---------- real code under test ----------
const THREE = await import('three');
const { attachLAN } = await import('../server/lan.js');
const { buildWorld } = await import('../src/map.js');
const { P2PClient } = await import('../src/webrtc.js');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, label, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return true;
    await delay(10);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const server = createServer();
const lan = attachLAN(server);
server.on('request', lan.request);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
globalThis.location = { protocol: 'http:', href: `http://127.0.0.1:${port}/`, search: '' };

const scene = new THREE.Scene();
const world = buildWorld(scene);

const clients = [];
function makeClient(name) {
  const messages = [];
  const state = { closed: false, messages, name };
  const client = new P2PClient({
    scene, world,
    onMessage: m => messages.push(m),
    onClose: () => { state.closed = true; },
  });
  state.client = client;
  state.player = { pos: new THREE.Vector3(), yaw: 0, crouching: false };
  clients.push(state);
  return state;
}

const loop = setInterval(() => {
  for (const state of clients) state.client.update(0.016, state.player);
}, 16);

try {
  // ---------- the menu offers both connection methods ----------
  const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
  assert.match(html, /id="lan-method"/, 'the multiplayer menu has a connection method picker');
  assert.match(html, /data-val="webrtc"/, 'the WebRTC method is selectable');
  assert.match(html, /data-val="server"/, 'the server relay method is selectable');

  // ---------- the room creator becomes the host ----------
  const host = makeClient('Host');
  const hostSpawn = await host.client.connect('Host', { createRoom: 'P2P Room' });
  assert.equal(hostSpawn.roomName, 'P2P Room');
  assert.ok(host.client.isHost, 'the room creator hosts the peer-to-peer room');
  assert.ok(hostSpawn.pos.length === 3, 'the host got a spawn point');

  // the room browser knows it is a peer-to-peer room
  const listing = await (await fetch(`http://127.0.0.1:${port}/api/rooms`)).json();
  assert.equal(listing.rooms.length, 1);
  assert.equal(listing.rooms[0].method, 'webrtc', 'the room is advertised as WebRTC');
  assert.equal(listing.rooms[0].players, 1);

  // ---------- a second player connects straight to the host ----------
  const guest = makeClient('Guest');
  const guestSpawn = await guest.client.connect('Guest', { roomId: hostSpawn.roomId });
  assert.equal(guestSpawn.name, 'Guest');
  assert.ok(!guest.client.isHost, 'the guest is a plain peer');
  assert.ok(guest.client.connectedPeerOpen(), 'the data channel to the host is open');

  await waitFor(
    () => guest.messages.some(m => m.type === 'state' && m.players.length === 2),
    'the guest to see both players',
  );
  const hostState = host.messages.filter(m => m.type === 'state').pop();
  assert.equal(hostState.players.length, 2, 'the host knows about the guest');
  assert.equal(hostState.players.find(p => p.id === host.client.id).name, 'Host');
  assert.equal(hostState.players.find(p => p.id === guest.client.id).name, 'Guest');

  // ---------- movement travels peer to peer ----------
  guest.player.pos.fromArray(guestSpawn.pos);
  guest.player.pos.x += 0.4;
  await waitFor(
    () => {
      const state = host.messages.filter(m => m.type === 'state').pop();
      const peer = state?.players.find(p => p.id === guest.client.id);
      return peer && Math.abs(peer.pos[0] - guest.player.pos.x) < 0.001;
    },
    'the host to see the guest move',
  );

  // ---------- shooting resolves on the host ----------
  await delay(2200); // spawn protection expires
  const from = [guest.player.pos.x, guest.player.pos.y + 1.87, guest.player.pos.z];
  const to = [hostSpawn.pos[0], hostSpawn.pos[1] + 1.7, hostSpawn.pos[2]];
  const delta = to.map((v, i) => v - from[i]);
  const length = Math.hypot(...delta);
  guest.client.send({ type: 'shot', dir: delta.map(v => v / length) });
  await waitFor(() => guest.messages.some(m => m.type === 'hit' && m.killed), 'the guest to hit the host');
  const kill = await waitFor(() => guest.messages.find(m => m.type === 'kill'), 'the kill feed entry')
    .then(() => guest.messages.find(m => m.type === 'kill'));
  assert.equal(kill.killer, 'Guest');
  assert.equal(kill.victim, 'Host');
  await waitFor(
    () => {
      const state = host.messages.filter(m => m.type === 'state').pop();
      return state?.players.find(p => p.id === host.client.id)?.hp === 0;
    },
    'the host to register the hit',
  );
  // the tracer reached the guest as well
  assert.ok(guest.messages.some(m => m.type === 'shot'), 'the shot was replicated to the peer');

  // ---------- the victim respawns on the host ----------
  await waitFor(
    () => {
      const state = host.messages.filter(m => m.type === 'state').pop();
      return state?.players.find(p => p.id === host.client.id)?.hp === 100;
    },
    'the host to respawn',
    8000,
  );
  assert.ok(host.messages.some(m => m.type === 'spawn'), 'the respawn was announced');

  // ---------- the host leaves: the remaining peer takes over ----------
  host.client.dispose();
  await waitFor(() => guest.client.isHost, 'the guest to be promoted to host');
  await waitFor(
    () => guest.messages.some(m => m.type === 'state' && m.players.length === 1),
    'the promoted host to rebuild the room',
  );

  // ---------- a new player joins the promoted host ----------
  const late = makeClient('Late');
  const lateSpawn = await late.client.connect('Late', { roomId: hostSpawn.roomId });
  assert.equal(lateSpawn.name, 'Late');
  await waitFor(
    () => guest.messages.some(m => m.type === 'state' && m.players.length === 2),
    'the promoted host to accept the new peer',
  );
  assert.ok(late.client.connectedPeerOpen(), 'the new peer connected to the promoted host');

  console.log('WebRTC P2P integration passed: signalling, handshake, data channel, state sync, movement, shooting, kills, host migration');
} finally {
  clearInterval(loop);
  for (const state of clients) state.client.dispose();
  lan.close();
  await new Promise(resolve => server.close(resolve));
}
