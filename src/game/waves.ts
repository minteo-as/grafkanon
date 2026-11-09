import type { Line } from '../math/line'
import {
  aimFunction,
  computeGrowthPath,
  computePath,
  computeSideLinePath,
  roots,
  WALL_HALF_WIDTH,
  type Aim,
  type PathResult,
  type Wall,
} from '../math/path'
import { pick, randInt, shuffle, type Rng } from './rng'

export const ARENA_HALF = 10 // banen går fra −10 til 10 på begge akser (i sidebilledet x fra −10 til 10)
export const SPAWN_LIMIT = 8 // glitches står inden for ±8, så der er luft til kanten
export const SIDE_TOP = 12 // sidebilledet går fra jorden (y = 0) op til y = 12
export const GROWTH_WIDTH = 2 * ARENA_HALF // i Vækstlaboratoriet er x tiden fra 0 til 20
const DRONE_MAX_Y = 11
const MIN_GAP = 1.9

// Marchører skal have tid nok til, at man kan nå at tænke, men ikke så meget, at der ikke er pres
export const MIN_HOPS = 7
export const MAX_HOPS = 12

/** 'final': Finalen, hvor alle tre våben kan bruges i samme sidebillede. */
export type Weapon = 'laser' | 'grenade' | 'rocket' | 'final'

export interface Point {
  x: number
  y: number
}

/** Et skridt på ét felt, som marchørerne tager hver gang, uret slår. */
export interface March {
  dx: number
  dy: number
}

/** Glitches på samme rette linje (laser). */
export interface LineGroup {
  kind?: 'line'
  count: number
  slopes: readonly number[]
  march?: March
  /** Skjoldbærere: kan kun rammes af en linje med negativ (neg) eller positiv (pos) hældning. */
  shield?: Shield
}

export type Shield = 'neg' | 'pos'

/** Droner på samme parabel (granat). */
export interface ArcGroup {
  kind: 'arc'
  count: number
  /** Mulige værdier af a. */
  as: readonly number[]
  /** En af dronerne sidder i toppunktet. */
  top?: boolean
  /** En glitch står på jorden i det højre nulpunkt (tæller med i count). */
  ground?: boolean
  /** En drone sidder på y-aksen, hvor buen skærer den (y = c i ax² + bx + c). */
  yAxis?: boolean
}

/** Droner på samme vækstkurve (raket): y = b · aˣ, eller y = ax + b, hvis væksten er lineær. */
export interface GrowthGroup {
  kind: 'growth'
  count: number
  /** Mulige vækstfaktorer a (eller hældninger, hvis linear). */
  as: readonly number[]
  /** Mulige startværdier b. */
  bs: readonly number[]
  /** Lineær vækst y = ax + b i stedet for eksponentiel. */
  linear?: boolean
  /** En drone sidder på y-aksen i startværdien (0, b). */
  start?: boolean
}

/**
 * Tvillingen: to svage punkter, der skal rammes i samme skud. Kurven: flyver langs en parabel med det
 * svage punkt i toppunktet. Kolonien: to svage punkter på samme vækstkurve, der skal rammes i samme skud.
 */
export interface BossSpec {
  kind: BossKind
  phases: number
  /** Hældninger (Tvillingen), værdier af a (Kurven) eller vækstfaktorer (Kolonien). */
  values: readonly number[]
}

/** 'final': Kernen, slutbossen, med én fase til hvert våben. */
export type BossKind = 'twins' | 'curve' | 'colony' | 'final'

export type Group = LineGroup | ArcGroup | GrowthGroup

export interface WaveSpec {
  groups: Group[]
  singles: number
  spareShots: number
  hint: string
  /** Sekunder mellem marchørernes skridt. */
  marchInterval?: number
  /** Antal mure i sidebilledet. */
  walls?: number
  /** Antal delere: når de rammes, dukker en ny glitch op spejlet i y-aksen. */
  splitters?: number
  /** Antal barrierer (x = k eller y = k), man kan sætte i bølgen. */
  barriers?: number
  /** Raketten kan også skyde med lineær vækst y = ax + b. */
  linear?: boolean
  /** Sekunder, det tager en glitch at lade op og skyde mod basen. Uden værdi angriber de ikke. */
  attack?: number
  boss?: BossSpec
}

