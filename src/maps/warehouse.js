/**
 * Warehouse: a tight, square industrial building. Two-story interior with
 * ramps up to a mezzanine. Single bomb site, narrow corridors.
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
    wood: new THREE.MeshStandardMaterial({ map: woodFloorTexture(), roughness: 0.8, metalness: 0.05 }),
    polished: new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.45, metalness: 0.3 }),
  };
}

export function build(scene) {
  const colliders = [];
  const materials = makeMaterials();
  const H = 6;
  const SZ = 50; // square building half-width

  // ---- floor: polished concrete ----
  {
    const fg = new THREE.PlaneGeometry(SZ * 2, SZ * 2);
    const fm = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.78, metalness: 0.08 });
    fm.map.repeat.set(10, 10);
    const floor = new THREE.Mesh(fg, fm);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    colliders.push(box3(0, -1, 0, SZ * 2, 2, SZ * 2));
  }

  // ---- outer walls (warehouse has 12m tall envelope) ----
  const addBox = makeAddBox(scene, colliders, materials);
  addBox(0, H / 2, -SZ, SZ * 2, H, 1.2, 'metal');
  addBox(0, H / 2,  SZ, SZ * 2, H, 1.2, 'metal');
  addBox(-SZ, H / 2, 0, 1.2, H, SZ * 2, 'metal');
  addBox( SZ, H / 2, 0, 1.2, H, SZ * 2, 'metal');

  // ---- interior partitions ----
  // South wall with two corridors
  addBox(0, 3, 18, 22, H, 1, 'plaster');           // top bar
  addBox(-15, 3, 18, 12, H, 1, 'plaster');         // left bar
  addBox(15, 3, 18, 12, H, 1, 'plaster');          // right bar
  // gaps at x = -8..-3 (west door) and x = 3..8 (east door)

  // Central office pod
  addBox(-9, 2, 4, 1, 4, 12, 'plaster');
  addBox( 9, 2, 4, 1, 4, 12, 'plaster');
  addBox(0, 2, -2, 18, 4, 1, 'plaster');

  // West storage room divider
  addBox(-15, 2, 0, 1, 4, 16, 'plaster');
  // East loading bay divider
  addBox(15, 2, 0, 1, 4, 16, 'plaster');

  // ---- crates / pillars ----
  // West storage room
  addBox(-21, 0.85, -6, 1.8, 1.7, 1.8, 'crate');
  addBox(-21, 2.55, -6, 1.8, 1.7, 1.8, 'crate');
  addBox(-19, 0.85,  4, 1.8, 1.7, 1.8, 'crate');
  addBox(-22, 0.85, 10, 1.8, 1.7, 1.8, 'crate');
  addBox(-19, 2.55, 10, 1.8, 1.7, 1.8, 'crate');

  // East loading bay
  addBox(19, 0.85, -8, 2.2, 1.7, 2.2, 'crate');
  addBox(21, 0.85,  2, 1.8, 1.7, 1.8, 'crate');
  addBox(21, 2.55,  2, 1.8, 1.7, 1.8, 'crate');
  addBox(19, 0.85,  8, 1.8, 1.7, 1.8, 'crate');

  // Pillars
  for (const [x, z] of [[-22, -18], [22, -18], [-22, 18], [22, 18], [-22, 0], [22, 0]]) {
    addBox(x, H / 2, z, 1.2, H, 1.2, 'concrete');
  }

  // Mezzanine ramp (raised platform in the north)
  const mezzH = 2.4;
  addBox(0, mezzH / 2, -14, 28, mezzH, 10, 'wood');
  // ramp from mezz to floor (gentle slope modeled as a step)
  addBox(-7, 1.2, -7, 14, 2.4, 1, 'wood');
  addBox(0, 0.6, -7, 14, 1.2, 1, 'wood');

  // Crates on the mezzanine ("plant site")
  addBox(-4, mezzH + 0.85, -14, 1.8, 1.7, 1.8, 'crate');
  addBox(4, mezzH + 0.85, -16, 1.8, 1.7, 1.8, 'crate');
  addBox(0, mezzH + 0.85, -10, 1.8, 1.7, 1.8, 'crate');
  addBox(-2, mezzH + 2.55, -10, 1.6, 1.6, 1.6, 'metal');

  // Catwalk rail (cosmetic, low barrier)
  addBox(-12, mezzH + 0.7, -10, 1, 1.4, 12, 'metal');
  addBox(12, mezzH + 0.7, -10, 1, 1.4, 12, 'metal');

  const nodes = buildNavGraph(colliders);

  return {
    id: 'warehouse',
    name: 'Warehouse',
    description: 'Tight corridors, two storage rooms, a plant site on the mezzanine.',
    colliders,
    nodes,
    bounds: { min: -SZ, max: SZ },
    spawnsCT: [
      new THREE.Vector3(-2, 0, 22),
      new THREE.Vector3(2, 0, 22),
      new THREE.Vector3(-6, 0, 24),
      new THREE.Vector3(6, 0, 24),
      new THREE.Vector3(0, 0, 26),
    ],
    spawnsT: [
      new THREE.Vector3(-6, 0, -22),
      new THREE.Vector3(0, 0, -22),
      new THREE.Vector3(6, 0, -22),
      new THREE.Vector3(-2, 0, -24),
      new THREE.Vector3(2, 0, -24),
    ],
    ambient: { sky: 0x4a4a52, fog: 0x4a4a52, fogNear: 30, fogFar: 110, sun: 0xfff2dc, sunIntensity: 0.9, hemi: 0x7780a0, ground: 0x4a4a52, hemiIntensity: 0.55 },
  };
}
