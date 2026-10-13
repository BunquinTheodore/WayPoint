import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { batchModel, releaseModel } from '../src/model-optimization';
import { demos, defaultBuildingId, supportedBuildingIds } from '../src/demos';

it('defaults to the lightweight Estancia demo and excludes the retired building', () => {
  expect(defaultBuildingId).toBe('estancia-main-gf');
  expect(demos).toHaveLength(3);
  expect(supportedBuildingIds).not.toContain('sm-marikina');
});

it('keeps floor transforms and detail fades independent while batching mirrored furniture', () => {
  const root = new Group();
  const material = new MeshStandardMaterial();
  for (const floorId of [0, 1]) {
    const floor = new Group();
    floor.userData.floor_id = floorId;
    floor.position.set(5, floorId * 4, -7);
    root.add(floor);
    for (const detail of [false, true])
      for (const x of [-2, 2]) {
        const prop = new Group();
        prop.rotation.y = 0.3;
        prop.userData.illustrative_detail = detail;
        const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
        mesh.position.x = x;
        mesh.scale.x = x < 0 ? -1 : 1;
        prop.add(mesh);
        floor.add(prop);
      }
  }
  const before = new Box3().setFromObject(root);
  expect(batchModel(root)).toBe(4);
  const after = new Box3().setFromObject(root);
  expect(after.min.distanceTo(before.min)).toBeLessThan(1e-5);
  expect(after.max.distanceTo(before.max)).toBeLessThan(1e-5);
  for (const floor of root.children) {
    expect(floor.children).toHaveLength(2);
    expect(floor.children.map((mesh) => mesh.userData.illustrative_detail).sort()).toEqual([
      false,
      true,
    ]);
  }
  releaseModel(root);
});

it('batches exterior and roof pieces without losing their independent visibility flags', () => {
  const root = new Group(),
    floor = new Group();
  floor.userData.floor_id = 0;
  root.add(floor);
  const material = new MeshStandardMaterial();
  for (const kind of ['interior', 'shell', 'roof']) {
    const group = new Group();
    group.userData[kind] = true;
    (kind === 'roof' ? root : floor).add(group);
    for (const x of [0, 2, 4]) {
      const mesh = new Mesh(new BoxGeometry(), material);
      mesh.position.set(x, kind === 'roof' ? 5 : 0, 0);
      group.add(mesh);
    }
  }
  const before = new Box3().setFromObject(root);
  expect(batchModel(root)).toBe(6);
  const after = new Box3().setFromObject(root);
  expect(after.min.distanceTo(before.min)).toBeLessThan(1e-5);
  expect(after.max.distanceTo(before.max)).toBeLessThan(1e-5);
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh) meshes.push(o);
  });
  expect(meshes).toHaveLength(3);
  expect(meshes.filter((m) => m.userData.roof)).toHaveLength(1);
  expect(meshes.filter((m) => m.userData.shell)).toHaveLength(1);
  expect(meshes.find((m) => m.userData.roof)!.parent).toBe(root);
  expect(meshes.find((m) => m.userData.shell)!.parent).toBe(floor);
  releaseModel(root);
});

it('releases shared geometry, materials and textures exactly once', () => {
  const geometry = new BoxGeometry();
  const texture = new Texture();
  const material = new MeshStandardMaterial({ map: texture });
  const root = new Group();
  root.add(new Mesh(geometry, material), new Mesh(geometry, material));
  const geometryDispose = vi.spyOn(geometry, 'dispose');
  const materialDispose = vi.spyOn(material, 'dispose');
  const textureDispose = vi.spyOn(texture, 'dispose');
  releaseModel(root);
  expect(geometryDispose).toHaveBeenCalledTimes(1);
  expect(materialDispose).toHaveBeenCalledTimes(1);
  expect(textureDispose).toHaveBeenCalledTimes(1);
});

for (const { id, floors } of demos)
  describe(`${id} batching`, () => {
    it('reduces meshes while preserving the actual model bounds and selectable floor groups', async () => {
      const bytes = readFileSync(`public/demos/${id}/building.glb`);
      const { scene } = await new GLTFLoader().parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        '',
      );
      const bounds = new Box3().setFromObject(scene);
      let before = 0;
      scene.traverse((object) => {
        if (object instanceof Mesh) before++;
      });
      const removed = batchModel(scene);
      const after = new Box3().setFromObject(scene);
      expect(after.min.distanceTo(bounds.min)).toBeLessThan(1e-4);
      expect(after.max.distanceTo(bounds.max)).toBeLessThan(1e-4);
      const floorIds: number[] = [];
      let remaining = 0;
      scene.traverse((object) => {
        if (object instanceof Mesh) remaining++;
        if (object.userData.floor_id !== undefined) floorIds.push(object.userData.floor_id);
      });
      expect(floorIds).toHaveLength(floors);
      expect(remaining).toBe(before - removed);
      expect(remaining).toBeLessThan(before * 0.4);
      console.info(`${id}: ${before} → ${remaining} static meshes`);
      releaseModel(scene);
    });
  });
