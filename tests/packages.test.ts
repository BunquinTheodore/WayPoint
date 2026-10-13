import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { createPrivateKey, sign, createHash } from 'node:crypto';
import { verifyPackage, validateBuilding } from '../src/packages';
const bytes = new Uint8Array(readFileSync('public/demo/package.zip'));
const key = JSON.parse(readFileSync('public/trust/package-key.json', 'utf8')).key;
describe('trusted offline package', () => {
  it('verifies the real Blender model and directory', () => {
    const pkg = verifyPackage(bytes, key, 'demo-001');
    expect(pkg.building.rooms).toHaveLength(18);
    expect(pkg.files['building.glb'].length).toBeGreaterThan(10000);
  });
  it('rejects altered model bytes', () => {
    const files = unzipSync(bytes);
    files['building.glb'][100] ^= 1;
    expect(() => verifyPackage(zipSync(files), key, 'demo-001')).toThrow('integrity');
  });
  it('rejects modified manifest and untrusted publisher', () => {
    const files = unzipSync(bytes);
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    manifest.version = '9.0.0';
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    expect(() => verifyPackage(zipSync(files), key, 'demo-001')).toThrow('signature');
    expect(() => verifyPackage(bytes, '00'.repeat(32), 'demo-001')).toThrow();
  });
  it('rejects unsigned extra files and wrong building IDs', () => {
    const files = unzipSync(bytes);
    files['extra.js'] = strToU8('alert(1)');
    expect(() => verifyPackage(zipSync(files), key, 'demo-001')).toThrow('unsigned');
    expect(() => verifyPackage(bytes, key, 'different')).toThrow('incompatible');
  });
  it('rejects path traversal before opening the model', () => {
    const files = unzipSync(bytes);
    files['../bad'] = strToU8('bad');
    expect(() => verifyPackage(zipSync(files), key, 'demo-001')).toThrow('Unsafe');
  });
  it('rejects decompression bombs from declared sizes', () => {
    const files = unzipSync(bytes);
    files['large'] = new Uint8Array(51 * 1024 * 1024);
    expect(() => verifyPackage(zipSync(files), key, 'demo-001')).toThrow('Unsafe');
  });
  it('validates graph endpoints and room coordinates', () => {
    const pkg = verifyPackage(bytes, key, 'demo-001');
    const invalid = structuredClone(pkg.building);
    invalid.edges[0].to = 'missing';
    expect(() => validateBuilding(invalid)).toThrow('connections');
    const room = structuredClone(pkg.building);
    room.rooms[0].position[0] = NaN;
    expect(() => validateBuilding(room)).toThrow('directory');
  });
  it('rejects a model with external asset references even when signed', () => {
    const files = unzipSync(bytes);
    const glb = files['building.glb'];
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    const jsonSize = view.getUint32(12, true);
    const gltf = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonSize)));
    gltf.buffers[0].uri = 'https://example.invalid/model.bin';
    const text = JSON.stringify(gltf);
    const padded = text + ' '.repeat((4 - (text.length % 4)) % 4);
    const json = strToU8(padded);
    const rest = glb.subarray(20 + jsonSize);
    const changed = new Uint8Array(20 + json.length + rest.length);
    changed.set(glb.subarray(0, 20));
    const header = new DataView(changed.buffer);
    header.setUint32(8, changed.length, true);
    header.setUint32(12, json.length, true);
    changed.set(json, 20);
    changed.set(rest, 20 + json.length);
    files['building.glb'] = changed;
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    manifest.files['building.glb'] = {
      size: changed.length,
      sha256: createHash('sha256').update(changed).digest('hex'),
    };
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    files['manifest.sig'] = new Uint8Array(
      sign(
        null,
        files['manifest.json'],
        createPrivateKey(readFileSync('.local/package-signing-private.pem')),
      ),
    );
    expect(() => verifyPackage(zipSync(files), key, 'demo-001')).toThrow('self-contained');
  });
});
