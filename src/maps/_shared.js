/**
 * Shared map utilities: collision primitives, ray casting, walkable
 * grid/nav-graph generation, and a small set of decorative helpers
 * used by every map.
 */
import * as THREE from 'three';

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

  if (hitAxis === -1) return null;
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

export function rayWorld(origin, dir, colliders, maxDist = 200) {
  let best = null;
  for (const box of colliders) {
    const hit = rayAABB(origin, dir, box, maxDist);
    if (hit && (!best || hit.t < best.t)) best = hit;
  }
  return best;
}

export function overlaps(a, b, eps = 1e-3) {
  return a.min.x < b.max.x - eps && a.max.x > b.min.x + eps &&
         a.min.y < b.max.y - eps && a.max.y > b.min.y + eps &&
         a.min.z < b.max.z - eps && a.max.z > b.min.z + eps;
}

export function box3(cx, cy, cz, w, h, d) {
  return new THREE.Box3(
    new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
    new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2)
  );
}

/**
 * Make a textured material with a per-instance repeat count so each box
 * gets the right texture density (avoids stretched planks on giant walls).
 */
export function makeTexturedMaterial(template, w, h, d, scale = 0.55) {
  const m = template.clone();
  if (m.map) {
    m.map = template.map.clone();
    m.map.needsUpdate = true;
    m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
    m.map.repeat.set(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    if (d > w) {
      m.map.repeat.set(Math.max(1, Math.round(d * scale)), Math.max(1, Math.round(h * scale)));
    }
  }
  return m;
}

/**
 * Auto-generate a nav graph from colliders. Returns the array of node
 * objects, each with .pos, .neighbors, .index — identical contract to
 * the original `buildWorld` so bots.js can stay unchanged.
 */
export function buildNavGraph(colliders, opts = {}) {
  const GRID = opts.grid ?? 3.0;
  const xMin = opts.xMin ?? -31.5;
  const xMax = opts.xMax ?? 31.6;
  const zMin = opts.zMin ?? -31.5;
  const zMax = opts.zMax ?? 31.6;
  const maxWalkableHeight = opts.maxWalkableHeight ?? 3.2;

  const probeBox = (x, y, z, r = 0.48, h = 1.7) => new THREE.Box3(
    new THREE.Vector3(x - r, y + 0.06, z - r),
    new THREE.Vector3(x + r, y + h, z + r)
  );

  function groundHeight(x, z) {
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
    if (g === null || g > maxWalkableHeight) return false;
    const box = probeBox(x, g, z);
    for (const c of colliders) {
      if (c.max.y <= g + 0.02) continue;
      if (overlaps(box, c)) return false;
    }
    return true;
  }

  const nodes = [];
  const nodeAt = new Map();
  for (let x = xMin; x <= xMax; x += GRID) {
    for (let z = zMin; z <= zMax; z += GRID) {
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
      const g = groundHeight(x, z);
      if (g === null || Math.abs(g - y) > 0.75) return false;
    }
    return true;
  }

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

  // Keep only the largest connected component.
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
  if (sizes.length) {
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

  return nodes;
}

/** Common addBox helper used by every map. */
export function makeAddBox(scene, colliders, materials) {
  return function addBox(cx, cy, cz, w, h, d, matName, { collide = true, shadow = true } = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, makeTexturedMaterial(materials[matName], w, h, d));
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collide) colliders.push(box3(cx, cy, cz, w, h, d));
    return mesh;
  };
}
