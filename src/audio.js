/**
 * Procedural sound engine — every sound is synthesized with the Web Audio API.
 * No external audio assets required.
 */
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.55;
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

    // Gentle compressor so overlapping shots don't clip harshly.
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

  _tone({ freq = 440, endFreq = null, dur = 0.15, gain = 0.3, type = 'sine', pan = 0, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this._out(pan));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---- Public one-shots ----

  /** kind: 'rifle' | 'pistol' | 'sniper' | 'knife' | 'smg' */
  shot(kind = 'rifle', pan = 0, volume = 1) {
    if (!this.ctx) return;
    switch (kind) {
      case 'sniper':
        this._noise({ dur: 0.34, freq: 2400, gain: 0.85 * volume, pan, q: 0.7 });
        this._noise({ dur: 0.12, freq: 5200, type: 'highpass', gain: 0.5 * volume, pan });
        this._tone({ freq: 130, endFreq: 38, dur: 0.3, gain: 0.55 * volume, pan });
        break;
      case 'pistol':
        this._noise({ dur: 0.14, freq: 1900, gain: 0.55 * volume, pan, q: 0.8 });
        this._noise({ dur: 0.05, freq: 4200, type: 'highpass', gain: 0.3 * volume, pan });
        this._tone({ freq: 190, endFreq: 60, dur: 0.11, gain: 0.32 * volume, pan });
        break;
      case 'knife':
        this._noise({ dur: 0.09, freq: 3200, type: 'bandpass', gain: 0.35 * volume, pan, q: 2 });
        this._tone({ freq: 900, endFreq: 300, dur: 0.07, gain: 0.12 * volume, pan });
        break;
      case 'smg':
        this._noise({ dur: 0.1, freq: 1600, gain: 0.5 * volume, pan, q: 0.9 });
        this._tone({ freq: 220, endFreq: 70, dur: 0.08, gain: 0.28 * volume, pan });
        break;
      default: // rifle
        this._noise({ dur: 0.2, freq: 1500, gain: 0.72 * volume, pan, q: 0.75 });
        this._noise({ dur: 0.07, freq: 3800, type: 'highpass', gain: 0.36 * volume, pan });
        this._tone({ freq: 165, endFreq: 48, dur: 0.17, gain: 0.42 * volume, pan });
    }
  }

  dryFire(pan = 0) {
    this._noise({ dur: 0.05, freq: 2600, type: 'bandpass', gain: 0.25, pan, q: 3 });
    this._tone({ freq: 320, endFreq: 180, dur: 0.05, gain: 0.12, pan });
  }

  reload(pan = 0) {
    this._noise({ dur: 0.05, freq: 2100, type: 'bandpass', gain: 0.3, pan, q: 4 });
    this._noise({ dur: 0.06, freq: 1300, type: 'bandpass', gain: 0.32, pan, q: 4, delay: 0.22 });
    this._noise({ dur: 0.08, freq: 900, type: 'bandpass', gain: 0.36, pan, q: 3, delay: 0.52 });
  }

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

  roundStart() {
    this._tone({ freq: 520, endFreq: 520, dur: 0.12, gain: 0.22, type: 'triangle' });
    this._tone({ freq: 520, endFreq: 520, dur: 0.12, gain: 0.22, type: 'triangle', delay: 0.18 });
    this._tone({ freq: 780, endFreq: 780, dur: 0.28, gain: 0.26, type: 'triangle', delay: 0.36 });
  }

  roundWin() {
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => this._tone({ freq: f, endFreq: f, dur: 0.22, gain: 0.22, type: 'triangle', delay: i * 0.13 }));
  }

  roundLose() {
    const seq = [440, 392, 330, 262];
    seq.forEach((f, i) => this._tone({ freq: f, endFreq: f * 0.98, dur: 0.26, gain: 0.2, type: 'triangle', delay: i * 0.15 }));
  }

  scope(pan = 0) {
    this._noise({ dur: 0.05, freq: 2400, type: 'bandpass', gain: 0.16, pan, q: 5 });
  }
}
