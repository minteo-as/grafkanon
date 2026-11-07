// Spillets regler uden grafik, så de kan testes for sig.

import { computePath, type Aim, type Path, type PathResult, type Wall } from '../math/path'
import { LEVELS, weaponOf, type Level } from './levels'
import { mulberry32, type Rng } from './rng'
import { BONUS_PER_SPARE_SHOT, helpMultiplier, shotPoints, starsFor, type Help, type WaveResult } from './scoring'
import {
  ARENA_HALF,
  canHit,
  generateWave,
  isOutside,
  mirrorOf,
  type Spawn,
  type WaveLayout,
  type WaveSpec,
  type Weapon,
} from './waves'

export const HIT_RADIUS = 0.3
const DEFAULT_MARCH_INTERVAL = 3
/** Så længe en barriere holder marchørerne tilbage. */
export const BARRIER_TIME = 8
export const BOSS_PHASE_BONUS = 500

export type Phase = 'aiming' | 'firing' | 'cleared' | 'outOfAmmo' | 'escaped'

export interface Enemy extends Spawn {
  id: number
  alive: boolean
}

/** En lodret (x = k) eller vandret (y = k) barriere, som marchører ikke kan gå over. */
export interface Barrier {
  axis: 'x' | 'y'
  k: number
  timeLeft: number
}

export interface Shot {
  aim: Aim
  path: Path
  /** Ramte glitches sorteret efter x, i den rækkefølge strålen når dem. */
  hits: Enemy[]
  multiplier: number
}

export interface ShotOutcome {
  hits: number
  points: number
  bonus: number
  phase: Phase
  /** Nye glitches: delernes spejlbilleder og bossens næste fase. */
  spawned: Enemy[]
  /** 'hurt': bossen mistede et liv; 'defeated': sidste liv. */
  boss: 'hurt' | 'defeated' | null
}

export interface LevelResult {
  stars: 1 | 2 | 3
  score: number
}

export function defaultAim(weapon: Weapon): Aim {
  return weapon === 'grenade' ? { kind: 'parabola', a: -1, h: 0, k: 6 } : { kind: 'line', a: 1, b: 0 }
}

export class Game {
  level: Level = LEVELS[0]
  waveIndex = 0
  score = 0
  ammo = 0
  phase: Phase = 'aiming'
  enemies: Enemy[] = []
  walls: Wall[] = []
  barriers: Barrier[] = []
  barrierCharges = 0
  aim: Aim = defaultAim('laser')
  help: Help = { aimLine: true, coordinates: true }

  // Hjælp, der har været slået til på noget tidspunkt i bølgen. Så kan man ikke
  // sigte med hjælp og slå den fra lige før skuddet for at få flere point.
  private helpUsed: Help = { ...this.help }
  private layout: WaveLayout | null = null
  private scoreAtWaveStart = 0
  private shot: Shot | null = null
  private results: WaveResult[] = []
  private hopTimer = 0
  private pendingPhases: Spawn[][] = []
  private nextId = 1
  private rng: Rng

  constructor(seed = Date.now()) {
    this.rng = mulberry32(seed)
  }

  get spec(): WaveSpec {
    return this.level.waves[this.waveIndex]
  }

  get waveNumber(): number {
    return this.waveIndex + 1
  }

  get waveCount(): number {
    return this.level.waves.length
  }

  get isLastWave(): boolean {
    return this.waveIndex === this.level.waves.length - 1
  }

  get hint(): string {
    return this.spec.hint
  }

  get ammoTotal(): number {
    return this.layout?.ammo ?? 0
  }

  get weapon(): Weapon {
    return weaponOf(this.level)
  }

  /** Hvor det næste skud vil gå hen, eller hvorfor det ikke kan skydes. */
  get path(): PathResult {
    return computePath(this.aim, ARENA_HALF, this.walls)
  }

