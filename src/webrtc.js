/**
 * Peer-to-peer multiplayer over WebRTC data channels.
 *
 * A WebRTC room keeps the *same* protocol as a relayed room, but the bytes
 * travel straight between the browsers:
 *
 *   - the room creator becomes the "host": it runs the authoritative
 *     `Room` simulation inside the browser and replicates the result to
 *     every other player over a data channel,
 *   - the game server is only used for room discovery and to broker the
 *     WebRTC handshake (offer / answer / ICE candidates).
 *
 * Because both transports share `src/room.js`, a WebRTC room plays exactly
 * like a server room — same damage, same spawns, same validation.
 */
import { MultiplayerClient, socketUrl } from './lan.js';
import { Room } from './room.js';

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * ICE servers. On a single LAN the host candidates are enough, the public
 * STUN servers only help when the players sit behind different routers.
 * `?nostun=1` disables them (useful on isolated networks).
 */
export function iceServers() {
  const search = globalThis.location?.search || '';
  if (/[?&]nostun=1/.test(search)) return [];
  return DEFAULT_ICE_SERVERS;
}

/** One WebRTC connection plus the data channel that carries the game traffic. */
export class RTCPeer {
  constructor({ id, initiator = false, onSignal, onIce, onOpen, onMessage, onClose }) {
    this.id = id;
    this.onSignal = onSignal; this.onIce = onIce;
    this.onOpen = onOpen; this.onMessage = onMessage; this.onClose = onClose;
    this.channel = null;
    this.remoteSet = false;
    this.pendingCandidates = [];
    this.closed = false;
    this.createdAt = Date.now();
    this.pc = new RTCPeerConnection({ iceServers: iceServers() });
    this.pc.onicecandidate = event => {
      const candidate = event.candidate;
      if (!candidate) return;
      const json = typeof candidate.toJSON === 'function'
        ? candidate.toJSON()
        : { candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex };
      this.onIce?.(this.id, json);
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'failed') this.close();
    };
    if (initiator) this.bindChannel(this.pc.createDataChannel('game', { ordered: true }));
    else this.pc.ondatachannel = event => this.bindChannel(event.channel);
  }

  bindChannel(channel) {
    this.channel = channel;
    channel.onopen = () => this.onOpen?.(this.id);
    channel.onmessage = event => {
      let m;
      try { m = JSON.parse(event.data); } catch { return; }
      this.onMessage?.(this.id, m);
    };
    channel.onclose = () => this.onClose?.(this.id);
    // The channel can already be open when it is handed to us.
    if (channel.readyState === 'open') queueMicrotask(() => this.onOpen?.(this.id));
  }

  get open() { return this.channel?.readyState === 'open'; }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.onSignal?.(this.id, { kind: 'offer', sdp: this.pc.localDescription?.sdp ?? offer.sdp });
  }

  async handleOffer(sdp) {
    await this.pc.setRemoteDescription({ type: 'offer', sdp });
    await this.drainCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.onSignal?.(this.id, { kind: 'answer', sdp: this.pc.localDescription?.sdp ?? answer.sdp });
  }

  async handleAnswer(sdp) {
    if (this.pc.signalingState === 'stable') return;
    await this.pc.setRemoteDescription({ type: 'answer', sdp });
    await this.drainCandidates();
  }

  async addIce(candidate) {
    if (!this.remoteSet) { this.pendingCandidates.push(candidate); return; }
    try { await this.pc.addIceCandidate(candidate); } catch { /* stale candidate */ }
  }

  async drainCandidates() {
    this.remoteSet = true;
    for (const candidate of this.pendingCandidates.splice(0)) {
      try { await this.pc.addIceCandidate(candidate); } catch { /* stale candidate */ }
    }
  }

  send(message) {
    const channel = this.channel;
    if (channel && channel.readyState === 'open' && channel.bufferedAmount < 65536) {
      channel.send(JSON.stringify(message));
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.channel?.close(); } catch { /* already gone */ }
    try { this.pc.close(); } catch { /* already gone */ }
  }
}

/**
 * A multiplayer client that plays through a WebRTC data channel.
 *
 * The signalling socket is only used to join the room and to exchange the
 * WebRTC handshake; every gameplay message travels peer to peer.
 */
export class P2PClient extends MultiplayerClient {
  constructor({ scene, world, onMessage, onClose, onStatus }) {
    super({ scene, world, onMessage, onClose });
    this.method = 'webrtc';
    this.onStatus = onStatus || (() => {});
    this.name = 'Player';
    this.peers = new Map();          // peer id -> RTCPeer
    this.pendingIce = new Map();     // peer id -> candidates that arrived early
    this.pendingReady = new Set();   // peers that are waiting for an offer
    this.members = [];
    this.hostId = null;
    this.connectedHost = null;
    this.room = null;                // the authoritative room (host role only)
    this.isHost = false;
    this.lastState = 0;
    this.heartbeat = 0;
    this.lastReady = 0;
    this.resolved = false;
    this.closed = false;
  }

