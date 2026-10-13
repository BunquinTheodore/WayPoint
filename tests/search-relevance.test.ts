import { beforeAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import * as ort from 'onnxruntime-node';
import { tokenize, meanPool } from '../src/tokenizer';
import { relevantMatches } from '../src/query-guard';
import { expandNeed, rankDestinations } from '../src/needs';

// The relevance rule is calibrated against the real model and the bundled demo packages:
// a sensible request must surface its destination, and nonsense must surface nothing.
let session: ort.InferenceSession;
let vocabulary: string[];
beforeAll(async () => {
  session = await ort.InferenceSession.create('public/ai/model.onnx', {
    executionProviders: ['cpu'],
    intraOpNumThreads: 2,
  });
  vocabulary = (await readFile('public/ai/vocab.txt', 'utf8')).split('\n');
}, 30000);

async function search(buildingId: string, query: string) {
  const building = JSON.parse(await readFile(`public/demos/${buildingId}/building.json`, 'utf8'));
  const vectors = JSON.parse(
    await readFile(`public/demos/${buildingId}/embeddings.json`, 'utf8'),
  ).vectors;
  const need = expandNeed(query);
  const tokens = tokenize(need.text, vocabulary);
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
  const ranked = rankDestinations(embedding, building.rooms, vectors, need);
  return relevantMatches(ranked).map((match) => match.room.name);
}

it.each([
  ['robinsons-manila', 'i want to watch movie', 'Robinsons Movieworld'],
  ['robinsons-manila', 'where can i buy groceries', 'Robinsons Supermarket'],
  ['robinsons-manila', 'bowling', 'Paeng’s Bowling'],
  ['robinsons-manila', 'where to eat', 'Food Court'],
  ['robinsons-manila', 'where is the restroom', 'Restrooms'],
  ['waypoint-tower', 'i need medical help', 'Clinic'],
  ['waypoint-tower', 'coffee', 'Café'],
  ['estancia-main-gf', 'buy a phone', 'Samsung'],
  // Products map to the kind of store that sells them.
  ['robinsons-manila', 'i want to buy diaper', 'Robinsons Supermarket'],
  ['robinsons-manila', 'i need medicine for headache', 'Southstar Drug'],
  ['robinsons-manila', 'buy shoes', 'Robinsons Department Store'],
  ['robinsons-manila', 'haircut', 'Bruno’s Barbers'],
  ['estancia-main-gf', 'buy sofa', 'Pottery Barn'],
  ['estancia-main-gf', 'i want to buy diaper', 'Dough&Grocer'],
  // Snacks and drinks: food places answer as well as supermarkets (typo included).
  ['robinsons-manila', 'i want to but snacks', 'Food Court'],
  ['robinsons-manila', 'snacks', 'Robinsons Supermarket'],
  ['waypoint-tower', 'i am thirsty', 'Café'],
])('offers %s destination for "%s"', async (buildingId, query, expected) => {
  expect(await search(buildingId, query)).toContain(expected);
});

it.each([
  ['robinsons-manila', 'what my dog name'],
  ['robinsons-manila', 'submarine'],
  ['robinsons-manila', 'bitcoin price'],
  ['waypoint-tower', 'what my dog name'],
  ['estancia-main-gf', 'watch a movie'],
  ['estancia-main-gf', 'tell me a joke'],
  ['waypoint-tower', 'i want to buy diaper'],
])('offers nothing in %s for "%s"', async (buildingId, query) => {
  expect(await search(buildingId, query)).toEqual([]);
});
