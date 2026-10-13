import QRCode from 'qrcode';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { buildingDirectories } from './demo-buildings.mjs';
await mkdir('checkpoints', { recursive: true });
const cards = [];
for (const directory of buildingDirectories) {
  const building = JSON.parse(await readFile(`${directory}/building.json`, 'utf8'));
  await mkdir(`checkpoints/${building.id}`, { recursive: true });
  for (const node of building.nodes.filter((n) => n.checkpoint)) {
    const payload = { v: 1, building: building.id, checkpoint: node.checkpoint };
    if (node.id === 'entrance')
      payload.wifi = {
        ssid: process.env.WAYPOINT_SSID ?? 'Building-Maps',
        password: process.env.WAYPOINT_WIFI_PASSWORD ?? 'waypoint-demo',
      };
    const svg = await QRCode.toString(JSON.stringify(payload), {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    await writeFile(`checkpoints/${building.id}/${node.checkpoint}.svg`, svg);
    cards.push(
      `<article>${svg}<h2>${building.name}</h2><h3>${node.label}</h3><p>DEMO ONLY · Open Waypoint and scan this checkpoint.</p><small>${node.checkpoint}</small></article>`,
    );
  }
}
await writeFile(
  'checkpoints/print.html',
  `<!doctype html><html><head><meta charset="utf-8"><title>Waypoint checkpoints</title><style>body{font:16px system-ui;display:grid;grid-template-columns:1fr 1fr;gap:24px}article{border:1px solid #ccc;padding:20px;text-align:center;break-inside:avoid}svg{width:240px;height:240px}small{color:#666}</style></head><body>${cards.join('')}</body></html>`,
);
console.log(
  `${cards.length} checkpoint QR cards created. The printed entrance credential is a public visitor credential.`,
);
