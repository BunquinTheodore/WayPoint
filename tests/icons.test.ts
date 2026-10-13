import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { iconSet } from '../src/icons';

const pascal = (name: string) =>
  name
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');

it('bundles every icon the interface references', async () => {
  const names = new Set<string>();
  for (const file of ['src/main.ts', 'src/chat-ui.ts']) {
    const source = await readFile(file, 'utf8');
    // Only literals in result position count: `icon('x')`, `cond ? 'x' : 'y'`, not `=== 'food' ?`.
    for (const match of source.matchAll(/icon\(([^)]*)\)/g))
      for (const literal of match[1].matchAll(/'([a-z0-9-]+)'(?=\s*(?:[:)]|$))/g))
        names.add(literal[1]);
  }
  expect(names.size).toBeGreaterThan(20);
  const missing = [...names].filter((name) => !(pascal(name) in iconSet));
  expect(missing).toEqual([]);
});
