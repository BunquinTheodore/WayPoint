import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { demos } from '../src/demos';
import { verifyPackage } from '../src/packages';
import { route, evacuationRoute, parseCheckpoint } from '../src/routing';

const key = JSON.parse(readFileSync('public/trust/package-key.json', 'utf8')).key;
for (const demo of demos) {
  describe(demo.name, () => {
    const archive = new Uint8Array(readFileSync(`public/demos/${demo.id}/package.zip`));
    const pkg = verifyPackage(archive, key, demo.id);
    const building = pkg.building;
    it('ships a signed independent package with honest layout provenance', () => {
      expect(building.name).toBe(demo.name);
      expect(building.floors).toHaveLength(demo.floors);
      expect(building.provenance?.layoutStatus).toBe(demo.layoutStatus);
      expect(building.instructions.emergency).toContain('DEMONSTRATION ONLY');
      expect(() => verifyPackage(archive, key, 'another-building')).toThrow('incompatible');
    });
    it('connects the entrance to every destination with a step-free option', () => {
      for (const room of building.rooms) {
        expect(route(building, 'entrance', room.node), room.name).not.toBeNull();
        const accessible = route(building, 'entrance', room.node, { accessible: true });
        expect(accessible, room.name).not.toBeNull();
        expect(accessible!.edges.every((edge) => edge.accessible && edge.kind !== 'stairs')).toBe(
          true,
        );
      }
    }, 15000);
    it('uses stairs for upper-floor evacuation and refuses an invented step-free exit', () => {
      const upper = building.nodes.find(
        (node) => node.floor === demo.floors - 1 && node.checkpoint,
      )!;
      const result = evacuationRoute(building, upper.id, false, new Set());
      if (demo.id === 'estancia-main-gf' || demo.id === 'robinsons-manila') {
        expect(result).toBeNull();
        expect(building.nodes.some((node) => node.assembly)).toBe(false);
        expect(building.edges.every((edge) => !edge.evacuation)).toBe(true);
        return;
      }
      expect(result).not.toBeNull();
      expect(result!.edges.filter((edge) => edge.kind === 'stairs')).toHaveLength(demo.floors - 1);
      expect(result!.edges.every((edge) => edge.evacuation && edge.kind !== 'elevator')).toBe(true);
      expect(evacuationRoute(building, upper.id, true, new Set())).toBeNull();
    });
    it('keeps checkpoint identity tied to its own building', () => {
      const checkpoint = building.nodes.find((node) => node.checkpoint)!;
      const parsed = parseCheckpoint(
        JSON.stringify({ v: 1, building: demo.id, checkpoint: checkpoint.checkpoint }),
      );
      expect(parsed.building).toBe(building.id);
      expect(building.nodes.find((node) => node.checkpoint === parsed.checkpoint)).toBe(checkpoint);
    });
    it('loads the actual GLB with all floors and the full tower height', async () => {
      const bytes = pkg.files['building.glb'];
      const model = await new GLTFLoader().parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        '',
      );
      const floors: number[] = [];
      model.scene.traverse((object) => {
        if (object.userData.floor_id !== undefined) floors.push(object.userData.floor_id);
      });
      expect(floors.sort((a, b) => a - b)).toEqual(building.floors.map((floor) => floor.id));
      const size = new Box3().setFromObject(model.scene).getSize(new Vector3());
      expect(size.y).toBeGreaterThan(building.floors.at(-1)!.height);
      if (demo.kind === 'tower') expect(size.y).toBeGreaterThan(72);
      else expect(size.x).toBeGreaterThan(80);
    });
  });
}
