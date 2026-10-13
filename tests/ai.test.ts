import { beforeAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import * as ort from 'onnxruntime-node';
import { tokenize, meanPool } from '../src/tokenizer';

let session: ort.InferenceSession;
let vocabulary: string[];
let rooms: { id: string; name: string }[];
let vectors: Record<string, number[]>;
beforeAll(async () => {
  session = await ort.InferenceSession.create('public/ai/model.onnx', {
    executionProviders: ['cpu'],
    intraOpNumThreads: 2,
  });
  vocabulary = (await readFile('public/ai/vocab.txt', 'utf8')).split('\n');
  rooms = JSON.parse(await readFile('public/demo/building.json', 'utf8')).rooms;
  vectors = JSON.parse(await readFile('public/demo/embeddings.json', 'utf8')).vectors;
}, 30000);
it.each([
  ['I want to borrow books', 'Library'],
  ['Where can I get coffee?', 'Café'],
  ['I need medical help', 'Clinic'],
])('runs local inference for "%s"', async (query, expected) => {
  const tokens = tokenize(query, vocabulary);
  const feeds: Record<string, ort.Tensor> = {};
  for (const key of session.inputNames)
    feeds[key] = new ort.Tensor(
      'int64',
      tokens[key as 'input_ids' | 'attention_mask' | 'token_type_ids'],
      [1, tokens.length],
    );
  const output = await session.run(feeds);
  const embedding = meanPool(
    output[session.outputNames[0]].data as Float32Array,
    tokens.attention_mask,
  );
  const ranked = rooms
    .map((room) => ({
      name: room.name,
      score: vectors[room.id].reduce((sum, value, i) => sum + value * embedding[i], 0),
    }))
    .sort((a, b) => b.score - a.score);
  expect(ranked[0].name).toBe(expected);
});
it.each([
  ['robinsons-manila', 'I need to buy groceries', 'Robinsons Supermarket'],
  ['waypoint-tower', 'Where is the sky lounge?', 'Sky lounge'],
  ['estancia-main-gf', 'Where can I buy home furniture?', 'Pottery Barn'],
])('searches the %s demo using local inference', async (id, query, expected) => {
  const building = JSON.parse(await readFile(`public/demos/${id}/building.json`, 'utf8'));
  const demoVectors = JSON.parse(
    await readFile(`public/demos/${id}/embeddings.json`, 'utf8'),
  ).vectors;
  const tokens = tokenize(query, vocabulary);
  const feeds: Record<string, ort.Tensor> = {};
  for (const name of session.inputNames)
    feeds[name] = new ort.Tensor(
      'int64',
      tokens[name as 'input_ids' | 'attention_mask' | 'token_type_ids'],
      [1, tokens.length],
    );
  const output = await session.run(feeds);
  const embedding = meanPool(
    output[session.outputNames[0]].data as Float32Array,
    tokens.attention_mask,
  );
  const ranked = (building.rooms as { id: string; name: string }[])
    .map((room) => ({
      name: room.name,
      score: (demoVectors[room.id] as number[]).reduce(
        (sum, value, i) => sum + value * embedding[i],
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score);
  expect(ranked[0].name).toBe(expected);
});