export interface BossTag {
  kind: BossKind
  /** Hvilken af bossens faser punktet hører til (0 = første). */
  phase: number
  /** Kurvens egen bane. */
  path?: Aim
}

export interface Spawn extends Point {
  march?: March
  shield?: Shield
  splits?: boolean
  boss?: BossTag
  /** Punkter med samme link skal rammes i samme skud (Tvillingens og Koloniens svage punkter). */
  link?: number
}

export interface WaveLayout {
  enemies: Spawn[]
  /** Bossens næste faser. De dukker op, når den forrige fase er besejret. */
  phases: Spawn[][]
  walls: Wall[]
  ammo: number
  /** Én måde at klare bølgen med færrest mulige skud. */
  solution: Aim[]
}

/** Skjolde stopper linjer med forkert fortegn på hældningen (og granater). */
export function canHit(aim: Aim, target: Spawn): boolean {
  if (!target.shield) return true
  if (aim.kind !== 'line') return false
  return target.shield === 'neg' ? aim.a < 0 : aim.a > 0
}

/** Hvor våbnet skyder hen. Raketten har sit eget koordinatsystem, hvor x er tiden fra 0 til 20. */
export function pathFor(weapon: Weapon, aim: Aim, walls: readonly Wall[] = []): PathResult {
  if (weapon === 'rocket') return computeGrowthPath(aim, GROWTH_WIDTH, SIDE_TOP)
  if (weapon === 'final') {
    // I Finalen bestemmer funktionen våbnet: linje = laser, parabel = granat, vækst = raket fra y-aksen
    if (aim.kind === 'line') return computeSideLinePath(aim, ARENA_HALF, SIDE_TOP)
    if (aim.kind === 'exp') return computeGrowthPath(aim, ARENA_HALF, SIDE_TOP)
  }
  return computePath(aim, ARENA_HALF, walls)
}

/** Hvor glitches må stå på en linje: på gulvet overalt inden for ±8, i Finalens sidebillede over jorden. */
const LINE_SPOTS = {
  floor: { xMax: SPAWN_LIMIT, yMin: -SPAWN_LIMIT, yMax: SPAWN_LIMIT },
  side: { xMax: 9, yMin: 1, yMax: DRONE_MAX_Y },
}

/** Delerens nye glitch dukker op spejlet i y-aksen. */
export const mirrorOf = (p: Point): Point => ({ x: -p.x, y: p.y })

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y)
const isInt = (v: number) => Math.abs(v - Math.round(v)) < 1e-9

/** Hvor mange skridt der går, før en marchør er ude af banen. */
export function hopsToEscape(p: Point, m: March): number {
  const steps = (pos: number, d: number) =>
    d > 0 ? Math.floor((ARENA_HALF - pos) / d) + 1 : d < 0 ? Math.floor((pos + ARENA_HALF) / -d) + 1 : Infinity
  return Math.min(steps(p.x, m.dx), steps(p.y, m.dy))
}

export const isOutside = (p: Point): boolean => Math.abs(p.x) > ARENA_HALF || Math.abs(p.y) > ARENA_HALF

/** Vælger punkter blandt kandidaterne: mindst minDx fra hinanden på x-aksen og ikke for tæt på andre glitches. */
function choosePoints(
  required: Point[],
  candidates: Point[],
  count: number,
  taken: Point[],
  rng: Rng,
  minDx = 2,
): Point[] | null {
  const out: Point[] = []
  const fits = (p: Point) =>
    !out.some((q) => Math.abs(q.x - p.x) < minDx) &&
    !taken.some((q) => dist(p, q) < MIN_GAP) &&
    !out.some((q) => dist(p, q) < MIN_GAP)
  for (const p of required) {
    if (!fits(p)) return null
    out.push(p)
  }
  for (const p of shuffle([...candidates], rng)) {
    if (out.length === count) break
    if (fits(p)) out.push(p)
  }
  return out.length === count ? out : null
}

