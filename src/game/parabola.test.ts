import { describe, expect, it } from 'vitest'
import { fmtExp, fmtGeneral, fmtGrowth, fmtVertex } from '../math/format'
import { parseBarrier, parseExp, parseParabola } from '../math/parse'
import { computeGrowthPath, computePath, roots, type Aim } from '../math/path'
import { Game } from './game'
import { LEVELS, weaponOf } from './levels'
import { mulberry32 } from './rng'
import { ARENA_HALF, generateWave, isSolvable, SIDE_TOP } from './waves'

const arc = (a: number, h: number, k: number): Aim => ({ kind: 'parabola', a, h, k })

describe('fmtVertex', () => {
  it.each([
    [-0.5, 2, 8, 'y = −0,5(x − 2)² + 8'],
    [-1, -3, 4, 'y = −(x + 3)² + 4'],
    [-2, 0, 9, 'y = −2x² + 9'],
    [-1, 1.5, 0, 'y = −(x − 1,5)²'],
  ])('a=%s h=%s k=%s → %s', (a, h, k, out) => {
    expect(fmtVertex(a, h, k)).toBe(out)
  })
})

describe('parseParabola', () => {
  it.each([
    ['y = −0,5(x − 2)² + 8', -0.5, 2, 8],
    ['y=-(x+3)^2+4', -1, -3, 4],
    ['y = -2(x-1)²+9', -2, 1, 9],
    ['y = 1/2(x - 4)^2', 0.5, 4, 0],
    ['y = −x² + 9', -1, 0, 9],
    ['y = -x^2 + 2x + 3', -1, 1, 4],
    ['f(x) = −0,5x² + 4', -0.5, 0, 4],
    ['y = -(x)^2 + 1', -1, 0, 1],
  ])('%s', (input, a, h, k) => {
    const r = parseParabola(input)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.a).toBeCloseTo(a)
    expect(r.h).toBeCloseTo(h)
    expect(r.k).toBeCloseTo(k)
  })

  it.each([
    ['', 'empty'],
    ['y = 2x + 3', 'notParabola'],
    ['y = -(x - 2 + 4', 'unreadable'],
    ['hej', 'unreadable'],
  ])('afviser %s', (input, reason) => {
    expect(parseParabola(input)).toEqual({ ok: false, reason })
  })
})

describe('computePath for granaten', () => {
  it('går fra nulpunkt til nulpunkt', () => {
    expect(roots(-1, 2, 9)).toEqual([-1, 5])
    const r = computePath(arc(-1, 2, 9), ARENA_HALF)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.path.xa).toBeCloseTo(-1)
    expect(r.path.xb).toBeCloseTo(5)
    expect(r.path.end).toBe('ground')
    expect(r.path.distanceTo(2, 9)).toBeLessThan(1e-6)
    expect(r.path.distanceTo(5, 0)).toBeLessThan(1e-6)
  })

  it('forklarer, hvorfor en bue ikke kan skydes', () => {
    expect(computePath(arc(1, 0, 4), ARENA_HALF)).toEqual({ ok: false, reason: 'opensUp' })
    expect(computePath(arc(-1, 0, -2), ARENA_HALF)).toEqual({ ok: false, reason: 'belowGround' })
    expect(computePath(arc(-0.25, 0, 36), ARENA_HALF)).toEqual({ ok: false, reason: 'landsOutside' })
  })

  it('stopper ved en mur, den ikke kommer over', () => {
    const wall = { x: 2, height: 8 }
    const low = computePath(arc(-1, -3, 4), ARENA_HALF, [wall])
    expect(low.ok && low.path.end).toBe('ground') // muren står uden for buen
    const blocked = computePath(arc(-1, 3, 9), ARENA_HALF, [wall])
    expect(blocked.ok && blocked.path.end).toBe('wall')
    if (!blocked.ok) return
    expect(blocked.path.xb).toBeLessThanOrEqual(2.2)
    expect(blocked.path.distanceTo(3, 9)).toBeGreaterThan(1)
    const over = computePath(arc(-1, 2, 9), ARENA_HALF, [wall])
    expect(over.ok && over.path.end).toBe('ground')
  })
})

