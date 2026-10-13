import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { localizeMessage } from '../src/taglish';
import { constrainIntent, type ChatIntent } from '../src/chat-intent';
import {
  classifyQuery,
  matchExit,
  matchRouteRequest,
  splitFloorQualifier,
  offTopic,
} from '../src/query-guard';
import {
  answerBuildingQuestion,
  findPlaces,
  matchBuildingQuestion,
  entranceNode,
} from '../src/building-facts';
import { answerNavigation, dedupeByName, emptyChat, simpleIntent } from '../src/navigation-chat';
import { expandNeed } from '../src/needs';
import type { Building } from '../src/types';

const robinsons = JSON.parse(
  readFileSync('public/demos/robinsons-manila/building.json', 'utf8'),
) as Building;
const tower = JSON.parse(
  readFileSync('public/demos/waypoint-tower/building.json', 'utf8'),
) as Building;
const search: ChatIntent = {
  action: 'search',
  query: '',
  stepFree: 'keep',
  nearest: false,
  choice: 0,
};
const context = (building: Building) => ({
  building,
  origin: 'entrance',
  sample: true,
  accessible: false,
  blocked: new Set<string>(),
  floor: 0,
});

describe('Filipino and Taglish', () => {
  it('translates common navigation words before the rules run', () => {
    expect(localizeMessage('saan ang cr').text).toBe('where is the restroom');
    expect(localizeMessage('nasaan ang elevator?').text).toBe('where is the elevator?');
    expect(localizeMessage('gusto kong bumili ng gamot').text).toBe('i want buy medicine');
    expect(localizeMessage('papunta sa ikalawang palapag').text).toBe('to 2nd floor');
    expect(localizeMessage('maraming salamat po').text).toBe('thanks');
    expect(localizeMessage('where is the food court').translated).toBe(false);
    expect(localizeMessage('Starbucks').text).toBe('Starbucks');
  });
});

describe('selection guard', () => {
  it('turns a guessed "choose" into a search unless something offered was named', () => {
    const chosen: ChatIntent = { ...search, action: 'choose', choice: 1 };
    expect(
      constrainIntent(chosen, {
        message: 'coffee then restroom',
        previousQuery: '',
        choices: ['Food Court'],
      }),
    ).toMatchObject({ action: 'search', query: 'coffee then restroom' });
    expect(
      constrainIntent(chosen, {
        message: 'the second one',
        previousQuery: '',
        choices: ['A', 'B'],
      }),
    ).toMatchObject({ action: 'choose' });
    expect(
      constrainIntent(
        { ...chosen, choice: 1 },
        { message: 'starbucks ☕', previousQuery: '', choices: ['Food Court', 'Starbucks'] },
      ),
    ).toMatchObject({ action: 'choose', choice: 2 });
  });
});

describe('exits, floors, and facilities', () => {
  it('recognises exit and entrance requests', () => {
    for (const text of ['where is the exit', 'take me back to the entrance', 'how do i get out'])
      expect(matchExit(text), text).toBe(true);
    expect(matchExit('exit the app')).toBe(false);
    expect(classifyQuery('where is the exit', 'robinsons-manila')).toEqual({ kind: 'exit' });
    expect(entranceNode(robinsons)?.label).toMatch(/entrance/i);
    expect(simpleIntent('take me back to the entrance', '', robinsons.id)).toMatchObject({
      action: 'route',
      routeTo: 'entrance',
    });
  });
  it('splits a floor qualifier off a search', () => {
    expect(splitFloorQualifier('nearest restroom on floor 7', tower.floors)).toMatchObject({
      text: 'nearest restroom',
      floor: { id: 6 },
    });
    expect(splitFloorQualifier('floor 12 pantry', tower.floors)).toMatchObject({
      text: 'pantry',
      floor: { id: 11 },
    });
    expect(splitFloorQualifier('coffee', tower.floors)).toEqual({ text: 'coffee' });
  });
  it('limits suggestions to the requested floor', async () => {
    const reply = await answerNavigation(
      'nearest restroom on floor 7',
      { ...search, query: 'restroom', nearest: true },
      emptyChat(),
      context(tower),
      async () =>
        tower.rooms
          .filter((room) => /restroom/i.test(room.name))
          .map((room) => ({ room, score: 0.7 })),
    );
    expect(reply.choices.length).toBeGreaterThan(0);
    expect(reply.choices.every((choice) => choice.room.floor === 6)).toBe(true);
    expect(reply.text).toContain('Floor 7');
  });
  it('strips a routing preference from a route endpoint', () => {
    expect(matchRouteRequest('how do i get to the fourth floor without stairs')).toEqual({
      to: 'fourth floor',
    });
  });
  it('explains missing amenities instead of guessing a shop', async () => {
    expect(expandNeed('free wifi')).toMatchObject({ facility: true, label: 'amenities' });
    expect(expandNeed('i need a doctor now')).toMatchObject({ label: 'medical help' });
    const reply = await answerNavigation(
      'free wifi',
      { ...search, query: 'free wifi' },
      emptyChat(),
      context(robinsons),
      async () => robinsons.rooms.map((room) => ({ room, score: 0.1 })),
    );
    expect(reply.text).toContain('has no mapped amenities');
  });
  it('declines pet and policy questions as store information, not personal questions', () => {
    expect(offTopic('can i bring my dog')).toBe('info');
  });
});

