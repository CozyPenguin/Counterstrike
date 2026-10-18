/**
 * Graphics / gameplay settings. Persists to localStorage.
 *
 * Quality presets:
 *   - low     : no shadows, smallest shadow map, bilinear, 1x pixel ratio,
 *               short fog, no blood decals, no muzzle flash sprite.
 *   - medium  : PCF soft shadows @ 1024, bilinear + 4x aniso, 1.5x pixel ratio,
 *               medium fog, half-decals, basic flash.
 *   - high    : PCF soft shadows @ 2048, trilinear + 8x aniso, capped 2x pixel
 *               ratio, full fog, full decals, full flash + sparks.
 */
const KEY = 'counterstrike:settings:v1';

export const QUALITY_PRESETS = {
  low: {
    pixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    shadowType: 'basic',
    anisotropy: 1,
    fogNear: 30,
    fogFar: 110,
    maxDecals: 18,
    bloodCount: 3,
    sparkCount: 0,
    flashSprite: false,
    effectsPool: 28,
    skyDetail: 8,
  },
  medium: {
    pixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    shadowType: 'pcfsoft',
    anisotropy: 4,
    fogNear: 45,
    fogFar: 140,
    maxDecals: 45,
    bloodCount: 5,
    sparkCount: 2,
    flashSprite: true,
    effectsPool: 60,
    skyDetail: 12,
  },
  high: {
    pixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowType: 'pcfsoft',
    anisotropy: 8,
    fogNear: 55,
    fogFar: 175,
    maxDecals: 80,
    bloodCount: 7,
    sparkCount: 4,
    flashSprite: true,
    effectsPool: 110,
    skyDetail: 16,
  },
};

export const DEFAULT_SETTINGS = {
  quality: 'medium',        // low | medium | high
  shadowQuality: 'auto',    // auto | low | med | high
  fov: 78,                  // 60..110
  volume: 0.55,             // 0..1
  mouseSensitivity: 2.1,    // 0.5..5
  // (above) means "follow the preset". When shadowQuality is set explicitly,
  // it overrides preset.shadowMapSize and shadowType.
  lastMap: 'dust',
};

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      cache = { ...DEFAULT_SETTINGS, ...parsed };
      return cache;
    }
  } catch { /* ignore */ }
  cache = { ...DEFAULT_SETTINGS };
  return cache;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* ignore */ }
}

export const settings = {
  get all() { return load(); },
  get(key) { return load()[key]; },
  set(key, value) {
    load()[key] = value;
    save();
  },
  setMany(patch) {
    const cur = load();
    Object.assign(cur, patch);
    save();
  },
  reset() {
    cache = { ...DEFAULT_SETTINGS };
    save();
  },
  /** Resolve the effective shadow settings after applying shadowQuality override. */
  effective() {
    const s = load();
    const preset = QUALITY_PRESETS[s.quality] || QUALITY_PRESETS.medium;
    const out = { ...preset };

    if (s.shadowQuality === 'low') {
      out.shadowMapSize = 512;
      out.shadowType = 'basic';
    } else if (s.shadowQuality === 'med') {
      out.shadowMapSize = 1024;
      out.shadowType = 'pcfsoft';
    } else if (s.shadowQuality === 'high') {
      out.shadowMapSize = 2048;
      out.shadowType = 'pcfsoft';
    }
    return out;
  },
};
