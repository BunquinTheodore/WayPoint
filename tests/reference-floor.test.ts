import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Building, Room } from '../src/types';
import { containsRoom, pointInPolygon } from '../src/geometry';
import { validateBuilding } from '../src/packages';
import { route } from '../src/routing';
import { Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const source = JSON.parse(readFileSync('references/estancia-main-gf.json', 'utf8'));
const building: Building = JSON.parse(
  readFileSync('public/demos/estancia-main-gf/building.json', 'utf8'),
);

describe('Estancia reference floor', () => {
  it('renders the same irregular polygon corners in the actual GLB', async () => {
    const bytes = readFileSync('public/demos/estancia-main-gf/building.glb');
    const model = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    model.scene.updateMatrixWorld(true);
    const key = (x: number, z: number) => `${x.toFixed(3)},${z.toFixed(3)}`;
    const meshes = new Map<number, Mesh>();
    model.scene.traverse((object) => {
      if (object instanceof Mesh && object.name.startsWith('Published_store_footprint'))
        meshes.set(object.userData.source_id, object);
    });
    for (const room of building.rooms) {
      const mesh = meshes.get(Number(room.id.replace('store-', '')))!;
      expect(mesh, room.name).toBeDefined();
      const position = mesh.geometry.getAttribute('position');
      const actual = new Set<string>();
      for (let i = 0; i < position.count; i++) {
        const point = new Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        actual.add(key(point.x, point.z));
      }
      expect(actual, room.name).toEqual(new Set(room.footprint!.map(([x, z]) => key(x, z))));
    }
  });
  it('preserves published store polygons under the disclosed coordinate transform', () => {
    expect(building.rooms.length).toBe(27);
    for (const room of building.rooms) {
      const feature = source.features.find((f: { id: number }) => `store-${f.id}` === room.id);
      const clean = feature.coordinates.filter(
        (p: number[], i: number, all: number[][]) =>
          i === 0 || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1],
      );
      expect(room.footprint).toEqual(
        clean.map(([x, z]: number[]) => [(x - 500) * 0.2, (z - 530) * 0.2]),
      );
    }
    expect(
      building.rooms.some((room) =>
        ['store-4978', 'store-9713', 'store-4992', 'store-7837'].includes(room.id),
      ),
    ).toBe(false);
  });

  it('keeps every modeled route outside all store interiors', () => {
    const nodes = new Map(building.nodes.map((node) => [node.id, node]));
    const obstacles = source.features
      .filter((f: { name: string; id: number }) => f.name && f.name !== 'Exit' && f.id !== 7837)
      .map((f: { coordinates: [number, number][] }) =>
        f.coordinates.map(([x, z]) => [(x - 500) * 0.2, (z - 530) * 0.2] as [number, number]),
      );
    for (const edge of building.edges) {
      const a = nodes.get(edge.from)!.position,
        b = nodes.get(edge.to)!.position;
      const steps = Math.max(2, Math.ceil(edge.distance / 0.08));
      for (let i = 1; i < steps; i++) {
        const x = a[0] + ((b[0] - a[0]) * i) / steps,
          z = a[2] + ((b[2] - a[2]) * i) / steps;
        for (const room of building.rooms)
          expect(pointInPolygon(x, z, room.footprint!), `${edge.id} crosses ${room.name}`).toBe(
            false,
          );
        expect(
          obstacles.some((polygon: [number, number][]) => pointInPolygon(x, z, polygon)),
          `${edge.id} crosses a source unit or escalator`,
        ).toBe(false);
      }
    }
    for (const room of building.rooms)
      expect(route(building, 'entrance', room.node), room.name).not.toBeNull();
  });

  it('selects irregular shops using their footprint rather than the bounding rectangle', () => {
    const room: Room = {
      ...building.rooms[0],
      position: [0, 0.18, 0],
      size: [10, 10],
      footprint: [
        [-5, -5],
        [5, -5],
        [5, 0],
        [0, 0],
        [0, 5],
        [-5, 5],
      ],
    };
    expect(containsRoom(room, -3, 3)).toBe(true);
    expect(containsRoom(room, 3, 3)).toBe(false);
    expect(containsRoom({ ...room, footprint: undefined }, 3, 3)).toBe(true);
  });

  it('rejects malformed polygon data before the viewer uses it', () => {
    const bad = structuredClone(building);
    bad.rooms[0].footprint = [
      [0, 0],
      [1, 1],
      [Number.NaN, 2],
    ];
    expect(() => validateBuilding(bad)).toThrow('Invalid room directory');
  });
});
