// Våbnenes baner gennem koordinatsystemet: laserens rette linje, granatens bue og rakettens vækstkurve.

import { clipToRect, clipToSquare, distanceToLine } from './line'

export type Aim =
  | { kind: 'line'; a: number; b: number }
  | { kind: 'parabola'; a: number; h: number; k: number }
  /** Eksponentiel vækst y = b · aˣ (raketten). */
  | { kind: 'exp'; a: number; b: number }

/** En mur i sidebilledet. Den står på jorden ved x og er WALL_HALF_WIDTH bred til hver side. */
export interface Wall {
  x: number
  height: number
}

export const WALL_HALF_WIDTH = 0.2

export interface Path {
  /** Banen går fra x = xa til x = xb, altid fra venstre mod højre. */
  xa: number
  xb: number
  f(x: number): number
  /** Hvad der stopper banen: kanten af banen (eller toppen), jorden (nulpunktet) eller en mur. */
  end: 'edge' | 'ground' | 'wall'
  distanceTo(x: number, y: number): number
}

export type PathProblem = 'outside' | 'opensUp' | 'belowGround' | 'landsOutside' | 'startOutside' | 'badFactor'

export type PathResult = { ok: true; path: Path } | { ok: false; reason: PathProblem }

export function aimFunction(aim: Aim): (x: number) => number {
  if (aim.kind === 'line') return (x) => aim.a * x + aim.b
  if (aim.kind === 'exp') return (x) => aim.b * aim.a ** x
  return (x) => aim.a * (x - aim.h) ** 2 + aim.k
}

/** Nulpunkterne for en parabel, der åbner nedad og har toppunkt over jorden. */
export function roots(a: number, h: number, k: number): [number, number] | null {
  if (a >= 0 || k <= 0) return null
  const r = Math.sqrt(-k / a)
  return [h - r, h + r]
}

const SAMPLE_STEP = 0.02

function curveDistance(f: (x: number) => number, xa: number, xb: number, x: number, y: number): number {
  const n = Math.max(1, Math.ceil((xb - xa) / SAMPLE_STEP))
  const at = (px: number) => Math.hypot(px - x, f(px) - y)
  let bestI = 0
  let best = Infinity
  for (let i = 0; i <= n; i++) {
    const d = at(xa + ((xb - xa) * i) / n)
    if (d < best) {
      best = d
      bestI = i
    }
  }
  // Finjuster omkring det bedste punkt, så også stejle buer måles præcist
  let lo = xa + ((xb - xa) * Math.max(0, bestI - 1)) / n
  let hi = xa + ((xb - xa) * Math.min(n, bestI + 1)) / n
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3
    const m2 = hi - (hi - lo) / 3
    if (at(m1) < at(m2)) hi = m2
    else lo = m1
  }
  return Math.min(best, at((lo + hi) / 2))
}

/** Første x i [lo; hi], hvor den faldende bue når ned til højden h. */
function descendTo(f: (x: number) => number, lo: number, hi: number, h: number): number {
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) >= h) lo = mid
    else hi = mid
  }
  return hi
}

/** Hvor våbnet skyder hen, givet banens størrelse og eventuelle mure. */
export function computePath(aim: Aim, half: number, walls: readonly Wall[] = []): PathResult {
  const f = aimFunction(aim)

  if (aim.kind === 'line') {
    const seg = clipToSquare(aim, half)
    if (!seg) return { ok: false, reason: 'outside' }
    return {
      ok: true,
      path: {
        ...seg,
        f,
        end: 'edge',
        distanceTo: (x, y) => (x >= seg.xa - 0.5 && x <= seg.xb + 0.5 ? distanceToLine(aim, x, y) : Infinity),
      },
    }
  }

  // Raketten har sin egen bane (computeGrowthPath)
  if (aim.kind === 'exp') return { ok: false, reason: 'outside' }
  if (aim.a >= 0) return { ok: false, reason: 'opensUp' }
  if (aim.k <= 0) return { ok: false, reason: 'belowGround' }
  const [xa, x1] = roots(aim.a, aim.h, aim.k)!
  if (xa < -half - 1e-9 || x1 > half + 1e-9) return { ok: false, reason: 'landsOutside' }

  // Granaten flyver fra venstre nulpunkt mod højre og stopper ved den første mur, den ikke kommer over
  let xb = x1
  let end: Path['end'] = 'ground'
  for (const w of [...walls].sort((p, q) => p.x - q.x)) {
    const lo = Math.max(w.x - WALL_HALF_WIDTH, xa)
    const hi = Math.min(w.x + WALL_HALF_WIDTH, xb)
    if (lo >= hi) continue
    if (f(lo) < w.height) {
      xb = lo
    } else if (f(hi) < w.height) {
      xb = descendTo(f, lo, hi, w.height)
    } else continue
    end = 'wall'
    break
  }
  return { ok: true, path: { xa, xb, f, end, distanceTo: (x, y) => curveDistance(f, xa, xb, x, y) } }
}

/**
 * Raketten i Vækstlaboratoriet: x er tiden fra 0 til width, og y går fra jorden op til top.
 * Den starter på y-aksen i (0, b) og flyver mod højre, til den forlader banen foroven, rammer
 * jorden eller når kanten. Den kan følge eksponentiel vækst y = b · aˣ eller lineær vækst y = ax + b.
 */
export function computeGrowthPath(aim: Aim, width: number, top: number): PathResult {
  if (aim.kind === 'parabola') return { ok: false, reason: 'outside' }
  if (aim.kind === 'exp' && aim.a <= 0) return { ok: false, reason: 'badFactor' }
  if (aim.b <= 0 || aim.b > top) return { ok: false, reason: 'startOutside' }
  const f = aimFunction(aim)
  let xb = width
  let end: Path['end'] = 'edge'
  if (aim.kind === 'line') {
    if (aim.a > 0) xb = Math.min(width, (top - aim.b) / aim.a)
    else if (aim.a < 0 && -aim.b / aim.a < width) {
      xb = -aim.b / aim.a
      end = 'ground'
    }
  } else if (aim.a > 1) xb = Math.min(width, Math.log(top / aim.b) / Math.log(aim.a))
  return { ok: true, path: { xa: 0, xb, f, end, distanceTo: (x, y) => curveDistance(f, 0, xb, x, y) } }
}

/** Laseren i Finalens sidebillede: en ret linje tværs over fra venstre mod højre, mellem jorden og toppen. */
export function computeSideLinePath(aim: Aim, half: number, top: number): PathResult {
  if (aim.kind !== 'line') return { ok: false, reason: 'outside' }
  const seg = clipToRect(aim, -half, half, 0, top)
  if (!seg) return { ok: false, reason: 'outside' }
  return {
    ok: true,
    path: {
      ...seg,
      f: aimFunction(aim),
      end: 'edge',
      distanceTo: (x, y) => (x >= seg.xa - 0.5 && x <= seg.xb + 0.5 ? distanceToLine(aim, x, y) : Infinity),
    },
  }
}

/** Punkter langs banen, fx til sigtelinjen og granatens spor. */
export function samplePath(path: Path, step = 0.1): { x: number; y: number }[] {
  const n = Math.max(1, Math.ceil((path.xb - path.xa) / step))
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = path.xa + ((path.xb - path.xa) * i) / n
    return { x, y: path.f(x) }
  })
}
