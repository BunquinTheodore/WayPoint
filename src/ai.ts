import type { Room } from './types';
import { tokenize, meanPool } from './tokenizer';
import { isNative, nativeRequest } from './bridge';
import { expandNeed, rankDestinations } from './needs';
let session: import('onnxruntime-web').InferenceSession | undefined;
let vocabulary: string[] | undefined;
let initialize: Promise<void> | undefined;
async function initializeWeb() {
  const ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = new URL('./runtime/', document.baseURI).href;
  vocabulary = (await (await fetch('./ai/vocab.txt')).text()).split('\n');
  session = await ort.InferenceSession.create('./ai/model.onnx', { executionProviders: ['wasm'] });
}
function ensureInitialized() {
  if (!initialize) {
    initialize = initializeWeb();
    // A failed load (offline runtime, interrupted fetch) must not poison every later search.
    initialize.catch(() => {
      initialize = undefined;
    });
  }
  return initialize;
}
/** Load the browser model while the visitor is idle so the first search answers immediately. */
export function warmUp() {
  if (isNative() || initialize) return;
  const start = () => void ensureInitialized().catch(() => {});
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 4000 });
  else setTimeout(start, 1500);
}
export async function embed(text: string): Promise<number[]> {
  if (isNative()) return nativeRequest<number[]>('embed', { text: text.slice(0, 500) });
  await ensureInitialized();
  const ort = await import('onnxruntime-web/wasm');
  const tokens = tokenize(text, vocabulary!);
  const feeds: Record<string, import('onnxruntime-web').Tensor> = {};
  for (const key of session!.inputNames)
    feeds[key] = new ort.Tensor(
      'int64',
      tokens[key as keyof Pick<typeof tokens, 'input_ids' | 'attention_mask' | 'token_type_ids'>],
      [1, tokens.length],
    );
  const output = await session!.run(feeds);
  return meanPool(output[session!.outputNames[0]].data as Float32Array, tokens.attention_mask);
}
export async function semanticSearch(
  query: string,
  rooms: Room[],
  vectors: Record<string, number[]>,
  limit = 3,
) {
  // A product or need is expanded with the kinds of places that serve it before embedding.
  const need = expandNeed(query);
  const embedding = await embed(need.text);
  return rankDestinations(embedding, rooms, vectors, need).slice(0, limit);
}
