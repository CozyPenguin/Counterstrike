/**
 * Valorant-style recoil patterns.
 *
 * Each weapon has a fixed, deterministic spray pattern made of (yaw, pitch)
 * deltas per shot, plus a few tuning constants. The player has to "pull down"
 * (apply the inverse of the pattern with their mouse) to keep the spray on
 * target. Bot shooters also use the same patterns so they "miss high" the way
 * a real player would.
 *
 * Pattern data is tuned to feel close to VALORANT for the equivalents:
 *   - ak47   ≈ Vandal (hard vertical, slight right then strong left)
 *   - m4a4   ≈ Phantom (gentler, mostly straight up with a leftward drift)
 *   - mac10  ≈ Stinger (fast fire, small climbs each shot)
 *   - deagle ≈ Sheriff / single-shot
 *   - pistols ≈ Ghost (small, manageable vertical)
 *   - awp    ≈ Operator (single-shot, big kick but reset per shot)
 *
 * Each entry has:
 *   - firstShotRandom: max horizontal offset (radians) of the very first
 *     bullet, applied randomly. Mimics VALORANT's first-bullet RNG.
 *   - climb: array of { y, p } where y = yaw delta (right+), p = pitch delta
 *     (up+). Length == weapon mag. After the array runs out, the last
 *     entry is reused. Values are in radians.
 *   - recovery: per-second rate the camera auto-recovers from the cumulative
 *     recoil (independent of the input-driven pull-down). Tunes how "floaty"
 *     the gun feels.
 *   - firstShotMult: extra upward kick applied only to bullet #1 (the famous
 *     "first bullet pull" — without it, the Vandal feels like a different gun).
 */
