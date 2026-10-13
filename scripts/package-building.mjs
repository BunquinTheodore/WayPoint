import { generateKeyPairSync, createHash, sign, createPublicKey } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { buildingDirectories } from './demo-buildings.mjs';

await mkdir('.local', { recursive: true });
await mkdir('public/trust', { recursive: true });
await mkdir('server/packages', { recursive: true });
let privateKey;
try {
  privateKey = await readFile('.local/package-signing-private.pem', 'utf8');
} catch {
  const keys = generateKeyPairSync('ed25519');
  privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  await writeFile('.local/package-signing-private.pem', privateKey, { mode: 0o600 });
}
const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32);
const trust = JSON.stringify({ algorithm: 'Ed25519', key: publicKey.toString('hex') });
await mkdir('src/generated', { recursive: true });
await writeFile('src/generated/package-key.json', trust);
await writeFile('public/trust/package-key.json', trust);
let totalSize = 0;
for (const directory of buildingDirectories) {
  const building = JSON.parse(await readFile(`${directory}/building.json`, 'utf8'));
  const files = {};
  for (const name of ['building.json', 'building.glb', 'embeddings.json'])
    files[name] = new Uint8Array(await readFile(`${directory}/${name}`));
  const manifest = {
    buildingId: building.id,
    version: building.version,
    schemaVersion: 1,
    reviewDate: building.reviewDate,
    aiModel: 'minilm-l6-v2-int8-v1',
    coordinates: 'meters, right-handed, Y-up',
    files: Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [
        name,
        { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length },
      ]),
    ),
  };
  const manifestBytes = strToU8(JSON.stringify(manifest));
  const signature = sign(null, manifestBytes, privateKey);
  files['manifest.json'] = manifestBytes;
  files['manifest.sig'] = new Uint8Array(signature);
  const archive = zipSync(files, { level: 6 });
  await writeFile(`server/packages/${building.id}-${building.version}.zip`, archive);
  await writeFile(`${directory}/package.zip`, archive);
  await writeFile(`server/packages/${building.id}.manifest.json`, manifestBytes);
  if (building.id === 'demo-001') await writeFile('server/packages/manifest.json', manifestBytes);
  totalSize += archive.length;
  console.log(`Signed ${building.name}: ${(archive.length / 1024 / 1024).toFixed(2)} MB.`);
}
const ips = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a?.family === 'IPv4' && !a.internal)
  .map((a) => a.address);
try {
  await readFile('.local/server-cert.pem');
} catch {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      '.local/server-key.pem',
      '-out',
      '.local/server-cert.pem',
      '-days',
      '365',
      '-subj',
      '/CN=Waypoint local package server',
      '-addext',
      `subjectAltName=DNS:localhost,IP:127.0.0.1,${ips.map((ip) => 'IP:' + ip).join(',')}`.replace(
        /,$/,
        '',
      ),
    ],
    { stdio: 'pipe' },
  );
}
await writeFile('public/trust/server-cert.pem', await readFile('.local/server-cert.pem'));
console.log(
  `Signed ${buildingDirectories.length} packages: ${(totalSize / 1024 / 1024).toFixed(2)} MB total. Trusted keys are bundled at app build time.`,
);
