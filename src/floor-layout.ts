import type { Building, Point } from './types';

export interface FloorLayout {
  offsets: Map<number, number>;
  visible: Set<number>;
}

// Keep floors at their model heights, including in the interior stack view.
export function floorLayout(
  floors: Building['floors'],
  selected: number,
  exploded: boolean,
): FloorLayout {
  const ordered = [...floors].sort((a, b) => a.height - b.height);
  const index = Math.max(
    0,
    ordered.findIndex((floor) => floor.id === selected),
  );
  const start = ordered.length > 5 ? Math.min(Math.max(index - 1, 0), ordered.length - 3) : 0;
  const shown = exploded && ordered.length > 5 ? ordered.slice(start, start + 3) : ordered;
  return {
    offsets: new Map(shown.map((floor) => [floor.id, 0])),
    visible: new Set(shown.map((floor) => floor.id)),
  };
}

export function displayedPoint(point: Point, floor: number, layout: FloorLayout): Point {
  return [point[0], point[1] + (layout.offsets.get(floor) ?? 0), point[2]];
}
