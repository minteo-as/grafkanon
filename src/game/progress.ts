// Fremskridt gemmes i browseren. Kan det ikke gemmes (privat vindue o.l.), spiller man bare uden.

import { LEVELS } from './levels'
import type { LevelResult } from './game'
import type { Help } from './scoring'

const KEY = 'grafkanonen:v1'

export interface LevelProgress {
  stars: number
  best: number
}

export interface Progress {
  levels: Record<string, LevelProgress>
  muted: boolean
  /** Sigtelinje og koordinater, som eleven sidst valgte. Uden et valg er begge slået til. */
  help?: Help
}

const empty = (): Progress => ({ levels: {}, muted: false })

export function loadProgress(): Progress {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return empty()
    const data = JSON.parse(raw) as Partial<Progress>
    const help = data.help
    return {
      levels: data.levels ?? {},
      muted: !!data.muted,
      ...(help ? { help: { aimLine: help.aimLine !== false, coordinates: help.coordinates !== false } } : {}),
    }
  } catch {
    return empty()
  }
}

export function saveProgress(p: Progress): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(p))
  } catch {
    // ignorer, fx hvis lageret er slået fra
  }
}

/** Gemmer det bedste resultat for banen. Giver true, hvis det er ny rekord. */
export function recordLevel(p: Progress, levelId: string, result: LevelResult): boolean {
  const prev = p.levels[levelId]
  const newBest = !prev || result.score > prev.best
  p.levels[levelId] = {
    stars: Math.max(prev?.stars ?? 0, result.stars),
    best: Math.max(prev?.best ?? 0, result.score),
  }
  return newBest
}

/** Stjerner samlet i en verdens almindelige baner (bossen tæller ikke med). */
export function worldStars(p: Progress, world: number): { stars: number; max: number } {
  const levels = LEVELS.filter((l) => l.world === world && !l.boss)
  return {
    stars: levels.reduce((sum, l) => sum + (p.levels[l.id]?.stars ?? 0), 0),
    max: levels.length * 3,
  }
}

/** Bossen kræver i gennemsnit halvanden stjerne pr. bane, så man må spille nogle baner igen. */
export function bossRequirement(world: number): number {
  return Math.ceil(LEVELS.filter((l) => l.world === world && !l.boss).length * 1.5)
}

/**
 * Første bane er altid åben. De næste åbner, når den forrige er klaret.
 * En bossbane kræver desuden stjerner nok i sin verden.
 */
export function isUnlocked(p: Progress, index: number): boolean {
  const level = LEVELS[index]
  if (!level) return false
  if (index > 0 && !p.levels[LEVELS[index - 1].id]) return false
  return !level.boss || worldStars(p, level.world).stars >= bossRequirement(level.world)
}
