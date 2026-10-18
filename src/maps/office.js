/**
 * Office: a multi-room office building. Long hallways, glass-partitioned
 * offices, a server room in the back. Wood floors, plaster walls.
 */
import * as THREE from 'three';
import { concreteTexture, crateTexture, metalTexture, plasterTexture, woodFloorTexture } from '../textures.js';
import { box3, buildNavGraph, makeAddBox } from './_shared.js';

function makeMaterials() {
  return {
    concrete: new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.88, metalness: 0.05 }),
    crate: new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85, metalness: 0.04 }),
    metal: new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.55, metalness: 0.6 }),
    plaster: new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.9, metalness: 0.02 }),
    wood: new THREE.MeshStandardMaterial({ map: woodFloorTexture(), roughness: 0.78, metalness: 0.05 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc4ff, roughness: 0.05, metalness: 0.85, transparent: true, opacity: 0.4 }),
  };
}

export function build(scene) {
  const colliders = [];
  const materials = makeMaterials();
  const H = 6;
  const SZ = 48;

  // ---- wood floor ----
  {
    const fg = new THREE.PlaneGeometry(SZ * 2, SZ * 2);
    const fm = new THREE.MeshStandardMaterial({ map: woodFloorTexture(), roughness: 0.72, metalness: 0.05 });
    fm.map.repeat.set(8, 8);
    const floor = new THREE.Mesh(fg, fm);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    colliders.push(box3(0, -1, 0, SZ * 2, 2, SZ * 2));
  }

  const addBox = makeAddBox(scene, colliders, materials);

  // ---- outer walls ----
  addBox(0, H / 2, -SZ, SZ * 2, H, 1, 'plaster');
  addBox(0, H / 2,  SZ, SZ * 2, H, 1, 'plaster');
  addBox(-SZ, H / 2, 0, 1, H, SZ * 2, 'plaster');
  addBox( SZ, H / 2, 0, 1, H, SZ * 2, 'plaster');

  // ---- central hallway (z = 0..-8) with glass partitions on either side ----
  // glass partitions: not solid colliders, just visual cover. Use crate for
  // gameplay (still blocks bullets) since the engine uses AABB only.
  // West row of small offices (z = 0..10)
  for (let i = 0; i < 3; i++) {
    const cx = -16 + i * 12;
    addBox(cx, H / 2, 0, 0.4, H, 8, 'glass', { collide: false });
    addBox(cx, H / 2, 4, 8, H, 0.4, 'glass', { collide: false });
    addBox(cx, 0.6, 4, 8, 1.2, 0.4, 'wood', { collide: false });
    addBox(cx - 3.5, 0.7, 0, 1, 1.4, 1, 'crate');
    addBox(cx + 3.5, 0.7, 0, 1, 1.4, 1, 'crate');
  }
  // East row (mirror)
  for (let i = 0; i < 3; i++) {
    const cx = -16 + i * 12;
    addBox(cx, H / 2, 8, 0.4, H, 8, 'glass', { collide: false });
    addBox(cx, H / 2, 12, 8, H, 0.4, 'glass', { collide: false });
    addBox(cx, 0.6, 12, 8, 1.2, 0.4, 'wood', { collide: false });
    addBox(cx - 3.5, 0.7, 8, 1, 1.4, 1, 'crate');
    addBox(cx + 3.5, 0.7, 8, 1, 1.4, 1, 'crate');
  }

  // ---- central reception at the south (z = 16..24) ----
  addBox(-12, 1, 20, 0.8, 2, 14, 'wood');
  addBox(12, 1, 20, 0.8, 2, 14, 'wood');
  addBox(0, 1.4, 18, 16, 0.3, 1.2, 'crate');  // reception desk

  // ---- north server room (z = -22..-32) ----
  addBox(-12, H / 2, -28, 0.6, H, 12, 'metal');
  addBox(12, H / 2, -28, 0.6, H, 12, 'metal');
  addBox(0, H / 2, -22, 24, H, 0.6, 'metal');
  // server racks
  for (let i = -2; i <= 2; i++) {
    addBox(i * 5, 1, -27, 1.4, 2, 1.4, 'metal');
  }

  // ---- planter boxes (cover) in the hall ----
  addBox(-3, 0.6, -12, 2, 1.2, 2, 'crate');
  addBox(3, 0.6, -12, 2, 1.2, 2, 'crate');

  // ---- pillars ----
  for (const [x, z] of [[-22, -10], [22, -10], [-22, 14], [22, 14], [-22, 22], [22, 22]]) {
    addBox(x, H / 2, z, 1, H, 1, 'concrete');
  }

  const nodes = buildNavGraph(colliders);

  return {
    id: 'office',
    name: 'Office',
    description: 'Glass offices flank a central hall. Server room in the back, reception up front.',
    colliders,
    nodes,
    bounds: { min: -SZ, max: SZ },
    spawnsCT: [
      new THREE.Vector3(-2, 0, 26),
      new THREE.Vector3(2, 0, 26),
      new THREE.Vector3(-6, 0, 28),
      new THREE.Vector3(6, 0, 28),
      new THREE.Vector3(0, 0, 30),
    ],
    spawnsT: [
      new THREE.Vector3(-6, 0, -32),
      new THREE.Vector3(0, 0, -34),
      new THREE.Vector3(6, 0, -32),
      new THREE.Vector3(-2, 0, -36),
      new THREE.Vector3(2, 0, -36),
    ],
    ambient: { sky: 0xc8d2dc, fog: 0xc8d2dc, fogNear: 40, fogFar: 140, sun: 0xfff2dc, sunIntensity: 1.3, hemi: 0xc4d0e0, ground: 0x80684c, hemiIntensity: 0.7 },
  };
}
