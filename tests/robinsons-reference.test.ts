import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Building } from '../src/types';
import { Mesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type XY = [number, number];
interface Surface {
  boundaries: XY[][];
  holes: XY[][];
  triangles: XY[][];
}
const geometry = JSON.parse(readFileSync('references/robinsons-manila/geometry.json', 'utf8')) as {
  outline: XY[];
  floors: { id: number; slab: Surface; stores: { polygon: XY[] }[] }[];
};
const building = JSON.parse(
  readFileSync('public/demos/robinsons-manila/building.json', 'utf8'),
) as Building;
function inside(p: XY, polygon: XY[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
describe('Robinsons reference geometry', () => {
  it('keeps horizontal routes on floor surfaces and outside shop interiors and open voids', () => {
    const nodes = new Map(building.nodes.map((n) => [n.id, n]));
    for (const edge of building.edges) {
      const a = nodes.get(edge.from)!,
        b = nodes.get(edge.to)!;
      if (a.floor !== b.floor) continue;
      const floor = geometry.floors.find((f) => f.id === a.floor)!;
      // Endpoints lie on storefront boundaries. Sample the open segment at 0.5 m intervals.
      const steps = Math.max(3, Math.ceil(edge.distance * 2));
      for (let i = 1; i < steps; i++) {
        const p: XY = [
          a.position[0] + ((b.position[0] - a.position[0]) * i) / steps,
          a.position[2] + ((b.position[2] - a.position[2]) * i) / steps,
        ];
        expect(
          floor.slab.boundaries.some((poly) => inside(p, poly)),
          `${edge.id}: outside floor`,
        ).toBe(true);
        expect(
          floor.slab.holes.some((poly) => inside(p, poly)),
          `${edge.id}: crosses void`,
        ).toBe(false);
        expect(
          floor.stores.some((store) => inside(p, store.polygon)),
          `${edge.id}: crosses shop`,
        ).toBe(false);
      }
    }
  });
  it('triangulates upper slabs without filling the atriums or creating degenerate triangles', () => {
    for (const floor of geometry.floors.slice(1)) {
      expect(floor.slab.holes.length).toBeGreaterThan(0);
      for (const triangle of floor.slab.triangles) {
        const [a, b, c] = triangle;
        const center: XY = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
        expect(floor.slab.holes.some((poly) => inside(center, poly))).toBe(false);
        expect(
          Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])),
        ).toBeGreaterThan(0);
      }
    }
  });
  it('exports upward-facing floor surfaces and the intended exterior identity colors', async () => {
    const bytes = readFileSync('public/demos/robinsons-manila/building.glb');
    const model = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    let slabs = 0;
    const names = new Set<string>();
    model.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const mat of Array.isArray(object.material) ? object.material : [object.material])
        names.add(mat.name);
      if (!object.name.startsWith('Floor_slab_-_reference_footprint')) return;
      slabs++;
      const normal = object.geometry.getAttribute('normal');
      let upward = 0;
      for (let i = 0; i < normal.count; i++) {
        expect(normal.getY(i)).toBeGreaterThanOrEqual(-0.001);
        if (normal.getY(i) > 0.99) upward++;
      }
      expect(upward).toBeGreaterThan(0);
    });
    expect(slabs).toBe(4);
    expect(names.has('Reference: Robinsons red')).toBe(true);
    expect(names.has('Reference: ivory balcony bands')).toBe(true);
  });
  it('excludes unverified evacuation connections and residential interiors', () => {
    expect(building.floors).toHaveLength(4);
    expect(building.edges.every((e) => !e.evacuation)).toBe(true);
    expect(building.nodes.some((n) => n.assembly || n.refuge || n.exit)).toBe(false);
    expect(building.provenance?.layoutNote).toContain('estimates');
    expect(building.provenance?.sources).toContain('https://www.openstreetmap.org/way/130532101');
  });
});
