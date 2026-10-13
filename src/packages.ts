import { unzipSync, strFromU8 } from 'fflate';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { Building, Manifest, StoredPackage } from './types';
const MAX_SIZE = 50 * 1024 * 1024;
const hex = (data: Uint8Array) => Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('');

export function validateBuilding(value: unknown): asserts value is Building {
  const b = value as Building;
  if (
    !b ||
    b.schemaVersion !== 1 ||
    typeof b.id !== 'string' ||
    typeof b.name !== 'string' ||
    b.name.length > 150 ||
    !Array.isArray(b.floors) ||
    !b.floors.length ||
    b.floors.length > 20 ||
    !Array.isArray(b.nodes) ||
    b.nodes.length > 20000 ||
    !Array.isArray(b.edges) ||
    b.edges.length > 40000 ||
    !Array.isArray(b.rooms) ||
    b.rooms.length > 2000 ||
    b.model !== 'building.glb' ||
    !b.instructions ||
    typeof b.instructions.assistance !== 'string' ||
    typeof b.instructions.emergency !== 'string'
  )
    throw new Error('Unsupported building package.');
  const floors = new Set(b.floors.map((f) => f.id));
  if (
    b.provenance &&
    (typeof b.provenance.layoutStatus !== 'string' ||
      typeof b.provenance.layoutNote !== 'string' ||
      !Array.isArray(b.provenance.sources) ||
      !b.provenance.sources.every((source) => typeof source === 'string'))
  )
    throw new Error('Invalid building provenance.');
  const ids = new Set<string>();
  const checkpoints = new Set<string>();
  for (const floor of b.floors)
    if (
      !Number.isInteger(floor.id) ||
      !Number.isFinite(floor.height) ||
      typeof floor.name !== 'string'
    )
      throw new Error('Invalid floor data.');
  for (const node of b.nodes) {
    if (
      typeof node.id !== 'string' ||
      ids.has(node.id) ||
      !floors.has(node.floor) ||
      !Array.isArray(node.position) ||
      node.position.length !== 3 ||
      !node.position.every(Number.isFinite) ||
      typeof node.label !== 'string'
    )
      throw new Error('Invalid navigation nodes.');
    ids.add(node.id);
    if (node.checkpoint) {
      if (checkpoints.has(node.checkpoint)) throw new Error('Duplicate checkpoint.');
      checkpoints.add(node.checkpoint);
    }
  }
  const edgeIds = new Set<string>();
  for (const edge of b.edges) {
    if (
      !ids.has(edge.from) ||
      !ids.has(edge.to) ||
      typeof edge.id !== 'string' ||
      edgeIds.has(edge.id) ||
      !Number.isFinite(edge.distance) ||
      edge.distance <= 0 ||
      !['corridor', 'door', 'stairs', 'elevator', 'outside'].includes(edge.kind) ||
      typeof edge.accessible !== 'boolean' ||
      typeof edge.evacuation !== 'boolean'
    )
      throw new Error('Invalid route connections.');
    edgeIds.add(edge.id);
  }
  for (const room of b.rooms)
    if (
      !ids.has(room.node) ||
      !floors.has(room.floor) ||
      typeof room.id !== 'string' ||
      typeof room.name !== 'string' ||
      typeof room.description !== 'string' ||
      !Array.isArray(room.aliases) ||
      !room.aliases.every((s) => typeof s === 'string') ||
      !Array.isArray(room.position) ||
      room.position.length !== 3 ||
      !room.position.every(Number.isFinite) ||
      !Array.isArray(room.size) ||
      room.size.length !== 2 ||
      !room.size.every((s) => Number.isFinite(s) && s > 0) ||
      (room.footprint !== undefined &&
        (!Array.isArray(room.footprint) ||
          room.footprint.length < 3 ||
          room.footprint.length > 200 ||
          !room.footprint.every(
            (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
          )))
    )
      throw new Error('Invalid room directory.');
}

export function verifyPackage(
  bytes: Uint8Array,
  publicKeyHex: string,
  expectedId: string | readonly string[],
): StoredPackage {
  if (bytes.byteLength > MAX_SIZE) throw new Error('Building package exceeds the 50 MB limit.');
  // Inspect declared uncompressed sizes before decompression to reject ZIP bombs.
  let total = 0;
  let count = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      count++;
      total += file.originalSize;
      if (
        count > 12 ||
        total > MAX_SIZE ||
        file.name.includes('..') ||
        file.name.startsWith('/') ||
        file.name.includes('\\')
      )
        throw new Error('Unsafe building archive.');
      return true;
    },
  });
  if (!files['manifest.json'] || !files['manifest.sig'])
    throw new Error('Package signature is missing.');
  const key = Uint8Array.from(publicKeyHex.match(/.{2}/g) ?? [], (h) => parseInt(h, 16));
  if (!ed25519.verify(files['manifest.sig'], files['manifest.json'], key))
    throw new Error('Package signature does not match this installation’s trusted publisher.');
  const manifest = JSON.parse(strFromU8(files['manifest.json'])) as Manifest;
  if (
    manifest.schemaVersion !== 1 ||
    !(typeof expectedId === 'string'
      ? manifest.buildingId === expectedId
      : expectedId.includes(manifest.buildingId)) ||
    manifest.aiModel !== 'minilm-l6-v2-int8-v1' ||
    !manifest.files ||
    Object.keys(manifest.files).length > 10
  )
    throw new Error('This package is incompatible with the app.');
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (
      !files[name] ||
      files[name].byteLength !== entry.size ||
      hex(sha256(files[name])) !== entry.sha256
    )
      throw new Error(`Package integrity check failed: ${name}`);
  }
  if (
    Object.keys(files).some(
      (name) => !['manifest.json', 'manifest.sig'].includes(name) && !manifest.files[name],
    )
  )
    throw new Error('Archive contains unsigned files.');
  if (!files['building.json'] || !files['building.glb'] || !files['embeddings.json'])
    throw new Error('Package is missing required files.');
  const view = new DataView(
    files['building.glb'].buffer,
    files['building.glb'].byteOffset,
    files['building.glb'].byteLength,
  );
  if (
    view.byteLength < 20 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== view.byteLength
  )
    throw new Error('Invalid 3D model.');
  const gltf = JSON.parse(
    new TextDecoder().decode(files['building.glb'].subarray(20, 20 + view.getUint32(12, true))),
  );
  if (
    (gltf.buffers ?? []).some((b: { uri?: string }) => b.uri) ||
    (gltf.images ?? []).some((i: { uri?: string }) => i.uri) ||
    (gltf.extensionsRequired ?? []).length
  )
    throw new Error('Models must be self-contained and use core glTF 2.0.');
  const building = JSON.parse(strFromU8(files['building.json']));
  validateBuilding(building);
  if (building.id !== manifest.buildingId || building.version !== manifest.version)
    throw new Error('Building metadata does not match the signed manifest.');
  const embeddings = JSON.parse(strFromU8(files['embeddings.json']));
  if (
    embeddings.model !== manifest.aiModel ||
    embeddings.dimensions !== 384 ||
    building.rooms.some(
      (r) =>
        !Array.isArray(embeddings.vectors?.[r.id]) ||
        embeddings.vectors[r.id].length !== 384 ||
        !embeddings.vectors[r.id].every(Number.isFinite),
    )
  )
    throw new Error('Invalid destination embeddings.');
  return { building, manifest, files, installedAt: new Date().toISOString() };
}

async function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('waypoint-local', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('packages', { keyPath: 'building.id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function savePackage(value: StoredPackage) {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('packages', 'readwrite');
      transaction.objectStore('packages').put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Package could not be saved.'));
    });
  } finally {
    database.close();
  }
}
export async function loadPackage(id: string): Promise<StoredPackage | undefined> {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction('packages').objectStore('packages').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}
export async function removePackage(id: string) {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('packages', 'readwrite');
      tx.objectStore('packages').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}