  /** Pointgangen for den igangværende bølge. */
  get multiplier(): number {
    return helpMultiplier(this.helpUsed)
  }

  /** Pointgangen fra næste bølge med de nuværende indstillinger. */
  get nextMultiplier(): number {
    return helpMultiplier(this.help)
  }

  get pointsThisWave(): number {
    return this.score - this.scoreAtWaveStart
  }

  get aliveCount(): number {
    return this.enemies.filter((e) => e.alive).length
  }

  get hasMarchers(): boolean {
    return this.enemies.some((e) => e.alive && e.march)
  }

  /** Bossens resterende liv (én pr. fase), eller null hvis bølgen ikke har en boss. */
  get bossLives(): number | null {
    if (!this.spec.boss) return null
    const current = this.enemies.some((e) => e.alive && e.boss) ? 1 : 0
    return current + this.pendingPhases.length
  }

  /** Sætter en barriere. Den koster ikke et skud, men der er kun få af dem. */
  placeBarrier(axis: Barrier['axis'], k: number): boolean {
    if (this.phase !== 'aiming' || this.barrierCharges <= 0) return false
    this.barrierCharges--
    this.barriers.push({ axis, k, timeLeft: BARRIER_TIME })
    return true
  }

  /** Sekunder til marchørernes næste skridt, eller null hvis ingen marcherer. */
  get timeToHop(): number | null {
    const active = this.phase === 'aiming' || this.phase === 'firing'
    return active && this.hasMarchers ? this.hopTimer : null
  }

  /** Når sidste bølge er klaret: stjerner og point for banen. */
  get levelResult(): LevelResult | null {
    if (this.phase !== 'cleared' || !this.isLastWave) return null
    return { stars: starsFor(this.results), score: this.score }
  }

  /** Starter banen. Med et seed bliver bølgerne de samme hver gang (bruges til ugens udfordring). */
  startLevel(level: Level, seed?: number): void {
    if (seed !== undefined) this.rng = mulberry32(seed)
    this.level = level
    const kind = this.weapon === 'grenade' ? 'parabola' : 'line'
    if (this.aim.kind !== kind) this.aim = defaultAim(this.weapon)
    if (this.aim.kind === 'parabola' && level.locked?.a !== undefined) this.aim = { ...this.aim, a: level.locked.a }
    this.score = 0
    this.results = []
    this.startWave(0)
  }

  nextWave(): void {
    if (this.phase === 'cleared' && !this.isLastWave) this.startWave(this.waveIndex + 1)
  }

  /** Samme bølge igen. Point fra det mislykkede forsøg tæller ikke. */
  retryWave(): void {
    this.score = this.scoreAtWaveStart
    this.loadLayout()
  }

  setAim(aim: Aim): void {
    this.aim = { ...aim }
  }

  setHelp(help: Help): void {
    this.help = { ...help }
    this.helpUsed = {
      aimLine: this.helpUsed.aimLine || help.aimLine,
      coordinates: this.helpUsed.coordinates || help.coordinates,
    }
  }

  /**
   * Flytter tiden frem. Marchørerne går kun, mens man sigter, så de står stille under skud og pauser.
   * Giver 'hop', når de har taget et skridt, og 'escaped', hvis en af dem er gået ud af banen.
   */
  update(dt: number): 'hop' | 'escaped' | null {
    if (this.phase !== 'aiming') return null
    for (const b of this.barriers) b.timeLeft -= dt
    this.barriers = this.barriers.filter((b) => b.timeLeft > 0)
    if (!this.hasMarchers) return null
    this.hopTimer -= dt
    if (this.hopTimer > 0) return null
    this.hopTimer += this.spec.marchInterval ?? DEFAULT_MARCH_INTERVAL
    let escaped = false
    for (const e of this.enemies) {
      if (!e.alive || !e.march) continue
      const next = { x: e.x + e.march.dx, y: e.y + e.march.dy }
      if (this.barriers.some((b) => blocks(b, e, next))) continue
      e.x = next.x
      e.y = next.y
      if (isOutside(e)) escaped = true
    }
    if (escaped) {
      this.phase = 'escaped'
      return 'escaped'
    }
    return 'hop'
  }

