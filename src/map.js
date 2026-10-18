/**
 * Re-exports of the shared map utilities plus a thin `buildWorld(scene, id)`
 * that delegates to the maps registry.
 *
 * Existing code (player.js, bots.js, effects.js, smoke.mjs) imports
 * `rayAABB`, `rayWorld`, `overlaps`, and `buildWorld` from this module —
 * we keep that surface stable.
 */
export { rayAABB, rayWorld, overlaps, box3, buildNavGraph } from './maps/_shared.js';
import { buildMap } from './maps/index.js';

export function buildWorld(scene, mapId = 'dust') {
  return buildMap(mapId, scene);
}
