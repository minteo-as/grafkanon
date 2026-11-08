import { describe, expect, it } from 'vitest'
import type { Aim } from '../math/path'
import { isoWeek, weeklyChallenge } from './challenge'
import { BARRIER_TIME, Game, HIT_RADIUS, type Enemy } from './game'
import { LEVELS, TRAINING, WORLDS, weaponOf, type Level } from './levels'
import {
  bossRequirement,
  isUnlocked,
  loadProgress,
  recordLevel,
  saveProgress,
  worldStars,
  type Progress,
} from './progress'
import { mulberry32 } from './rng'
import { canHit, generateWave, isSolvable } from './waves'

/** Starter en bane og regner bølgernes løsninger ud med samme seed som spillet. */
function startKnown(level: Level, seed: number) {
  const game = new Game()
  game.startLevel(level, seed)
  const rng = mulberry32(seed)
  const solutions = level.waves.map((spec) => generateWave(spec, rng, weaponOf(level)).solution)
  return { game, solutions }
}

/** Hvor mange glitches et skud langs `aim` ville ramme lige nu. */
function wouldHit(game: Game, aim: Aim): number {
  game.setAim(aim)
  const r = game.path
  if (!r.ok) return 0
  const on = (e: Enemy) => e.alive && canHit(aim, e) && r.path.distanceTo(e.x, e.y) < HIT_RADIUS
  const onPath = game.enemies.filter(on)
  return onPath.filter((e) => e.link === undefined || game.enemies.every((o) => !o.alive || o.link !== e.link || on(o)))
    .length
}

/** Spiller en bølge med løsningens skud: altid det skud, der rammer flest lige nu. */
function autoplayWave(game: Game, solution: Aim[]): void {
  while (game.phase === 'aiming') {
    const best = solution.map((aim) => ({ aim, n: wouldHit(game, aim) })).sort((p, q) => q.n - p.n)[0]
    if (!best || best.n === 0) return
    game.setAim(best.aim)
    game.fire()
    game.completeShot()
  }
}

describe('hele kampagnen', () => {
  it('har fire verdener med en boss til sidst i hver', () => {
    expect(WORLDS.map((w) => w.weapon)).toEqual(['laser', 'grenade', 'rocket', 'final'])
    for (const world of WORLDS) {
      const levels = LEVELS.filter((l) => l.world === world.id)
      expect(levels.length).toBeGreaterThanOrEqual(world.weapon === 'final' ? 4 : 6)
      expect(levels.at(-1)!.boss).toBe(true)
      expect(levels.filter((l) => l.boss).length).toBe(1)
    }
  })

  it('kan altid klares: alle mål ligger på løsningen og kan rammes', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = mulberry32(seed)
      for (const level of LEVELS) {
        for (const spec of level.waves) {
          const layout = generateWave(spec, rng, weaponOf(level))
          expect(isSolvable(layout, weaponOf(level)), `${level.id} seed ${seed}`).toBe(true)
          expect(layout.solution.length).toBeLessThanOrEqual(layout.ammo)
        }
      }
    }
  })

  it('kan spilles igennem bane for bane med de skud, man får', () => {
    for (let seed = 1; seed <= 15; seed++) {
      for (const level of LEVELS) {
        const { game, solutions } = startKnown(level, seed)
        solutions.forEach((solution, i) => {
          autoplayWave(game, solution)
          expect(game.phase, `${level.id} bølge ${i + 1} seed ${seed}`).toBe('cleared')
          if (i < solutions.length - 1) game.nextWave()
        })
        expect(game.levelResult).not.toBeNull()
      }
    }
  })
})

const levelById = (id: string) => LEVELS.find((l) => l.id === id)!

describe('skjoldbærere', () => {
  it('kan kun rammes med det rigtige fortegn på hældningen', () => {
    const shielded = { x: 1, y: 1, shield: 'neg' as const }
    expect(canHit({ kind: 'line', a: -1, b: 2 }, shielded)).toBe(true)
    expect(canHit({ kind: 'line', a: 1, b: 0 }, shielded)).toBe(false)
    expect(canHit({ kind: 'line', a: 0, b: 1 }, shielded)).toBe(false)
    expect(canHit({ kind: 'line', a: 2, b: 0 }, { x: 1, y: 2, shield: 'pos' })).toBe(true)
  })
})

