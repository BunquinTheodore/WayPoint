import type { Point } from './types';

export interface Dash {
  from: Point;
  to: Point;
  segment: number;
}

// Follow the path's arc length, splitting at turns instead of cutting across them.
export function routeDashes(points: Point[], dash: number, gap: number): Dash[] {
  if (!(dash > 0) || !(gap >= 0) || !Number.isFinite(dash + gap))
    throw new Error('Invalid route dash spacing.');
  const result: Dash[] = [];
  const period = dash + gap;
  let distance = 0;
  for (let segment = 0; segment < points.length - 1; segment++) {
    const a = points[segment],
      b = points[segment + 1];
    const length = Math.hypot(...a.map((value, i) => b[i] - value));
    if (!length) continue;
    const interpolate = (t: number): Point =>
      a.map((value, i) => value + (b[i] - value) * t) as Point;
    let cursor = 0;
    while (cursor < length - 1e-8) {
      let phase = (distance + cursor) % period;
      if (period - phase < 1e-8) phase = 0;
      const visible = phase < dash - 1e-8;
      const remaining = (visible ? dash : period) - phase;
      const end = Math.min(length, cursor + Math.max(remaining, 1e-8));
      if (visible && end - cursor > 1e-8)
        result.push({ from: interpolate(cursor / length), to: interpolate(end / length), segment });
      cursor = end;
    }
    distance += length;
  }
  return result;
}
