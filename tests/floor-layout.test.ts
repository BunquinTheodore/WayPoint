import { describe, expect, it } from 'vitest';
import { displayedPoint, floorLayout } from '../src/floor-layout';

describe('floor stack presentation', () => {
  const floors = [
    { id: 0, height: 0 },
    { id: 1, height: 4.5 },
    { id: 2, height: 9 },
  ].map((floor) => ({ ...floor, name: String(floor.id) }));
  it('keeps the interior stack and route points at the physical model heights', () => {
    const layout = floorLayout(floors, 0, true);
    const point: [number, number, number] = [8, 9.18, -12];
    expect(displayedPoint(point, 2, layout)).toEqual([8, 9.18, -12]);
    expect([...layout.offsets.values()]).toEqual([0, 0, 0]);
    expect(point).toEqual([8, 9.18, -12]);
    expect(layout.visible).toEqual(new Set([0, 1, 2]));
  });
  it('restores exact floor and route positions in assembled mode', () => {
    expect(displayedPoint([8, 9.18, -12], 2, floorLayout(floors, 0, false))).toEqual([
      8, 9.18, -12,
    ]);
  });
  it('keeps the top floors of a tall building in a bounded, correctly ordered stack', () => {
    const tower = Array.from({ length: 20 }, (_, id) => ({
      id,
      height: id * 3.6,
      name: String(id),
    }));
    const layout = floorLayout(tower, 19, true);
    expect([...layout.visible]).toEqual([17, 18, 19]);
    expect(
      tower
        .filter((floor) => layout.visible.has(floor.id))
        .map((floor) => displayedPoint([0, floor.height, 0], floor.id, layout)[1]),
    ).toEqual([61.2, 64.8, 68.4]);
  });
  it('does not invent floors for a single-floor building', () => {
    expect(floorLayout(floors.slice(0, 1), 0, true).offsets).toEqual(new Map([[0, 0]]));
  });
});
