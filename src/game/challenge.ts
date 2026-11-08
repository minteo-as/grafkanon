// Ugens udfordring: en bane, der er ens for alle hele ugen, så klassen kan sammenligne point.
// Den laves ud fra ugenummeret alene, så der skal ikke bruges nogen server.

import { LEVELS, WORLDS, type Level } from './levels'
import { mulberry32, pick, shuffle } from './rng'

export interface Week {
  year: number
  week: number
}

const WAVES = 4
const DAY = 86_400_000

/** ISO-ugenummer (som i den danske kalender) for datoen i lokal tid. */
export function isoWeek(date: Date): Week {
  // Torsdagen i samme uge afgør, hvilket år ugen hører til
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const weekday = (d.getUTCDay() + 6) % 7 // mandag = 0
  d.setUTCDate(d.getUTCDate() - weekday + 3)
  const year = d.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(year, 0, 4))
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3)
  return { year, week: 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY)) }
}

export interface Challenge {
  level: Level
  /** Seed til bølgerne. Samme uge giver samme seed og dermed samme bølger. */
  seed: number
  week: Week
}

/**
 * Ugens bane går på skift mellem verdenerne, én verden pr. uge.
 * Der vælges fire af verdenens almindelige baner, og fra hver én af dens bølger. De står i
 * samme rækkefølge som i kampagnen, så det bliver sværere undervejs.
 */
export function weeklyChallenge(date: Date = new Date()): Challenge {
  const week = isoWeek(date)
  const seed = Math.imul(week.year * 100 + week.week, 0x9e3779b1) >>> 0
  const rng = mulberry32(seed)
  const world = WORLDS[week.week % WORLDS.length]
  // Almindelig form (abc) styres anderledes end resten af verdenen, så den er ikke med
  const pool = LEVELS.filter((l) => l.world === world.id && !l.boss && !l.form)
  const chosen = shuffle([...pool], rng)
    .slice(0, WAVES)
    .sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b))
  const id = `uge-${week.year}-${String(week.week).padStart(2, '0')}`
  return {
    week,
    seed,
    level: {
      id,
      world: world.id,
      name: 'Ugens udfordring',
      topic: `Uge ${week.week} · ${world.name}`,
      waves: chosen.map((l) => pick(l.waves, rng)),
    },
  }
}

/** Dage til næste mandag, hvor en ny udfordring starter. */
export function daysUntilNext(date: Date = new Date()): number {
  return 7 - ((date.getDay() + 6) % 7)
}
