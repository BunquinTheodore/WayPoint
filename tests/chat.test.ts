import { describe, expect, it } from 'vitest';
import {
  answerNavigation,
  emptyChat,
  simpleIntent,
  type ChatContext,
} from '../src/navigation-chat';
import {
  constrainIntent,
  explicitRoutePreferences,
  isPureRoutePreference,
  parseIntent,
  stripRoutePreferences,
  validateRequest,
  type ChatIntent,
} from '../src/chat-intent';
import type { Building, Room } from '../src/types';

const room = (id: string): Room => ({
  id,
  name: id,
  node: id,
  category: 'facilities',
  description: 'Restroom',
  aliases: [],
  floor: 0,
  position: [0, 0, 0],
  size: [1, 1],
});
const rooms = [room('Near restroom'), room('Far restroom')];
const building: Building = {
  id: 'test',
  name: 'Test building',
  version: '1.0.0',
  schemaVersion: 1,
  reviewDate: '2026-10-09',
  model: 'test.glb',
  floors: [{ id: 0, name: 'Ground floor', height: 0 }],
  rooms,
  nodes: ['start', ...rooms.map((room) => room.id)].map((id) => ({
    id,
    label: id,
    floor: 0,
    position: [0, 0, 0],
  })),
  edges: rooms.map((room, index) => ({
    id: `edge-${index}`,
    from: 'start',
    to: room.id,
    distance: index ? 80 : 10,
    kind: index ? 'corridor' : 'stairs',
    accessible: !!index,
    evacuation: false,
  })),
  instructions: { emergency: 'Demo only', assistance: 'Ask staff' },
};
const context: ChatContext = {
  building,
  origin: 'start',
  accessible: false,
  sample: true,
  blocked: new Set(),
};
const intent: ChatIntent = {
  action: 'search',
  query: 'restroom',
  stepFree: 'keep',
  nearest: false,
  choice: 0,
};
const search = async () => [
  { room: rooms[1], score: 0.8 },
  { room: rooms[0], score: 0.78 },
];

