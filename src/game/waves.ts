import type { Line } from '../math/line';
import { pick, randInt, shuffle, type Rng } from './rng';

export const ARENA_HALF = 10; // banen går fra −10 til 10 på begge akser
export const SPAWN_LIMIT = 8; // glitches står inden for ±8, så der er luft til kanten
const MIN_GAP = 1.9;

// Marchører skal have tid nok til, at man kan nå at tænke, men ikke så meget, at der ikke er pres
export const MIN_HOPS = 7;
export const MAX_HOPS = 12;

export interface Point {
  x: number;
  y: number;
}

/** Et skridt på ét felt, som marchørerne tager hver gang, uret slår. */
export interface March {
  dx: number;
  dy: number;
}

export interface Group {
  count: number;
  slopes: readonly number[];
  march?: March;
}

export interface WaveSpec {
  groups: Group[];
  singles: number;
  spareShots: number;
  hint: string;
  /** Sekunder mellem marchørernes skridt. */
  marchInterval?: number;
}

export interface Spawn extends Point {
  march?: March;
}

export interface WaveLayout {
  enemies: Spawn[];
  ammo: number;
  /** Én måde at klare bølgen med færrest mulige skud (ved bølgens start). */
  solution: Line[];
}

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);

/** Hvor mange skridt der går, før en marchør er ude af banen. */
export function hopsToEscape(p: Point, m: March): number {
  const steps = (pos: number, d: number) =>
    d > 0 ? Math.floor((ARENA_HALF - pos) / d) + 1 : d < 0 ? Math.floor((pos + ARENA_HALF) / -d) + 1 : Infinity;
  return Math.min(steps(p.x, m.dx), steps(p.y, m.dy));
}

export const isOutside = (p: Point): boolean => Math.abs(p.x) > ARENA_HALF || Math.abs(p.y) > ARENA_HALF;

function pointsOnLine(line: Line, count: number, taken: Point[], rng: Rng, march?: March): Point[] | null {
  const candidates: Point[] = [];
  for (let x = -SPAWN_LIMIT; x <= SPAWN_LIMIT; x++) {
    const y = line.a * x + line.b;
    const ry = Math.round(y);
    if (Math.abs(y - ry) > 1e-9 || Math.abs(ry) > SPAWN_LIMIT) continue;
    if (march && hopsToEscape({ x, y: ry }, march) < MIN_HOPS) continue;
    candidates.push({ x, y: ry });
  }
  shuffle(candidates, rng);
  const out: Point[] = [];
  for (const p of candidates) {
    if (out.length === count) break;
    if (out.some(q => Math.abs(q.x - p.x) < 2)) continue;
    if (taken.some(q => dist(p, q) < MIN_GAP) || out.some(q => dist(p, q) < MIN_GAP)) continue;
    out.push(p);
  }
  if (out.length !== count) return null;
  if (march && Math.min(...out.map(p => hopsToEscape(p, march))) > MAX_HOPS) return null;
  return out;
}

function tryGenerate(spec: WaveSpec, rng: Rng): WaveLayout | null {
  const enemies: Spawn[] = [];
  const solution: Line[] = [];
  for (const group of spec.groups) {
    let placed: Point[] | null = null;
    for (let t = 0; t < 40 && !placed; t++) {
      const line = { a: pick(group.slopes, rng), b: randInt(-5, 5, rng) };
      if (solution.some(l => l.a === line.a)) continue;
      placed = pointsOnLine(line, group.count, enemies, rng, group.march);
      if (placed) solution.push(line);
    }
    if (!placed) return null;
    enemies.push(...placed.map(p => (group.march ? { ...p, march: { ...group.march } } : p)));
  }
  for (let s = 0; s < spec.singles; s++) {
    let p: Point | null = null;
    for (let t = 0; t < 80 && !p; t++) {
      const c = { x: randInt(-7, 7, rng), y: randInt(-7, 7, rng) };
      if (enemies.every(q => dist(c, q) >= 2.5)) p = c;
    }
    if (!p) return null;
    enemies.push(p);
    solution.push({ a: 0, b: p.y });
  }
  return { enemies, ammo: solution.length + spec.spareShots, solution };
}

export function generateWave(spec: WaveSpec, rng: Rng): WaveLayout {
  for (let tries = 0; tries < 500; tries++) {
    const layout = tryGenerate(spec, rng);
    if (layout) return layout;
  }
  // Nødløsning, hvis tilfældigheden er meget uheldig
  return {
    enemies: [{ x: -2, y: -3 }, { x: 0, y: 1 }, { x: 2, y: 5 }],
    ammo: 2,
    solution: [{ a: 2, b: 1 }],
  };
}
