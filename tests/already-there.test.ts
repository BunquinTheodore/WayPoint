import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { answerNavigation, emptyChat } from '../src/navigation-chat';
import { expandNeed } from '../src/needs';
import type { Building } from '../src/types';

const robinsons = JSON.parse(
  readFileSync('public/demos/robinsons-manila/building.json', 'utf8'),
) as Building;
const context = {
  building: robinsons,
  origin: 'entrance',
  sample: true,
  accessible: false,
  blocked: new Set<string>(),
  floor: 0,
};

describe('edge replies', () => {
  it('says so when the visitor is already at the requested place', async () => {
    const reply = await answerNavigation(
      'take me back to the entrance',
      {
        action: 'route',
        query: '',
        stepFree: 'keep',
        nearest: false,
        choice: 0,
        routeTo: 'entrance',
      },
      emptyChat(),
      context,
      async () => [],
    );
    expect(reply.action).toBeUndefined();
    expect(reply.text).toMatch(/^You are already at /);
  });
  it('treats restrooms as a facility so a map without them says so', async () => {
    expect(expandNeed('saan ang cr')).toMatchObject({ label: 'restrooms', facility: true });
    const reply = await answerNavigation(
      'where is the restroom',
      { action: 'search', query: 'restroom', stepFree: 'keep', nearest: false, choice: 0 },
      emptyChat(),
      context,
      async () => robinsons.rooms.map((room) => ({ room, score: 0.1 })),
    );
    expect(reply.text).toContain('has no mapped restrooms');
  });
});
