import { mkdir, writeFile, readFile, copyFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as ort from 'onnxruntime-node';
import { tokenize, meanPool } from '../src/tokenizer.ts';
import { buildingDirectories } from './demo-buildings.mjs';

await mkdir('public/ai', { recursive: true });
await mkdir('public/runtime', { recursive: true });
const repo = 'Xenova/all-MiniLM-L6-v2';
let info;
try {
  info = JSON.parse(await readFile('public/ai/model-info.json', 'utf8'));
} catch {
  const response = await fetch(`https://huggingface.co/api/models/${repo}`);
  if (!response.ok) throw new Error('Could not resolve the model revision.');
  const metadata = await response.json();
  info = { repo, revision: metadata.sha, license: 'Apache-2.0', files: {} };
}
for (const [remote, local] of [
  ['onnx/model_quantized.onnx', 'model.onnx'],
  ['vocab.txt', 'vocab.txt'],
]) {
  let data;
  try {
    data = await readFile(`public/ai/${local}`);
    if (
      info.files[local] &&
      createHash('sha256').update(data).digest('hex') !== info.files[local].sha256
    )
      throw new Error('Hash mismatch');
  } catch {
    console.log(`Downloading ${local} at ${info.revision}...`);
    const response = await fetch(
      `https://huggingface.co/${repo}/resolve/${info.revision}/${remote}`,
    );
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
    if (
      info.files[local] &&
      createHash('sha256').update(data).digest('hex') !== info.files[local].sha256
    )
      throw new Error(`Downloaded ${local} failed checksum verification.`);
    await writeFile(`public/ai/${local}.pending`, data);
    await rename(`public/ai/${local}.pending`, `public/ai/${local}`);
  }
  info.files[local] = {
    sha256: createHash('sha256').update(data).digest('hex'),
    size: data.length,
  };
}
await writeFile('public/ai/model-info.json', JSON.stringify(info, null, 2));
for (const file of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'])
  await copyFile(`node_modules/onnxruntime-web/dist/${file}`, `public/runtime/${file}`);
const vocabulary = (await readFile('public/ai/vocab.txt', 'utf8')).split('\n');
const session = await ort.InferenceSession.create('public/ai/model.onnx', {
  executionProviders: ['cpu'],
  intraOpNumThreads: 2,
});
for (const directory of buildingDirectories) {
  const building = JSON.parse(await readFile(`${directory}/building.json`, 'utf8'));
  const embeddings = {};
  for (const room of building.rooms) {
    const tokens = tokenize(
      `${room.name}. ${room.description}. ${room.aliases.join('. ')}`,
      vocabulary,
    );
    const feeds = {};
    for (const key of session.inputNames)
      feeds[key] = new ort.Tensor('int64', tokens[key], [1, tokens.length]);
    const output = await session.run(feeds);
    embeddings[room.id] = meanPool(output[session.outputNames[0]].data, tokens.attention_mask);
  }
  await writeFile(
    `${directory}/embeddings.json`,
    JSON.stringify({ model: 'minilm-l6-v2-int8-v1', dimensions: 384, vectors: embeddings }),
  );
  console.log(`Local AI ready: ${building.name}; ${building.rooms.length} destinations.`);
}