describe('delere', () => {
  it('dukker op igen spejlet i y-aksen', () => {
    // Bølgerne skal klares i rækkefølge, så de to første spilles med løsningen
    const { game: g, solutions } = startKnown(levelById('linjebyen-skjolde'), 3)
    autoplayWave(g, solutions[0])
    g.nextWave()
    autoplayWave(g, solutions[1])
    g.nextWave()
    const splitter = g.enemies.find((e) => e.splits)!
    g.setAim({ kind: 'line', a: 0, b: splitter.y })
    g.fire()
    const out = g.completeShot()
    expect(out.spawned.some((e) => e.x === -splitter.x && e.y === splitter.y && e.alive)).toBe(true)
  })
})

describe('Tvillingen', () => {
  const boss = levelById('linjebyen-boss')

  function bossWave(seed: number) {
    const { game, solutions } = startKnown(boss, seed)
    autoplayWave(game, solutions[0])
    game.nextWave()
    return { game, solution: solutions[1] }
  }

  it('overlever, hvis kun ét svagt punkt rammes', () => {
    const { game } = bossWave(5)
    expect(game.bossLives).toBe(3)
    const [p] = game.enemies.filter((e) => e.link !== undefined)
    game.setAim({ kind: 'line', a: 0, b: p.y })
    const shot = game.fire()!
    expect(shot.hits.some((e) => e.link !== undefined)).toBe(false)
    game.completeShot()
    expect(game.bossLives).toBe(3)
  })

  it('mister et liv, når begge punkter rammes i samme skud, og kommer igen et nyt sted', () => {
    const { game } = bossWave(5)
    const pair = game.enemies.filter((e) => e.link !== undefined)
    const a = (pair[1].y - pair[0].y) / (pair[1].x - pair[0].x)
    game.setAim({ kind: 'line', a, b: pair[0].y - a * pair[0].x })
    game.fire()
    const out = game.completeShot()
    expect(out.boss).toBe('hurt')
    expect(out.spawned.filter((e) => e.boss).length).toBe(2)
    expect(game.bossLives).toBe(2)
  })
})

describe('Kurven', () => {
  it('besejres ved at skyde langs dens egen bane tre gange', () => {
    const level = levelById('parabel-boss')
    const { game, solutions } = startKnown(level, 9)
    autoplayWave(game, solutions[0])
    game.nextWave()
    const outcomes: (string | null)[] = []
    for (let i = 0; i < 3; i++) {
      const top = game.enemies.find((e) => e.alive && e.boss)!
      game.setAim(top.boss!.path!)
      game.fire()
      outcomes.push(game.completeShot().boss)
    }
    expect(outcomes).toEqual(['hurt', 'hurt', 'defeated'])
  })
})

describe('barrierer', () => {
  it('stopper marchører, der går ind i dem, og forsvinder igen', () => {
    const level = levelById('linjebyen-barriere')
    const game = new Game(4)
    game.startLevel(level)
    const marcher = game.enemies.find((e) => e.march)!
    expect(marcher.march).toEqual({ dx: 0, dy: -1 })
    expect(game.barrierCharges).toBe(2)

    // En lodret barriere stopper ikke en marchør, der går nedad
    game.placeBarrier('x', marcher.x)
    const startY = marcher.y
    game.update(game.spec.marchInterval!)
    expect(marcher.y).toBe(startY - 1)

    // En vandret barriere lige under den gør
    game.placeBarrier('y', marcher.y - 1)
    expect(game.barrierCharges).toBe(0)
    expect(game.placeBarrier('y', 0)).toBe(false)
    game.update(game.spec.marchInterval!)
    expect(marcher.y).toBe(startY - 1)

    // Når tiden er gået, går den videre
    for (let t = 0; t < BARRIER_TIME + 4; t += game.spec.marchInterval!) game.update(game.spec.marchInterval!)
    expect(game.barriers.length).toBe(0)
    expect(marcher.y).toBeLessThan(startY - 1)
  })
})

