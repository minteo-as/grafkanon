// Spillets regler uden grafik, så de kan testes for sig.

import { aimFunction, type Aim, type Path, type PathResult, type Wall } from '../math/path'
import { LEVELS, weaponOf, type Level } from './levels'
import { mulberry32, type Rng } from './rng'
import {
  BONUS_PER_SHIELD,
  BONUS_PER_SPARE_SHOT,
  helpMultiplier,
  shotPoints,
  starsFor,
  type Help,
  type WaveResult,
} from './scoring'
import {
  canHit,
  flightPoint,
  generateWave,
  SIDE_TOP,
  isOutside,
  mirrorOf,
  pathFor,
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
/** Basens skjolde i hver bølge. Mister den dem alle, falder basen. */
export const SHIELDS = 3
/** Hvor langt en glitch er i sin ladning, når den begynder at lyse rødt og advare. */
export const CHARGE_WARNING = 0.8
/** Sekunder mellem blinkernes hop. */
export const BLINK_EVERY = 7
/** Sekunder mellem kolonernes skridt frem langs kurven. */
export const GROW_EVERY = 9

/** 'fallen': glitcherne har skudt basens skjolde i stykker. */
export type Phase = 'aiming' | 'firing' | 'cleared' | 'outOfAmmo' | 'escaped' | 'fallen'

export interface Enemy extends Spawn {
  id: number
  alive: boolean
  /** Ladning mod næste angreb: 0 = lige skudt, 1 = skyder nu. Negativ i starten, så de ikke skyder samtidig. */
  charge: number
}

/** Hvad der skete, mens tiden gik. */
export interface UpdateResult {
  /** Marchørerne tog et skridt. */
  hop: boolean
  /** En marchør gik ud af banen. */
  escaped: boolean
  /** Glitches, der lige har skudt mod basen. */
  attacks: Enemy[]
  /** Glitches, der lige er begyndt at advare (lyser rødt). */
  warnings: Enemy[]
  /** Basen mistede sit sidste skjold. */
  fallen: boolean
  /** Blinkere, der lige har hoppet. */
  blinked: Enemy[]
  /** Nye kolonier: hver koloni deler sig og får en ny ét skridt længere fremme på kurven. */
  grown: Enemy[]
  /** Kolonier, der er nået toppen og springer (koster et skjold). */
  bursts: Enemy[]
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
  /** Bonus for skud og skjolde, der er tilbage, når bølgen er klaret. */
  bonus: number
  shieldBonus: number
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
  if (weapon === 'grenade') return { kind: 'parabola', a: -1, h: 0, k: 6 }
  if (weapon === 'rocket') return { kind: 'exp', a: 2, b: 1 }
  if (weapon === 'final') return { kind: 'line', a: 0.5, b: 4 }
  return { kind: 'line', a: 1, b: 0 }
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
  shields = SHIELDS
  /** Kan slås fra i menuen, så man kan spille i ro. */
  attacksEnabled = true

  // Hjælp, der har været slået til på noget tidspunkt i bølgen. Så kan man ikke
  // sigte med hjælp og slå den fra lige før skuddet for at få flere point.
  private helpUsed: Help = { ...this.help }
  private layout: WaveLayout | null = null
  private scoreAtWaveStart = 0
  private shot: Shot | null = null
  private results: WaveResult[] = []
  private hopTimer = 0
  private blinkTimer = BLINK_EVERY
  private growTimer = GROW_EVERY
  /** Sekunder, man har sigtet i bølgen. Styrer de flyvende droner. */
  private elapsed = 0
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
    return pathFor(this.weapon, this.aim, this.walls)
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

  /** Angriber glitcherne i denne bølge? */
  get attacking(): boolean {
    return this.attacksEnabled && !!this.spec.attack
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
    const previous = this.weapon
    this.level = level
    // Sigtet beholdes fra bane til bane med samme våben, men ikke over i et andet våben
    if (this.weapon !== previous || this.aim.kind !== defaultAim(this.weapon).kind) this.aim = defaultAim(this.weapon)
    if (this.aim.kind === 'parabola' && level.locked?.a !== undefined) this.aim = { ...this.aim, a: level.locked.a }
    this.score = 0
    this.results = []
    this.startWave(0)
  }

  /** Samme bølge med nye mål. Pointene beholdes (bruges på træningsbanen). */
  rerollWave(): void {
    this.startWave(this.waveIndex)
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
   * Flytter tiden frem. Alt sker kun, mens man sigter, så marchører og ladninger står stille under
   * skud og pauser. Marchørerne tager et skridt, når uret slår, og glitcherne lader op og skyder
   * mod basen, når ladningen er fuld.
   */
  update(dt: number): UpdateResult {
    const result: UpdateResult = {
      hop: false,
      escaped: false,
      attacks: [],
      warnings: [],
      fallen: false,
      blinked: [],
      grown: [],
      bursts: [],
    }
    if (this.phase !== 'aiming') return result
    for (const b of this.barriers) b.timeLeft -= dt
    this.barriers = this.barriers.filter((b) => b.timeLeft > 0)
    this.moveSpecials(dt, result)
    if (this.phase !== 'aiming') return result

    if (this.attacking) {
      const time = this.spec.attack!
      for (const e of this.enemies) {
        // Kolonier lader ikke op; deres vækst er truslen
        if (!e.alive || e.grow) continue
        const before = e.charge
        e.charge += dt / time
        if (before < CHARGE_WARNING && e.charge >= CHARGE_WARNING) result.warnings.push(e)
        if (e.charge < 1) continue
        e.charge = 0
        result.attacks.push(e)
        this.shields = Math.max(0, this.shields - 1)
      }
      if (result.attacks.length && this.shields === 0) {
        this.phase = 'fallen'
        result.fallen = true
        return result
      }
    }

    if (!this.hasMarchers) return result
    this.hopTimer -= dt
    if (this.hopTimer > 0) return result
    this.hopTimer += this.spec.marchInterval ?? DEFAULT_MARCH_INTERVAL
    for (const e of this.enemies) {
      if (!e.alive || !e.march) continue
      const next = { x: e.x + e.march.dx, y: e.y + e.march.dy }
      if (this.barriers.some((b) => blocks(b, e, next))) continue
      e.x = next.x
      e.y = next.y
      if (isOutside(e)) result.escaped = true
    }
    if (result.escaped) this.phase = 'escaped'
    else result.hop = true
    return result
  }

  /** Flyvende droner, blinkere og kolonier. Sker kun, mens man sigter, ligesom resten. */
  private moveSpecials(dt: number, result: UpdateResult): void {
    this.elapsed += dt
    for (const e of this.enemies) if (e.alive && e.fly) Object.assign(e, flightPoint(e.fly, this.elapsed))

    this.blinkTimer -= dt
    if (this.blinkTimer <= 0) {
      this.blinkTimer += BLINK_EVERY
      for (const e of this.enemies) {
        if (!e.alive || !e.blink) continue
        const there = e.blink
        e.blink = { x: e.x, y: e.y }
        e.x = there.x
        e.y = there.y
        result.blinked.push(e)
      }
    }

    // Kolonierne vokser kun, når angreb er slået til, for det er deres måde at true basen på
    this.growTimer -= dt
    if (this.growTimer > 0 || !this.attacking) return
    this.growTimer += GROW_EVERY
    const colonies = new Map<Aim, Enemy[]>()
    for (const e of this.enemies)
      if (e.alive && e.grow) colonies.set(e.grow.aim, [...(colonies.get(e.grow.aim) ?? []), e])
    for (const [aim, members] of colonies) {
      // Den forreste koloni deler sig: en ny dukker op ét skridt længere fremme på kurven
      const front = members.reduce((a, b) => (b.x > a.x ? b : a))
      const x = front.x + 1
      const y = aimFunction(aim)(x)
      if (x > front.grow!.maxX || y > SIDE_TOP - 0.6) {
        // Den er nået toppen og springer: det koster et skjold, og det sker igen, til man rammer den
        result.bursts.push(front)
        this.shields = Math.max(0, this.shields - 1)
        continue
      }
      // Er pladsen optaget af en anden glitch, venter kolonien til næste gang
      if (this.enemies.some((o) => o.alive && Math.hypot(o.x - x, o.y - y) < 1.4)) continue
      result.grown.push(this.spawn({ x, y, grow: front.grow }))
    }
    if (result.bursts.length && this.shields === 0) {
      this.phase = 'fallen'
      result.fallen = true
    }
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
    let shieldBonus = 0
    if (this.aliveCount === 0) {
      bonus = this.ammo * BONUS_PER_SPARE_SHOT
      shieldBonus = this.attacking ? this.shields * BONUS_PER_SHIELD : 0
      bonus += shieldBonus
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
    return { hits, points, bonus, shieldBonus, phase: this.phase, spawned, boss }
  }

  private spawn(p: Spawn): Enemy {
    // Forskudt start: hver glitch venter lidt ekstra, så de ikke skyder samtidig
    const delay = ((this.enemies.length * 0.37) % 1) * 0.6
    const e: Enemy = { ...p, id: this.nextId++, alive: true, charge: -delay }
    if (p.blink) e.blink = { ...p.blink }
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
    this.shields = SHIELDS
    this.phase = 'aiming'
    this.helpUsed = { ...this.help }
    this.hopTimer = this.spec.marchInterval ?? DEFAULT_MARCH_INTERVAL
    this.blinkTimer = BLINK_EVERY
    this.growTimer = GROW_EVERY
    this.elapsed = 0
    this.shot = null
  }
}

/** Går marchøren over (eller ind på) barrierens linje i dette skridt? */
function blocks(b: Barrier, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const [p, q] = b.axis === 'x' ? [from.x, to.x] : [from.y, to.y]
  return p !== q && Math.min(p, q) <= b.k && b.k <= Math.max(p, q)
}