const PATTERNS = {
  ak47: {
    firstShotRandom: 0.0035,
    firstShotMult: 1.35,   // Vandal: first bullet kicks noticeably harder
    recovery: 6.0,
    climb: [
      { y: -0.0008, p: 0.0132 }, // 1  - straight up, very slightly left
      { y:  0.0012, p: 0.0128 }, // 2
      { y:  0.0026, p: 0.0126 }, // 3
      { y:  0.0038, p: 0.0124 }, // 4
      { y:  0.0042, p: 0.0122 }, // 5
      { y:  0.0032, p: 0.0120 }, // 6
      { y:  0.0010, p: 0.0118 }, // 7
      { y: -0.0014, p: 0.0116 }, // 8
      { y: -0.0034, p: 0.0114 }, // 9
      { y: -0.0050, p: 0.0110 }, // 10
      { y: -0.0058, p: 0.0104 }, // 11
      { y: -0.0050, p: 0.0096 }, // 12
      { y: -0.0032, p: 0.0088 }, // 13
      { y: -0.0008, p: 0.0082 }, // 14
      { y:  0.0016, p: 0.0078 }, // 15
      { y:  0.0030, p: 0.0076 }, // 16
      { y:  0.0024, p: 0.0076 }, // 17
      { y:  0.0006, p: 0.0078 }, // 18
      { y: -0.0018, p: 0.0080 }, // 19
      { y: -0.0038, p: 0.0082 }, // 20
      { y: -0.0046, p: 0.0084 }, // 21
      { y: -0.0036, p: 0.0084 }, // 22
      { y: -0.0014, p: 0.0082 }, // 23
      { y:  0.0010, p: 0.0080 }, // 24
      { y:  0.0024, p: 0.0078 }, // 25
      { y:  0.0018, p: 0.0076 }, // 26
      { y:  0.0000, p: 0.0076 }, // 27
      { y: -0.0018, p: 0.0076 }, // 28
      { y: -0.0024, p: 0.0076 }, // 29
      { y: -0.0016, p: 0.0076 }, // 30
    ],
  },

  m4a4: {
    firstShotRandom: 0.0025,
    firstShotMult: 1.15,
    recovery: 6.5,
    climb: [
      { y: -0.0004, p: 0.0096 },
      { y: -0.0008, p: 0.0094 },
      { y: -0.0006, p: 0.0092 },
      { y: -0.0002, p: 0.0090 },
      { y:  0.0004, p: 0.0088 },
      { y:  0.0006, p: 0.0086 },
      { y:  0.0002, p: 0.0084 },
      { y: -0.0006, p: 0.0082 },
      { y: -0.0016, p: 0.0080 },
      { y: -0.0022, p: 0.0078 },
      { y: -0.0018, p: 0.0076 },
      { y: -0.0008, p: 0.0076 },
      { y:  0.0002, p: 0.0076 },
      { y:  0.0006, p: 0.0076 },
      { y:  0.0000, p: 0.0076 },
      { y: -0.0008, p: 0.0076 },
      { y: -0.0014, p: 0.0076 },
      { y: -0.0012, p: 0.0076 },
      { y: -0.0004, p: 0.0076 },
      { y:  0.0002, p: 0.0076 },
      { y:  0.0004, p: 0.0076 },
      { y:  0.0000, p: 0.0076 },
      { y: -0.0004, p: 0.0076 },
      { y: -0.0006, p: 0.0076 },
      { y: -0.0004, p: 0.0076 },
      { y:  0.0000, p: 0.0076 },
      { y:  0.0002, p: 0.0076 },
      { y:  0.0000, p: 0.0076 },
      { y: -0.0002, p: 0.0076 },
      { y: -0.0002, p: 0.0076 },
    ],
  },

  mac10: {
    firstShotRandom: 0.0040,
    firstShotMult: 1.10,
    recovery: 5.5,
    climb: [
      { y:  0.0020, p: 0.0078 },
      { y:  0.0024, p: 0.0080 },
      { y:  0.0022, p: 0.0078 },
      { y:  0.0018, p: 0.0076 },
      { y:  0.0012, p: 0.0074 },
      { y:  0.0006, p: 0.0072 },
      { y:  0.0000, p: 0.0070 },
      { y: -0.0006, p: 0.0068 },
      { y: -0.0012, p: 0.0066 },
      { y: -0.0016, p: 0.0064 },
      { y: -0.0014, p: 0.0062 },
      { y: -0.0008, p: 0.0060 },
      { y: -0.0002, p: 0.0058 },
      { y:  0.0004, p: 0.0056 },
      { y:  0.0008, p: 0.0054 },
      { y:  0.0006, p: 0.0052 },
      { y:  0.0002, p: 0.0050 },
      { y: -0.0002, p: 0.0048 },
      { y: -0.0004, p: 0.0046 },
      { y: -0.0002, p: 0.0044 },
      { y:  0.0002, p: 0.0042 },
      { y:  0.0004, p: 0.0040 },
      { y:  0.0002, p: 0.0038 },
      { y:  0.0000, p: 0.0036 },
      { y: -0.0002, p: 0.0034 },
      { y: -0.0002, p: 0.0032 },
      { y:  0.0000, p: 0.0030 },
      { y:  0.0000, p: 0.0028 },
      { y:  0.0000, p: 0.0026 },
      { y:  0.0000, p: 0.0024 },
    ],
  },

  // Single-shot hand cannons: the pattern is just "kick up hard and recenter".
  // We model that with a 1-entry climb and high recovery.
  deagle: {
    firstShotRandom: 0.0015,
    firstShotMult: 1.0,
    recovery: 9.0,
    climb: [
      { y: -0.0010, p: 0.0220 },
      { y:  0.0000, p: 0.0200 },
      { y:  0.0000, p: 0.0180 },
      { y:  0.0000, p: 0.0160 },
      { y:  0.0000, p: 0.0140 },
      { y:  0.0000, p: 0.0120 },
      { y:  0.0000, p: 0.0000 },
    ],
  },

  usp: {
    firstShotRandom: 0.0010,
    firstShotMult: 1.0,
    recovery: 8.0,
    climb: [
      { y: -0.0002, p: 0.0118 },
      { y:  0.0002, p: 0.0110 },
      { y: -0.0002, p: 0.0100 },
      { y:  0.0000, p: 0.0088 },
      { y:  0.0002, p: 0.0076 },
      { y:  0.0000, p: 0.0060 },
      { y:  0.0000, p: 0.0044 },
      { y:  0.0000, p: 0.0028 },
      { y:  0.0000, p: 0.0012 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
    ],
  },

  p250: {
    firstShotRandom: 0.0012,
    firstShotMult: 1.0,
    recovery: 8.0,
    climb: [
      { y:  0.0002, p: 0.0128 },
      { y: -0.0002, p: 0.0120 },
      { y:  0.0002, p: 0.0110 },
      { y:  0.0000, p: 0.0098 },
      { y: -0.0002, p: 0.0084 },
      { y:  0.0002, p: 0.0068 },
      { y:  0.0000, p: 0.0052 },
      { y:  0.0000, p: 0.0036 },
      { y:  0.0000, p: 0.0020 },
      { y:  0.0000, p: 0.0004 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
    ],
  },

  glock: {
    firstShotRandom: 0.0018,
    firstShotMult: 1.0,
    recovery: 7.5,
    climb: [
      { y:  0.0006, p: 0.0110 },
      { y:  0.0010, p: 0.0104 },
      { y:  0.0008, p: 0.0096 },
      { y:  0.0004, p: 0.0088 },
      { y:  0.0000, p: 0.0080 },
      { y: -0.0004, p: 0.0072 },
      { y: -0.0006, p: 0.0064 },
      { y: -0.0004, p: 0.0056 },
      { y:  0.0000, p: 0.0048 },
      { y:  0.0002, p: 0.0040 },
      { y:  0.0002, p: 0.0032 },
      { y:  0.0000, p: 0.0024 },
      { y:  0.0000, p: 0.0016 },
      { y:  0.0000, p: 0.0008 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
    ],
  },

  awp: {
    // The Operator in VALORANT: huge first-shot kick, then nothing until
    // the chamber cycles. The player can scope-shoot-reset-scope-shoot
    // rhythmically. Modeled as a 1-shot pattern with very high recovery.
    firstShotRandom: 0.0008,
    firstShotMult: 1.0,
    recovery: 12.0,
    climb: [
      { y: -0.0014, p: 0.0280 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
      { y:  0.0000, p: 0.0000 },
    ],
  },

  knife: {
    firstShotRandom: 0,
    firstShotMult: 0,
    recovery: 0,
    climb: [{ y: 0, p: 0 }],
  },
};

const FALLBACK = PATTERNS.ak47;

export function getRecoilPattern(weaponId) {
  return PATTERNS[weaponId] || FALLBACK;
}

export function listPatternedWeapons() {
  return Object.keys(PATTERNS);
}

/**
 * Compute the camera-space recoil delta for a single shot.
 *
 *   pattern   = pattern object for the weapon
 *   shotIndex = 0-based index of the shot in the current spray (resets on a
 *               gap of more than 0.18s)
 *   firstBulletOfSpray = true if this is bullet 0 of a fresh spray
 *   rng = () => number in [0,1) — injectable for tests
 *
 * Returns { dYaw, dPitch } in radians.
 */
export function recoilForShot(pattern, shotIndex, firstBulletOfSpray, rng = Math.random) {
  const climb = pattern.climb[Math.min(shotIndex, pattern.climb.length - 1)] || { y: 0, p: 0 };
  let dPitch = climb.p;
  let dYaw = climb.y;

  // Vandal-style first-shot RNG: only on the very first bullet of a fresh
  // spray, apply a small random horizontal offset.
  if (firstBulletOfSpray && pattern.firstShotRandom > 0) {
    dYaw += (rng() * 2 - 1) * pattern.firstShotRandom;
  }

  // First-shot multiplier: only on bullet 0, scale the upward kick.
  if (shotIndex === 0 && pattern.firstShotMult > 1) {
    dPitch *= pattern.firstShotMult;
  }

  return { dYaw, dPitch };
}

/**
 * How much pitch (downward) the player must apply per second to fully
 * cancel a weapon's vertical climb at the current rate of fire. This is
 * surfaced in the practice range HUD as a coaching hint.
 */
export function verticalCompensationPerSecond(pattern, rpm) {
  if (!pattern || !pattern.climb.length || !rpm) return 0;
  // Average the first 8 shots' vertical kick — that's the segment you have
  // to learn to control.
  const sample = pattern.climb.slice(0, Math.min(8, pattern.climb.length));
  const avg = sample.reduce((s, c) => s + c.p, 0) / sample.length;
  const shotsPerSec = rpm / 60;
  return avg * shotsPerSec; // rad / sec the player must pull down
}
