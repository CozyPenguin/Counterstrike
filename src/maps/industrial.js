/**
 * Industrial: an outdoor refinery/yard. Big open central area with
 * cylindrical tanks, an elevated pipe corridor, and a container maze.
 */
import * as THREE from 'three';
import { sandTexture, concreteTexture, plasterTexture, crateTexture, metalTexture } from '../textures.js';
import { box3, buildNavGraph, makeAddBox } from './_shared.js';

function makeMaterials() {
  return {
    sand: new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 0.95, metalness: 0.02 }),
    concrete: new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.88, metalness: 0.05 }),
    plaster: new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.9, metalness: 0.02 }),
    crate: new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85, metalness: 0.04 }),
    metal: new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.5, metalness: 0.7 }),
    rusty: new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.7, metalness: 0.4 }),
  };
}

function addTank(scene, colliders, mat, cx, cz, r, h) {
  const seg = 12;
  const geo = new THREE.CylinderGeometry(r, r, h, seg);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, h / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  // Approximate AABB collider (slightly inset)
  const ar = r * 0.95;
  colliders.push(box3(cx, h / 2, cz, ar * 2, h, ar * 2));
  return mesh;
}

export function build(scene) {
  const colliders = [];
  const materials = makeMaterials();
  const H = 7;
  const SZ = 50;

  // ---- sandy ground ----
  {
    const fg = new THREE.PlaneGeometry(SZ * 2, SZ * 2);
    const fm = new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 0.96, metalness: 0.02 });
    fm.map.repeat.set(14, 14);
    const floor = new THREE.Mesh(fg, fm);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    colliders.push(box3(0, -1, 0, SZ * 2, 2, SZ * 2));
  }

  // ---- low perimeter fence (concrete wall segments) ----
  const fenceH = 3.5;
  const fenceY = fenceH / 2;
  // We use addBox for the fence but with a small scale: each "picket" segment
  // is short, with a small gap (shootable slits). Implementation: solid
  // boxes around the perimeter (simpler and still gives cover).
  const addBox = makeAddBox(scene, colliders, materials);
  addBox(0, fenceY, -SZ + 1, SZ * 2, fenceH, 1, 'concrete');
  addBox(0, fenceY,  SZ - 1, SZ * 2, fenceH, 1, 'concrete');
  addBox(-SZ + 1, fenceY, 0, 1, fenceH, SZ * 2, 'concrete');
  addBox( SZ - 1, fenceY, 0, 1, fenceH, SZ * 2, 'concrete');

  // ---- central elevated pipe corridor (north) ----
  const pipeH = 4.5;
  addBox(0, pipeH / 2, -10, 24, pipeH, 3, 'metal');
  // ramp up to pipe
  for (let i = 0; i < 3; i++) {
    const top = pipeH - i * 0.9;
    addBox(-14 - i * 0.6, top / 2, -10 + (i - 1) * 0.4, 6, top, 3, 'metal');
  }
  // pillars under pipe
  addBox(-9, pipeH / 2, -10, 1, pipeH, 1, 'concrete');
  addBox(9, pipeH / 2, -10, 1, pipeH, 1, 'concrete');

  // ---- oil tanks scattered in the middle ----
  addTank(scene, colliders, materials.rusty, -16,  8, 3, 6);
  addTank(scene, colliders, materials.metal, -16, 18, 3, 6);
  addTank(scene, colliders, materials.rusty,  16,  8, 3, 6);
  addTank(scene, colliders, materials.metal,  16, 18, 3, 6);
  addTank(scene, colliders, materials.rusty,   0, 12, 2.5, 5);

  // ---- south container maze ----
  // 4 rows of stacked containers forming corridors
  for (let row = 0; row < 2; row++) {
    const z = 32 + row * 4;
    for (let i = 0; i < 4; i++) {
      const x = -15 + i * 10;
      const h = (i % 2 === 0) ? 2.6 : 2.6;
      addBox(x, h / 2, z, 4, h, 2.6, 'crate');
    }
  }
  // gap corridors between rows
  addBox(0, 0.85, 30, 1.6, 1.7, 1.6, 'crate');
  addBox(0, 2.55, 30, 1.6, 1.7, 1.6, 'crate');

  // ---- control building (a small plaster box) ----
  addBox(-26, 1.5, 24, 4, 3, 4, 'plaster');
  addBox(-26, 4, 24, 4, 1, 4, 'concrete');
  addBox(-26.8, 1.5, 21.5, 0.6, 3, 1, 'metal'); // door frame
  // Window slits (decoration, no collider)
  addBox(-26, 2.5, 22.1, 0.05, 0.6, 1.2, 'metal', { collide: false, shadow: false });

  // ---- pumpjack (decorative) ----
  addBox(20, 1.5, -20, 2, 1, 5, 'metal');
  addBox(20, 3.5, -22, 0.4, 2, 1, 'rusty');

  // ---- sandbag wall near center for cover ----
  addBox(0, 0.4, -2, 4, 0.8, 0.6, 'concrete');
  addBox(0, 1.0, -2, 4, 0.4, 0.6, 'concrete');

  const nodes = buildNavGraph(colliders);

  return {
    id: 'industrial',
    name: 'Refinery',
    description: 'Open yard with oil tanks, an elevated pipe corridor, and a container maze.',
    colliders,
    nodes,
    bounds: { min: -SZ, max: SZ },
    spawnsCT: [
      new THREE.Vector3(-4, 0, 42),
      new THREE.Vector3(4, 0, 42),
      new THREE.Vector3(-10, 0, 44),
      new THREE.Vector3(10, 0, 44),
      new THREE.Vector3(0, 0, 46),
    ],
    spawnsT: [
      new THREE.Vector3(-8, 0, -42),
      new THREE.Vector3(0, 0, -44),
      new THREE.Vector3(8, 0, -42),
      new THREE.Vector3(-2, 0, -46),
      new THREE.Vector3(2, 0, -46),
    ],
    ambient: { sky: 0xc0a878, fog: 0xc4a880, fogNear: 50, fogFar: 170, sun: 0xffe8c0, sunIntensity: 1.9, hemi: 0xc4a880, ground: 0xb89f72, hemiIntensity: 0.8 },
  };
}
