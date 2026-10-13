import { build } from 'esbuild';
import { writeFile, mkdir, copyFile, readdir, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { catalog } from './demo-buildings.mjs';
await mkdir('mobile/assets', { recursive: true });
const chatModel = JSON.parse(await readFile('chat-model.json', 'utf8'));
const chatPath = '.local/chat/' + chatModel.file;
// Metro reads every required asset into a JavaScript string while bundling, which fails above
// roughly 500 MB. Larger interpreters are sideloaded with `npm run chat:sideload` instead.
const metroAssetLimit = 480 * 1024 * 1024;
let chatAvailable = false;
let chatBundled = false;
try {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(chatPath)) {
    hash.update(chunk);
    size += chunk.length;
  }
  if (hash.digest('hex') !== chatModel.sha256) throw new Error('Chat model checksum mismatch.');
  chatAvailable = true;
  chatBundled = size <= metroAssetLimit;
  if (chatBundled) await copyFile(chatPath, 'mobile/assets/chat.gguf');
  else await rm('mobile/assets/chat.gguf', { force: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.warn(
    'Chat interpreter not available. Run npm run setup:chat before building the full chat demo.',
  );
}
await writeFile(
  'mobile/assets/chat-model.ts',
  `${chatBundled ? '/* eslint-disable @typescript-eslint/no-require-imports -- Metro requires static bundled asset references. */\n' : ''}export const chatModelAsset: number | null = ${chatBundled ? "require('./chat.gguf')" : 'null'};\nexport const chatModelFile = ${JSON.stringify(chatAvailable ? chatModel.file : null)};\n`,
);
if (chatBundled)
  console.log(`Chat interpreter bundled: ${chatModel.file} (~${chatModel.approximateSizeMB} MB).`);
else if (chatAvailable)
  console.log(
    `Chat interpreter ${chatModel.file} (~${chatModel.approximateSizeMB} MB) is too large for Metro to bundle. After installing the app on a phone, run npm run chat:sideload to push it.`,
  );
const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  write: false,
  outdir: '.local/viewer-build',
  format: 'iife',
  target: 'es2022',
  minify: true,
  define: { 'import.meta.env.PROD': 'false' },
  logLevel: 'warning',
});
const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = result.outputFiles.find((f) => f.path.endsWith('.css')).text;
await writeFile(
  'mobile/assets/viewer.html',
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><style>${css}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`,
);
const modelInfo = JSON.parse(await readFile('public/ai/model-info.json', 'utf8'));
for (const name of ['model.onnx', 'vocab.txt']) {
  const bytes = await readFile('public/ai/' + name);
  if (createHash('sha256').update(bytes).digest('hex') !== modelInfo.files[name].sha256)
    throw new Error(
      'Offline AI asset is incomplete: ' + name + '. Run npm run model before building.',
    );
  await copyFile('public/ai/' + name, 'mobile/assets/' + name);
}
await copyFile('public/trust/server-cert.pem', 'mobile/assets/server-cert.pem');
for (const demo of catalog)
  await copyFile(`public/demos/${demo.id}/package.zip`, `mobile/assets/demo-${demo.id}.zip`);
for (const name of await readdir('mobile/assets'))
  if (
    name.startsWith('demo-') &&
    name.endsWith('.zip') &&
    !catalog.some((demo) => name === `demo-${demo.id}.zip`)
  )
    await rm(`mobile/assets/${name}`);
await writeFile(
  'mobile/assets/demo-packages.ts',
  `/* eslint-disable @typescript-eslint/no-require-imports -- Metro requires static bundled asset references. */\nexport const demoPackages: Record<string, number> = {\n${catalog.map((demo) => `${JSON.stringify(demo.id)}: require('./demo-${demo.id}.zip'),`).join('\n')}\n};\n`,
);
const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a?.family === 'IPv4' && !a.internal)
  .map((a) => a.address);
const server = process.env.WAYPOINT_SERVER ?? `https://${addresses[0] ?? '127.0.0.1'}:8443`;
await writeFile(
  'mobile/assets/building-profile.json',
  JSON.stringify(
    {
      buildingId: 'demo-001',
      buildingIds: ['demo-001', ...catalog.map((demo) => demo.id)],
      ssid: process.env.WAYPOINT_SSID ?? 'Building-Maps',
      password: process.env.WAYPOINT_WIFI_PASSWORD ?? 'waypoint-demo',
      server,
    },
    null,
    2,
  ),
);
// Gradle tracks JS/TS inputs but can otherwise reuse a bundle after HTML/AI assets change.
const assetHash = createHash('sha256');
assetHash.update(chatAvailable ? chatModel.sha256 : 'search-only');
for (const name of [
  'viewer.html',
  'model.onnx',
  'vocab.txt',
  'server-cert.pem',
  'building-profile.json',
  ...catalog.map((demo) => `demo-${demo.id}.zip`),
])
  assetHash.update(await readFile('mobile/assets/' + name));
await writeFile(
  'mobile/assets/version.ts',
  `export const viewerRevision=${JSON.stringify(assetHash.digest('hex').slice(0, 16))};\n`,
);
// Ship only signed runtime archives, not duplicate raw/exported models or retired demos.
await rm('dist/demos', { recursive: true, force: true });
await rm('dist/demo', { recursive: true, force: true });
await mkdir('dist/demo', { recursive: true });
await copyFile('public/demo/package.zip', 'dist/demo/package.zip');
for (const demo of catalog) {
  await mkdir(`dist/demos/${demo.id}`, { recursive: true });
  await copyFile(`public/demos/${demo.id}/package.zip`, `dist/demos/${demo.id}/package.zip`);
}
// Precache the small app shell only. Models, lazy chunks and AI are cached on first use.
const html = await readFile('dist/index.html', 'utf8');
const files = [
  './index.html',
  ...Array.from(html.matchAll(/(?:src|href)="(\.\/assets\/[^" ]+)"/g), (match) => match[1]),
];
const cacheName = 'waypoint-' + Date.now();
await writeFile(
  'dist/sw.js',
  `const CACHE=${JSON.stringify(cacheName)};const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('waypoint-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
const response=caches.open(CACHE).then(async cache=>{const hit=await cache.match(e.request,{ignoreVary:true});if(hit)return hit;
try {const result=await fetch(e.request);if(result.ok){try{await cache.put(e.request,result.clone());}catch{/* Cache quota must not block loading. */}}return result;
}catch(error){if(e.request.mode==='navigate'){const shell=await cache.match('./index.html');if(shell)return shell;}throw error;}});
e.respondWith(response);});`,
);
console.log(
  `Mobile viewer built. Package server profile: ${server}. Configure the final router IP before a device build.`,
);
