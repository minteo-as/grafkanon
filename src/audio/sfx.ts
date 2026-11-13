// Alle lyde laves i koden med Web Audio, så der ikke er lydfiler at hente.
// Browseren tillader først lyd efter et klik, så unlock() kaldes fra et klik.

const VOLUME = 0.6

interface ToneOptions {
  type: OscillatorType
  from: number
  to?: number
  duration: number
  volume: number
  delay?: number
  /** Sekunder til fuld styrke. Kort giver et hårdt anslag. */
  attack?: number
  /** Send tonen gennem forvrængning, så den lyder grovere. */
  distort?: boolean
}

interface NoiseOptions {
  duration: number
  volume: number
  filterFrom: number
  filterTo: number
  delay?: number
  filterType?: BiquadFilterType
  q?: number
}

/** Blød klipning: jo større amount, jo mere forvrængning. */
function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x))
  }
  return curve
}

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private distortion: WaveShaperNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private muted = false

  get isMuted(): boolean {
    return this.muted
  }

  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext()
      } catch {
        return
      }
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : VOLUME
      // Kompressoren klemmer toppene, så slagene lyder tætte og kraftige uden at skurre
      const compressor = this.ctx.createDynamicsCompressor()
      compressor.threshold.value = -20
      compressor.knee.value = 6
      compressor.ratio.value = 5
      compressor.attack.value = 0.002
      compressor.release.value = 0.2
      this.master.connect(compressor).connect(this.ctx.destination)
      this.distortion = this.ctx.createWaveShaper()
      this.distortion.curve = distortionCurve(12)
      this.distortion.oversample = '2x'
      this.distortion.connect(this.master)
      const len = Math.floor(this.ctx.sampleRate * 1)
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = this.noiseBuffer.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : VOLUME
  }

  laser(): void {
    this.tone({ type: 'sawtooth', from: 1400, to: 220, duration: 0.32, volume: 0.12 })
    this.tone({ type: 'square', from: 700, to: 110, duration: 0.3, volume: 0.05 })
    this.noise({ duration: 0.14, volume: 0.12, filterFrom: 6000, filterTo: 1500 })
  }

  grenade(): void {
    this.noise({ duration: 0.2, volume: 0.35, filterFrom: 900, filterTo: 120 })
    this.tone({ type: 'sine', from: 120, to: 55, duration: 0.25, volume: 0.3 })
    this.tone({ type: 'triangle', from: 500, to: 1300, duration: 0.6, volume: 0.04, delay: 0.05 })
  }

  /** En blinker hopper: et hurtigt elektronisk blip. */
  blink(): void {
    this.tone({ type: 'sine', from: 700, to: 1700, duration: 0.07, volume: 0.06 })
    this.tone({ type: 'sine', from: 1700, to: 600, duration: 0.09, volume: 0.05, delay: 0.07 })
  }

  /** En koloni vokser et skridt: en boblende lyd, der stiger. */
  grow(): void {
    this.tone({ type: 'sine', from: 220, to: 420, duration: 0.14, volume: 0.07 })
    this.tone({ type: 'sine', from: 330, to: 620, duration: 0.12, volume: 0.05, delay: 0.09 })
  }

  /** En glitch er ved at være ladet op: en lav, truende knurren. */
  warn(): void {
    this.tone({ type: 'sawtooth', from: 120, to: 78, duration: 0.55, volume: 0.07, distort: true })
    this.tone({ type: 'square', from: 240, to: 150, duration: 0.45, volume: 0.025, delay: 0.05 })
  }

  /** En glitch skyder mod basen, og et skjold springer. */
  shieldHit(): void {
    this.tone({ type: 'sawtooth', from: 900, to: 120, duration: 0.25, volume: 0.12 })
    this.noise({ duration: 0.3, volume: 0.4, filterFrom: 2600, filterTo: 600, filterType: 'bandpass', q: 0.8 })
    this.tone({ type: 'sine', from: 130, to: 48, duration: 0.32, volume: 0.5, attack: 0.003 })
    this.tone({ type: 'sine', from: 1500, to: 1350, duration: 0.45, volume: 0.04, delay: 0.06 })
  }

  /** Raketten tænder: et sus, der stiger, ligesom kurven. */
  rocket(): void {
    this.noise({ duration: 0.7, volume: 0.28, filterFrom: 400, filterTo: 4200, filterType: 'bandpass', q: 1.2 })
    this.tone({ type: 'sawtooth', from: 90, to: 640, duration: 0.7, volume: 0.07 })
    this.tone({ type: 'sine', from: 70, to: 45, duration: 0.25, volume: 0.35 })
  }

  /** Granaten rammer jorden eller en mur. */
  boom(): void {
    this.tone({ type: 'sine', from: 140, to: 32, duration: 0.6, volume: 0.9, attack: 0.003 })
    this.tone({ type: 'sawtooth', from: 110, to: 40, duration: 0.3, volume: 0.3, distort: true })
    this.noise({ duration: 0.06, volume: 0.6, filterFrom: 3500, filterTo: 1500, filterType: 'bandpass', q: 0.7 })
    this.noise({ duration: 0.9, volume: 0.5, filterFrom: 1600, filterTo: 50, delay: 0.01 })
  }

  /** combo = 0 for første træffer i skuddet. Klangen stiger for hver træffer. */
  hit(combo: number): void {
    const f = 220 * Math.pow(1.26, combo)
    // Dybt slag, man kan mærke
    this.tone({ type: 'sine', from: 190, to: 38, duration: 0.35, volume: 0.95, attack: 0.002 })
    // Forvrænget krop, der giver eksplosionen tyngde
    this.tone({
      type: 'sawtooth',
      from: f * 2,
      to: f * 0.5,
      duration: 0.18,
      volume: 0.35,
      attack: 0.002,
      distort: true,
    })
    // Skarpt knæk i anslaget
    this.noise({ duration: 0.05, volume: 0.75, filterFrom: 5000, filterTo: 2500, filterType: 'bandpass', q: 0.8 })
    // Rumlen bagefter
    this.noise({ duration: 0.6, volume: 0.45, filterFrom: 2400, filterTo: 60, delay: 0.01 })
    // Klang, der stiger for hver træffer i samme skud
    this.tone({ type: 'triangle', from: f * 4, duration: 0.2, volume: 0.1, delay: 0.03 })
  }

  barrier(): void {
    this.tone({ type: 'square', from: 220, to: 440, duration: 0.18, volume: 0.08 })
    this.tone({ type: 'sine', from: 660, to: 660, duration: 0.4, volume: 0.1, delay: 0.08 })
  }

  /** Bossen mister et liv: et ekstra dybt brag med en faldende tone. */
  bossHurt(): void {
    this.boom()
    this.tone({ type: 'sawtooth', from: 520, to: 90, duration: 0.7, volume: 0.25, distort: true, delay: 0.05 })
  }

  miss(): void {
    this.tone({ type: 'sine', from: 240, to: 90, duration: 0.4, volume: 0.22 })
  }

  hop(): void {
    this.tone({ type: 'square', from: 180, to: 120, duration: 0.07, volume: 0.04 })
  }

  click(): void {
    this.tone({ type: 'sine', from: 900, to: 650, duration: 0.05, volume: 0.07 })
  }

  waveCleared(): void {
    ;[523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ type: 'triangle', from: f, duration: 0.22, volume: 0.16, delay: i * 0.09 }),
    )
  }

  fail(): void {
    ;[392, 330, 262].forEach((f, i) =>
      this.tone({ type: 'triangle', from: f, to: f * 0.97, duration: 0.25, volume: 0.16, delay: i * 0.14 }),
    )
  }

  escaped(): void {
    for (let i = 0; i < 3; i++)
      this.tone({ type: 'square', from: 880, to: 660, duration: 0.12, volume: 0.06, delay: i * 0.16 })
  }

  /** i = 0, 1, 2 for første, anden og tredje stjerne. */
  star(i: number): void {
    const f = 880 * Math.pow(1.25, i)
    this.tone({ type: 'sine', from: f, duration: 0.5, volume: 0.18 })
    this.tone({ type: 'triangle', from: f * 2, duration: 0.25, volume: 0.05 })
  }

  private tone({ type, from, to, duration, volume, delay = 0, attack = 0.01, distort = false }: ToneOptions): void {
    const ctx = this.ctx
    if (!ctx || !this.master || this.muted) return
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, t0)
    if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(to, t0 + duration)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(volume, t0 + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    osc.connect(gain).connect(distort && this.distortion ? this.distortion : this.master)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }

  private noise({
    duration,
    volume,
    filterFrom,
    filterTo,
    delay = 0,
    filterType = 'lowpass',
    q = 1,
  }: NoiseOptions): void {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noiseBuffer || this.muted) return
    const t0 = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = filterType
    filter.Q.value = q
    filter.frequency.setValueAtTime(filterFrom, t0)
    filter.frequency.exponentialRampToValueAtTime(filterTo, t0 + duration)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, t0)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    src.connect(filter).connect(gain).connect(this.master)
    src.start(t0)
    src.stop(t0 + duration + 0.02)
  }
}
