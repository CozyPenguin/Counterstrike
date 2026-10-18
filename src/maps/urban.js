/**
 * Urban: a narrow city-block map with underpass tunnels, a courtyard,
 * and a multi-level parking garage interior.
 */
import * as THREE from 'three';
import { concreteTexture, crateTexture, metalTexture, plasterTexture } from '../textures.js';
import { box3, buildNavGraph, makeAddBox } from './_shared.js';

function makeMaterials() {
  return {
    concrete: new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.88, metalness: 0.05 }),
    crate: new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85, metalness: 0.04 }),
    metal: new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.55, metalness: 0.6 }),
    plaster: new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.9, metalness: 0.02 }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.95, metalness: 0.05 }),
  };
}

export function build(scene) {
  const colliders = [];
  const materials = makeMaterials();
  const H = 7;
  const SZ = 50;

  // ---- asphalt courtyard floor ----
  {
    const fg = new THREE.PlaneGeometry(SZ * 2, SZ * 2);
    const fm = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.95, metalness: 0.04 });
    fm.map.repeat.set(12, 12);
    const floor = new THREE.Mesh(fg, fm);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    colliders.push(box3(0, -1, 0, SZ * 2, 2, SZ * 2));
  }

  const addBox = makeAddBox(scene, colliders, materials);

  // ---- outer city walls (perimeter) ----
  addBox(0, H / 2, -SZ, SZ * 2, H, 1.2, 'plaster');
  addBox(0, H / 2,  SZ, SZ * 2, H, 1.2, 'plaster');
  addBox(-SZ, H / 2, 0, 1.2, H, SZ * 2, 'plaster');
  addBox( SZ, H / 2, 0, 1.2, H, SZ * 2, 'plaster');

  // ---- north underpass: lower corridor below ground level ----
  // Sides
  addBox(-12, 2, -28, 0.6, 4, 18, 'concrete');
  addBox(12, 2, -28, 0.6, 4, 18, 'concrete');
  addBox(0, 4, -19, 24, 0.4, 0.6, 'concrete');
  addBox(0, 4, -37, 24, 0.4, 0.6, 'concrete');
  // ramps down
  for (let i = 0; i < 4; i++) {
    const top = 4 - i * 1.0;
    addBox(-15, top / 2, -28 + (i - 2) * 1.2, 6, top, 1.2, 'concrete');
    addBox(15, top / 2, -28 + (i - 2) * 1.2, 6, top, 1.2, 'concrete');
  }

  // ---- central courtyard buildings (flanking the open area) ----
  // East building
  addBox(28, H / 2, 10, 10, H, 14, 'plaster');
  addBox(28, H / 2, 24, 10, H, 14, 'plaster');
  addBox(28, 2, 17, 1.2, 4, 1.2, 'plaster'); // door frame (open at center)
  // West building (mirror)
  addBox(-28, H / 2, 10, 10, H, 14, 'plaster');
  addBox(-28, H / 2, 24, 10, H, 14, 'plaster');
  addBox(-28, 2, 17, 1.2, 4, 1.2, 'plaster');

  // ---- south parking garage ----
  const parkH = 5;
  addBox(0, parkH / 2, 38, 26, parkH, 8, 'concrete');
  // internal pillars
  for (let i = 0; i < 3; i++) {
    addBox(-8 + i * 8, parkH / 2, 34, 0.8, parkH, 0.8, 'concrete');
  }
  // ramped up second level (ramp on the east side)
  addBox(11, 0.7, 38, 3, 1.4, 8, 'concrete');
  addBox(11, 2.1, 38, 3, 1.4, 8, 'concrete');
  addBox(11, 3.5, 38, 3, 1.4, 8, 'concrete');

  // car covers (large crate-like boxes) in parking garage
  addBox(-6, 0.7, 38, 1.6, 1.4, 3.4, 'crate');
  addBox(0, 0.7, 38, 1.6, 1.4, 3.4, 'crate');
  addBox(6, 0.7, 38, 1.6, 1.4, 3.4, 'crate');

  // ---- central open courtyard with planter boxes ----
  addBox(-3, 0.5, 6, 2, 1, 2, 'crate');
  addBox(3, 0.5, 6, 2, 1, 2, 'crate');
  addBox(0, 0.5, 16, 3, 1, 1.4, 'crate');

  // ---- underpass cover (crates inside the tunnel) ----
  addBox(-6, 0.85, -28, 1.6, 1.7, 1.6, 'crate');
  addBox(6, 0.85, -32, 1.6, 1.7, 1.6, 'crate');
  addBox(0, 0.85, -34, 3, 1.7, 1.6, 'crate');

  // ---- side alleys with dumpsters ----
  addBox(-44, 1, 12, 1.6, 2, 4, 'metal');
  addBox(-44, 1, 22, 1.6, 2, 4, 'metal');
  addBox(44, 1, 12, 1.6, 2, 4, 'metal');
  addBox(44, 1, 22, 1.6, 2, 4, 'metal');

  const nodes = buildNavGraph(colliders);

  return {
    id: 'urban',
    name: 'Underpass',
    description: 'Narrow city block with an underpass tunnel, courtyard, and parking garage.',
    colliders,
    nodes,
    bounds: { min: -SZ, max: SZ },
    spawnsCT: [
      new THREE.Vector3(-4, 0, 44),
      new THREE.Vector3(4, 0, 44),
      new THREE.Vector3(-8, 0, 46),
      new THREE.Vector3(8, 0, 46),
      new THREE.Vector3(0, 0, 48),
    ],
    spawnsT: [
      new THREE.Vector3(-6, 0, -44),
      new THREE.Vector3(0, 0, -46),
      new THREE.Vector3(6, 0, -44),
      new THREE.Vector3(-2, 0, -48),
      new THREE.Vector3(2, 0, -48),
    ],
    ambient: { sky: 0x6a7382, fog: 0x5a606a, fogNear: 40, fogFar: 150, sun: 0xfff2dc, sunIntensity: 1.1, hemi: 0x889098, ground: 0x3a3a3a, hemiIntensity: 0.6 },
  };
}
