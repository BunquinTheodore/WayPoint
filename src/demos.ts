import catalog from '../demo-catalog.json';

export const demos = catalog;
export const defaultBuildingId = demos.find((demo) => demo.id === 'estancia-main-gf')!.id;
export const supportedBuildingIds = [...demos.map((demo) => demo.id), 'demo-001'];
export function demoPackagePath(id: string) {
  if (id === 'demo-001') return './demo/package.zip';
  if (!demos.some((demo) => demo.id === id)) throw new Error('Unknown demo building.');
  return `./demos/${id}/package.zip`;
}
