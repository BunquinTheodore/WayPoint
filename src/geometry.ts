import type { Room } from './types';

export function pointInPolygon(x: number, z: number, polygon: readonly [number, number][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}

export function containsRoom(room: Room, x: number, z: number) {
  return room.footprint
    ? pointInPolygon(x, z, room.footprint)
    : Math.abs(x - room.position[0]) < room.size[0] / 2 &&
        Math.abs(z - room.position[2]) < room.size[1] / 2;
}
