// Alle lyde laves i koden med Web Audio, så der ikke er lydfiler at hente.
// Browseren tillader først lyd efter et klik, så unlock() kaldes fra et klik.

const VOLUME = 0.5;

interface ToneOptions {
  type: OscillatorType;
  from: number;
  to?: number;
  duration: number;
  volume: number;
  delay?: number;
}

interface NoiseOptions {
  duration: number;
  volume: number;
  filterFrom: number;
  filterTo: number;
  delay?: number;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  get isMuted(): boolean {
    return this.muted;
  }

  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : VOLUME;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : VOLUME;
  }

  laser(): void {
    this.tone({ type: 'sawtooth', from: 1400, to: 220, duration: 0.32, volume: 0.12 });
    this.tone({ type: 'square', from: 700, to: 110, duration: 0.3, volume: 0.05 });
    this.noise({ duration: 0.14, volume: 0.12, filterFrom: 6000, filterTo: 1500 });
  }

  /** combo = 0 for første træffer i skuddet. Tonen stiger for hver træffer. */
  hit(combo: number): void {
    const f = 330 * Math.pow(1.26, combo);
    this.tone({ type: 'triangle', from: f * 2, to: f, duration: 0.2, volume: 0.28 });
    this.tone({ type: 'square', from: f * 4, to: f * 3, duration: 0.08, volume: 0.05 });
    this.noise({ duration: 0.3, volume: 0.3, filterFrom: 3000, filterTo: 250 });
  }

  miss(): void {
    this.tone({ type: 'sine', from: 240, to: 90, duration: 0.4, volume: 0.22 });
  }

  hop(): void {
    this.tone({ type: 'square', from: 180, to: 120, duration: 0.07, volume: 0.04 });
  }

  click(): void {
    this.tone({ type: 'sine', from: 900, to: 650, duration: 0.05, volume: 0.07 });
  }

  waveCleared(): void {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ type: 'triangle', from: f, duration: 0.22, volume: 0.16, delay: i * 0.09 }),
    );
  }

  fail(): void {
    [392, 330, 262].forEach((f, i) =>
      this.tone({ type: 'triangle', from: f, to: f * 0.97, duration: 0.25, volume: 0.16, delay: i * 0.14 }),
    );
  }

  escaped(): void {
    for (let i = 0; i < 3; i++) this.tone({ type: 'square', from: 880, to: 660, duration: 0.12, volume: 0.06, delay: i * 0.16 });
  }

  /** i = 0, 1, 2 for første, anden og tredje stjerne. */
  star(i: number): void {
    const f = 880 * Math.pow(1.25, i);
    this.tone({ type: 'sine', from: f, duration: 0.5, volume: 0.18 });
    this.tone({ type: 'triangle', from: f * 2, duration: 0.25, volume: 0.05 });
  }

  private tone({ type, from, to, duration, volume, delay = 0 }: ToneOptions): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noise({ duration, volume, filterFrom, filterTo, delay = 0 }: NoiseOptions): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrom, t0);
    filter.frequency.exponentialRampToValueAtTime(filterTo, t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }
}