function pointsOnLine(
  line: Line,
  count: number,
  taken: Point[],
  rng: Rng,
  march?: March,
  spots = LINE_SPOTS.floor,
): Point[] | null {
  const candidates: Point[] = []
  for (let x = -spots.xMax; x <= spots.xMax; x++) {
    const y = line.a * x + line.b
    if (!isInt(y) || Math.round(y) < spots.yMin || Math.round(y) > spots.yMax) continue
    const p = { x, y: Math.round(y) }
    if (march && hopsToEscape(p, march) < MIN_HOPS) continue
    candidates.push(p)
  }
  const out = choosePoints([], candidates, count, taken, rng)
  if (!out) return null
  if (march && Math.min(...out.map((p) => hopsToEscape(p, march))) > MAX_HOPS) return null
  return out
}

function placeArc(group: ArcGroup, taken: Point[], rng: Rng): { points: Point[]; aim: Aim } | null {
  const a = pick(group.as, rng)
  let h: number
  let k: number
  if (group.ground) {
    // Nulpunkterne skal være hele tal: h ± r, hvor k = −a·r²
    const r = randInt(1, 6, rng)
    k = -a * r * r
    if (k < 2 || k > DRONE_MAX_Y) return null
    h = randInt(-ARENA_HALF + r, ARENA_HALF - r, rng)
  } else {
    h = randInt(-6, 6, rng)
    k = randInt(3, DRONE_MAX_Y, rng)
  }
  const rs = roots(a, h, k)
  if (!rs || rs[0] < -ARENA_HALF || rs[1] > ARENA_HALF) return null
  if (group.top && !isInt(k)) return null

  const f = aimFunction({ kind: 'parabola', a, h, k })
  const candidates: Point[] = []
  for (let x = Math.ceil(rs[0]); x <= Math.floor(rs[1]); x++) {
    const y = f(x)
    if (isInt(y) && y >= 1 && y <= DRONE_MAX_Y && !(x === h && group.top)) candidates.push({ x, y: Math.round(y) })
  }
  const required: Point[] = []
  if (group.top) required.push({ x: h, y: k })
  if (group.ground) required.push({ x: rs[1], y: 0 })
  if (group.yAxis) {
    const c = f(0)
    if (h === 0 || rs[0] >= 0 || rs[1] <= 0 || !isInt(c) || c < 1 || c > DRONE_MAX_Y) return null
    required.push({ x: 0, y: Math.round(c) })
  }
  const points = choosePoints(required, candidates, group.count, taken, rng)
  return points ? { points, aim: { kind: 'parabola', a, h, k } } : null
}

/** Punkter på vækstkurven ved hele x (tidsskridt), hvor en drone kan sidde. */
function growthCandidates(aim: Aim, maxX = GROWTH_WIDTH - 2): Point[] {
  const f = aimFunction(aim)
  const out: Point[] = []
  for (let x = 1; x <= maxX; x++) {
    const y = f(x)
    if (y >= 0.6 && y <= DRONE_MAX_Y + 0.4) out.push({ x, y: isInt(y) ? Math.round(y) : y })
  }
  return out
}

/**
 * Vækst går hurtigt ud af billedet, så dronerne må gerne stå ét skridt fra hinanden, hvis de er
 * langt nok fra hinanden i højden. Så kan man se faktoren direkte: fx 2, 4, 8 ved x = 1, 2, 3.
 */
function placeGrowth(
  group: GrowthGroup,
  taken: Point[],
  rng: Rng,
  maxX = GROWTH_WIDTH - 2,
): { points: Point[]; aim: Aim } | null {
  const a = pick(group.as, rng)
  const b = pick(group.bs, rng)
  const aim: Aim = group.linear ? { kind: 'line', a, b } : { kind: 'exp', a, b }
  const required = group.start ? [{ x: 0, y: b }] : []
  const points = choosePoints(required, growthCandidates(aim, maxX), group.count, taken, rng, 1)
  return points ? { points, aim } : null
}

