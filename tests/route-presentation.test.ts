import { describe, expect, it } from 'vitest';
import { routeDashes } from '../src/route-presentation';

describe('dashed route presentation', () => {
  it('continues the dash phase across graph vertices', () => {
    expect(
      routeDashes(
        [
          [0, 0, 0],
          [1, 0, 0],
          [4, 0, 0],
        ],
        2,
        1,
      ),
    ).toEqual([
      { from: [0, 0, 0], to: [1, 0, 0], segment: 0 },
      { from: [1, 0, 0], to: [2, 0, 0], segment: 1 },
      { from: [3, 0, 0], to: [4, 0, 0], segment: 1 },
    ]);
  });
  it('splits a visible dash at a corner without drawing a shortcut', () => {
    expect(
      routeDashes(
        [
          [0, 0, 0],
          [1, 0, 0],
          [1, 0, 2],
        ],
        2,
        1,
      ),
    ).toEqual([
      { from: [0, 0, 0], to: [1, 0, 0], segment: 0 },
      { from: [1, 0, 0], to: [1, 0, 1], segment: 1 },
    ]);
  });
  it('handles duplicate points and rejects invalid spacing', () => {
    expect(
      routeDashes(
        [
          [0, 0, 0],
          [0, 0, 0],
          [2, 0, 0],
        ],
        1,
        1,
      ),
    ).toHaveLength(1);
    expect(() => routeDashes([], 0, 1)).toThrow('Invalid');
  });
});
