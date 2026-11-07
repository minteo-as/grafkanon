// Våbnenes baner gennem koordinatsystemet: laserens rette linje og granatens bue.

import { clipToSquare, distanceToLine } from './line'

export type Aim = { kind: 'line'; a: number; b: number } | { kind: 'parabola'; a: number; h: number; k: number }

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
  /** Hvad der stopper banen: kanten af banen, jorden (nulpunktet) eller en mur. */
  end: 'edge' | 'ground' | 'wall'
  distanceTo(x: number, y: number): number
}

export type PathProblem = 'outside' | 'opensUp' | 'belowGround' | 'landsOutside'

export type PathResult = { ok: true; path: Path } | { ok: false; reason: PathProblem }

export function aimFunction(aim: Aim): (x: number) => number {
  return aim.kind === 'line' ? (x) => aim.a * x + aim.b : (x) => aim.a * (x - aim.h) ** 2 + aim.k
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

/** Punkter langs banen, fx til sigtelinjen og granatens spor. */
export function samplePath(path: Path, step = 0.1): { x: number; y: number }[] {
  const n = Math.max(1, Math.ceil((path.xb - path.xa) / step))
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = path.xa + ((path.xb - path.xa) * i) / n
    return { x, y: path.f(x) }
  })
}
