// Detailed recoil verification: per-shot patterns, RNG bounds, climb shape.
// Doesn't need jsdom — just imports the recoil module.

const { getRecoilPattern, recoilForShot, verticalCompensationPerSecond, listPatternedWeapons } = await import('../src/recoil.js');

let failures = 0;
function check(name, cond) {
  if (cond) console.log('  ✓ ' + name);
  else { console.error('  ✗ ' + name); failures++; }
}

console.log('--- Per-weapon recoil shape ---');

// AK47 should have a hard first bullet (Vandal-style) then steady climb.
const ak = getRecoilPattern('ak47');
const akShots = [];
for (let i = 0; i < 30; i++) {
  const s = recoilForShot(ak, i, i === 0, () => 0.5);
  akShots.push(s);
}
const ak0 = recoilForShot(ak, 0, true, () => 0.5);
// The first-shot mult applies to any shotIndex-0 bullet. Verify by
// comparing against the raw climb entry pitch (0.0132) — with mult 1.35
// the result must be > 0.0132.
const rawClimb0Pitch = 0.0132;
check('ak first-shot pitch is multiplied', Math.abs(ak0.dPitch - rawClimb0Pitch * 1.35) < 1e-6);
check('ak first bullet (with mult) is harder than bullet 1', ak0.dPitch > akShots[1].dPitch);

// AK should swing right initially then left (classic Vandal curve)
const ak1yaw = akShots[1].dYaw;
const ak5yaw = akShots[5].dYaw;
const ak9yaw = akShots[9].dYaw;
console.log('  ak yaw by index: 1=' + ak1yaw.toFixed(4) + ' 5=' + ak5yaw.toFixed(4) + ' 9=' + ak9yaw.toFixed(4));
check('ak swings right then left (Vandal curve)', ak1yaw > 0 && ak9yaw < 0);

// M4 should be gentler than AK
const m4 = getRecoilPattern('m4a4');
let m4Total = 0;
let akTotal = 0;
for (let i = 0; i < 10; i++) {
  akTotal += akShots[i].dPitch;
  m4Total += recoilForShot(m4, i, i === 0, () => 0.5).dPitch;
}
console.log('  10-shot vertical climb: ak=' + akTotal.toFixed(4) + ' m4=' + m4Total.toFixed(4));
check('m4 climbs less than ak (Phantom < Vandal)', m4Total < akTotal);

// MAC10 should have a noticeable but manageable climb
const mac = getRecoilPattern('mac10');
let macTotal = 0;
for (let i = 0; i < 10; i++) macTotal += recoilForShot(mac, i, i === 0, () => 0.5).dPitch;
console.log('  10-shot vertical climb: mac10=' + macTotal.toFixed(4));
check('mac10 climbs less than ak (SMG < Rifle)', macTotal < akTotal);

// AWP should kick hard once then nothing (Operator style)
const awp = getRecoilPattern('awp');
const awp0 = recoilForShot(awp, 0, true, () => 0.5);
const awp3 = recoilForShot(awp, 3, false, () => 0.5);
check('awp has big first-shot kick', awp0.dPitch > 0.015);
check('awp has zero kick on follow-up shots', awp3.dPitch === 0);

// Deagle should kick like a handcannon
const deagle = getRecoilPattern('deagle');
const d0 = recoilForShot(deagle, 0, true, () => 0.5);
check('deagle first shot is hard', d0.dPitch > 0.018);
const d1 = recoilForShot(deagle, 1, false, () => 0.5);
check('deagle recovers quickly (1-shot pattern)', d1.dPitch < 0.021);

console.log('\n--- First-bullet RNG ---');
let allYaws = [];
for (let i = 0; i < 200; i++) {
  allYaws.push(recoilForShot(ak, 0, true, Math.random).dYaw);
}
const minYaw = Math.min(...allYaws);
const maxYaw = Math.max(...allYaws);
console.log('  ak first-bullet yaw range over 200 trials: [' + minYaw.toFixed(4) + ', ' + maxYaw.toFixed(4) + ']');
check('first-bullet RNG spans negative and positive', minYaw < 0 && maxYaw > 0);
check('first-bullet RNG bound ~ 0.0035', Math.abs(maxYaw - 0.0035) < 0.001);

console.log('\n--- Vertical compensation per second ---');
const akComp = verticalCompensationPerSecond(ak, 600);
const m4Comp = verticalCompensationPerSecond(m4, 666);
const macComp = verticalCompensationPerSecond(mac, 800);
console.log('  comp/s: ak=' + akComp.toFixed(4) + ' m4=' + m4Comp.toFixed(4) + ' mac10=' + macComp.toFixed(4));
check('ak compensation > m4 (Vandal > Phantom in pull-down)', akComp > m4Comp);
check('mac10 has compensation > 0 (Stinger needs pull-down)', macComp > 0);

console.log('\n' + (failures === 0 ? '✓ ALL DETAILED RECOIL TESTS PASS' : '✗ ' + failures + ' failures'));
process.exit(failures === 0 ? 0 : 1);