describe('conversation closers and emergencies', () => {
  it('acknowledges thanks, ok, and cancel without searching', async () => {
    expect(simpleIntent('thanks')).toMatchObject({ action: 'ack', ackKind: 'thanks' });
    expect(simpleIntent('ok')).toMatchObject({ action: 'ack', ackKind: 'ok' });
    const cancelled = await answerNavigation(
      'cancel',
      { ...search, action: 'ack', ackKind: 'cancel' },
      { ...emptyChat(robinsons.id), choices: ['x'] },
      context(robinsons),
      async () => [],
    );
    expect(cancelled.text).toContain('cancelled');
    expect(cancelled.state.choices).toEqual([]);
  });
  it('treats fire, smoke, and earthquake as evacuation', () => {
    for (const text of ['there is a fire', 'i smell smoke', 'earthquake!', 'i am lost'])
      expect(['evacuation', 'location']).toContain(simpleIntent(text)!.action);
    expect(simpleIntent('there is a fire')!.action).toBe('evacuation');
  });
});

describe('comparisons, nearby places, and duplicates', () => {
  it('answers which of two places is closer', () => {
    const question = matchBuildingQuestion('which is closer starbucks or coffee bean');
    expect(question).toMatchObject({ kind: 'compare', a: 'starbucks', b: 'coffee bean' });
    const answer = answerBuildingQuestion(question!, robinsons, {
      origin: 'entrance',
      accessible: false,
      blocked: new Set(),
    })!;
    expect(answer.text).toMatch(/is closer: about \d+ m .*, versus .* at about \d+ m\./);
    expect(answer.rooms).toHaveLength(2);
  });
  it('lists the closest places to a landmark', () => {
    const question = matchBuildingQuestion('what shops are near the entrance');
    expect(question).toMatchObject({ kind: 'near', place: 'entrance' });
    const answer = answerBuildingQuestion(question!, robinsons, {
      origin: 'entrance',
      accessible: false,
      blocked: new Set(),
    })!;
    expect(answer.text).toMatch(/^Closest stores to .*: .* \(\d+ m\)/);
    expect(answer.rooms.length).toBeGreaterThan(1);
    expect(new Set(answer.rooms.map((room) => room.name)).size).toBe(answer.rooms.length);
  });
  it('understands "this floor" and plurals', () => {
    expect(matchBuildingQuestion('show me everything on this floor')).toMatchObject({
      kind: 'floorContents',
    });
    const answer = answerBuildingQuestion(
      matchBuildingQuestion('show me everything on this floor')!,
      robinsons,
      { origin: 'entrance', currentFloor: 1, accessible: false, blocked: new Set() },
    )!;
    expect(answer.text).toMatch(/^Level 2 has \d+ mapped places/);
    expect(findPlaces(tower, 'pantries').length).toBeGreaterThan(10);
    expect(
      answerBuildingQuestion(matchBuildingQuestion('how many pantries')!, tower, {
        origin: 'entrance',
        accessible: false,
        blocked: new Set(),
      })!.text,
    ).toMatch(/has \d+ mapped pantries/);
  });
  it('offers one suggestion per name, nearest floor first', () => {
    const room = (id: string, name: string, floor: number) => ({
      id,
      name,
      node: id,
      category: 'shopping',
      description: '',
      aliases: [],
      floor,
      position: [0, 0, 0] as [number, number, number],
      size: [1, 1] as [number, number],
    });
    const deduped = dedupeByName([
      { room: room('a', 'Store', 2), distance: 90, reachable: true },
      { room: room('b', 'Store', 0), distance: 30, reachable: true },
      { room: room('c', 'Other', 1), distance: 50, reachable: true },
    ]);
    expect(deduped.map((choice) => choice.room.id)).toEqual(['b', 'c']);
  });
});
