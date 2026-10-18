/**
 * Procedural sound engine — every sound is synthesized with the Web Audio API.
 * No external audio assets required.
 *
 * Reload sounds are *class-specific* and multi-step:
 *   pistol : mag release -> mag out -> mag in -> slide rack
 *   rifle  : mag release -> mag out -> mag in -> bolt release
 *   smg    : mag release -> mag out -> mag in -> bolt release (snappier)
 *   sniper : mag release -> mag out -> mag in -> bolt cycle (slow, heavy)
 *   knife  : no reload
 *
 * Empty-mag / dry-fire clicks are also class-specific so each weapon has its
 * own "snap". Round-start / win / lose stingers get a small random variation
 * each play so a 12-round match doesn't sound robotic.
 */
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.55;
    this.noiseBuffer = null;
    this.comp = null;
    this._seed = (Math.random() * 1e9) | 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.002;
    this.comp.release.value = 0.16;

    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);
    this.noiseBuffer = this._makeNoise(1.0);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _out(pan = 0) {
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.master);
      return p;
    }
    return this.master;
  }

  _noise({ dur = 0.2, freq = 1000, type = 'lowpass', gain = 0.5, pan = 0, q = 1, delay = 0, decay = 'exp' }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    if (decay === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this._out(pan));
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  _tone({ freq = 440, endFreq = null, dur = 0.15, gain = 0.3, type = 'sine', pan = 0, delay = 0, detune = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.value = detune;
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this._out(pan));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ============= Shots =============

  shot(kind = 'rifle', pan = 0, volume = 1) {
    if (!this.ctx) return;
    switch (kind) {
      case 'sniper':
        this._noise({ dur: 0.36, freq: 2300, gain: 0.88 * volume, pan, q: 0.65 });
        this._noise({ dur: 0.14, freq: 5400, type: 'highpass', gain: 0.55 * volume, pan });
        this._noise({ dur: 0.5, freq: 320, type: 'lowpass', gain: 0.3 * volume, pan, q: 0.6 });
        this._tone({ freq: 125, endFreq: 35, dur: 0.34, gain: 0.6 * volume, pan });
        this._tone({ freq: 60, endFreq: 30, dur: 0.4, gain: 0.18 * volume, pan, type: 'sawtooth' });
        break;
      case 'pistol':
        this._noise({ dur: 0.16, freq: 1900, gain: 0.6 * volume, pan, q: 0.8 });
        this._noise({ dur: 0.06, freq: 4400, type: 'highpass', gain: 0.34 * volume, pan });
        this._tone({ freq: 195, endFreq: 60, dur: 0.12, gain: 0.36 * volume, pan });
        break;
      case 'knife':
        this._noise({ dur: 0.1, freq: 3200, type: 'bandpass', gain: 0.4 * volume, pan, q: 2 });
        this._tone({ freq: 950, endFreq: 320, dur: 0.08, gain: 0.14 * volume, pan });
        break;
      case 'smg':
        this._noise({ dur: 0.11, freq: 1700, gain: 0.55 * volume, pan, q: 0.85 });
        this._noise({ dur: 0.05, freq: 3800, type: 'highpass', gain: 0.28 * volume, pan });
        this._tone({ freq: 220, endFreq: 70, dur: 0.09, gain: 0.3 * volume, pan });
        break;
      default: // rifle
        this._noise({ dur: 0.22, freq: 1500, gain: 0.78 * volume, pan, q: 0.7 });
        this._noise({ dur: 0.08, freq: 3800, type: 'highpass', gain: 0.4 * volume, pan });
        this._noise({ dur: 0.3, freq: 280, type: 'lowpass', gain: 0.18 * volume, pan, q: 0.7 });
        this._tone({ freq: 160, endFreq: 45, dur: 0.19, gain: 0.46 * volume, pan });
    }
  }

  // ============= Dry-fire / empty mag =============
  // Class-specific "click" — pistol slide lock, rifle bolt, smg bolt, sniper bolt.
  dryFire(kind = 'rifle', pan = 0) {
    if (!this.ctx) return;
    switch (kind) {
      case 'sniper':
        this._noise({ dur: 0.05, freq: 1100, type: 'bandpass', gain: 0.3, pan, q: 4 });
        this._tone({ freq: 210, endFreq: 140, dur: 0.07, gain: 0.18, pan });
        break;
      case 'pistol':
        this._noise({ dur: 0.04, freq: 3600, type: 'bandpass', gain: 0.32, pan, q: 5 });
        this._tone({ freq: 480, endFreq: 260, dur: 0.05, gain: 0.16, pan, type: 'square' });
        break;
      case 'smg':
        this._noise({ dur: 0.04, freq: 2200, type: 'bandpass', gain: 0.28, pan, q: 4 });
        this._tone({ freq: 340, endFreq: 200, dur: 0.05, gain: 0.14, pan });
        break;
      default: // rifle
        this._noise({ dur: 0.05, freq: 2600, type: 'bandpass', gain: 0.3, pan, q: 3 });
        this._tone({ freq: 320, endFreq: 180, dur: 0.05, gain: 0.14, pan });
    }
  }

  // ============= Reloads (class-specific, multi-step) =============
  // Total duration is kept short (< 1s) so the gameplay reload timer in
  // weapons.js dominates. We emit a "mag release", "mag out", "mag in",
  // and a final "rack/bolt" — each with its own tone/noise character.

  /** pistol: mag release -> mag out -> mag in -> slide rack */
  reloadPistol(dur = 2.2, pan = 0) {
    if (!this.ctx) return;
    // mag release button (clicky)
    this._noise({ dur: 0.04, freq: 2800, type: 'bandpass', gain: 0.32, pan, q: 5, delay: 0.0 });
    this._tone({ freq: 720, endFreq: 380, dur: 0.05, gain: 0.16, pan, delay: 0.0 });
    // mag drops
    this._noise({ dur: 0.16, freq: 700, gain: 0.18, pan, q: 1, delay: 0.12 });
    // mag slides in
    this._noise({ dur: 0.16, freq: 1300, gain: 0.22, pan, q: 1.2, delay: dur * 0.55 });
    this._tone({ freq: 280, endFreq: 200, dur: 0.08, gain: 0.16, pan, delay: dur * 0.55 });
    // slide rack (sharp)
    this._noise({ dur: 0.06, freq: 3400, type: 'highpass', gain: 0.4, pan, delay: dur * 0.85 });
    this._tone({ freq: 380, endFreq: 220, dur: 0.07, gain: 0.22, pan, type: 'square', delay: dur * 0.85 });
  }

  /** rifle: mag release -> mag out -> mag in -> bolt release */
  reloadRifle(dur = 3.0, pan = 0) {
    if (!this.ctx) return;
    // mag release
    this._noise({ dur: 0.05, freq: 2400, type: 'bandpass', gain: 0.34, pan, q: 5, delay: 0.0 });
    this._tone({ freq: 580, endFreq: 320, dur: 0.05, gain: 0.18, pan, delay: 0.0 });
    // mag drops
    this._noise({ dur: 0.18, freq: 620, gain: 0.2, pan, q: 1, delay: 0.16 });
    // mag slides in (heavier thud)
    this._noise({ dur: 0.2, freq: 950, gain: 0.24, pan, q: 1.4, delay: dur * 0.55 });
    this._tone({ freq: 180, endFreq: 90, dur: 0.12, gain: 0.22, pan, type: 'sawtooth', delay: dur * 0.55 });
    // bolt release (metallic clack)
    this._noise({ dur: 0.07, freq: 3000, type: 'highpass', gain: 0.36, pan, delay: dur * 0.86 });
    this._tone({ freq: 720, endFreq: 360, dur: 0.08, gain: 0.24, pan, type: 'square', delay: dur * 0.86 });
  }

  /** smg: snappier than rifle, smaller mag */
  reloadSmg(dur = 2.6, pan = 0) {
    if (!this.ctx) return;
    this._noise({ dur: 0.04, freq: 3000, type: 'bandpass', gain: 0.32, pan, q: 5, delay: 0.0 });
    this._tone({ freq: 640, endFreq: 360, dur: 0.04, gain: 0.16, pan, delay: 0.0 });
    this._noise({ dur: 0.14, freq: 800, gain: 0.2, pan, q: 1.2, delay: 0.1 });
    this._noise({ dur: 0.16, freq: 1300, gain: 0.24, pan, q: 1.3, delay: dur * 0.55 });
    this._tone({ freq: 220, endFreq: 120, dur: 0.1, gain: 0.2, pan, type: 'sawtooth', delay: dur * 0.55 });
    this._noise({ dur: 0.06, freq: 3600, type: 'highpass', gain: 0.36, pan, delay: dur * 0.85 });
    this._tone({ freq: 540, endFreq: 300, dur: 0.07, gain: 0.22, pan, type: 'square', delay: dur * 0.85 });
  }

  /** sniper: slow, heavy, large bolt cycle */
  reloadSniper(dur = 3.6, pan = 0) {
    if (!this.ctx) return;
    // mag release (deep)
    this._noise({ dur: 0.06, freq: 1800, type: 'bandpass', gain: 0.3, pan, q: 4, delay: 0.0 });
    this._tone({ freq: 460, endFreq: 240, dur: 0.06, gain: 0.18, pan, delay: 0.0 });
    // mag drops
    this._noise({ dur: 0.22, freq: 480, gain: 0.22, pan, q: 1, delay: 0.2 });
    // mag in (heavy thud)
    this._noise({ dur: 0.24, freq: 760, gain: 0.28, pan, q: 1.3, delay: dur * 0.55 });
    this._tone({ freq: 140, endFreq: 70, dur: 0.16, gain: 0.26, pan, type: 'sawtooth', delay: dur * 0.55 });
    // bolt cycle (drawn-out metallic clack + heavy thunk)
    this._noise({ dur: 0.1, freq: 2400, type: 'highpass', gain: 0.34, pan, delay: dur * 0.86 });
    this._tone({ freq: 360, endFreq: 180, dur: 0.1, gain: 0.22, pan, type: 'square', delay: dur * 0.86 });
    this._tone({ freq: 110, endFreq: 60, dur: 0.18, gain: 0.18, pan, type: 'sawtooth', delay: dur * 0.88 });
  }

  /** Dispatcher — public reload(kind, dur, pan). */
  reload(kind = 'rifle', dur = 2.5, pan = 0) {
    switch (kind) {
      case 'pistol': return this.reloadPistol(dur, pan);
      case 'sniper': return this.reloadSniper(dur, pan);
      case 'smg':    return this.reloadSmg(dur, pan);
      case 'knife':  return;
      default:       return this.reloadRifle(dur, pan);
    }
  }

  // ============= Movement / damage =============

  footstep(pan = 0, crouch = false) {
    const g = crouch ? 0.1 : 0.22;
    this._noise({ dur: 0.09, freq: 320 + Math.random() * 180, gain: g, pan, q: 1.2 });
    this._tone({ freq: 95, endFreq: 55, dur: 0.06, gain: g * 0.6, pan });
  }

  jump(pan = 0) {
    this._noise({ dur: 0.08, freq: 500, gain: 0.16, pan });
    this._tone({ freq: 220, endFreq: 320, dur: 0.09, gain: 0.1, pan });
  }

  land(pan = 0) {
    this._noise({ dur: 0.12, freq: 260, gain: 0.28, pan, q: 1.1 });
    this._tone({ freq: 110, endFreq: 50, dur: 0.12, gain: 0.22, pan });
  }

  hit(pan = 0) {
    this._tone({ freq: 1150, endFreq: 900, dur: 0.055, gain: 0.28, pan, type: 'square' });
    this._noise({ dur: 0.05, freq: 2200, type: 'bandpass', gain: 0.18, pan, q: 2 });
  }

  headshot(pan = 0) {
    this._tone({ freq: 1560, endFreq: 1320, dur: 0.09, gain: 0.32, pan, type: 'triangle' });
    this._tone({ freq: 2340, endFreq: 2100, dur: 0.13, gain: 0.2, pan, type: 'triangle', delay: 0.02 });
    this._noise({ dur: 0.07, freq: 3200, type: 'bandpass', gain: 0.16, pan, q: 2 });
  }

  flesh(pan = 0) {
    this._noise({ dur: 0.11, freq: 420, gain: 0.3, pan, q: 1.4 });
    this._tone({ freq: 160, endFreq: 70, dur: 0.1, gain: 0.22, pan });
  }

  death(pan = 0) {
    this._noise({ dur: 0.35, freq: 500, gain: 0.34, pan, q: 1 });
    this._tone({ freq: 220, endFreq: 60, dur: 0.4, gain: 0.26, pan, type: 'sawtooth' });
    this._tone({ freq: 140, endFreq: 40, dur: 0.5, gain: 0.2, pan });
  }

  buy() {
    this._tone({ freq: 660, endFreq: 880, dur: 0.08, gain: 0.22, type: 'triangle' });
    this._tone({ freq: 990, endFreq: 1320, dur: 0.1, gain: 0.18, type: 'triangle', delay: 0.07 });
  }

  deny() {
    this._tone({ freq: 220, endFreq: 160, dur: 0.16, gain: 0.22, type: 'square' });
    this._tone({ freq: 165, endFreq: 110, dur: 0.2, gain: 0.18, type: 'square', delay: 0.12 });
  }

  // Round stingers — slight detune + rhythm perturbation per call
  // so repeated rounds don't sound identical.
  roundStart() {
    const det = (this._seed = (this._seed * 1664525 + 1013904223) & 0x7fffffff) % 16 - 8;
    this._tone({ freq: 520, endFreq: 520, dur: 0.12, gain: 0.22, type: 'triangle', detune: det });
    this._tone({ freq: 520, endFreq: 520, dur: 0.12, gain: 0.22, type: 'triangle', delay: 0.18, detune: det });
    this._tone({ freq: 780, endFreq: 780, dur: 0.28, gain: 0.26, type: 'triangle', delay: 0.36, detune: det });
  }

  roundWin() {
    const det = (this._seed = (this._seed * 1664525 + 1013904223) & 0x7fffffff) % 12 - 6;
    const base = [523, 659, 784, 1046];
    // pick one of two rhythms to add variety
    const variant = this._seed & 1;
    const offsets = variant
      ? [0, 0.13, 0.26, 0.39]
      : [0, 0.16, 0.31, 0.46];
    base.forEach((f, i) => this._tone({ freq: f, endFreq: f, dur: 0.24, gain: 0.22, type: 'triangle', delay: offsets[i], detune: det }));
    // soft cymbal-like noise tail
    this._noise({ dur: 0.6, freq: 4500, type: 'highpass', gain: 0.08, delay: 0.4, q: 1 });
  }

  roundLose() {
    const det = (this._seed = (this._seed * 1664525 + 1013904223) & 0x7fffffff) % 10 - 5;
    const base = [440, 392, 330, 262];
    const variant = this._seed & 1;
    const offsets = variant
      ? [0, 0.15, 0.30, 0.45]
      : [0, 0.18, 0.34, 0.50];
    base.forEach((f, i) => this._tone({ freq: f, endFreq: f * 0.98, dur: 0.28, gain: 0.2, type: 'triangle', delay: offsets[i], detune: det }));
    this._noise({ dur: 0.5, freq: 240, type: 'lowpass', gain: 0.1, delay: 0.2, q: 1 });
  }

  scope(pan = 0) {
    this._noise({ dur: 0.05, freq: 2400, type: 'bandpass', gain: 0.16, pan, q: 5 });
  }
}
