import { readFile } from 'node:fs/promises';
export const catalog = JSON.parse(await readFile('demo-catalog.json', 'utf8'));
export const buildingDirectories = [
  'public/demo',
  ...catalog.map((demo) => `public/demos/${demo.id}`),
];
