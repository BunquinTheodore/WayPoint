import { BufferGeometry, Material, Matrix4, Mesh, Object3D, Texture } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Batch static furnishing/wall meshes without combining independently selectable floors. */
export function batchModel(root: Object3D) {
  root.updateMatrixWorld(true);
  const batches = new Map<
    string,
    { parent: Object3D; meshes: Mesh[]; detail: boolean; shell: boolean; roof: boolean }
  >();
  const originals = new Set<BufferGeometry>();
  root.traverse((object) => {
    if (
      !(object instanceof Mesh) ||
      'isSkinnedMesh' in object ||
      'isInstancedMesh' in object ||
      Array.isArray(object.material) ||
      object.children.length ||
      Object.keys(object.geometry.morphAttributes).length ||
      object.geometry.drawRange.start !== 0 ||
      Number.isFinite(object.geometry.drawRange.count) ||
      /floor.slab|atrium.*floor|concept.wing|estimated.floor.outline/i.test(object.name)
    )
      return;
    let parent: Object3D | null = object;
    let floor: Object3D | undefined;
    let detail = false,
      shell = false,
      roof = false;
    while (parent && parent !== root) {
      shell ||= !!parent.userData.shell;
      roof ||= !!(parent.userData.roof || parent.name === 'Roof');
      detail ||= !!(parent.userData.illustrative_detail || parent.userData.asset_name);
      if (parent.userData.floor_id !== undefined) floor = parent;
      parent = parent.parent;
    }
    const batchParent = floor ?? root;
    const geometry: BufferGeometry = object.geometry;
    const attributes = Object.entries(geometry.attributes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([name, attribute]) =>
          `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`,
      )
      .join('|');
    const key = `${batchParent.uuid}:${object.material.uuid}:${detail}:${shell}:${roof}:${!!geometry.index}:${attributes}`;
    const batch = batches.get(key) ?? { parent: batchParent, meshes: [], detail, shell, roof };
    batch.meshes.push(object);
    batches.set(key, batch);
  });
  let removed = 0;
  for (const { parent, meshes, detail, shell, roof } of batches.values()) {
    if (meshes.length < 2) continue;
    const inverse = parent.matrixWorld.clone().invert();
    const geometries = meshes.map((mesh) => {
      const transform = new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
      const geometry: BufferGeometry = mesh.geometry.clone().applyMatrix4(transform);
      // Mirrored furniture must retain front-face winding after baking its transform.
      if (transform.determinant() < 0) {
        if (geometry.index) {
          const index = geometry.index;
          for (let i = 0; i < index.count; i += 3) {
            const value = index.getX(i);
            index.setX(i, index.getX(i + 2));
            index.setX(i + 2, value);
          }
        } else {
          for (const attribute of Object.values(geometry.attributes)) {
            const array = attribute.array;
            for (let i = 0; i < attribute.count; i += 3)
              for (let j = 0; j < attribute.itemSize; j++) {
                const a = i * attribute.itemSize + j;
                const b = (i + 2) * attribute.itemSize + j;
                const value = array[a];
                array[a] = array[b];
                array[b] = value;
              }
          }
        }
      }
      return geometry;
    });
    const geometry = mergeGeometries(geometries);
    for (const source of geometries) source.dispose();
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const merged = new Mesh(geometry, meshes[0].material);
    merged.name = `Batched_${detail ? 'details' : 'structure'}`;
    merged.userData.illustrative_detail = detail;
    merged.userData.shell = shell;
    merged.userData.roof = roof;
    parent.add(merged);
    for (const mesh of meshes) {
      originals.add(mesh.geometry);
      mesh.removeFromParent();
    }
    removed += meshes.length - 1;
  }
  const retained = new Set<BufferGeometry>();
  root.traverse((object) => {
    if (object instanceof Mesh) retained.add(object.geometry);
  });
  for (const geometry of originals) if (!retained.has(geometry)) geometry.dispose();
  const emptyGroups: Object3D[] = [];
  root.traverse((object) => {
    if (
      object !== root &&
      (object.type === 'Object3D' || object.type === 'Group') &&
      object.userData.floor_id === undefined
    )
      emptyGroups.push(object);
  });
  for (const group of emptyGroups.reverse()) if (!group.children.length) group.removeFromParent();
  return removed;
}

/** Release each shared GPU resource once when a building is replaced or removed. */
export function releaseModel(root: Object3D) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
