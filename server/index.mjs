import https from 'node:https';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { catalog } from '../scripts/demo-buildings.mjs';
const packages = new Map();
for (const id of ['demo-001', ...catalog.map((demo) => demo.id)]) {
  const manifest = JSON.parse(await readFile(`server/packages/${id}.manifest.json`, 'utf8'));
  const archive = await readFile(`server/packages/${id}-${manifest.version}.zip`);
  packages.set(id, { manifest, archive });
}
const limits = new Map();
function handler(req, res) {
  const address = req.socket.remoteAddress;
  const now = Date.now();
  const current = limits.get(address) ?? { start: now, count: 0 };
  if (now - current.start > 60000) {
    current.start = now;
    current.count = 0;
  }
  current.count++;
  limits.set(address, current);
  if (limits.size > 2000)
    for (const [key, v] of limits) if (now - v.start > 60000) limits.delete(key);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (current.count > 60) {
    res.writeHead(429, { 'Retry-After': '60' });
    res.end('Too many requests');
    return;
  }
  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end();
    return;
  }
  const path = new URL(req.url, 'https://localhost').pathname;
  const id = path.split('/')[2];
  const pkg = packages.get(id);
  if (pkg && path === `/buildings/${id}/manifest`) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(pkg.manifest));
  } else if (pkg && path === `/buildings/${id}/packages/${pkg.manifest.version}.zip`) {
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': pkg.archive.length });
    res.end(pkg.archive);
  } else {
    res.writeHead(404);
    res.end('Unknown building or package');
  }
}
https
  .createServer(
    {
      key: await readFile('.local/server-key.pem'),
      cert: await readFile('.local/server-cert.pem'),
    },
    handler,
  )
  .listen(8443, '0.0.0.0', () =>
    console.log('HTTPS package server on port 8443. No internet connection required.'),
  );
// Loopback-only development endpoint. Never expose HTTP to visitor Wi-Fi.
http.createServer(handler).listen(8081, '127.0.0.1');
for (const address of Object.values(networkInterfaces()).flat())
  if (address?.family === 'IPv4' && !address.internal)
    console.log(`Building profile address: https://${address.address}:8443`);
