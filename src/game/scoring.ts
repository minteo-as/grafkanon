export const POINTS_PER_HIT = 100;
export const BONUS_PER_SPARE_SHOT = 250;

export interface Help {
  aimLine: boolean;
  coordinates: boolean;
}

/** Hjælp, der er slået fra, giver flere point. */
export function helpMultiplier(help: Help): number {
  return (help.aimLine ? 1 : 2) * (help.coordinates ? 1 : 1.5);
}

/** Flere træffere i samme skud ganges op: 1 → 100, 2 → 400, 3 → 900. */
export function shotPoints(hits: number, multiplier: number): number {
  return Math.round(POINTS_PER_HIT * hits * hits * multiplier);
}
