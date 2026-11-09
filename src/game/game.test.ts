import { describe, expect, it } from 'vitest'
import { distanceToLine } from '../math/line'
import type { Aim } from '../math/path'
import { Game } from './game'
import { LEVELS, weaponOf, type Level } from './levels'
import { isUnlocked, recordLevel, type Progress } from './progress'
import { mulberry32 } from './rng'
import { helpMultiplier, hitIncrement, shotPoints, starsFor } from './scoring'
import { generateWave, hopsToEscape, MAX_HOPS, MIN_HOPS, SPAWN_LIMIT } from './waves'

describe('generateWave', () => {
  it('laver bølger, der kan klares med de skud, man får', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = mulberry32(seed)
      for (const level of LEVELS.filter((l) => weaponOf(l) === 'laser')) {
        for (const spec of level.waves) {
          const layout = generateWave(spec, rng)
          expect(layout.solution.length).toBeLessThanOrEqual(layout.ammo)
          for (const e of layout.enemies) {
            expect(Number.isInteger(e.x) && Number.isInteger(e.y)).toBe(true)
            expect(Math.abs(e.x)).toBeLessThanOrEqual(SPAWN_LIMIT)
            expect(Math.abs(e.y)).toBeLessThanOrEqual(SPAWN_LIMIT)
            expect(layout.solution.some((l) => l.kind === 'line' && distanceToLine(l, e.x, e.y) < 1e-9)).toBe(true)
            if (e.march) expect(hopsToEscape(e, e.march)).toBeGreaterThanOrEqual(MIN_HOPS)
          }
          const keys = new Set(layout.enemies.map((e) => `${e.x},${e.y}`))
          expect(keys.size).toBe(layout.enemies.length)
          const marchers = layout.enemies.filter((e) => e.march)
          if (marchers.length) {
            expect(Math.min(...marchers.map((e) => hopsToEscape(e, e.march!)))).toBeLessThanOrEqual(MAX_HOPS)
          }
        }
      }
    }
  })

  it('giver samme bølge for samme seed', () => {
    const spec = LEVELS[2].waves[1]
    expect(generateWave(spec, mulberry32(42))).toEqual(generateWave(spec, mulberry32(42)))
  })

  it('tæller skridt til kanten', () => {
    expect(hopsToEscape({ x: 0, y: 0 }, { dx: 0, dy: -1 })).toBe(11)
    expect(hopsToEscape({ x: 4, y: 0 }, { dx: 1, dy: 0 })).toBe(7)
  })
})

describe('scoring', () => {
  it('ganger flere træffere op', () => {
    expect([1, 2, 3].map((n) => shotPoints(n, 1))).toEqual([100, 400, 900])
  })
  it('fordeler pointene over træfferne', () => {
    expect([1, 2, 3].map((k) => hitIncrement(k, 1))).toEqual([100, 300, 500])
  })
  it('giver flere point uden hjælp', () => {
    expect(helpMultiplier({ aimLine: true, coordinates: true })).toBe(1)
    expect(helpMultiplier({ aimLine: false, coordinates: false })).toBe(3)
  })
  it('giver stjerner', () => {
    const on = { aimLine: true, coordinates: true }
    const off = { aimLine: false, coordinates: false }
    expect(starsFor([{ shotsUsed: 3, minShots: 2, helpUsed: off }])).toBe(1)
    expect(starsFor([{ shotsUsed: 2, minShots: 2, helpUsed: on }])).toBe(2)
    expect(starsFor([{ shotsUsed: 2, minShots: 2, helpUsed: off }])).toBe(3)
  })
})

/** Et spil, hvor vi kender løsningen: samme seed som spillet bruger. */
function knownGame(level: Level = LEVELS[0], seed = 7) {
  const game = new Game(seed)
  game.startLevel(level)
  const rng = mulberry32(seed)
  const solutions: Aim[][] = level.waves.map((spec) => generateWave(spec, rng, weaponOf(level)).solution)
  return { game, solutions }
}

function clearWave(game: Game, solution: Aim[]) {
  for (const aim of solution) {
    game.setAim(aim)
    expect(game.fire()).not.toBeNull()
    game.completeShot()
  }
}

