export interface Line {
  a: number;
  b: number;
}

/** Den del af linjen, der ligger inde i banen, givet ved x-intervallet [xa; xb]. */
export interface Segment {
  xa: number;
  xb: number;
}

export const yAt = (line: Line, x: number): number => line.a * x + line.b;

export function distanceToLine(line: Line, x: number, y: number): number {
  return Math.abs(line.a * x - y + line.b) / Math.hypot(line.a, 1);
}

/** Klipper linjen til kvadratet −half ≤ x, y ≤ half. Giver null, hvis linjen ikke går gennem banen. */
export function clipToSquare(line: Line, half: number): Segment | null {
  let xa = -half;
  let xb = half;
  if (line.a === 0) {
    if (Math.abs(line.b) > half) return null;
  } else {
    const x1 = (-half - line.b) / line.a;
    const x2 = (half - line.b) / line.a;
    xa = Math.max(xa, Math.min(x1, x2));
    xb = Math.min(xb, Math.max(x1, x2));
    if (xa > xb - 1e-6) return null;
  }
  return { xa, xb };
}