/** Mure placeres, så løsningen stadig kommer over, men en lav bue bliver stoppet. */
function placeWalls(count: number, enemies: Point[], solution: Aim[], rng: Rng): Wall[] | null {
  const candidates: Wall[] = []
  const arcs = solution.filter((s) => s.kind === 'parabola')
  for (let x = -8; x <= 8; x++) {
    let clearance = Infinity
    for (const arc of arcs) {
      const rs = roots(arc.a, arc.h, arc.k)!
      if (x - WALL_HALF_WIDTH <= rs[0] || x + WALL_HALF_WIDTH >= rs[1]) continue
      const f = aimFunction(arc)
      clearance = Math.min(clearance, f(x - WALL_HALF_WIDTH), f(x + WALL_HALF_WIDTH))
    }
    if (clearance === Infinity) continue // ingen bue går forbi her, så muren gør ingen forskel
    const height = Math.min(9, Math.floor(clearance - 0.8))
    if (height < 2) continue
    if (enemies.some((e) => Math.abs(e.x - x) < 1 && e.y < height + 1)) continue
    candidates.push({ x, height })
  }
  // Høje mure gør mest forskel, så der vælges tilfældigt blandt de højeste
  candidates.sort((p, q) => q.height - p.height)
  const walls: Wall[] = []
  while (walls.length < count) {
    const open = candidates.filter((c) => walls.every((w) => Math.abs(w.x - c.x) >= 3))
    if (!open.length) return null
    walls.push(pick(open.slice(0, 3), rng))
  }
  return walls
}

function tryGenerate(spec: WaveSpec, weapon: Weapon, rng: Rng): WaveLayout | null {
  const enemies: Spawn[] = []
  const solution: Aim[] = []
  for (const group of spec.groups) {
    let placed: Point[] | null = null
    for (let t = 0; t < 60 && !placed; t++) {
      if (group.kind === 'arc' || group.kind === 'growth') {
        // I Finalen står raketten i midten af sidebilledet, så vækstkurven har kun den højre halvdel
        const placedGroup =
          group.kind === 'arc'
            ? placeArc(group, enemies, rng)
            : placeGrowth(group, enemies, rng, weapon === 'final' ? ARENA_HALF - 1 : undefined)
        if (!placedGroup) continue
        // To grupper på samme kurve ville være én gruppe
        if (solution.some((s) => JSON.stringify(s) === JSON.stringify(placedGroup.aim))) continue
        placed = placedGroup.points
        solution.push(placedGroup.aim)
      } else {
        const slopes = group.shield
          ? group.slopes.filter((a) => (group.shield === 'neg' ? a < 0 : a > 0))
          : group.slopes
        const side = weapon === 'final'
        const line = { a: pick(slopes, rng), b: side ? randInt(1, 10, rng) : randInt(-5, 5, rng) }
        if (solution.some((s) => s.kind === 'line' && s.a === line.a)) continue
        placed = pointsOnLine(line, group.count, enemies, rng, group.march, side ? LINE_SPOTS.side : LINE_SPOTS.floor)
        if (placed) solution.push({ kind: 'line', ...line })
      }
    }
    if (!placed) return null
    for (const p of placed) {
      const spawn: Spawn = { ...p }
      if (group.kind !== 'arc' && group.kind !== 'growth') {
        if (group.march) spawn.march = { ...group.march }
        if (group.shield) spawn.shield = group.shield
      }
      enemies.push(spawn)
    }
  }

  for (let s = 0; s < spec.singles; s++) {
    let p: Point | null = null
    for (let t = 0; t < 80 && !p; t++) {
      const c =
        weapon === 'grenade'
          ? { x: randInt(-7, 7, rng), y: randInt(2, 9, rng) }
          : weapon === 'rocket'
            ? { x: randInt(2, 17, rng), y: randInt(1, 10, rng) }
            : weapon === 'final'
              ? { x: randInt(-8, 8, rng), y: randInt(2, 10, rng) }
              : { x: randInt(-7, 7, rng), y: randInt(-7, 7, rng) }
      if (enemies.every((q) => dist(c, q) >= 2.5)) p = c
    }
    if (!p) return null
    enemies.push(p)
    // En enlig drone rammes af en bue med toppunkt i dronen eller en raket uden vækst (a = 1);
    // en enlig glitch på gulvet af en vandret linje
    solution.push(
      weapon === 'grenade'
        ? { kind: 'parabola', a: -1, h: p.x, k: p.y }
        : weapon === 'rocket'
          ? { kind: 'exp', a: 1, b: p.y }
          : { kind: 'line', a: 0, b: p.y },
    )
  }

  for (let s = 0; s < (spec.splitters ?? 0); s++) {
    let p: Point | null = null
    for (let t = 0; t < 80 && !p; t++) {
      const c = { x: randInt(2, 7, rng) * (rng() < 0.5 ? -1 : 1), y: randInt(-7, 7, rng) }
      if ([c, mirrorOf(c)].every((m) => enemies.every((q) => dist(m, q) >= 2.5))) p = c
    }
    if (!p) return null
    enemies.push({ ...p, splits: true })
    // Én vandret linje rammer deleren, og samme linje rammer bagefter den spejlede glitch
    solution.push({ kind: 'line', a: 0, b: p.y }, { kind: 'line', a: 0, b: p.y })
  }

  const phases: Spawn[][] = []
  if (spec.boss) {
    for (let phase = 0; phase < spec.boss.phases; phase++) {
      const placed = placeBossPhase(spec.boss, phase, enemies, rng, weapon)
      if (!placed) return null
      phases.push(placed.spawns)
      solution.push(placed.aim)
    }
  }

  const all = [...enemies, ...phases.flat()]
  const walls = spec.walls ? placeWalls(spec.walls, all, solution, rng) : []
  if (!walls) return null
  return {
    enemies: [...enemies, ...(phases[0] ?? [])],
    phases: phases.slice(1),
    walls,
    ammo: solution.length + spec.spareShots,
    solution,
  }
}

