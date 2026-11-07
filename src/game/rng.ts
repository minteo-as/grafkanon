// Seedet tilfældighed, så samme seed giver samme bølger (bruges senere til "ugens udfordring").

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <T>(arr: readonly T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)]

export const randInt = (min: number, max: number, rng: Rng): number => min + Math.floor(rng() * (max - min + 1))

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
