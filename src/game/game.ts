// Spillets regler uden grafik, så de kan testes for sig.

import { clipToSquare, distanceToLine, type Line, type Segment } from '../math/line';
import { mulberry32, type Rng } from './rng';
import { BONUS_PER_SPARE_SHOT, helpMultiplier, shotPoints, type Help } from './scoring';
import { ARENA_HALF, generateWave, specForWave, type Point, type WaveLayout } from './waves';

export const HIT_RADIUS = 0.3;

export type Phase = 'aiming' | 'firing' | 'cleared' | 'outOfAmmo';

export interface Enemy extends Point {
  id: number;
  alive: boolean;
}

export interface Shot {
  line: Line;
  segment: Segment;
  /** Ramte glitches sorteret efter x, i den rækkefølge strålen når dem. */
  hits: Enemy[];
  multiplier: number;
}

export interface ShotOutcome {
  hits: number;
  points: number;
  bonus: number;
  phase: Phase;
}

export class Game {
  wave = 0;
  score = 0;
  ammo = 0;
  phase: Phase = 'aiming';
  enemies: Enemy[] = [];
  line: Line = { a: 1, b: 0 };
  help: Help = { aimLine: true, coordinates: true };

  // Hjælp, der har været slået til på noget tidspunkt i bølgen. Så kan man ikke
  // sigte med hjælp og slå den fra lige før skuddet for at få flere point.
  private helpUsed: Help = { ...this.help };
  private layout: WaveLayout | null = null;
  private scoreAtWaveStart = 0;
  private shot: Shot | null = null;
  private nextId = 1;
  private rng: Rng;

  constructor(seed = Date.now()) {
    this.rng = mulberry32(seed);
  }

  get ammoTotal(): number {
    return this.layout?.ammo ?? 0;
  }

  get segment(): Segment | null {
    return clipToSquare(this.line, ARENA_HALF);
  }

  /** Pointgangen for den igangværende bølge. */
  get multiplier(): number {
    return helpMultiplier(this.helpUsed);
  }

  /** Pointgangen fra næste bølge med de nuværende indstillinger. */
  get nextMultiplier(): number {
    return helpMultiplier(this.help);
  }

  get hint(): string {
    return specForWave(this.wave).hint;
  }

  get pointsThisWave(): number {
    return this.score - this.scoreAtWaveStart;
  }

  get aliveCount(): number {
    return this.enemies.filter(e => e.alive).length;
  }

  startWave(n: number): void {
    this.wave = n;
    this.layout = generateWave(n, this.rng);
    this.scoreAtWaveStart = this.score;
    this.loadLayout();
  }

  nextWave(): void {
    if (this.phase === 'cleared') this.startWave(this.wave + 1);
  }

  /** Samme bølge igen. Point fra det mislykkede forsøg tæller ikke. */
  retryWave(): void {
    this.score = this.scoreAtWaveStart;
    this.loadLayout();
  }

  setLine(line: Line): void {
    this.line = { ...line };
  }

  setHelp(help: Help): void {
    this.help = { ...help };
    this.helpUsed = {
      aimLine: this.helpUsed.aimLine || help.aimLine,
      coordinates: this.helpUsed.coordinates || help.coordinates,
    };
  }

  fire(): Shot | null {
    if (this.phase !== 'aiming' || this.ammo <= 0) return null;
    const segment = this.segment;
    if (!segment) return null;
    this.ammo--;
    const hits = this.enemies
      .filter(e => e.alive && distanceToLine(this.line, e.x, e.y) < HIT_RADIUS)
      .sort((p, q) => p.x - q.x);
    hits.forEach(e => (e.alive = false));
    this.shot = { line: { ...this.line }, segment, hits, multiplier: this.multiplier };
    this.phase = 'firing';
    return this.shot;
  }

  /** Kaldes, når strålens animation er færdig. */
  completeShot(): ShotOutcome {
    if (this.phase !== 'firing' || !this.shot) throw new Error('Intet skud i gang');
    const hits = this.shot.hits.length;
    const points = shotPoints(hits, this.shot.multiplier);
    this.score += points;
    let bonus = 0;
    if (this.aliveCount === 0) {
      bonus = this.ammo * BONUS_PER_SPARE_SHOT;
      this.score += bonus;
      this.phase = 'cleared';
    } else {
      this.phase = this.ammo === 0 ? 'outOfAmmo' : 'aiming';
    }
    this.shot = null;
    return { hits, points, bonus, phase: this.phase };
  }

  private loadLayout(): void {
    if (!this.layout) return;
    this.enemies = this.layout.enemies.map(p => ({ id: this.nextId++, x: p.x, y: p.y, alive: true }));
    this.ammo = this.layout.ammo;
    this.phase = 'aiming';
    this.helpUsed = { ...this.help };
    this.shot = null;
  }
}
