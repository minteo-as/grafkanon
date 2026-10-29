import { describe, expect, it } from 'vitest';
import { distanceToLine } from '../math/line';
import { Game } from './game';
import { mulberry32 } from './rng';
import { helpMultiplier, shotPoints } from './scoring';
import { generateWave, SPAWN_LIMIT } from './waves';

describe('generateWave', () => {
  it('laver bølger, der kan klares med de skud, man får', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rng = mulberry32(seed);
      for (let wave = 1; wave <= 8; wave++) {
        const layout = generateWave(wave, rng);
        expect(layout.solution.length).toBeLessThanOrEqual(layout.ammo);
        for (const e of layout.enemies) {
          expect(Number.isInteger(e.x) && Number.isInteger(e.y)).toBe(true);
          expect(Math.abs(e.x)).toBeLessThanOrEqual(SPAWN_LIMIT);
          expect(Math.abs(e.y)).toBeLessThanOrEqual(SPAWN_LIMIT);
          expect(layout.solution.some(l => distanceToLine(l, e.x, e.y) < 1e-9)).toBe(true);
        }
        const keys = new Set(layout.enemies.map(e => `${e.x},${e.y}`));
        expect(keys.size).toBe(layout.enemies.length);
      }
    }
  });

  it('giver samme bølge for samme seed', () => {
    expect(generateWave(3, mulberry32(42))).toEqual(generateWave(3, mulberry32(42)));
  });
});

describe('scoring', () => {
  it('ganger flere træffere op', () => {
    expect([1, 2, 3].map(n => shotPoints(n, 1))).toEqual([100, 400, 900]);
  });
  it('giver flere point uden hjælp', () => {
    expect(helpMultiplier({ aimLine: true, coordinates: true })).toBe(1);
    expect(helpMultiplier({ aimLine: false, coordinates: false })).toBe(3);
  });
});

function solvedGame(seed = 7) {
  const game = new Game(seed);
  game.startWave(1);
  const layout = generateWave(1, mulberry32(seed));
  return { game, layout };
}

describe('Game', () => {
  it('rammer en hel gruppe med ét skud og klarer bølgen', () => {
    const { game, layout } = solvedGame();
    const shots = layout.solution;
    let total = 0;
    for (const line of shots) {
      game.setLine(line);
      const shot = game.fire();
      expect(shot).not.toBeNull();
      const out = game.completeShot();
      total += out.points + out.bonus;
    }
    expect(game.phase).toBe('cleared');
    expect(game.score).toBe(total);
    // gruppen på tre giver 900, den enlige 100, og det ekstra skud 250 i bonus
    expect(game.score).toBe(900 + 100 + 250);
  });

  it('går til outOfAmmo, når skuddene slipper op', () => {
    const { game } = solvedGame();
    game.setLine({ a: 0, b: 9.5 });
    while (game.ammo > 0) {
      game.fire();
      game.completeShot();
    }
    expect(game.phase).toBe('outOfAmmo');
    expect(game.fire()).toBeNull();
  });

  it('nulstiller point og glitches ved nyt forsøg', () => {
    const { game, layout } = solvedGame();
    game.setLine(layout.solution[0]);
    game.fire();
    game.completeShot();
    expect(game.score).toBeGreaterThan(0);
    game.retryWave();
    expect(game.score).toBe(0);
    expect(game.aliveCount).toBe(layout.enemies.length);
    expect(game.ammo).toBe(layout.ammo);
  });

  it('skyder ikke, når linjen er uden for banen', () => {
    const { game } = solvedGame();
    game.setLine({ a: 0, b: 30 });
    expect(game.fire()).toBeNull();
    expect(game.ammo).toBe(game.ammoTotal);
  });

  it('giver først ekstra point uden hjælp fra næste bølge', () => {
    const { game, layout } = solvedGame();
    game.setHelp({ aimLine: false, coordinates: true });
    expect(game.multiplier).toBe(1);
    expect(game.nextMultiplier).toBe(2);
    for (const line of layout.solution) {
      game.setLine(line);
      game.fire();
      game.completeShot();
    }
    game.nextWave();
    expect(game.wave).toBe(2);
    expect(game.multiplier).toBe(2);
    // slår man hjælpen til midt i bølgen, mister man bonussen for resten af bølgen
    game.setHelp({ aimLine: true, coordinates: true });
    game.setHelp({ aimLine: false, coordinates: true });
    expect(game.multiplier).toBe(1);
  });
});
