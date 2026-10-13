import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Mesh, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Building } from '../src/types';
import { demos } from '../src/demos';

for (const { id } of demos) {
  describe(`${id} cutaway interior`, () => {
    it('uses varied, self-contained furnishings without obstructing horizontal routes', async () => {
      const bytes = readFileSync(`public/demos/${id}/building.glb`);
      const model = await new GLTFLoader().parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        '',
      );
      model.scene.updateMatrixWorld(true);
      const obstacles: Mesh[] = [];
      let caps = 0,
        treads = 0,
        props = 0;
      const assetTypes = new Set<string>();
      model.scene.traverse((object) => {
        if (object.userData.asset_name) {
          props++;
          assetTypes.add(object.userData.asset_name);
          expect(object.userData.asset_license).toBe('CC0-1.0');
        }
        if (!(object instanceof Mesh)) return;
        if (object.name.startsWith('Partition_top_edge')) caps++;
        if (object.name.startsWith('Escalator_tread')) treads++;
        let parent = object.parent;
        let reused = Boolean(object.userData.asset_name);
        while (parent) {
          reused ||= Boolean(parent.userData.asset_name);
          parent = parent.parent;
        }
        if (reused) {
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            expect('map' in material ? material.map : null).toBeNull();
        }
        if (
          /^(Cutaway_dividing_wall|Illustrative_storefront|Storefront_post|Illustrative_column|Illustrative_display_plinth|Cafe_seat)/.test(
            object.name,
          ) ||
          reused
        )
          obstacles.push(object);
      });
      if (id === 'sm-marikina' || id === 'estancia-main-gf') {
        expect(caps).toBeGreaterThan(30);
        expect(treads).toBeGreaterThanOrEqual(72);
      }
      expect(props).toBeGreaterThan(40);
      expect(assetTypes.size).toBeGreaterThan(12);
      const building: Building = JSON.parse(
        readFileSync(`public/demos/${id}/building.json`, 'utf8'),
      );
      const nodes = new Map(building.nodes.map((node) => [node.id, node]));
      for (const edge of building.edges) {
        const from = nodes.get(edge.from)!,
          to = nodes.get(edge.to)!;
        if (from.floor !== to.floor) continue;
        const a = new Vector3(...from.position),
          b = new Vector3(...to.position);
        const delta = b.clone().sub(a),
          length = delta.length();
        if (length < 0.005) continue;
        const ray = new Raycaster(a, delta.normalize(), 0.002, length - 0.002);
        const hits = ray.intersectObjects(obstacles, false);
        expect(
          hits,
          `Interior blocks ${edge.id}: ${hits.map((hit) => hit.object.name).join(', ')}`,
        ).toHaveLength(0);
      }
    });
  });
}
