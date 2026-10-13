import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { route, routeSteps, directions } from '../src/routing';
import type { Building } from '../src/types';

const robinsons = JSON.parse(
  readFileSync('public/demos/robinsons-manila/building.json', 'utf8'),
) as Building;

describe('turn-by-turn steps', () => {
  it('merges walks through generic gallery waypoints into one step per meaningful place', () => {
    const foodCourt = robinsons.rooms.find((room) => room.name === 'Food Court')!;
    const path = route(robinsons, 'entrance', foodCourt.node)!;
    const steps = routeSteps(path);
    expect(steps.length).toBeLessThan(path.edges.length / 2);
    for (let i = 1; i < steps.length; i++)
      expect(steps[i].text, `step ${i + 1}`).not.toMatch(/toward Public gallery\.$/);
    expect(steps.some((step) => step.text.startsWith('Take the elevator'))).toBe(true);
    expect(steps.at(-1)!.text).toContain('Food Court');
    // Every edge is covered exactly once, so blocking a merged step blocks the whole walk.
    expect(steps.flatMap((step) => step.edges)).toEqual(path.edges.map((edge) => edge.id));
    // Merged distances add up to the walking edges they cover (rounding aside).
    const summed = steps
      .filter((step) => step.text.startsWith('Continue'))
      .map((step) => Number(/(\d+) m/.exec(step.text)![1]))
      .reduce((sum, metres) => sum + metres, 0);
    const walked = path.edges
      .filter((edge) => edge.kind === 'corridor' || edge.kind === 'door')
      .reduce((sum, edge) => sum + edge.distance, 0);
    expect(Math.abs(summed - walked)).toBeLessThan(steps.length);
  });
  it('blocking a merged step blocks every edge it covers', () => {
    const foodCourt = robinsons.rooms.find((room) => room.name === 'Food Court')!;
    const path = route(robinsons, 'entrance', foodCourt.node)!;
    const walk = routeSteps(path).find((step) => step.edges.length > 1)!;
    const rerouted = route(robinsons, 'entrance', foodCourt.node, { blocked: new Set(walk.edges) });
    // Either a detour that avoids every blocked edge, or an honest "no route".
    if (rerouted) expect(rerouted.edges.some((edge) => walk.edges.includes(edge.id))).toBe(false);
  });
  it('keeps the plain text form', () => {
    expect(directions(route(robinsons, 'entrance', 'entrance')!)).toEqual([
      'You are at the destination.',
    ]);
  });
});
