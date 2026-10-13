import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { answerBuildingQuestion, findPlaces, matchBuildingQuestion } from '../src/building-facts';
import { answerNavigation, emptyChat, simpleIntent } from '../src/navigation-chat';
import type { Building } from '../src/types';

const building = JSON.parse(
  readFileSync('public/demos/robinsons-manila/building.json', 'utf8'),
) as Building;
const tower = JSON.parse(
  readFileSync('public/demos/waypoint-tower/building.json', 'utf8'),
) as Building;
const context = {
  origin: 'entrance',
  currentFloor: 0,
  accessible: false,
  blocked: new Set<string>(),
};
const ask = (text: string, b = building) => {
  const question = matchBuildingQuestion(text);
  expect(question, text).toBeDefined();
  return answerBuildingQuestion(question!, b, context);
};

describe('building facts', () => {
  it('parses the common question shapes', () => {
    expect(matchBuildingQuestion('whats the highest floor')).toEqual({ kind: 'floors' });
    expect(matchBuildingQuestion('How many floors are there?')).toEqual({ kind: 'floors' });
    expect(matchBuildingQuestion('what floor am i on')).toEqual({ kind: 'myFloor' });
    expect(matchBuildingQuestion("what's on the 2nd floor")).toMatchObject({
      kind: 'floorContents',
    });
    expect(matchBuildingQuestion('which stores are on level 3')).toMatchObject({
      kind: 'floorContents',
    });
    expect(matchBuildingQuestion('what floor is samsung on')).toEqual({
      kind: 'placeFloor',
      place: 'samsung',
    });
    expect(matchBuildingQuestion('is there a cinema here')).toEqual({
      kind: 'exists',
      place: 'cinema',
    });
    expect(matchBuildingQuestion('how many restaurants are there')).toEqual({
      kind: 'count',
      what: 'restaurants',
    });
    expect(matchBuildingQuestion('how far is the food court')).toEqual({
      kind: 'distance',
      place: 'food court',
    });
    expect(matchBuildingQuestion('coffee')).toBeUndefined();
    expect(matchBuildingQuestion('i want to buy diaper')).toBeUndefined();
    expect(matchBuildingQuestion('what my dog name')).toBeUndefined();
  });
  it('answers from the package data', () => {
    expect(ask('whats the highest floor')!.text).toBe(
      'Robinsons Manila has 4 floors, from Level 1 to Level 4. The highest is Level 4.',
    );
    expect(ask('whats the highest floor', tower)!.text).toContain('20 floors');
    expect(ask('what floor am i on')!.text).toMatch(/Midtown entrance[^,]*, is on Level 1/);
    const level2 = ask('what is on level 2')!;
    expect(level2.text).toMatch(/^Level 2 has \d+ mapped places: /);
    expect(level2.text).toContain('Paeng’s Bowling');
    expect(level2.rooms.every((room) => room.floor === 1)).toBe(true);
    expect(ask('what floor is samsung on')!.text).toBe('Samsung is on Level 3.');
    expect(ask('what floor is the department store on')!.text).toBe(
      'Robinsons Department Store is on Level 1, Level 2 and Level 3.',
    );
    expect(ask('is there a cinema here')!.text).toBe('Yes. Robinsons Movieworld is on Level 4.');
    expect(ask('is there a gym')!.text).toContain('Fitness First');
    expect(ask('how many restaurants are there')!.text).toMatch(/has \d+ mapped places to eat/);
    expect(ask('how many elevators')!.text).toContain('1 mapped elevator');
    const far = ask('how far is the food court')!;
    expect(far.text).toMatch(/Food Court on Level 3 is about \d+ m from Midtown entrance/);
    expect(far.rooms[0].name).toBe('Food Court');
    expect(ask('what is on floor 9')!.text).toContain('has no floor 9');
  });
  it('falls back to a search when the names do not know the place', () => {
    expect(findPlaces(building, 'unicorn shop')).toEqual([]);
    expect(ask('is there a unicorn shop')).toMatchObject({ fallbackQuery: 'unicorn shop' });
    expect(matchBuildingQuestion("what's on the 2nd floor")).toBeDefined();
  });
  it('answers in the chat with tappable places', async () => {
    expect(simpleIntent('whats the highest floor', '', building.id)).toMatchObject({
      action: 'question',
    });
    const reply = await answerNavigation(
      'is there a cinema here',
      {
        action: 'question',
        query: '',
        stepFree: 'keep',
        nearest: false,
        choice: 0,
        question: { kind: 'exists', place: 'cinema' },
      },
      emptyChat(),
      { building, origin: 'entrance', sample: true, accessible: false, blocked: new Set() },
      async () => [],
    );
    expect(reply.text).toBe('Yes. Robinsons Movieworld is on Level 4.');
    expect(reply.choices[0].room.name).toBe('Robinsons Movieworld');
    expect(reply.choices[0].distance).toBeGreaterThan(0);
    // The model may misclassify a building question as unsupported; the facts still win.
    const viaModel = await answerNavigation(
      'How many floors does this mall have?',
      { action: 'unsupported', query: '', stepFree: 'keep', nearest: false, choice: 0 },
      emptyChat(),
      { building, origin: 'entrance', sample: true, accessible: false, blocked: new Set() },
      async () => [],
    );
    expect(viaModel.text).toContain('4 floors');
  });
});
