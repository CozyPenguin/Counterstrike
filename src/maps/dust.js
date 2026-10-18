/**
 * Dust-style two-site map: A site to the east, B site to the west, mid lane
 * between them. T spawns at the north, CT spawns at the south.
 */
import * as THREE from 'three';
import { sandTexture, concreteTexture, plasterTexture, crateTexture, metalTexture, woodFloorTexture } from '../textures.js';
import { box3, buildNavGraph, makeAddBox } from './_shared.js';

const FLOOR_SIZE = 70;
const WALL_H = 7;

function makeMaterials() {
  return {
    sand: new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 0.95, metalness: 0.02 }),
    plaster: new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.9, metalness: 0.02 }),
    concrete: new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.88, metalness: 0.05 }),
    crate: new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85, metalness: 0.04 }),
    metal: new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.55, metalness: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ map: woodFloorTexture(), roughness: 0.8, metalness: 0.05 }),
  };
}

function addFloor(scene, colliders, materials) {
  const floorGeo = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
  const floorMat = new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 0.96, metalness: 0.02 });
  floorMat.map.repeat.set(16, 16);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  colliders.push(box3(0, -1, 0, FLOOR_SIZE, 2, FLOOR_SIZE));
  return floor;
}

function addOuterWalls(scene, colliders, materials) {
  const H = WALL_H;
  const y = H / 2;
  const addBox = makeAddBox(scene, colliders, materials);
  addBox(0, y, -35, 72, H, 2, 'plaster');
  addBox(0, y, 35, 72, H, 2, 'plaster');
  addBox(-35, y, 0, 2, H, 72, 'plaster');
  addBox(35, y, 0, 2, H, 72, 'plaster');
}

function addLaneAndSiteWalls(scene, colliders, materials) {
  const H = WALL_H;
  const y = H / 2;
  const addBox = makeAddBox(scene, colliders, materials);
  // mid lane walls
  addBox(-9, y, -17, 1.2, H, 14, 'plaster');
  addBox(9, y, -17, 1.2, H, 14, 'plaster');
  // site separators with shorts gap
  addBox(-9, y, -5, 1.2, H, 10, 'plaster');
  addBox(-9, y, 9, 1.2, H, 6, 'plaster');
  addBox(9, y, -5, 1.2, H, 10, 'plaster');
  addBox(9, y, 9, 1.2, H, 6, 'plaster');
  // z = -10 wall
  addBox(-29.5, y, -10, 7, H, 1.2, 'plaster');
  addBox(-11.5, y, -10, 5, H, 1.2, 'plaster');
  addBox(11.5, y, -10, 5, H, 1.2, 'plaster');
  addBox(29.5, y, -10, 7, H, 1.2, 'plaster');
  // z = 12 wall
  addBox(-30.5, y, 12, 5, H, 1.2, 'plaster');
  addBox(-11, y, 12, 10, H, 1.2, 'plaster');
  addBox(11, y, 12, 10, H, 1.2, 'plaster');
  addBox(30.5, y, 12, 5, H, 1.2, 'plaster');
}

