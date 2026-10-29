// Fremskridt gemmes i browseren. Kan det ikke gemmes (privat vindue o.l.), spiller man bare uden.

import { LEVELS } from './levels';
import type { LevelResult } from './game';

const KEY = 'grafkanonen:v1';

export interface LevelProgress {
  stars: number;
  best: number;
}

export interface Progress {
  levels: Record<string, LevelProgress>;
  muted: boolean;
}

const empty = (): Progress => ({ levels: {}, muted: false });

export function loadProgress(): Progress {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw) as Partial<Progress>;
    return { levels: data.levels ?? {}, muted: !!data.muted };
  } catch {
    return empty();
  }
}

export function saveProgress(p: Progress): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignorer, fx hvis lageret er slået fra
  }
}

/** Gemmer det bedste resultat for banen. Giver true, hvis det er ny rekord. */
export function recordLevel(p: Progress, levelId: string, result: LevelResult): boolean {
  const prev = p.levels[levelId];
  const newBest = !prev || result.score > prev.best;
  p.levels[levelId] = {
    stars: Math.max(prev?.stars ?? 0, result.stars),
    best: Math.max(prev?.best ?? 0, result.score),
  };
  return newBest;
}

/** Første bane er altid åben. De næste åbner, når den forrige er klaret. */
export function isUnlocked(p: Progress, index: number): boolean {
  return index === 0 || !!p.levels[LEVELS[index - 1]?.id];
}
