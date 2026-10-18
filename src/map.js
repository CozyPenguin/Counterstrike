import * as THREE from 'three';
import { sandTexture, concreteTexture, plasterTexture, crateTexture, metalTexture, woodFloorTexture } from './textures.js';

/**
 * Ray vs AABB (slab method). Returns { t, point, normal } or null.
 */
export function rayAABB(origin, dir, box, maxDist = Infinity) {
  let tmin = 0;
  let tmax = maxDist;
  let hitAxis = -1;
  let hitSign = 1;

  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  const min = [box.min.x, box.min.y, box.min.z];
  const max = [box.max.x, box.max.y, box.max.z];

  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
      continue;
    }
    const inv = 1 / d[a];
    let t1 = (min[a] - o[a]) * inv;
    let t2 = (max[a] - o[a]) * inv;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1; t1 = t2; t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      hitAxis = a;
      hitSign = sign;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  if (hitAxis === -1) return null; // started inside or parallel miss
  const point = new THREE.Vector3(
    origin.x + dir.x * tmin,
    origin.y + dir.y * tmin,
    origin.z + dir.z * tmin
  );
  const normal = new THREE.Vector3();
  if (hitAxis === 0) normal.x = hitSign;
  else if (hitAxis === 1) normal.y = hitSign;
  else normal.z = hitSign;
  return { t: tmin, point, normal };
}

/** Nearest world hit along a ray. */
export function rayWorld(origin, dir, colliders, maxDist = 200) {
  let best = null;
  for (const box of colliders) {
    const hit = rayAABB(origin, dir, box, maxDist);
    if (hit && (!best || hit.t < best.t)) {
      best = hit;
    }
  }
  return best;
}

/**
 * Genuine-overlap test (unlike Box3.intersectsBox, touching faces do NOT count).
 */
export function overlaps(a, b, eps = 1e-3) {
  return a.min.x < b.max.x - eps && a.max.x > b.min.x + eps &&
         a.min.y < b.max.y - eps && a.max.y > b.min.y + eps &&
         a.min.z < b.max.z - eps && a.max.z > b.min.z + eps;
}

function box3(cx, cy, cz, w, h, d) {
  return new THREE.Box3(
    new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
    new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2)
  );
}