describe('bosser og stjerner', () => {
  it('åbner bossen, når verdenen har stjerner nok', () => {
    const p: Progress = { levels: {}, muted: false }
    const bossIndex = LEVELS.findIndex((l) => l.boss && l.world === 1)
    const before = LEVELS.slice(0, bossIndex)
    for (const l of before) recordLevel(p, l.id, { stars: 1, score: 100 })
    expect(worldStars(p, 1).stars).toBe(before.length)
    expect(isUnlocked(p, bossIndex)).toBe(false)
    for (const l of before.slice(0, bossRequirement(1) - before.length)) recordLevel(p, l.id, { stars: 2, score: 100 })
    expect(worldStars(p, 1).stars).toBeGreaterThanOrEqual(bossRequirement(1))
    expect(isUnlocked(p, bossIndex)).toBe(true)
    // Verden 2 åbner først, når bossen er klaret
    expect(isUnlocked(p, bossIndex + 1)).toBe(false)
    recordLevel(p, LEVELS[bossIndex].id, { stars: 1, score: 100 })
    expect(isUnlocked(p, bossIndex + 1)).toBe(true)
  })
})

describe('ugens udfordring', () => {
  it('regner ugenummeret ud som i den danske kalender', () => {
    expect(isoWeek(new Date(2026, 0, 1))).toEqual({ year: 2026, week: 1 })
    expect(isoWeek(new Date(2024, 11, 30))).toEqual({ year: 2025, week: 1 })
    expect(isoWeek(new Date(2021, 0, 3))).toEqual({ year: 2020, week: 53 })
    expect(isoWeek(new Date(2026, 10, 7))).toEqual({ year: 2026, week: 45 })
    // Mandag og søndag i samme uge
    expect(isoWeek(new Date(2026, 10, 2))).toEqual(isoWeek(new Date(2026, 10, 8)))
    expect(isoWeek(new Date(2026, 10, 9)).week).toBe(46)
  })

  it('er ens hele ugen og skifter verden fra uge til uge', () => {
    const monday = weeklyChallenge(new Date(2026, 10, 2, 8))
    const sunday = weeklyChallenge(new Date(2026, 10, 8, 22))
    expect(sunday).toEqual(monday)
    expect(monday.level.id).toBe('uge-2026-45')
    const next = weeklyChallenge(new Date(2026, 10, 9))
    expect(next.seed).not.toBe(monday.seed)
    expect(next.level.world).not.toBe(monday.level.world)
  })

  it('giver alle de samme bølger, også når man prøver igen', () => {
    const { level, seed } = weeklyChallenge(new Date(2026, 10, 7))
    const where = (g: Game) => g.enemies.map((e) => [e.x, e.y])
    const a = new Game(1)
    const b = new Game(2)
    a.startLevel(level, seed)
    b.startLevel(level, seed)
    expect(where(a)).toEqual(where(b))
    a.retryWave()
    expect(where(a)).toEqual(where(b))
    a.startLevel(level, seed)
    expect(where(a)).toEqual(where(b))
  })

  it('kan klares hver uge i to år', () => {
    for (let day = 0; day < 2 * 365; day += 7) {
      const { level, seed } = weeklyChallenge(new Date(2026, 0, 5 + day))
      expect(level.waves.length).toBe(4)
      const { game, solutions } = startKnown(level, seed)
      solutions.forEach((solution, i) => {
        autoplayWave(game, solution)
        expect(game.phase, `${level.id} bølge ${i + 1}`).toBe('cleared')
        if (i < solutions.length - 1) game.nextWave()
      })
      expect(game.levelResult).not.toBeNull()
    }
  })
})

describe('Kolonien', () => {
  const boss = levelById('vaekst-boss')

  function bossWave(seed: number) {
    const { game, solutions } = startKnown(boss, seed)
    autoplayWave(game, solutions[0])
    game.nextWave()
    return game
  }

  it('har to svage punkter ét skridt fra hinanden på samme vækstkurve', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const pair = bossWave(seed).enemies.filter((e) => e.alive && e.boss)
      expect(pair.length).toBe(2)
      expect(Math.abs(pair[0].x - pair[1].x)).toBe(1)
    }
  })

  it('besejres ved at finde a = y₂ : y₁ og b tre gange', () => {
    const game = bossWave(4)
    const outcomes: (string | null)[] = []
    for (let i = 0; i < 3; i++) {
      const [p, q] = game.enemies.filter((e) => e.alive && e.boss).sort((m, n) => m.x - n.x)
      const a = q.y / p.y
      // Ét punkt alene skader den ikke
      game.setAim({ kind: 'exp', a: 1, b: p.y })
      if (i === 0) {
        expect(game.fire()!.hits.some((e) => e.boss)).toBe(false)
        game.completeShot()
      }
      game.setAim({ kind: 'exp', a, b: p.y / a ** p.x })
      game.fire()
      outcomes.push(game.completeShot().boss)
    }
    expect(outcomes).toEqual(['hurt', 'hurt', 'defeated'])
  })
})

