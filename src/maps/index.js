/**
 * Map registry. Each map exports a `build(scene)` function that constructs
 * colliders, decoration, and the auto-generated nav graph. The active map
 * is chosen in the main menu.
 */
import * as dust from './dust.js';
import * as warehouse from './warehouse.js';
import * as office from './office.js';
import * as industrial from './industrial.js';
import * as urban from './urban.js';

export const MAPS = {
  dust: dust,
  warehouse: warehouse,
  office: office,
  industrial: industrial,
  urban: urban,
};

export const MAP_LIST = [
  { id: 'dust', name: 'Dustline', description: 'Two-site desert layout with mid lane and tunnels.' },
  { id: 'warehouse', name: 'Warehouse', description: 'Tight corridors and a mezzanine plant site.' },
  { id: 'office', name: 'Office', description: 'Glass offices, central hall, and a server room.' },
  { id: 'industrial', name: 'Refinery', description: 'Open yard with tanks, pipe corridor, and containers.' },
  { id: 'urban', name: 'Underpass', description: 'City block with underpass, courtyard, and parking garage.' },
];

export function buildMap(id, scene) {
  const mod = MAPS[id] || MAPS.dust;
  return mod.build(scene);
}
