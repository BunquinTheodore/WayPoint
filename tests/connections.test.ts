import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { routeToConnection } from '../src/routing';
import { matchConnection, classifyQuery } from '../src/query-guard';
import { explicitRoutePreferences, stripRoutePreferences } from '../src/chat-intent';
import { answerNavigation, emptyChat, simpleIntent } from '../src/navigation-chat';
import type { Building } from '../src/types';

// The tower has both stairs and elevators; the rebuilt Robinsons demo maps elevators only.
const building = JSON.parse(
  readFileSync('public/demos/waypoint-tower/building.json', 'utf8'),
) as Building;

describe('elevator, escalator, and stairs requests', () => {
  it('recognises requests for a vertical connection', () => {
    expect(matchConnection('where is the elevator')).toEqual({
      kind: 'elevator',
      requested: 'elevator',
    });
    expect(matchConnection('Where is the nearest lift?')).toMatchObject({ kind: 'elevator' });
    expect(matchConnection('escalator')).toEqual({ kind: 'stairs', requested: 'escalator' });
    expect(matchConnection('find the stairs please')).toMatchObject({ requested: 'stairs' });
    expect(matchConnection('take me to the elevator')).toMatchObject({ kind: 'elevator' });
    expect(matchConnection('coffee')).toBeUndefined();
    expect(matchConnection('elevator repair shop')).toBeUndefined();
    expect(classifyQuery('where is the elevator', 'waypoint-tower')).toMatchObject({
      kind: 'connection',
    });
  });
  it('does not mistake asking for the elevator for a step-free preference', () => {
    expect(explicitRoutePreferences('where is the elevator').stepFree).toBe('keep');
    expect(stripRoutePreferences('where is the elevator')).toBe('where is the elevator');
    expect(explicitRoutePreferences('I want to use the elevator').stepFree).toBe('yes');
  });
  it('routes to the nearest landing on the same floor first', () => {
    const start = building.nodes.find((node) => node.floor === 0 && node.checkpoint)!;
    const lift = routeToConnection(building, start.id, 'elevator');
    expect(lift).not.toBeNull();
    expect(lift!.nodes.at(-1)!.floor).toBe(0);
    expect(lift!.nodes.at(-1)!.label).toMatch(/elevator/i);
    const stairs = routeToConnection(building, start.id, 'stairs', { accessible: true });
    expect(stairs).not.toBeNull();
    expect(stairs!.nodes.at(-1)!.label).toMatch(/stairs/i);
    expect(stairs!.edges.every((edge) => edge.accessible)).toBe(true);
  });
  it('answers in the chat with the landing and a route button', async () => {
    const start = building.nodes.find((node) => node.floor === 0 && node.checkpoint)!;
    expect(simpleIntent('where is the elevator', '', building.id)).toMatchObject({
      action: 'connection',
      connectionKind: 'elevator',
    });
    const context = {
      building,
      origin: start.id,
      sample: true,
      accessible: false,
      blocked: new Set<string>(),
    };
    const reply = await answerNavigation(
      'where is the elevator',
      {
        action: 'connection',
        query: '',
        stepFree: 'keep',
        nearest: false,
        choice: 0,
        connectionKind: 'elevator',
        connectionLabel: 'elevator',
      },
      emptyChat(),
      context,
      async () => [],
    );
    expect(reply.action).toBe('connection');
    expect(reply.nodeId).toBeDefined();
    expect(reply.text).toMatch(/nearest elevator .* is Elevator, floor 1, about \d+ m/);
    const escalator = await answerNavigation(
      'Where is the nearest escalator?',
      { action: 'search', query: 'escalator', stepFree: 'keep', nearest: true, choice: 0 },
      emptyChat(),
      context,
      async () => [],
    );
    expect(escalator.action).toBe('connection');
    expect(escalator.text).toContain('maps escalators as stairs');
  });
});
