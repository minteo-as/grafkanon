import { describe, expect, it } from 'vitest'
import { fmtVertex } from '../math/format'
import { parseParabola } from '../math/parse'
import { computePath, roots, type Aim } from '../math/path'
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