function addSites(scene, colliders, materials) {
  const addBox = makeAddBox(scene, colliders, materials);
  const platW = 9, platTop = 2.1, platZ = -2.25;
  for (const sx of [24, -24]) {
    addBox(sx, platTop / 2 - 0.01, platZ, platW, platTop, 7.5, 'concrete');
    for (let i = 0; i < 4; i++) {
      const top = (i + 1) * 0.525;
      const cz = 6.75 - i * 1.5;
      addBox(sx, top / 2 - 0.01, cz, platW, top, 1.5, 'concrete');
    }
  }
  // A site cover
  addBox(15.5, 0.85, -6.5, 1.7, 1.7, 1.7, 'crate');
  addBox(15.5, 2.55, -6.5, 1.7, 1.7, 1.7, 'crate');
  addBox(30, 0.85, 4, 1.7, 1.7, 1.7, 'crate');
  addBox(30, 2.55, 4, 1.7, 1.7, 1.7, 'crate');
  addBox(17, 0.85, 7.5, 1.7, 1.7, 1.7, 'crate');
  addBox(32, 0.85, -7, 1.7, 1.7, 1.7, 'crate');
  addBox(13, 1.0, 2, 2.0, 2.0, 2.0, 'metal');
  // B site cover (mirror)
  addBox(-15.5, 0.85, -6.5, 1.7, 1.7, 1.7, 'crate');
  addBox(-15.5, 2.55, -6.5, 1.7, 1.7, 1.7, 'crate');
  addBox(-30, 0.85, 4, 1.7, 1.7, 1.7, 'crate');
  addBox(-30, 2.55, 4, 1.7, 1.7, 1.7, 'crate');
  addBox(-17, 0.85, 7.5, 1.7, 1.7, 1.7, 'crate');
  addBox(-32, 0.85, -7, 1.7, 1.7, 1.7, 'crate');
  addBox(-13, 1.0, 2, 2.0, 2.0, 2.0, 'metal');
  addBox(-21, WALL_H / 2, 8, 1.6, WALL_H, 1.6, 'concrete');
  addBox(-27, WALL_H / 2, -8, 1.6, WALL_H, 1.6, 'concrete');
}

function addMidAndLanes(scene, colliders, materials) {
  const addBox = makeAddBox(scene, colliders, materials);
  // mid
  addBox(0, 0.85, -2, 1.7, 1.7, 1.7, 'crate');
  addBox(0, 2.55, -2, 1.7, 1.7, 1.7, 'crate');
  addBox(-4.5, 0.7, 8, 3.2, 1.4, 1.2, 'concrete');
  addBox(4.5, 0.7, -8, 3.2, 1.4, 1.2, 'concrete');
  // long A
  addBox(26, 0.85, -20, 1.7, 1.7, 1.7, 'crate');
  addBox(26, 2.55, -20, 1.7, 1.7, 1.7, 'crate');
  addBox(16, 0.85, -16, 1.7, 1.7, 1.7, 'crate');
  addBox(31, 1.0, -24, 2.0, 2.0, 2.0, 'metal');
  // B tunnels
  addBox(-26, 0.85, -20, 1.7, 1.7, 1.7, 'crate');
  addBox(-26, 2.55, -20, 1.7, 1.7, 1.7, 'crate');
  addBox(-16, 0.85, -16, 1.7, 1.7, 1.7, 'crate');
  addBox(-31, 1.0, -24, 2.0, 2.0, 2.0, 'metal');
  addBox(-20, WALL_H / 2, -14, 1.2, WALL_H, 7, 'plaster');
  // spawns
  addBox(-8, 0.85, -28, 1.7, 1.7, 1.7, 'crate');
  addBox(8, 0.85, -28, 1.7, 1.7, 1.7, 'crate');
  addBox(0, 0.7, -31, 6, 1.4, 1.2, 'concrete');
  addBox(-8, 0.85, 22, 1.7, 1.7, 1.7, 'crate');
  addBox(8, 0.85, 22, 1.7, 1.7, 1.7, 'crate');
  addBox(-16, 0.85, 28, 1.7, 1.7, 1.7, 'crate');
  addBox(16, 0.85, 28, 1.7, 1.7, 1.7, 'crate');
  addBox(0, 0.7, 26, 8, 1.4, 1.2, 'concrete');
}

export function build(scene) {
  const colliders = [];
  const materials = makeMaterials();
  addFloor(scene, colliders, materials);
  addOuterWalls(scene, colliders, materials);
  addLaneAndSiteWalls(scene, colliders, materials);
  addSites(scene, colliders, materials);
  addMidAndLanes(scene, colliders, materials);
  const nodes = buildNavGraph(colliders);

  return {
    id: 'dust',
    name: 'Dustline',
    description: 'Two sites, mid lane, long A and B tunnels.',
    colliders,
    nodes,
    bounds: { min: -35, max: 35 },
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
    ambient: { sky: 0x9db9cf, fog: 0xbcc9c8, fogNear: 55, fogFar: 165, sun: 0xfff2dc, sunIntensity: 1.75, hemi: 0xa8c4dd, ground: 0xb89f72, hemiIntensity: 0.95 },
  };
}