export function buildWorld(scene) {
  const colliders = [];
  const sand = new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 0.95, metalness: 0.02 });
  const plaster = new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.9, metalness: 0.02 });
  const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.88, metalness: 0.05 });
  const crate = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85, metalness: 0.04 });
  const metal = new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.55, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ map: woodFloorTexture(), roughness: 0.8, metalness: 0.05 });

  const wallTexRepeat = new Map();
  function texFor(mat, w, h, d, scale = 0.55) {
    // Clone material so each box can set its own texture repeat.
    const m = mat.clone();
    if (m.map) {
      m.map = mat.map.clone();
      m.map.needsUpdate = true;
      m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
      m.map.repeat.set(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
      if (d > w) {
        m.map.repeat.set(Math.max(1, Math.round(d * scale)), Math.max(1, Math.round(h * scale)));
      }
    }
    return m;
  }

  function addBox(cx, cy, cz, w, h, d, mat, { collide = true, shadow = true } = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, texFor(mat, w, h, d));
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collide) colliders.push(box3(cx, cy, cz, w, h, d));
    return mesh;
  }

  // ---------- Floor ----------
  const floorGeo = new THREE.PlaneGeometry(70, 70);
  const floorMat = new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 0.96, metalness: 0.02 });
  floorMat.map.repeat.set(16, 16);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // Floor collider: thick slab under the map.
  colliders.push(box3(0, -1, 0, 70, 2, 70));

  // ---------- Outer walls ----------
  const H = 7;   // wall height
  const y = H / 2;
  addBox(0, y, -35, 72, H, 2, plaster);
  addBox(0, y, 35, 72, H, 2, plaster);
  addBox(-35, y, 0, 2, H, 72, plaster);
  addBox(35, y, 0, 2, H, 72, plaster);

  // ---------- Mid lane walls (x = ±9, z in upper half) ----------
  addBox(-9, y, -17, 1.2, H, 14, plaster); // z -24..-10
  addBox(9, y, -17, 1.2, H, 14, plaster);

  // ---------- Site separators (x = ±9, z in -10..12), gap z 0..6 = shorts ----------
  addBox(-9, y, -5, 1.2, H, 10, plaster);  // z -10..0
  addBox(-9, y, 9, 1.2, H, 6, plaster);    // z 6..12
  addBox(9, y, -5, 1.2, H, 10, plaster);
  addBox(9, y, 9, 1.2, H, 6, plaster);

  // ---------- z = -10 wall between upper lanes and sites ----------
  addBox(-29.5, y, -10, 7, H, 1.2, plaster); // x -33..-26  (B tunnel mouth open x -26..-14)
  addBox(-11.5, y, -10, 5, H, 1.2, plaster); // x -14..-9
  addBox(11.5, y, -10, 5, H, 1.2, plaster);  // x 9..14
  addBox(29.5, y, -10, 7, H, 1.2, plaster);  // x 26..33 (long mouth open x 14..26)

  // ---------- z = 12 wall between sites and CT spawn ----------
  addBox(-30.5, y, 12, 5, H, 1.2, plaster); // x -33..-28
  addBox(-11, y, 12, 10, H, 1.2, plaster);  // x -16..-6  (B door open x -28..-16)
  addBox(11, y, 12, 10, H, 1.2, plaster);   // x 6..16   (A door open x 16..28)
  addBox(30.5, y, 12, 5, H, 1.2, plaster);  // x 28..33

  // ---------- A site plateau (with stairs on the south side) ----------
  const platW = 9, platTop = 2.1, platZ = -2.25;
  addBox(24, platTop / 2 - 0.01, platZ, platW, platTop, 7.5, concrete);
  // stairs: 4 steps of 0.525 each, z from 7.5 up to 1.5
  for (let i = 0; i < 4; i++) {
    const top = (i + 1) * 0.525;
    const cz = 6.75 - i * 1.5;
    addBox(24, top / 2 - 0.01, cz, platW, top, 1.5, concrete);
  }

  // A site cover
  addBox(15.5, 0.85, -6.5, 1.7, 1.7, 1.7, crate);   // single crate
  addBox(15.5, 2.55, -6.5, 1.7, 1.7, 1.7, crate);   // stacked crate
  addBox(30, 0.85, 4, 1.7, 1.7, 1.7, crate);
  addBox(30, 2.55, 4, 1.7, 1.7, 1.7, crate);
  addBox(17, 0.85, 7.5, 1.7, 1.7, 1.7, crate);
  addBox(32, 0.85, -7, 1.7, 1.7, 1.7, crate);
  addBox(13, 1.0, 2, 2.0, 2.0, 2.0, metal);

  // ---------- B site plateau (mirror) ----------
  addBox(-24, platTop / 2 - 0.01, platZ, platW, platTop, 7.5, concrete);
  for (let i = 0; i < 4; i++) {
    const top = (i + 1) * 0.525;
    const cz = 6.75 - i * 1.5;
    addBox(-24, top / 2 - 0.01, cz, platW, top, 1.5, concrete);
  }

  // B site cover
  addBox(-15.5, 0.85, -6.5, 1.7, 1.7, 1.7, crate);
  addBox(-15.5, 2.55, -6.5, 1.7, 1.7, 1.7, crate);
  addBox(-30, 0.85, 4, 1.7, 1.7, 1.7, crate);
  addBox(-30, 2.55, 4, 1.7, 1.7, 1.7, crate);
  addBox(-17, 0.85, 7.5, 1.7, 1.7, 1.7, crate);
  addBox(-32, 0.85, -7, 1.7, 1.7, 1.7, crate);
  addBox(-13, 1.0, 2, 2.0, 2.0, 2.0, metal);
  // pillars
  addBox(-21, y, 8, 1.6, H, 1.6, concrete);
  addBox(-27, y, -8, 1.6, H, 1.6, concrete);

  // ---------- Mid cover ----------
  addBox(0, 0.85, -2, 1.7, 1.7, 1.7, crate);
  addBox(0, 2.55, -2, 1.7, 1.7, 1.7, crate);
  addBox(-4.5, 0.7, 8, 3.2, 1.4, 1.2, concrete); // low wall
  addBox(4.5, 0.7, -8, 3.2, 1.4, 1.2, concrete);

  // ---------- Long A cover ----------
  addBox(26, 0.85, -20, 1.7, 1.7, 1.7, crate);
  addBox(26, 2.55, -20, 1.7, 1.7, 1.7, crate);
  addBox(16, 0.85, -16, 1.7, 1.7, 1.7, crate);
  addBox(31, 1.0, -24, 2.0, 2.0, 2.0, metal);

  // ---------- B tunnels cover ----------
  addBox(-26, 0.85, -20, 1.7, 1.7, 1.7, crate);
  addBox(-26, 2.55, -20, 1.7, 1.7, 1.7, crate);
  addBox(-16, 0.85, -16, 1.7, 1.7, 1.7, crate);
  addBox(-31, 1.0, -24, 2.0, 2.0, 2.0, metal);
  addBox(-20, y, -14, 1.2, H, 7, plaster); // interior tunnel wall

  // ---------- T spawn cover ----------
  addBox(-8, 0.85, -28, 1.7, 1.7, 1.7, crate);
  addBox(8, 0.85, -28, 1.7, 1.7, 1.7, crate);
  addBox(0, 0.7, -31, 6, 1.4, 1.2, concrete);

  // ---------- CT spawn cover ----------
  addBox(-8, 0.85, 22, 1.7, 1.7, 1.7, crate);
  addBox(8, 0.85, 22, 1.7, 1.7, 1.7, crate);
  addBox(-16, 0.85, 28, 1.7, 1.7, 1.7, crate);
  addBox(16, 0.85, 28, 1.7, 1.7, 1.7, crate);
  addBox(0, 0.7, 26, 8, 1.4, 1.2, concrete);

  // ---------- Nav graph (auto-generated walkable grid) ----------
  // Sample a grid across the map; keep cells where a player-sized body fits
  // and there is ground below. Link orthogonal/diagonal neighbors whose
  // connecting edge is walkable. This routes around crates automatically.
  const probeBox = (x, y, z, r = 0.48, h = 1.7) => new THREE.Box3(
    new THREE.Vector3(x - r, y + 0.06, z - r),
    new THREE.Vector3(x + r, y + h, z + r)
  );

  function groundHeight(x, z) {
    // cast a ray down from above; returns ground y or null if over a hole
    const origin = new THREE.Vector3(x, 6, z);
    const dir = new THREE.Vector3(0, -1, 0);
    let best = null;
    for (const c of colliders) {
      const hit = rayAABB(origin, dir, c, 7);
      if (hit && (best === null || hit.point.y > best)) best = hit.point.y;
    }
    return best;
  }

  function walkable(x, z) {
    const g = groundHeight(x, z);
    if (g === null || g > 3.2) return false;
    const box = probeBox(x, g, z);
    for (const c of colliders) {
      // ignore the floor slab (its top is the ground itself)
      if (c.max.y <= g + 0.02) continue;
      if (overlaps(box, c)) return false;
    }
    return true;
  }

  const nodes = [];
  const nodeAt = new Map();
  const GRID = 3.0;
  for (let x = -31.5; x <= 31.6; x += GRID) {
    for (let z = -31.5; z <= 31.6; z += GRID) {
      if (!walkable(x, z)) continue;
      const g = groundHeight(x, z);
      const n = { pos: new THREE.Vector3(x, g, z), neighbors: [], index: nodes.length };
      nodeAt.set(`${Math.round(x * 10)}:${Math.round(z * 10)}`, n.index);
      nodes.push(n);
    }
  }

  function edgeWalkable(a, b) {
    const dist = a.pos.distanceTo(b.pos);
    const steps = Math.max(2, Math.ceil(dist / 0.7));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a.pos.x + (b.pos.x - a.pos.x) * t;
      const z = a.pos.z + (b.pos.z - a.pos.z) * t;
      const y = a.pos.y + (b.pos.y - a.pos.y) * t;
      const box = probeBox(x, y, z, 0.4, 1.4);
      for (const c of colliders) {
        if (c.max.y <= Math.min(a.pos.y, b.pos.y) + 0.02) continue;
        if (overlaps(box, c)) return false;
      }
      // don't walk off cliffs: ground must exist near edge height
      const g = groundHeight(x, z);
      if (g === null || Math.abs(g - y) > 0.75) return false;
    }
    return true;
  }

  // 8-directional links between grid neighbors
  const key = (i, j) => `${i}-${j}`;
  const edgeSet = new Set();
  function tryLink(i, j) {
    if (i === j || edgeSet.has(key(i, j))) return;
    const a = nodes[i], b = nodes[j];
    const d = a.pos.distanceTo(b.pos);
    if (d > GRID * 1.6) return;
    if (!edgeWalkable(a, b)) return;
    a.neighbors.push(j);
    b.neighbors.push(i);
    edgeSet.add(key(i, j));
    edgeSet.add(key(j, i));
  }
  for (const n of nodes) {
    for (const [dx, dz] of [[GRID, 0], [0, GRID], [GRID, GRID], [GRID, -GRID]]) {
      const kx = Math.round((n.pos.x + dx) * 10);
      const kz = Math.round((n.pos.z + dz) * 10);
      const j = nodeAt.get(`${kx}:${kz}`);
      if (j !== undefined) tryLink(n.index, j);
    }
  }

  // Tidy: keep only the largest connected component, then reindex.
  {
    const comp = new Array(nodes.length).fill(-1);
    let compId = 0;
    const sizes = [];
    for (const n of nodes) {
      if (comp[n.index] !== -1) continue;
      const q = [n.index];
      comp[n.index] = compId;
      let size = 0;
      while (q.length) {
        const cur = q.pop();
        size++;
        for (const nb of nodes[cur].neighbors) {
          if (comp[nb] === -1) { comp[nb] = compId; q.push(nb); }
        }
      }
      sizes.push(size);
      compId++;
    }
    const bestComp = sizes.indexOf(Math.max(...sizes));
    const remap = new Map();
    const kept = nodes.filter((n) => comp[n.index] === bestComp);
    kept.forEach((n, i) => remap.set(n.index, i));
    for (const n of kept) {
      n.neighbors = n.neighbors.map((j) => remap.get(j)).filter((j) => j !== undefined);
    }
    kept.forEach((n, i) => { n.index = i; });
    nodes.length = 0;
    nodes.push(...kept);
  }

  return {
    colliders,
    nodes,
    rayWorld: (origin, dir, maxDist) => rayWorld(origin, dir, colliders, maxDist),
    spawnsCT: [
      new THREE.Vector3(-4, 0, 22),
      new THREE.Vector3(4, 0, 22),
      new THREE.Vector3(-10, 0, 25),
      new THREE.Vector3(10, 0, 25),
      new THREE.Vector3(0, 0, 28),
    ],
    spawnsT: [
      new THREE.Vector3(-10, 0, -28),
      new THREE.Vector3(-5, 0, -30),
      new THREE.Vector3(0, 0, -28),
      new THREE.Vector3(5, 0, -30),
      new THREE.Vector3(10, 0, -28),
    ],
  };
}
