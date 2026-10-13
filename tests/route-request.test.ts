import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { matchRouteRequest } from '../src/query-guard';
import { resolveEndpoint } from '../src/building-facts';
import { routeBetween } from '../src/routing';
import { answerNavigation, emptyChat, simpleIntent } from '../src/navigation-chat';
import type { Building } from '../src/types';

const building = JSON.parse(
  readFileSync('public/demos/robinsons-manila/building.json', 'utf8'),
) as Building;
// Landing labels and stairs connections are checked on the tower, which has both kinds.
const tower = JSON.parse(
  readFileSync('public/demos/waypoint-tower/building.json', 'utf8'),
) as Building;
const context = {
  building,
  origin: 'entrance',
  sample: true,
  accessible: false,
  blocked: new Set<string>(),
  floor: 0,
};

describe('routes between two endpoints', () => {
  it('parses the request shapes', () => {
    expect(matchRouteRequest('create a route to first floor to second floor')).toEqual({
      from: 'first floor',
      to: 'second floor',
    });
    expect(matchRouteRequest('How do I get from the food court to the cinema?')).toEqual({
      from: 'food court',
      to: 'cinema',
    });
    expect(matchRouteRequest('directions from here to samsung')).toEqual({ to: 'samsung' });
    expect(matchRouteRequest('route level 1 to level 4')).toEqual({
      from: 'level 1',
      to: 'level 4',
    });
    expect(matchRouteRequest('how do i get to the cinema')).toEqual({ to: 'cinema' });
    // Filler between the keyword and the endpoints, as visitors actually type it.
    expect(matchRouteRequest('create route going to the elevator')).toEqual({ to: 'elevator' });
    expect(matchRouteRequest('create route going to floor 1 to floor 5')).toEqual({
      from: 'floor 1',
      to: 'floor 5',
    });
    expect(matchRouteRequest('go from level 1 to level 5')).toEqual({
      from: 'level 1',
      to: 'level 5',
    });
    expect(matchRouteRequest('show me the way to the food court')).toEqual({ to: 'food court' });
    // Dashes and arrows instead of "to", and a bare floor pair without any keyword.
    expect(matchRouteRequest('create route to floor 1 - floor 7')).toEqual({
      from: 'floor 1',
      to: 'floor 7',
    });
    expect(matchRouteRequest('floor 1 -> floor 7')).toEqual({ from: 'floor 1', to: 'floor 7' });
    expect(matchRouteRequest('level 1 → cinema')).toEqual({ from: 'level 1', to: 'cinema' });
    expect(matchRouteRequest('2nd floor to 5th floor')).toEqual({
      from: '2nd floor',
      to: '5th floor',
    });
    expect(matchRouteRequest('step-free route to the cinema')).toEqual({ to: 'cinema' });
    expect(matchRouteRequest('give me directions to samsung please')).toEqual({ to: 'samsung' });
    expect(matchRouteRequest('i want to go to the 2nd floor')).toBeUndefined();
    expect(matchRouteRequest('coffee')).toBeUndefined();
  });
  it('resolves endpoints to floors, rooms, or landings', () => {
    expect(resolveEndpoint('elevator', building)).toMatchObject({
      kind: 'connection',
      connection: 'elevator',
    });
    expect(resolveEndpoint('the stairs', building)).toMatchObject({ kind: 'connection' });
    const toLift = routeBetween(tower, { node: 'entrance' }, { connection: 'elevator' });
    expect(toLift!.nodes.at(-1)!.label).toMatch(/elevator/i);
    expect(resolveEndpoint('first floor', building)).toMatchObject({ kind: 'floor' });
    expect(resolveEndpoint('food court', building)).toMatchObject({
      kind: 'node',
      label: 'Food Court',
    });
    expect(resolveEndpoint('elevator, floor 1', tower)).toMatchObject({ kind: 'node' });
    expect(resolveEndpoint('unicorn shop', building)).toBeUndefined();
  });
  it('routes floor to floor via a landing and place to place directly', () => {
    const floors = routeBetween(building, { floor: 0 }, { floor: 1 });
    expect(floors).not.toBeNull();
    expect(floors!.nodes[0].floor).toBe(0);
    expect(floors!.nodes.at(-1)!.floor).toBe(1);
    expect(floors!.edges.every((edge) => edge.kind === 'stairs' || edge.kind === 'elevator')).toBe(
      true,
    );
    const stepFree = routeBetween(building, { floor: 0 }, { floor: 1 }, { accessible: true });
    expect(stepFree!.edges.every((edge) => edge.kind === 'elevator')).toBe(true);
    const foodCourt = building.rooms.find((room) => room.name === 'Food Court')!;
    const cinema = building.rooms.find((room) => room.name === 'Robinsons Movieworld')!;
    const places = routeBetween(building, { node: foodCourt.node }, { node: cinema.node });
    expect(places!.nodes[0].id).toBe(foodCourt.node);
    expect(places!.nodes.at(-1)!.id).toBe(cinema.node);
  });
  it('answers in the chat with a route button and explains unknown endpoints', async () => {
    expect(
      simpleIntent('create a route to first floor to second floor', '', building.id),
    ).toMatchObject({
      action: 'route',
      routeFrom: 'first floor',
      routeTo: 'second floor',
    });
    const reply = await answerNavigation(
      'create a route to first floor to second floor',
      {
        action: 'route',
        query: '',
        stepFree: 'keep',
        nearest: false,
        choice: 0,
        routeFrom: 'first floor',
        routeTo: 'second floor',
      },
      emptyChat(),
      context,
      async () => [],
    );
    expect(reply.action).toBe('route');
    expect(reply.text).toMatch(
      /^Route from Level 1 to Level 2: start at .*, (take the elevator|use the stairs), about \d+ m/,
    );
    expect(reply.routeStartId).toBeDefined();
    const unknown = await answerNavigation(
      'route from narnia to the cinema',
      {
        action: 'route',
        query: '',
        stepFree: 'keep',
        nearest: false,
        choice: 0,
        routeFrom: 'narnia',
        routeTo: 'cinema',
      },
      emptyChat(),
      context,
      async () => [],
    );
    expect(unknown.text).toContain('do not know a place or floor called');
    // The model may express this as a search for "from A to B".
    const viaModel = await answerNavigation(
      'How do I get from the food court to the cinema?',
      {
        action: 'search',
        query: 'from food court to cinema',
        stepFree: 'keep',
        nearest: false,
        choice: 0,
      },
      emptyChat(),
      context,
      async () => [],
    );
    expect(viaModel.action).toBe('route');
    expect(viaModel.text).toContain('Route from Food Court to Robinsons Movieworld');
  });
});
