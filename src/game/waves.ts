import type { Line } from '../math/line';
import { pick, randInt, shuffle, type Rng } from './rng';

export const ARENA_HALF = 10; // banen går fra −10 til 10 på begge akser
export const SPAWN_LIMIT = 8; // glitches står inden for ±8, så der er luft til kanten
const MIN_GAP = 1.9;

export interface Point {
  x: number;
  y: number;
}

export interface WaveLayout {
  enemies: Point[];
  ammo: number;
  /** Én måde at klare bølgen med færrest mulige skud. */
  solution: Line[];
}

interface Group {
  count: number;
  slopes: readonly number[];
}

interface WaveSpec {
  groups: Group[];
  singles: number;
  spareShots: number;
  hint: string;
}

const WHOLE = [1, 2, 3, -1, -2, -3];
const HALF = [0.5, -0.5, 1.5, -1.5];
const ALL = [...WHOLE, ...HALF, 0];

const WAVES: WaveSpec[] = [
  {
    groups: [{ count: 3, slopes: [1, 2, -1, -2] }],
    singles: 1,
    spareShots: 1,
    hint: 'Tre glitches står på linje. Kan du ramme dem alle med ét skud?',
  },
  {
    groups: [{ count: 3, slopes: WHOLE }, { count: 2, slopes: WHOLE }],
    singles: 0,
    spareShots: 1,
    hint: 'To grupper. Hvilken hældning har hver gruppe?',
  },
  {
    groups: [{ count: 3, slopes: WHOLE }, { count: 3, slopes: WHOLE }],
    singles: 1,
    spareShots: 0,
    hint: 'Nu er der præcis nok skud. Hvert skud skal ramme en hel gruppe.',
  },
  {
    groups: [{ count: 3, slopes: HALF }, { count: 3, slopes: WHOLE }],
    singles: 0,
    spareShots: 0,
    hint: 'En af grupperne har en hældning med komma. y = 0,5x stiger ½ for hver 1 til højre.',
  },
  {
    groups: [{ count: 3, slopes: [0] }, { count: 3, slopes: HALF }, { count: 2, slopes: WHOLE }],
    singles: 0,
    spareShots: 0,
    hint: 'En vandret linje har hældning 0. Så er forskriften bare y = b.',
  },
  {
    groups: [{ count: 3, slopes: ALL }, { count: 3, slopes: ALL }, { count: 3, slopes: ALL }],
    singles: 0,
    spareShots: 0,
    hint: 'Tre grupper. Find alle tre linjer.',
  },
];

export function specForWave(n: number): WaveSpec {
  return WAVES[Math.min(Math.max(n, 1), WAVES.length) - 1];
}

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);

function pointsOnLine(line: Line, count: number, taken: Point[], rng: Rng): Point[] | null {
  const candidates: Point[] = [];
  for (let x = -SPAWN_LIMIT; x <= SPAWN_LIMIT; x++) {
    const y = line.a * x + line.b;
    const ry = Math.round(y);
    if (Math.abs(y - ry) < 1e-9 && Math.abs(ry) <= SPAWN_LIMIT) candidates.push({ x, y: ry });
  }
  shuffle(candidates, rng);
  const out: Point[] = [];
  for (const p of candidates) {
    if (out.length === count) break;
    if (out.some(q => Math.abs(q.x - p.x) < 2)) continue;
    if (taken.some(q => dist(p, q) < MIN_GAP) || out.some(q => dist(p, q) < MIN_GAP)) continue;
    out.push(p);
  }
  return out.length === count ? out : null;
}

function tryGenerate(spec: WaveSpec, rng: Rng): WaveLayout | null {
  const enemies: Point[] = [];
  const solution: Line[] = [];
  for (const group of spec.groups) {
    let placed: Point[] | null = null;
    for (let t = 0; t < 40 && !placed; t++) {
      const line = { a: pick(group.slopes, rng), b: randInt(-5, 5, rng) };
      if (solution.some(l => l.a === line.a)) continue;
      placed = pointsOnLine(line, group.count, enemies, rng);
      if (placed) solution.push(line);
    }
    if (!placed) return null;
    enemies.push(...placed);
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

export function generateWave(n: number, rng: Rng): WaveLayout {
  const spec = specForWave(n);
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
