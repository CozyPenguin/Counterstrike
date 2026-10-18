import * as THREE from 'three';

/**
 * Pooled one-shot effects: tracers, impact puffs, blood, decals.
 *
 * `applyQuality(preset)` lets the host (main.js) cap the number of decals,
 * blood splatter count, spark count, and the muzzle flash sprite based on
 * the active graphics preset.
 */
export class Effects {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.live = [];

    // tracer template
    this.tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    this.tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffe6b0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.puffGeo = new THREE.SphereGeometry(0.13, 6, 5);
    this.puffMat = new THREE.MeshBasicMaterial({ color: 0xcfc4a8, transparent: true, opacity: 0.85, depthWrite: false });
    this.bloodMat = new THREE.MeshBasicMaterial({ color: 0xb22222, transparent: true, opacity: 0.9, depthWrite: false });

    this.decalGeo = new THREE.PlaneGeometry(0.16, 0.16);
    this.decalTex = this._makeDecalTexture();
    this.decalMat = new THREE.MeshBasicMaterial({
      map: this.decalTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.decals = [];
    this.maxDecals = 60;
    this.bloodCount = 7;
    this.sparkCount = 4;
    this.flashSprite = true;
  }

  applyQuality(preset) {
    this.maxDecals = preset.maxDecals;
    this.bloodCount = preset.bloodCount;
    this.sparkCount = preset.sparkCount;
    this.flashSprite = preset.flashSprite;
    // cull decals above the new cap
    while (this.decals.length > this.maxDecals) {
      const old = this.decals.shift();
      this.scene.remove(old);
      old.material.dispose();
    }
  }

  _makeDecalTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(18,14,10,0.95)');
    g.addColorStop(0.45, 'rgba(30,22,16,0.55)');
    g.addColorStop(1, 'rgba(40,30,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // chips
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(20,16,12,${0.3 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.arc(32 + (Math.random() - 0.5) * 22, 32 + (Math.random() - 0.5) * 22, 2 + Math.random() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  spawnTracer(from, to, color = 0xffe6b0) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.01) return;
    const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
    mesh.material.color.setHex(color);
    mesh.scale.z = len;
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.lookAt(to);
    this.scene.add(mesh);
    this.live.push({ mesh, life: 0.075, maxLife: 0.075, type: 'tracer' });
  }

  spawnImpact(point, normal) {
    // puff
    const puff = new THREE.Mesh(this.puffGeo, this.puffMat.clone());
    puff.position.copy(point).addScaledVector(normal, 0.06);
    this.scene.add(puff);
    this.live.push({
      mesh: puff, life: 0.32, maxLife: 0.32, type: 'puff',
      vel: normal.clone().multiplyScalar(1.1).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6)),
    });

    // sparks: configurable count (low quality = 0)
    for (let i = 0; i < this.sparkCount; i++) {
      const s = new THREE.Mesh(this.puffGeo, new THREE.MeshBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0.95, depthWrite: false }));
      s.scale.setScalar(0.22);
      s.position.copy(point);
      this.scene.add(s);
      this.live.push({
        mesh: s, life: 0.16 + Math.random() * 0.12, maxLife: 0.28, type: 'spark',
        vel: normal.clone().multiplyScalar(2 + Math.random() * 3).add(
          new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.4, (Math.random() - 0.5) * 3)
        ),
      });
    }

    this.spawnDecal(point, normal);
  }

  spawnDecal(point, normal) {
    const mesh = new THREE.Mesh(this.decalGeo, this.decalMat.clone());
    mesh.position.copy(point).addScaledVector(normal, 0.02);
    const look = new THREE.Vector3().copy(point).add(normal);
    mesh.lookAt(look);
    mesh.rotation.z = Math.random() * Math.PI * 2;
    this.scene.add(mesh);
    this.decals.push(mesh);
    if (this.decals.length > this.maxDecals) {
      const old = this.decals.shift();
      this.scene.remove(old);
      old.material.dispose();
    }
  }

  spawnBlood(point) {
    for (let i = 0; i < this.bloodCount; i++) {
      const b = new THREE.Mesh(this.puffGeo, this.bloodMat.clone());
      b.scale.setScalar(0.35 + Math.random() * 0.55);
      b.position.copy(point);
      this.scene.add(b);
      this.live.push({
        mesh: b, life: 0.28 + Math.random() * 0.22, maxLife: 0.5, type: 'blood',
        vel: new THREE.Vector3((Math.random() - 0.5) * 3.4, Math.random() * 2.6, (Math.random() - 0.5) * 3.4),
      });
    }
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.life -= dt;
      const k = Math.max(0, e.life / e.maxLife);

      if (e.type === 'tracer') {
        e.mesh.material.opacity = 0.9 * k;
      } else if (e.type === 'puff' || e.type === 'spark' || e.type === 'blood') {
        if (e.vel) {
          e.vel.y -= 6 * dt;
          e.mesh.position.addScaledVector(e.vel, dt);
        }
        e.mesh.material.opacity = k * (e.type === 'blood' ? 0.92 : 0.85);
        if (e.type === 'puff') e.mesh.scale.setScalar(1 + (1 - k) * 1.6);
      }

      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        if (e.mesh.material) e.mesh.material.dispose();
        if (e.type === 'spark') e.mesh.geometry.dispose();
        this.live.splice(i, 1);
      }
    }
  }

  clear() {
    for (const e of this.live) {
      this.scene.remove(e.mesh);
    }
    this.live.length = 0;
  }
}