describe('parabel-bølger', () => {
  const arcLevels = LEVELS.filter((l) => weaponOf(l) === 'grenade')

  it('findes i verden 2', () => {
    expect(arcLevels.length).toBeGreaterThanOrEqual(3)
  })

  it('kan altid klares, og dronerne er i luften over banen', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = mulberry32(seed)
      for (const level of arcLevels) {
        for (const spec of level.waves) {
          const layout = generateWave(spec, rng, 'grenade')
          expect(isSolvable(layout)).toBe(true)
          expect(layout.walls.length).toBe(spec.walls ?? 0)
          expect(layout.solution.length).toBeLessThanOrEqual(layout.ammo)
          for (const e of layout.enemies) {
            expect(e.y).toBeGreaterThanOrEqual(0)
            expect(e.y).toBeLessThan(SIDE_TOP)
            expect(Math.abs(e.x)).toBeLessThanOrEqual(ARENA_HALF)
          }
          if (level.locked?.a !== undefined) {
            for (const s of layout.solution) expect(s.kind === 'parabola' && s.a).toBe(level.locked.a)
          }
          if (spec.groups.some((g) => g.kind === 'arc' && g.ground)) {
            expect(layout.enemies.some((e) => e.y === 0)).toBe(true)
          }
        }
      }
    }
  })

  it('rammer alle droner på buen med én granat', () => {
    const level = arcLevels[0]
    const seed = 11
    const game = new Game(seed)
    game.startLevel(level)
    expect(game.aim.kind).toBe('parabola')
    const solution = generateWave(level.waves[0], mulberry32(seed), 'grenade').solution
    game.setAim(solution[0])
    const shot = game.fire()
    expect(shot?.hits.length).toBe(2)
    game.completeShot()
    expect(game.phase).toBe('cleared')
  })

  it('starter med a = −1, når a er låst', () => {
    const game = new Game(1)
    game.startLevel(arcLevels[0])
    expect(game.aim).toMatchObject({ kind: 'parabola', a: -1 })
  })
})

describe('almindelig form og barrierer', () => {
  it('skriver y = ax² + bx + c pænt', () => {
    expect(fmtGeneral(-1, 4, 5)).toBe('y = −x² + 4x + 5')
    expect(fmtGeneral(-0.5, -2, 0)).toBe('y = −0,5x² − 2x')
    expect(fmtGeneral(-2, 0, -3)).toBe('y = −2x² − 3')
  })

  it('læser barrierer', () => {
    expect(parseBarrier('x = 3')).toEqual({ ok: true, axis: 'x', k: 3 })
    expect(parseBarrier('y = −2')).toEqual({ ok: true, axis: 'y', k: -2 })
    expect(parseBarrier('Y=0')).toEqual({ ok: true, axis: 'y', k: 0 })
    expect(parseBarrier('y = 2x')).toEqual({ ok: false, reason: 'unreadable' })
  })
})

describe('vækst', () => {
  it('læser eksponentiel vækst, som elever skriver den', () => {
    expect(parseExp('y = 5 · 1,2^x')).toEqual({ ok: true, a: 1.2, b: 5 })
    expect(parseExp('y=5*1.2^x')).toEqual({ ok: true, a: 1.2, b: 5 })
    expect(parseExp('f(x) = 3 · 0,5ˣ')).toEqual({ ok: true, a: 0.5, b: 3 })
    expect(parseExp('y = 2^x')).toEqual({ ok: true, a: 2, b: 1 })
    expect(parseExp('y = 3(1,5)^x')).toEqual({ ok: true, a: 1.5, b: 3 })
    expect(parseExp('y = 1,1^x · 4')).toEqual({ ok: true, a: 1.1, b: 4 })
    expect(parseExp('y = 2x + 3')).toEqual({ ok: false, reason: 'notExp' })
    expect(parseExp('')).toEqual({ ok: false, reason: 'empty' })
  })

  it('viser forskriften og væksten pr. skridt', () => {
    expect(fmtExp(1.2, 5)).toBe('y = 5 · 1,2ˣ')
    expect(fmtExp(2, 1)).toBe('y = 2ˣ')
    expect(fmtGrowth({ kind: 'exp', a: 1.2 })).toBe('+20 % pr. skridt')
    expect(fmtGrowth({ kind: 'exp', a: 0.75 })).toBe('−25 % pr. skridt')
    expect(fmtGrowth({ kind: 'line', a: 2 })).toBe('+2 pr. skridt')
    expect(fmtGrowth({ kind: 'exp', a: 1 })).toBe('Uændret for hvert skridt')
  })

  it('flyver fra (0, b), til raketten forlader banen foroven eller rammer jorden', () => {
    const up = computeGrowthPath({ kind: 'exp', a: 2, b: 1 }, 20, 12)
    expect(up.ok && up.path.xa).toBe(0)
    expect(up.ok && up.path.xb).toBeCloseTo(Math.log2(12))
    const decay = computeGrowthPath({ kind: 'exp', a: 0.5, b: 8 }, 20, 12)
    expect(decay.ok && decay.path.xb).toBe(20)
    expect(decay.ok && decay.path.distanceTo(2, 2)).toBeLessThan(1e-6)
    const down = computeGrowthPath({ kind: 'line', a: -1, b: 5 }, 20, 12)
    expect(down.ok && [down.path.xb, down.path.end]).toEqual([5, 'ground'])
    expect(computeGrowthPath({ kind: 'exp', a: 2, b: 0 }, 20, 12)).toEqual({ ok: false, reason: 'startOutside' })
    expect(computeGrowthPath({ kind: 'exp', a: -2, b: 1 }, 20, 12)).toEqual({ ok: false, reason: 'badFactor' })
  })
})
