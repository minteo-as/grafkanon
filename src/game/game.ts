// Spillets regler uden grafik, så de kan testes for sig.

import { computePath, type Aim, type Path, type PathResult, type Wall } from '../math/path';
import { LEVELS, weaponOf, type Level } from './levels';
import { mulberry32, type Rng } from './rng';
import { BONUS_PER_SPARE_SHOT, helpMultiplier, shotPoints, starsFor, type Help, type WaveResult } from './scoring';
import { ARENA_HALF, generateWave, isOutside, type March, type Point, type WaveLayout, type WaveSpec, type Weapon } from './waves';

export const HIT_RADIUS = 0.3;
const DEFAULT_MARCH_INTERVAL = 3;

export type Phase = 'aiming' | 'firing' | 'cleared' | 'outOfAmmo' | 'escaped';

export interface Enemy extends Point {
  id: number;
  alive: boolean;
  march?: March;
}

export interface Shot {
  aim: Aim;
  path: Path;
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

export interface LevelResult {
  stars: 1 | 2 | 3;
  score: number;
}

export function defaultAim(weapon: Weapon): Aim {
  return weapon === 'grenade' ? { kind: 'parabola', a: -1, h: 0, k: 6 } : { kind: 'line', a: 1, b: 0 };
}

export class Game {
  level: Level = LEVELS[0];
  waveIndex = 0;
  score = 0;
  ammo = 0;
  phase: Phase = 'aiming';
  enemies: Enemy[] = [];
  walls: Wall[] = [];
  aim: Aim = defaultAim('laser');
  help: Help = { aimLine: true, coordinates: true };

  // Hjælp, der har været slået til på noget tidspunkt i bølgen. Så kan man ikke
  // sigte med hjælp og slå den fra lige før skuddet for at få flere point.
  private helpUsed: Help = { ...this.help };
  private layout: WaveLayout | null = null;
  private scoreAtWaveStart = 0;
  private shot: Shot | null = null;
  private results: WaveResult[] = [];
  private hopTimer = 0;
  private nextId = 1;
  private rng: Rng;

  constructor(seed = Date.now()) {
    this.rng = mulberry32(seed);
  }

  get spec(): WaveSpec {
    return this.level.waves[this.waveIndex];
  }

  get waveNumber(): number {
    return this.waveIndex + 1;
  }

  get waveCount(): number {
    return this.level.waves.length;
  }

  get isLastWave(): boolean {
    return this.waveIndex === this.level.waves.length - 1;
  }

  get hint(): string {
    return this.spec.hint;
  }

  get ammoTotal(): number {
    return this.layout?.ammo ?? 0;
  }

  get weapon(): Weapon {
    return weaponOf(this.level);
  }

  /** Hvor det næste skud vil gå hen, eller hvorfor det ikke kan skydes. */
  get path(): PathResult {
    return computePath(this.aim, ARENA_HALF, this.walls);
  }

  /** Pointgangen for den igangværende bølge. */
  get multiplier(): number {
    return helpMultiplier(this.helpUsed);
  }

  /** Pointgangen fra næste bølge med de nuværende indstillinger. */
  get nextMultiplier(): number {
    return helpMultiplier(this.help);
  }

  get pointsThisWave(): number {
    return this.score - this.scoreAtWaveStart;
  }

  get aliveCount(): number {
    return this.enemies.filter(e => e.alive).length;
  }

  get hasMarchers(): boolean {
    return this.enemies.some(e => e.alive && e.march);
  }

  /** Sekunder til marchørernes næste skridt, eller null hvis ingen marcherer. */
  get timeToHop(): number | null {
    const active = this.phase === 'aiming' || this.phase === 'firing';
    return active && this.hasMarchers ? this.hopTimer : null;
  }

  /** Når sidste bølge er klaret: stjerner og point for banen. */
  get levelResult(): LevelResult | null {
    if (this.phase !== 'cleared' || !this.isLastWave) return null;
    return { stars: starsFor(this.results), score: this.score };
  }

  startLevel(level: Level): void {
    this.level = level;
    const kind = this.weapon === 'grenade' ? 'parabola' : 'line';
    if (this.aim.kind !== kind) this.aim = defaultAim(this.weapon);
    if (this.aim.kind === 'parabola' && level.locked?.a !== undefined) this.aim = { ...this.aim, a: level.locked.a };
    this.score = 0;
    this.results = [];
    this.startWave(0);
  }

  nextWave(): void {
    if (this.phase === 'cleared' && !this.isLastWave) this.startWave(this.waveIndex + 1);
  }

  /** Samme bølge igen. Point fra det mislykkede forsøg tæller ikke. */
  retryWave(): void {
    this.score = this.scoreAtWaveStart;
    this.loadLayout();
  }

  setAim(aim: Aim): void {
    this.aim = { ...aim };
  }

  setHelp(help: Help): void {
    this.help = { ...help };
    this.helpUsed = {
      aimLine: this.helpUsed.aimLine || help.aimLine,
      coordinates: this.helpUsed.coordinates || help.coordinates,
    };
  }

  /**
   * Flytter tiden frem. Marchørerne går kun, mens man sigter, så de står stille under skud og pauser.
   * Giver 'hop', når de har taget et skridt, og 'escaped', hvis en af dem er gået ud af banen.
   */
  update(dt: number): 'hop' | 'escaped' | null {
    if (this.phase !== 'aiming' || !this.hasMarchers) return null;
    this.hopTimer -= dt;
    if (this.hopTimer > 0) return null;
    this.hopTimer += this.spec.marchInterval ?? DEFAULT_MARCH_INTERVAL;
    let escaped = false;
    for (const e of this.enemies) {
      if (!e.alive || !e.march) continue;
      e.x += e.march.dx;
      e.y += e.march.dy;
      if (isOutside(e)) escaped = true;
    }
    if (escaped) {
      this.phase = 'escaped';
      return 'escaped';
    }
    return 'hop';
  }

  fire(): Shot | null {
    if (this.phase !== 'aiming' || this.ammo <= 0) return null;
    const result = this.path;
    if (!result.ok) return null;
    const path = result.path;
    this.ammo--;
    const hits = this.enemies
      .filter(e => e.alive && path.distanceTo(e.x, e.y) < HIT_RADIUS)
      .sort((p, q) => p.x - q.x);
    hits.forEach(e => (e.alive = false));
    this.shot = { aim: { ...this.aim }, path, hits, multiplier: this.multiplier };
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
      this.results.push({
        shotsUsed: this.ammoTotal - this.ammo,
        minShots: this.layout?.solution.length ?? 0,
        helpUsed: { ...this.helpUsed },
      });
    } else {
      this.phase = this.ammo === 0 ? 'outOfAmmo' : 'aiming';
    }
    this.shot = null;
    return { hits, points, bonus, phase: this.phase };
  }

  private startWave(index: number): void {
    this.waveIndex = index;
    this.layout = generateWave(this.spec, this.rng, this.weapon);
    this.scoreAtWaveStart = this.score;
    this.loadLayout();
  }

  private loadLayout(): void {
    if (!this.layout) return;
    this.enemies = this.layout.enemies.map(p => ({
      id: this.nextId++,
      x: p.x,
      y: p.y,
      alive: true,
      ...(p.march ? { march: { ...p.march } } : {}),
    }));
    this.walls = this.layout.walls.map(w => ({ ...w }));
    this.ammo = this.layout.ammo;
    this.phase = 'aiming';
    this.helpUsed = { ...this.help };
    this.hopTimer = this.spec.marchInterval ?? DEFAULT_MARCH_INTERVAL;
    this.shot = null;
  }
}