  fire(): Shot | null {
    if (this.phase !== 'aiming' || this.ammo <= 0) return null
    const result = this.path
    if (!result.ok) return null
    const path = result.path
    this.ammo--
    const onPath = this.enemies.filter((e) => e.alive && canHit(this.aim, e) && path.distanceTo(e.x, e.y) < HIT_RADIUS)
    // Tvillingens svage punkter tæller kun, hvis begge rammes i samme skud
    const hits = onPath
      .filter(
        (e) => e.link === undefined || this.enemies.every((o) => !o.alive || o.link !== e.link || onPath.includes(o)),
      )
      .sort((p, q) => p.x - q.x)
    hits.forEach((e) => (e.alive = false))
    this.shot = { aim: { ...this.aim }, path, hits, multiplier: this.multiplier }
    this.phase = 'firing'
    return this.shot
  }

  /** Kaldes, når strålens animation er færdig. */
  completeShot(): ShotOutcome {
    if (this.phase !== 'firing' || !this.shot) throw new Error('Intet skud i gang')
    const hits = this.shot.hits.length
    let points = shotPoints(hits, this.shot.multiplier)
    const spawned: Enemy[] = []
    for (const e of this.shot.hits) if (e.splits) spawned.push(this.spawn(mirrorOf(e)))

    let boss: ShotOutcome['boss'] = null
    if (this.shot.hits.some((e) => e.boss) && !this.enemies.some((e) => e.alive && e.boss)) {
      points += BOSS_PHASE_BONUS
      const next = this.pendingPhases.shift()
      if (next) {
        spawned.push(...next.map((p) => this.spawn(p)))
        boss = 'hurt'
      } else boss = 'defeated'
    }
    this.score += points
    let bonus = 0
    if (this.aliveCount === 0) {
      bonus = this.ammo * BONUS_PER_SPARE_SHOT
      this.score += bonus
      this.phase = 'cleared'
      this.results.push({
        shotsUsed: this.ammoTotal - this.ammo,
        minShots: this.layout?.solution.length ?? 0,
        helpUsed: { ...this.helpUsed },
      })
    } else {
      this.phase = this.ammo === 0 ? 'outOfAmmo' : 'aiming'
    }
    this.shot = null
    return { hits, points, bonus, phase: this.phase, spawned, boss }
  }

  private spawn(p: Spawn): Enemy {
    const e: Enemy = { ...p, id: this.nextId++, alive: true }
    if (p.march) e.march = { ...p.march }
    this.enemies.push(e)
    return e
  }

  private startWave(index: number): void {
    this.waveIndex = index
    this.layout = generateWave(this.spec, this.rng, this.weapon)
    this.scoreAtWaveStart = this.score
    this.loadLayout()
  }

  private loadLayout(): void {
    if (!this.layout) return
    this.enemies = []
    for (const p of this.layout.enemies) this.spawn(p)
    this.pendingPhases = this.layout.phases.map((phase) => phase.map((p) => ({ ...p })))
    this.walls = this.layout.walls.map((w) => ({ ...w }))
    this.barriers = []
    this.barrierCharges = this.spec.barriers ?? 0
    this.ammo = this.layout.ammo
    this.phase = 'aiming'
    this.helpUsed = { ...this.help }
    this.hopTimer = this.spec.marchInterval ?? DEFAULT_MARCH_INTERVAL
    this.shot = null
  }
}

/** Går marchøren over (eller ind på) barrierens linje i dette skridt? */
function blocks(b: Barrier, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const [p, q] = b.axis === 'x' ? [from.x, to.x] : [from.y, to.y]
  return p !== q && Math.min(p, q) <= b.k && b.k <= Math.max(p, q)
}