  connect(name, room = {}) {
    return new Promise((resolve, reject) => {
      if (typeof globalThis.RTCPeerConnection === 'undefined') {
        reject(new Error('This browser does not support WebRTC. Use the server connection instead.'));
        return;
      }
      this.name = name || 'Player';
      this.resolveSpawn = resolve;
      this.rejectConnect = reject;
      const url = socketUrl('/lan');
      this.ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        this.ws.close();
        reject(new Error('Connection timed out'));
      }, 15000);
      this.ws.onmessage = event => {
        const m = JSON.parse(event.data);
        if (m.type === 'welcome') {
          this.id = m.id;
          this.signalRaw({ type: 'join', name: this.name, ...room, method: 'webrtc' });
        } else if (m.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(m.message));
          this.ws.close();
        } else if (m.type === 'spawn') {
          // The server hands out the id and the room; the authoritative spawn
          // point arrives later from the host over the data channel.
          this.roomId = m.roomId ?? this.roomId;
          this.roomName = m.roomName ?? this.roomName;
        } else if (m.type === 'rtc-roster') {
          this.onRoster(m);
        } else if (m.type === 'rtc') {
          this.onSignal(m.from, m.payload);
        }
      };
      this.ws.onclose = event => {
        clearTimeout(timeout);
        if (this.resolved) {
          // A peer can keep playing while the signalling socket is down, but
          // the host cannot: the server hands the room over to somebody else
          // as soon as its socket disappears.
          if (!this.isHost && this.connectedPeerOpen()) return;
          this.onClose();
        } else {
          reject(new Error(event.reason || 'Could not connect to LAN server'));
        }
      };
      this.ws.onerror = () => {};
    });
  }

  connectedPeerOpen() {
    const peer = this.peers.get(this.connectedHost);
    return !!peer?.open;
  }

  // ---------- signalling ----------

  signalRaw(message) {
    if (this.ws?.readyState === WebSocket.OPEN && this.ws.bufferedAmount < 65536) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /** Send a WebRTC handshake message to another member of the room. */
  signal(peerId, payload) {
    this.signalRaw({ type: 'rtc', to: peerId, payload });
  }

  onRoster(roster) {
    this.members = roster.members || [];
    this.roomId = roster.roomId ?? this.roomId;
    this.roomName = roster.roomName ?? this.roomName;
    const hostId = roster.hostId ?? null;
    if (hostId === this.id) { this.becomeHost(); return; }
    if (!hostId) return;
    if (hostId !== this.connectedHost) {
      // The host changed (the previous one left): drop the stale connection
      // and start a fresh handshake with the new host.
      this.connectedHost = hostId;
      this.dropPeers();
      this.ensurePeer(hostId);
      this.onStatus(`Host changed — reconnecting to ${this.memberName(hostId)}…`);
    }
    this.lastReady = Date.now();
    this.signal(hostId, { kind: 'ready' });
  }

  memberName(id) {
    return this.members.find(m => m.id === id)?.name || 'host';
  }

  ensurePeer(id) {
    let peer = this.peers.get(id);
    if (peer) return peer;
    peer = new RTCPeer({
      id,
      initiator: this.isHost,
      onSignal: (peerId, payload) => this.signal(peerId, payload),
      onIce: (peerId, candidate) => this.signal(peerId, { kind: 'ice', candidate }),
      onOpen: peerId => this.onPeerOpen(peerId),
      onMessage: (peerId, message) => this.onPeerMessage(peerId, message),
      onClose: peerId => this.onPeerClose(peerId),
    });
    this.peers.set(id, peer);
    for (const candidate of this.pendingIce.get(id) || []) peer.addIce(candidate);
    this.pendingIce.delete(id);
    return peer;
  }

  async onSignal(from, payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.kind === 'ice') {
      const peer = this.peers.get(from);
      if (peer) await peer.addIce(payload.candidate);
      else {
        const list = this.pendingIce.get(from) || [];
        list.push(payload.candidate);
        this.pendingIce.set(from, list);
      }
      return;
    }
    if (payload.kind === 'ready') {
      if (!this.isHost) { this.pendingReady.add(from); return; }
      const existing = this.peers.get(from);
      if (existing) {
        // A handshake is already running (or finished) — only rebuild the
        // connection when the previous attempt clearly died.
        if (existing.open || Date.now() - existing.createdAt < 6000) return;
        this.peers.delete(from);
        existing.close();
      }
      const created = this.ensurePeer(from);
      try { await created.createOffer(); } catch { /* peer vanished */ }
      return;
    }
    if (payload.kind === 'offer' && from !== this.connectedHost) {
      // A different member took over the room: drop the stale connection
      // before answering the new host.
      this.connectedHost = from;
      this.dropPeers();
    }
    const peer = this.ensurePeer(from);
    try {
      if (payload.kind === 'offer') await peer.handleOffer(payload.sdp);
      else if (payload.kind === 'answer') await peer.handleAnswer(payload.sdp);
    } catch { /* duplicate or stale handshake */ }
  }

  // ---------- roles ----------

  /** Become the authority of the room (creator of the room, or promoted). */
  becomeHost() {
    if (this.room) return;
    this.isHost = true;
    this.connectedHost = null;
    this.room = new Room(this.world);
    const player = this.room.add(this.id, this.name, { roomId: this.roomId, roomName: this.roomName });
    this.disposeAvatars();
    this.players = [];
    this.dropPeers();
    this.onStatus('You are the room host — the game runs through your browser.');
    this.settle(this.room.payload(player));
    // Peers that announced themselves before we became the host still wait
    // for an offer.
    for (const id of this.pendingReady) {
      if (this.peers.has(id)) continue;
      const peer = this.ensurePeer(id);
      peer.createOffer().catch(() => {});
    }
    this.pendingReady.clear();
  }

  dropPeers() {
    const peers = [...this.peers.values()];
    this.peers.clear();
    for (const peer of peers) peer.close();
    this.pendingIce.clear();
  }

  settle(spawn) {
    if (this.resolved) return;
    this.resolved = true;
    this.resolveSpawn(spawn);
  }

  // ---------- peer lifecycle ----------

  onPeerOpen(id) {
    if (this.isHost) return;
    // Tell the host who we are so it can add us to the authoritative room.
    this.peers.get(id)?.send({ type: 'join', name: this.name, id: this.id });
  }

  onPeerClose(id) {
    this.peers.delete(id);
    if (this.isHost) {
      const player = this.room?.get(id);
      if (player) this.room.remove(id);
      return;
    }
    if (id !== this.connectedHost) return;
    // The host vanished. Give the server a moment to promote a new one.
    clearTimeout(this.hostLostTimer);
    this.hostLostTimer = setTimeout(() => {
      if (!this.connectedPeerOpen()) this.onClose();
    }, 4000);
  }

  onPeerMessage(id, message) {
    if (this.isHost) { this.hostHandle(id, message); return; }
    if (message.type === 'spawn') this.settle(message);
    this.handleMessage(message);
  }

  /** Host side: a peer sent us a gameplay message. */
  hostHandle(peerId, message) {
    if (!this.room) return;
    if (message.type === 'join') {
      let player = this.room.get(peerId);
      if (!player) {
        const name = String(message.name || 'Player')
          .replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 20) || 'Player';
        player = this.room.add(peerId, name, { roomId: this.roomId, roomName: this.roomName });
      }
      this.peers.get(peerId)?.send(this.room.payload(player));
      return;
    }
    this.dispatch(this.room.handle(peerId, message));
  }

  /** Deliver the events produced by the room simulation. */
  dispatch(events) {
    for (const event of events) {
      if (event.to === '*') {
        for (const peer of this.peers.values()) peer.send(event.message);
        this.handleMessage(event.message);
      } else if (event.to === this.id) {
        this.handleMessage(event.message);
      } else {
        this.peers.get(event.to)?.send(event.message);
      }
    }
  }

  // ---------- transport ----------

  send(message) {
    if (this.isHost) {
      if (!this.room) return;
      this.dispatch(this.room.handle(this.id, message));
      return;
    }
    const peer = this.peers.get(this.connectedHost);
    peer?.send(message);
  }

  tick(dt) {
    const now = Date.now();
    this.heartbeat += dt;
    if (this.heartbeat >= 10) {
      this.heartbeat = 0;
      this.signalRaw({ type: 'ping' });
    }
    if (!this.isHost) {
      // Keep asking the host for a handshake until the data channel is up.
      if (this.connectedHost && !this.connectedPeerOpen() && now - this.lastReady > 2000) {
        this.lastReady = now;
        this.signal(this.connectedHost, { kind: 'ready' });
      }
      return;
    }
    if (!this.room) return;
    this.dispatch(this.room.tick(now));
    if (now - this.lastState < 50) return;
    this.lastState = now;
    const message = { type: 'state', players: this.room.snapshot() };
    for (const peer of this.peers.values()) peer.send(message);
    this.handleMessage(message);
  }

  dispose() {
    this.closed = true;
    clearTimeout(this.hostLostTimer);
    this.dropPeers();
    if (this.ws) { this.ws.onclose = null; this.ws.close(); }
    super.dispose();
  }
}
