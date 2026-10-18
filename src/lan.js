import * as THREE from 'three';
import { Bot } from './bots.js';

export class LANClient {
  constructor({ scene, world, onMessage, onClose }) {
    this.scene = scene; this.world = world;
    this.onMessage = onMessage; this.onClose = onClose;
    this.avatars = new Map(); this.players = []; this.elapsed = 0;
  }
  connect(name, room = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL('/lan', window.location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(url);
      let ready = false;
      const timeout = setTimeout(() => { this.ws.close(); reject(new Error('Connection timed out')); }, 8000);
      this.ws.onmessage = event => {
        const m = JSON.parse(event.data);
        if (m.type === 'welcome') {
          this.id = m.id; this.send({ type: 'join', name, ...room });
        } else if (m.type === 'error') {
          clearTimeout(timeout); reject(new Error(m.message)); this.ws.close();
        } else if (m.type === 'spawn' && !ready) {
          ready = true; clearTimeout(timeout); resolve(m);
        } else if (m.type === 'state') {
          this.players = m.players;
          const ids = new Set();
          for (const p of m.players) {
            if (p.id === this.id) continue;
            ids.add(p.id);
            let avatar = this.avatars.get(p.id);
            if (!avatar) {
              avatar = new Bot(this.scene, new THREE.Vector3(...p.pos), this.world, { name: p.name });
              this.avatars.set(p.id, avatar);
            }
            avatar.target = new THREE.Vector3(...p.pos);
            avatar.mesh.visible = p.hp > 0;
            avatar.mesh.rotation.y = p.yaw;
            avatar.mesh.scale.y = p.height / 1.75;
          }
          for (const [id, avatar] of this.avatars) if (!ids.has(id)) { avatar.dispose(); this.avatars.delete(id); }
          this.onMessage(m);
        } else this.onMessage(m);
      };
      this.ws.onclose = event => {
        clearTimeout(timeout);
        if (!ready) reject(new Error(event.reason || 'Could not connect to LAN server'));
        else this.onClose();
      };
      this.ws.onerror = () => {};
    });
  }
  send(message) {
    if (this.ws?.readyState === WebSocket.OPEN && this.ws.bufferedAmount < 65536) this.ws.send(JSON.stringify(message));
  }
  update(dt, player) {
    this.elapsed += dt;
    if (this.elapsed >= 0.05) {
      this.elapsed = 0;
      this.send({ type: 'move', pos: player.pos.toArray(), yaw: player.yaw, crouch: player.crouching });
    }
    for (const a of this.avatars.values()) a.mesh.position.lerp(a.target, Math.min(1, dt * 18));
  }
  dispose() {
    this.ws.onclose = null; this.ws.close();
    for (const a of this.avatars.values()) a.dispose();
    this.avatars.clear();
  }
}