/** Én af bossens faser. Faserne kommer efter hinanden, så de må gerne stå samme sted. */
/** Kernens faser i rækkefølge: først laseren (to punkter på en linje), så granaten, så raketten. */
const FINAL_PHASES: { kind: BossKind; values: number[] }[] = [
  { kind: 'twins', values: [0.5, 1, -1, -0.5, 2] },
  { kind: 'curve', values: [-0.5, -1] },
  { kind: 'colony', values: [2, 1.5, 0.5] },
]

function placeBossPhase(
  spec: BossSpec,
  phase: number,
  minions: Point[],
  rng: Rng,
  weapon: Weapon = 'laser',
): { spawns: Spawn[]; aim: Aim } | null {
  const step = spec.kind === 'final' ? FINAL_PHASES[phase % FINAL_PHASES.length] : null
  const boss = step ? { ...spec, kind: step.kind, values: step.values } : spec
  const side = weapon === 'final'
  for (let t = 0; t < 80; t++) {
    if (boss.kind === 'twins') {
      const spots = side ? LINE_SPOTS.side : LINE_SPOTS.floor
      const line = { a: pick(boss.values, rng), b: side ? randInt(2, 9, rng) : randInt(-5, 5, rng) }
      const candidates: Point[] = []
      for (let x = -spots.xMax; x <= spots.xMax; x++) {
        const y = line.a * x + line.b
        if (isInt(y) && Math.round(y) >= spots.yMin && Math.round(y) <= spots.yMax) {
          candidates.push({ x, y: Math.round(y) })
        }
      }
      const free = shuffle(
        candidates.filter((p) => minions.every((q) => dist(p, q) >= 2.5)),
        rng,
      )
      // De to svage punkter står mindst 4 fra hinanden, så linjen ikke er til at gætte
      const first = free[0]
      const second = first && free.find((p) => Math.abs(p.x - first.x) >= 4)
      if (!first || !second) continue
      const tag: BossTag = { kind: 'twins', phase }
      return {
        spawns: [first, second].map((p) => ({ ...p, boss: tag, link: phase + 1 })),
        aim: { kind: 'line', ...line },
      }
    }
    if (boss.kind === 'colony') {
      // To svage punkter ét skridt fra hinanden på samme vækstkurve, så a = y₂ : y₁
      const a = pick(boss.values, rng)
      const aim: Aim = { kind: 'exp', a, b: randInt(a < 1 ? 6 : 1, a < 1 ? 11 : 4, rng) }
      const free = shuffle(
        growthCandidates(aim, side ? ARENA_HALF - 1 : undefined).filter((p) => minions.every((q) => dist(p, q) >= 2.5)),
        rng,
      )
      const first = free[0]
      const second = first && free.find((p) => Math.abs(p.x - first.x) === 1 && dist(p, first) >= MIN_GAP)
      if (!first || !second) continue
      const tag: BossTag = { kind: 'colony', phase }
      return { spawns: [first, second].map((p) => ({ ...p, boss: tag, link: phase + 1 })), aim }
    }
    const arc = placeArc({ kind: 'arc', count: 3, as: boss.values, top: true }, minions, rng)
    if (!arc || arc.aim.kind !== 'parabola') continue
    const top = { x: arc.aim.h, y: arc.aim.k }
    return {
      spawns: arc.points.map((p) =>
        p.x === top.x && p.y === top.y ? { ...p, boss: { kind: 'curve', phase, path: arc.aim } } : p,
      ),
      aim: arc.aim,
    }
  }
  return null
}