describe('grounded navigation conversation', () => {
  it('orders nearest suggestions by traversable graph distance, not semantic score', async () => {
    const reply = await answerNavigation(
      'Nearest restroom',
      { ...intent, nearest: true },
      emptyChat(),
      context,
      search,
    );
    expect(reply.choices.map((choice) => choice.distance)).toEqual([10, 80]);
    expect(reply.text).toContain('demo starting point');
  });
  it('enforces no-stairs even when the interpreter misses the constraint', async () => {
    const reply = await answerNavigation(
      'Restroom, no stairs',
      intent,
      emptyChat(),
      context,
      search,
    );
    expect(reply.state.stepFree).toBe(true);
    expect(reply.choices.map((choice) => choice.room.id)).toEqual(['Far restroom']);
  });
  it('preserves accessibility for a follow-up and refuses unreachable routes', async () => {
    const state = {
      ...emptyChat('test'),
      query: 'restroom',
      choices: rooms.map((room) => room.id),
      stepFree: true,
    };
    const reply = await answerNavigation(
      'The first one',
      { ...intent, action: 'choose', choice: 1 },
      state,
      { ...context, accessible: true },
      search,
    );
    expect(reply.choices[0].reachable).toBe(false);
    expect(reply.text).toContain('no permitted step-free route');
  });
  it('never disables accessibility merely because the model requests it', async () => {
    const reply = await answerNavigation(
      'Find restroom',
      { ...intent, stepFree: 'no' },
      emptyChat(),
      { ...context, accessible: true },
      search,
    );
    expect(reply.state.stepFree).toBe(true);
  });
  it('rechecks reported blocked edges', async () => {
    const reply = await answerNavigation(
      'Restroom',
      intent,
      emptyChat(),
      { ...context, blocked: new Set(['edge-0', 'edge-1']) },
      search,
    );
    expect(reply.choices).toEqual([]);
    expect(reply.text).toContain('no permitted');
  });
  it('asks for a checkpoint without inventing a distance or nearest order', async () => {
    const reply = await answerNavigation(
      'Nearest restroom',
      { ...intent, nearest: true },
      emptyChat(),
      { ...context, origin: undefined, sample: false },
      search,
    );
    expect(reply.action).toBe('scan');
    expect(reply.choices.every((choice) => choice.distance === undefined)).toBe(true);
    expect(reply.text).not.toContain('closest');
  });
  it('does not force unrelated semantic results into a suggestion', async () => {
    const reply = await answerNavigation(
      'A submarine',
      { ...intent, query: 'submarine' },
      emptyChat(),
      context,
      async () => rooms.map((room) => ({ room, score: 0.18 })),
    );
    expect(reply.choices).toEqual([]);
    expect(reply.text).toContain('could not find');
  });
  it('excludes previously offered places when asking for another', async () => {
    const state = { ...emptyChat('test'), query: 'restroom', choices: [rooms[0].id] };
    const reply = await answerNavigation(
      'Another one',
      { ...intent, action: 'refine' },
      state,
      context,
      search,
    );
    expect(reply.choices.map((choice) => choice.room.id)).toEqual([rooms[1].id]);
  });
  it('does not carry a destination into a different building', async () => {
    const state = { ...emptyChat('old-building'), query: 'restroom', choices: [rooms[0].id] };
    const reply = await answerNavigation(
      'First one',
      { ...intent, action: 'choose', choice: 1 },
      state,
      context,
      search,
    );
    expect(reply.choices).toEqual([]);
  });
  it('does not manufacture emergency routes', async () => {
    const reply = await answerNavigation(
      'Evacuate',
      { ...intent, action: 'evacuation' },
      emptyChat(),
      context,
      search,
    );
    expect(reply.action).toBe('evacuation');
    expect(reply.choices).toEqual([]);
  });
  it('switches buildings and declines off-topic chat without a model call', async () => {
    expect(simpleIntent('go to waypoint tower', '', 'robinsons-manila')).toMatchObject({
      action: 'building',
      buildingId: 'waypoint-tower',
    });
    expect(simpleIntent('what my dog name')).toMatchObject({
      action: 'unsupported',
      reason: 'personal',
    });
    const switching = await answerNavigation(
      'go to waypoint tower',
      { ...intent, action: 'building', query: '', buildingId: 'waypoint-tower' },
      emptyChat(),
      context,
      search,
    );
    expect(switching).toMatchObject({ action: 'building', buildingId: 'waypoint-tower' });
    expect(switching.choices).toEqual([]);
    const same = await answerNavigation(
      'go to the test building',
      { ...intent, action: 'building', query: '', buildingId: 'test' },
      emptyChat(),
      context,
      search,
    );
    expect(same.action).toBeUndefined();
    expect(same.text).toContain('already viewing');
    const personal = await answerNavigation(
      'what my dog name',
      { ...intent, action: 'unsupported', query: '', reason: 'personal' },
      emptyChat(),
      context,
      search,
    );
    expect(personal.choices).toEqual([]);
    expect(personal.text).toContain('offline guide');
    const hours = await answerNavigation(
      'What time does the supermarket close?',
      { ...intent, action: 'unsupported', query: '' },
      emptyChat(),
      context,
      search,
    );
    expect(hours.text).toContain('opening hours');
  });
  it('understands many ways of refusing stairs and re-plans the route on screen', async () => {
    for (const text of [
      "I don't want to use stairs",
      'i dont want to use stairs i want to go to supermarket',
      "I can't climb stairs",
      'Take me there without the stairs',
      'Use the elevator please',
      'My knees are bad, the stairs are hard',
    ])
      expect(explicitRoutePreferences(text).stepFree, text).toBe('yes');
    expect(stripRoutePreferences('i dont want to use stairs i want to go to supermarket')).toBe(
      'i want to go to supermarket',
    );
    expect(stripRoutePreferences('Nearest restroom, no stairs please')).toBe('Nearest restroom');
    expect(isPureRoutePreference("I don't want to use stairs")).toBe(true);
    expect(isPureRoutePreference('no stairs, supermarket')).toBe(false);
    expect(simpleIntent("I don't want to use stairs", 'coffee')).toMatchObject({
      action: 'refine',
      query: 'coffee',
      stepFree: 'yes',
    });
    // A route to the far restroom is on screen; the visitor refuses stairs.
    const reply = await answerNavigation(
      "I don't want to use stairs",
      { ...intent, action: 'refine', query: '', stepFree: 'yes' },
      { ...emptyChat('test'), query: 'restroom' },
      { ...context, routeTo: rooms[1] },
      search,
    );
    expect(reply.state.stepFree).toBe(true);
    expect(reply.choices.map((choice) => choice.room.id)).toEqual(['Far restroom']);
    expect(reply.choices[0].reachable).toBe(true);
    expect(reply.text).toContain('elevators instead of stairs');
    // The stairs-only room cannot be reached step-free.
    const blocked = await answerNavigation(
      'avoid stairs',
      { ...intent, action: 'refine', query: '', stepFree: 'yes' },
      emptyChat('test'),
      { ...context, routeTo: rooms[0] },
      search,
    );
    expect(blocked.choices[0].reachable).toBe(false);
    expect(blocked.text).toContain('no permitted step-free route');
  });
  it('answers floor requests with a route to a landing, or explains why not', async () => {
    const floors = [
      { id: 0, name: 'Ground floor', height: 0 },
      { id: 1, name: 'Level 2', height: 4 },
    ];
    expect(simpleIntent('go to the 2nd floor', '', 'test', floors, 0)).toMatchObject({
      action: 'floor',
      floorId: 1,
    });
    // Two floors joined by stairs and an elevator from the start node.
    const landing = (id: string, floor: number) => ({
      id,
      label: id,
      floor,
      position: [0, 0, 0] as [number, number, number],
    });
    const multi: Building = {
      ...building,
      floors,
      nodes: [...building.nodes, landing('stairs-up', 1), landing('lift-up', 1)],
      edges: [
        ...building.edges,
        {
          id: 'stairs',
          from: 'start',
          to: 'stairs-up',
          distance: 12,
          kind: 'stairs',
          accessible: false,
          evacuation: true,
        },
        {
          id: 'lift',
          from: 'start',
          to: 'lift-up',
          distance: 30,
          kind: 'elevator',
          accessible: true,
          evacuation: false,
        },
      ],
    };
    const up = await answerNavigation(
      'go to the 2nd floor',
      { ...intent, action: 'floor', query: '', floorId: 1, floorLabel: 'floor 2' },
      emptyChat(),
      { ...context, building: multi },
      search,
    );
    expect(up).toMatchObject({ action: 'floor', floorId: 1 });
    expect(up.text).toContain('use the stairs');
    expect(up.text).toContain('12 m');
    const stepFree = await answerNavigation(
      'go to the 2nd floor, no stairs',
      { ...intent, action: 'floor', query: '', floorId: 1, floorLabel: 'floor 2' },
      emptyChat(),
      { ...context, building: multi },
      search,
    );
    expect(stepFree.text).toContain('take the elevator');
    expect(stepFree.text).toContain('30 m');
    const same = await answerNavigation(
      'ground floor',
      { ...intent, action: 'floor', query: '', floorId: 0, floorLabel: 'the ground floor' },
      emptyChat(),
      { ...context, building: multi },
      search,
    );
    expect(same.text).toContain('already on Ground floor');
    const missing = await answerNavigation(
      'floor 9',
      { ...intent, action: 'floor', query: '', floorId: undefined, floorLabel: 'floor 9' },
      emptyChat(),
      { ...context, building: multi },
      search,
    );
    expect(missing.text).toContain('has no floor 9');
    // The model may phrase a floor request as a search for "floor 2".
    const viaSearch = await answerNavigation(
      'Can you take me to the second floor?',
      { ...intent, query: 'floor 2' },
      emptyChat(),
      { ...context, building: multi },
      search,
    );
    expect(viaSearch.action).toBe('floor');
  });
  it('handles explicit navigation follow-ups without another model call', () => {
    expect(simpleIntent('Avoid stairs', 'coffee')).toMatchObject({
      action: 'refine',
      query: 'coffee',
      stepFree: 'yes',
    });
    expect(simpleIntent('The second one')).toMatchObject({ action: 'choose', choice: 2 });
    expect(simpleIntent('Find a place to get a drink')).toBeUndefined();
  });
  it('rejects malformed output and oversized requests at the native boundary', () => {
    expect(() => parseIntent('{"action":"navigate","query":"fake"}')).toThrow();
    expect(() => parseIntent(JSON.stringify({ ...intent, choice: 99 }))).toThrow();
    expect(() =>
      validateRequest({ message: 'a'.repeat(501), previousQuery: '', choices: [] }),
    ).toThrow();
    expect(parseIntent('<think></think>' + JSON.stringify(intent))).toEqual(intent);
  });
  it('ignores routing preferences the model invented without an explicit request', () => {
    expect(
      constrainIntent(
        { ...intent, stepFree: 'yes', nearest: true },
        { message: 'Find food', previousQuery: '', choices: [] },
      ),
    ).toMatchObject({ stepFree: 'keep', nearest: false });
    expect(
      constrainIntent(intent, {
        message: "I can't climb stairs. Find the closest restroom",
        previousQuery: '',
        choices: [],
      }),
    ).toMatchObject({ stepFree: 'yes', nearest: true });
  });
});