describe('Game', () => {
  it('rammer en hel gruppe med ét skud og klarer bølgen', () => {
    const { game, solutions } = knownGame()
    clearWave(game, solutions[0])
    expect(game.phase).toBe('cleared')
    // gruppen på tre giver 900, den enlige 100, og det ekstra skud 250 i bonus
    expect(game.score).toBe(900 + 100 + 250)
  })

  it('går til outOfAmmo, når skuddene slipper op', () => {
    const { game } = knownGame()
    game.setAim({ kind: 'line', a: 0, b: 9.5 })
    while (game.ammo > 0) {
      game.fire()
      game.completeShot()
    }
    expect(game.phase).toBe('outOfAmmo')
    expect(game.fire()).toBeNull()
  })

  it('nulstiller point og glitches ved nyt forsøg', () => {
    const { game, solutions } = knownGame()
    game.setAim(solutions[0][0])
    game.fire()
    game.completeShot()
    expect(game.score).toBeGreaterThan(0)
    game.retryWave()
    expect(game.score).toBe(0)
    expect(game.aliveCount).toBe(game.enemies.length)
    expect(game.ammo).toBe(game.ammoTotal)
  })

  it('skyder ikke, når linjen er uden for banen', () => {
    const { game } = knownGame()
    game.setAim({ kind: 'line', a: 0, b: 30 })
    expect(game.fire()).toBeNull()
    expect(game.ammo).toBe(game.ammoTotal)
  })

  it('giver først ekstra point uden hjælp fra næste bølge', () => {
    const { game, solutions } = knownGame()
    game.setHelp({ aimLine: false, coordinates: true })
    expect(game.multiplier).toBe(1)
    expect(game.nextMultiplier).toBe(2)
    clearWave(game, solutions[0])
    game.nextWave()
    expect(game.waveNumber).toBe(2)
    expect(game.multiplier).toBe(2)
    // slår man hjælpen til midt i bølgen, mister man bonussen for resten af bølgen
    game.setHelp({ aimLine: true, coordinates: true })
    game.setHelp({ aimLine: false, coordinates: true })
    expect(game.multiplier).toBe(1)
  })

  it('giver stjerner, når hele banen er klaret', () => {
    const { game, solutions } = knownGame()
    solutions.forEach((solution, i) => {
      expect(game.levelResult).toBeNull()
      clearWave(game, solution)
      if (i < solutions.length - 1) game.nextWave()
    })
    expect(game.levelResult).toEqual({ stars: 2, score: game.score })
  })
})

describe('marchører', () => {
  const marchLevel = LEVELS[2]

  it('går ét felt, når uret slår, og står stille under skud', () => {
    const { game } = knownGame(marchLevel)
    const marcher = game.enemies.find((e) => e.march)!
    const start = { x: marcher.x, y: marcher.y }
    const interval = game.spec.marchInterval!
    expect(game.update(interval - 0.01).hop).toBe(false)
    expect(game.update(0.02).hop).toBe(true)
    expect(marcher.y).toBe(start.y - 1)

    game.setAim({ kind: 'line', a: 0, b: 9.5 })
    game.fire()
    expect(game.update(interval * 3).hop).toBe(false)
    expect(marcher.y).toBe(start.y - 1)
  })

  it('flytter løsningen: samme hældning, b bliver mindre', () => {
    const { game, solutions } = knownGame(marchLevel)
    game.update(game.spec.marchInterval!)
    const [groupLine, singleLine] = solutions[0]
    if (groupLine.kind !== 'line') throw new Error('forventede en linje')
    game.setAim({ ...groupLine, b: groupLine.b - 1 })
    game.fire()
    expect(game.completeShot().hits).toBe(3)
    game.setAim(singleLine)
    game.fire()
    game.completeShot()
    expect(game.phase).toBe('cleared')
  })

  it('slipper væk, hvis man venter for længe', () => {
    const { game } = knownGame(marchLevel)
    game.attacksEnabled = false // her gælder det kun marchørerne
    let escaped = false
    for (let i = 0; i < 30 && !escaped; i++) escaped = game.update(game.spec.marchInterval!).escaped
    expect(escaped).toBe(true)
    expect(game.phase).toBe('escaped')
    game.retryWave()
    expect(game.phase).toBe('aiming')
  })
})

describe('progress', () => {
  it('gemmer bedste stjerner og point og åbner næste bane', () => {
    const p: Progress = { levels: {}, muted: false }
    expect(isUnlocked(p, 0)).toBe(true)
    expect(isUnlocked(p, 1)).toBe(false)
    expect(recordLevel(p, LEVELS[0].id, { stars: 2, score: 5000 })).toBe(true)
    expect(recordLevel(p, LEVELS[0].id, { stars: 3, score: 4000 })).toBe(false)
    expect(p.levels[LEVELS[0].id]).toEqual({ stars: 3, best: 5000 })
    expect(isUnlocked(p, 1)).toBe(true)
  })
})