/** Alle mål i bølgen: dem fra start, bossens senere faser og delernes spejlede glitches. */
export function allTargets(layout: WaveLayout): Spawn[] {
  const now = [...layout.enemies, ...layout.phases.flat()]
  return [...now, ...now.filter((e) => e.splits).map(mirrorOf)]
}

/** Hver glitch ligger på en af løsningens baner, kan rammes af den, og ingen mur stopper banen før glitchen. */
export function isSolvable(layout: WaveLayout, weapon: Weapon = 'laser'): boolean {
  const paths = layout.solution.map((s) => ({ aim: s, result: pathFor(weapon, s, layout.walls) }))
  if (!paths.every((p) => p.result.ok)) return false
  return allTargets(layout).every((e) =>
    paths.some((p) => p.result.ok && canHit(p.aim, e) && p.result.path.distanceTo(e.x, e.y) < 1e-6),
  )
}

export function generateWave(spec: WaveSpec, rng: Rng, weapon: Weapon = 'laser'): WaveLayout {
  for (let tries = 0; tries < 800; tries++) {
    const layout = tryGenerate(spec, weapon, rng)
    if (layout && isSolvable(layout, weapon)) return layout
  }
  // Nødløsning, hvis tilfældigheden er meget uheldig
  if (weapon === 'final') {
    return {
      enemies: [
        { x: -4, y: 2 },
        { x: 0, y: 4 },
        { x: 4, y: 6 },
      ],
      phases: [],
      walls: [],
      ammo: 2,
      solution: [{ kind: 'line', a: 0.5, b: 4 }],
    }
  }
  if (weapon === 'rocket') {
    return {
      enemies: [
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 8 },
      ],
      phases: [],
      walls: [],
      ammo: 2,
      solution: [{ kind: 'exp', a: 2, b: 1 }],
    }
  }
  return weapon === 'grenade'
    ? {
        enemies: [
          { x: 0, y: 4 },
          { x: -1, y: 3 },
          { x: 1, y: 3 },
        ],
        phases: [],
        walls: [],
        ammo: 2,
        solution: [{ kind: 'parabola', a: -1, h: 0, k: 4 }],
      }
    : {
        enemies: [
          { x: -2, y: -3 },
          { x: 0, y: 1 },
          { x: 2, y: 5 },
        ],
        phases: [],
        walls: [],
        ammo: 2,
        solution: [{ kind: 'line', a: 2, b: 1 }],
      }
}