describe('raketten', () => {
  it('starter på y-aksen og skyder i sit eget koordinatsystem', () => {
    const game = new Game(1)
    game.startLevel(levelById('vaekst-1'))
    expect(game.weapon).toBe('rocket')
    expect(game.aim).toEqual({ kind: 'exp', a: 2, b: 1 })
    const r = game.path
    expect(r.ok && r.path.xa).toBe(0)
    // Fra raketten tilbage til laseren nulstilles sigtet
    game.startLevel(LEVELS[0])
    expect(game.aim.kind).toBe('line')
  })
})

describe('Finalen', () => {
  it('blander linjer, buer og vækst, og våbnet følger funktionen', () => {
    const level = levelById('finale-3')
    const { game, solutions } = startKnown(level, 2)
    expect(game.weapon).toBe('final')
    expect(new Set(solutions.flat().map((s) => s.kind))).toEqual(new Set(['line', 'parabola', 'exp']))
    // Laseren skyder tværs over sidebilledet, raketten fra y-aksen og mod højre
    game.setAim({ kind: 'line', a: 0.5, b: 4 })
    const line = game.path
    expect(line.ok && [line.path.xa, line.path.xb]).toEqual([-8, 10])
    game.setAim({ kind: 'exp', a: 2, b: 1 })
    const rocket = game.path
    expect(rocket.ok && rocket.path.xa).toBe(0)
  })

  it('Kernen kræver et nyt våben i hver fase', () => {
    const boss = levelById('finale-boss')
    for (const seed of [1, 7]) {
      const { game, solutions } = startKnown(boss, seed)
      autoplayWave(game, solutions[0])
      game.nextWave()
      const kinds: string[] = []
      const outcomes: (string | null)[] = []
      for (let i = 0; i < 3; i++) {
        kinds.push(game.enemies.find((e) => e.alive && e.boss)!.boss!.kind)
        const aim = solutions[1][i]
        game.setAim(aim)
        game.fire()
        outcomes.push(game.completeShot().boss)
      }
      expect(kinds).toEqual(['twins', 'curve', 'colony'])
      expect(solutions[1].map((s) => s.kind)).toEqual(['line', 'parabola', 'exp'])
      expect(outcomes).toEqual(['hurt', 'hurt', 'defeated'])
    }
  })
})

describe('træningsbanen', () => {
  it('giver nye mål og beholder pointene', () => {
    for (const level of Object.values(TRAINING)) {
      const { game, solutions } = startKnown(level, 3)
      autoplayWave(game, solutions[0])
      expect(game.phase).toBe('cleared')
      const score = game.score
      const before = JSON.stringify(game.enemies.map((e) => [e.x, e.y]))
      game.rerollWave()
      expect(game.phase).toBe('aiming')
      expect(game.score).toBe(score)
      expect(JSON.stringify(game.enemies.map((e) => [e.x, e.y]))).not.toBe(before)
    }
  })
})

describe('gemte indstillinger', () => {
  it('husker sigtelinje og koordinater mellem besøg', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    const old = (globalThis as { localStorage?: unknown }).localStorage
    ;(globalThis as { localStorage?: unknown }).localStorage = storage
    try {
      expect(loadProgress().help).toBeUndefined()
      const p = loadProgress()
      p.help = { aimLine: false, coordinates: true }
      saveProgress(p)
      expect(loadProgress().help).toEqual({ aimLine: false, coordinates: true })
    } finally {
      ;(globalThis as { localStorage?: unknown }).localStorage = old
    }
  })
})
