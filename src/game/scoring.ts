export const POINTS_PER_HIT = 100
export const BONUS_PER_SPARE_SHOT = 250

export interface Help {
  aimLine: boolean
  coordinates: boolean
}

/** Hjælp, der er slået fra, giver flere point. */
export function helpMultiplier(help: Help): number {
  return (help.aimLine ? 1 : 2) * (help.coordinates ? 1 : 1.5)
}

/** Flere træffere i samme skud ganges op: 1 → 100, 2 → 400, 3 → 900. */
export function shotPoints(hits: number, multiplier: number): number {
  return Math.round(POINTS_PER_HIT * hits * hits * multiplier)
}

/** Point for den k'te træffer i et skud (k starter ved 1), så summen giver shotPoints. */
export function hitIncrement(k: number, multiplier: number): number {
  return shotPoints(k, multiplier) - shotPoints(k - 1, multiplier)
}

export interface WaveResult {
  shotsUsed: number
  minShots: number
  helpUsed: Help
}

/** ★ bane klaret · ★★ uden ekstra skud · ★★★ uden ekstra skud og uden hjælp. */
export function starsFor(results: WaveResult[]): 1 | 2 | 3 {
  const perfect = results.every((r) => r.shotsUsed <= r.minShots)
  const noHelp = results.every((r) => !r.helpUsed.aimLine && !r.helpUsed.coordinates)
  if (!perfect) return 1
  return noHelp ? 3 : 2
}
