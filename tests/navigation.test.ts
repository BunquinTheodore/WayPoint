import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { route, routeToFloor, evacuationRoute, parseCheckpoint, directions } from '../src/routing';
import type { Building } from '../src/types';
const building = JSON.parse(readFileSync('public/demo/building.json', 'utf8')) as Building;
describe('mapped navigation', () => {
  it('routes from the entrance to every room through valid edges', () => {
    for (const room of building.rooms) {
      const result = route(building, 'entrance', room.node);
      expect(result, room.name).not.toBeNull();
      expect(result!.nodes[0].id).toBe('entrance');
      expect(result!.nodes.at(-1)!.id).toBe(room.node);
      for (let i = 0; i < result!.edges.length; i++) {
        const e = result!.edges[i];
        expect([e.from, e.to]).toContain(result!.nodes[i].id);
        expect([e.from, e.to]).toContain(result!.nodes[i + 1].id);
      }
    }
  });
  it('uses elevators and never stairs for a step-free multi-floor route', () => {
    const room = building.rooms.find((r) => r.name === 'Library')!;
    const result = route(building, 'entrance', room.node, { accessible: true });
    expect(result).not.toBeNull();
    expect(result!.edges.some((e) => e.kind === 'elevator')).toBe(true);
    expect(result!.edges.every((e) => e.accessible && e.kind !== 'stairs')).toBe(true);
  });
  it('excludes elevators from every evacuation route', () => {
    for (const node of building.nodes.filter((n) => n.checkpoint)) {
      const result = evacuationRoute(building, node.id, false, new Set());
      expect(result).not.toBeNull();
      expect(result!.nodes.at(-1)!.assembly).toBe(true);
      expect(result!.edges.every((e) => e.evacuation && e.kind !== 'elevator')).toBe(true);
    }
  });
  it('does not invent an accessible evacuation route from an upper floor', () => {
    expect(evacuationRoute(building, 'corridor-2-13', true, new Set())).toBeNull();
  });
  it('finds the alternate exit after one exit connection is blocked', () => {
    const first = evacuationRoute(building, 'entrance', false, new Set())!;
    const exterior = first.edges.find((e) => e.kind === 'outside')!;
    const second = evacuationRoute(building, 'entrance', false, new Set([exterior.id]))!;
    expect(second).not.toBeNull();
    expect(second.edges.some((e) => e.id === exterior.id)).toBe(false);
    expect(second.nodes.at(-1)!.id).not.toBe(first.nodes.at(-1)!.id);
  });
  it('returns no route when both exit connections are blocked', () => {
    const connections = building.edges.filter(
      (e) => e.kind === 'outside' && e.from.startsWith('corridor'),
    );
    expect(
      evacuationRoute(building, 'entrance', false, new Set(connections.map((e) => e.id))),
    ).toBeNull();
  });
  it('handles arrival and unknown nodes', () => {
    expect(directions(route(building, 'entrance', 'entrance')!)).toEqual([
      'You are at the destination.',
    ]);
    expect(route(building, 'unknown', 'entrance')).toBeNull();
  });
});
describe('checkpoint parsing', () => {
  it('accepts a building checkpoint and optional Wi-Fi setup', () => {
    expect(
      parseCheckpoint(
        '{"v":1,"building":"demo-001","checkpoint":"ground-reception","wifi":{"ssid":"Building-Maps","password":"waypoint-demo"}}',
      ).checkpoint,
    ).toBe('ground-reception');
  });
  it.each([
    'https://evil.example',
    '{}',
    '{"v":2,"building":"demo-001","checkpoint":"entrance"}',
    '{"v":1,"building":"../other","checkpoint":"entrance"}',
  ])('rejects unsupported payload %s', (text) => expect(() => parseCheckpoint(text)).toThrow());
});

describe('floor requests', () => {
  it('routes to the nearest landing on the requested floor, step-free when asked', () => {
    const upstairs = building.floors.find((floor) => floor.id === 1)!;
    const any = routeToFloor(building, 'entrance', upstairs.id);
    expect(any).not.toBeNull();
    expect(any!.nodes.at(-1)!.floor).toBe(upstairs.id);
    expect(['stairs', 'elevator']).toContain(any!.edges.at(-1)!.kind);
    const stepFree = routeToFloor(building, 'entrance', upstairs.id, { accessible: true });
    expect(stepFree).not.toBeNull();
    expect(stepFree!.edges.at(-1)!.kind).toBe('elevator');
    expect(stepFree!.edges.every((edge) => edge.accessible)).toBe(true);
    expect(routeToFloor(building, 'entrance', 99)).toBeNull();
  });
});
