import type { Line } from '../math/line'
import { aimFunction, computePath, roots, WALL_HALF_WIDTH, type Aim, type Wall } from '../math/path'
import { pick, randInt, shuffle, type Rng } from './rng'

export const ARENA_HALF = 10 // banen går fra −10 til 10 på begge akser (i sidebilledet x fra −10 til 10)
export const SPAWN_LIMIT = 8 // glitches står inden for ±8, så der er luft til kanten
export const SIDE_TOP = 12 // sidebilledet går fra jorden (y = 0) op til y = 12
const DRONE_MAX_Y = 11
const MIN_GAP = 1.9

// Marchører skal have tid nok til, at man kan nå at tænke, men ikke så meget, at der ikke er pres
export const MIN_HOPS = 7
export const MAX_HOPS = 12

export type Weapon = 'laser' | 'grenade'

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
}

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
}

export type Group = LineGroup | ArcGroup

export interface WaveSpec {
  groups: Group[]
  singles: number
  spareShots: number
  hint: string
  /** Sekunder mellem marchørernes skridt. */
  marchInterval?: number
  /** Antal mure i sidebilledet. */
  walls?: number
}

export interface Spawn extends Point {
  march?: March
}

export interface WaveLayout {
  enemies: Spawn[]
  walls: Wall[]
  ammo: number
  /** Én måde at klare bølgen med færrest mulige skud (ved bølgens start). */
  solution: Aim[]
}

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y)
const isInt = (v: number) => Math.abs(v - Math.round(v)) < 1e-9

/** Hvor mange skridt der går, før en marchør er ude af banen. */
export function hopsToEscape(p: Point, m: March): number {
  const steps = (pos: number, d: number) =>
    d > 0 ? Math.floor((ARENA_HALF - pos) / d) + 1 : d < 0 ? Math.floor((pos + ARENA_HALF) / -d) + 1 : Infinity
  return Math.min(steps(p.x, m.dx), steps(p.y, m.dy))
}

export const isOutside = (p: Point): boolean => Math.abs(p.x) > ARENA_HALF || Math.abs(p.y) > ARENA_HALF

/** Vælger punkter blandt kandidaterne: mindst 2 fra hinanden på x-aksen og ikke for tæt på andre glitches. */
function choosePoints(required: Point[], candidates: Point[], count: number, taken: Point[], rng: Rng): Point[] | null {
  const out: Point[] = []
  const fits = (p: Point) =>
    !out.some((q) => Math.abs(q.x - p.x) < 2) &&
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

function pointsOnLine(line: Line, count: number, taken: Point[], rng: Rng, march?: March): Point[] | null {
  const candidates: Point[] = []
  for (let x = -SPAWN_LIMIT; x <= SPAWN_LIMIT; x++) {
    const y = line.a * x + line.b
    if (!isInt(y) || Math.abs(Math.round(y)) > SPAWN_LIMIT) continue
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
  const points = choosePoints(required, candidates, group.count, taken, rng)
  return points ? { points, aim: { kind: 'parabola', a, h, k } } : null
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
      if (group.kind === 'arc') {
        const arc = placeArc(group, enemies, rng)
        if (!arc) continue
        placed = arc.points
        solution.push(arc.aim)
      } else {
        const line = { a: pick(group.slopes, rng), b: randInt(-5, 5, rng) }
        if (solution.some((s) => s.kind === 'line' && s.a === line.a)) continue
        placed = pointsOnLine(line, group.count, enemies, rng, group.march)
        if (placed) solution.push({ kind: 'line', ...line })
      }
    }
    if (!placed) return null
    enemies.push(...placed.map((p) => (group.kind !== 'arc' && group.march ? { ...p, march: { ...group.march } } : p)))
  }

  for (let s = 0; s < spec.singles; s++) {
    let p: Point | null = null
    for (let t = 0; t < 80 && !p; t++) {
      const c =
        weapon === 'grenade'
          ? { x: randInt(-7, 7, rng), y: randInt(2, 9, rng) }
          : { x: randInt(-7, 7, rng), y: randInt(-7, 7, rng) }
      if (enemies.every((q) => dist(c, q) >= 2.5)) p = c
    }
    if (!p) return null
    enemies.push(p)
    // En enlig drone rammes af en bue med toppunkt i dronen; en enlig glitch på gulvet af en vandret linje
    solution.push(weapon === 'grenade' ? { kind: 'parabola', a: -1, h: p.x, k: p.y } : { kind: 'line', a: 0, b: p.y })
  }

  const walls = spec.walls ? placeWalls(spec.walls, enemies, solution, rng) : []
  if (!walls) return null
  return { enemies, walls, ammo: solution.length + spec.spareShots, solution }
}

/** Hver glitch ligger på en af løsningens baner, og ingen mur stopper banen før glitchen. */
export function isSolvable(layout: WaveLayout): boolean {
  const paths = layout.solution.map((s) => computePath(s, ARENA_HALF, layout.walls))
  if (!paths.every((p) => p.ok)) return false
  return layout.enemies.every((e) => paths.some((p) => p.ok && p.path.distanceTo(e.x, e.y) < 1e-6))
}

export function generateWave(spec: WaveSpec, rng: Rng, weapon: Weapon = 'laser'): WaveLayout {
  for (let tries = 0; tries < 800; tries++) {
    const layout = tryGenerate(spec, weapon, rng)
    if (layout && isSolvable(layout)) return layout
  }
  // Nødløsning, hvis tilfældigheden er meget uheldig
  return weapon === 'grenade'
    ? {
        enemies: [
          { x: 0, y: 4 },
          { x: -1, y: 3 },
          { x: 1, y: 3 },
        ],
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
        walls: [],
        ammo: 2,
        solution: [{ kind: 'line', a: 2, b: 1 }],
      }
}
