import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { initLlama, type LlamaContext } from 'llama.rn';
import { chatModelAsset, chatModelFile } from './assets/chat-model';
import {
  constrainIntent,
  intentMessages,
  intentSchema,
  parseIntent,
  validateRequest,
} from '../src/chat-intent';

let context: Promise<LlamaContext> | undefined;
let prepared: Promise<string> | undefined;
let busy = false;
let epoch = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let disposing: Promise<void> = Promise.resolve();
let disposeWhenIdle = false;

/** Where a sideloaded interpreter lives: the app-specific folder adb can write without root. */
const sideloadCandidates = () =>
  Platform.OS === 'android'
    ? [
        'file:///storage/emulated/0/Android/data/com.waypoint.offline/files/chat.gguf',
        'file:///sdcard/Android/data/com.waypoint.offline/files/chat.gguf',
      ]
    : [new File(Paths.document, 'chat.gguf').uri];

/**
 * Resolve the interpreter weights to a readable file without loading them into memory.
 * A sideloaded file is preferred: Metro cannot bundle assets above about 500 MB, so the 1.7B
 * model is pushed with `npm run chat:sideload`. A bundled copy (small models only) is the
 * fallback; on Android expo-asset copies it out of the package first, which is why this runs
 * early rather than on the first chat turn.
 */
export function prepareChatModel(): Promise<string> {
  prepared ??= (async () => {
    for (const uri of sideloadCandidates())
      try {
        if (new File(uri).exists) return uri;
      } catch {
        /* Not readable on this device; try the next location. */
      }
    if (chatModelAsset === null)
      throw new Error(
        chatModelFile
          ? `Chat model ${chatModelFile} is not on this phone. Run npm run chat:sideload.`
          : 'Chat model is not included in this build.',
      );
    const asset = Asset.fromModule(chatModelAsset);
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error('The bundled chat model is unavailable.');
    return asset.localUri;
  })();
  prepared.catch(() => {
    prepared = undefined;
  });
  return prepared;
}

async function loadContext() {
  await disposing;
  if (!context) {
    context = (async () => {
      const settings = {
        model: await prepareChatModel(),
        n_ctx: 2048,
        n_batch: 128,
        n_ubatch: 128,
        n_parallel: 1,
        use_mmap: true,
        use_mlock: false,
        // iPhone 13 has two performance cores; recent Android phones run CPU-only here and
        // benefit from more threads for prompt processing.
        n_threads: Platform.OS === 'android' ? 4 : 2,
        state_cache_budget_mb: 0,
      };
      try {
        return await initLlama({ ...settings, n_gpu_layers: Platform.OS === 'ios' ? 99 : 0 });
      } catch (error) {
        if (Platform.OS !== 'ios') throw error;
        return await initLlama({ ...settings, n_gpu_layers: 0 });
      }
    })();
    context.catch(() => {
      context = undefined;
    });
  }
  return context;
}

export async function cancelChat() {
  epoch++;
  const loaded = await context?.catch(() => undefined);
  await loaded?.stopCompletion().catch(() => {});
}

export async function releaseChat() {
  clearTimeout(idleTimer);
  disposeWhenIdle = true;
  await cancelChat();
  if (busy) return;
  await disposeContext();
}

function disposeContext() {
  const current = context;
  context = undefined;
  disposeWhenIdle = false;
  disposing = current ? current.then((loaded) => loaded.release()).catch(() => {}) : disposing;
  return disposing;
}

export async function interpretNavigation(payload: unknown): Promise<string> {
  const request = validateRequest(payload);
  if (busy) throw new Error('A navigation request is already running.');
  clearTimeout(idleTimer);
  busy = true;
  const requestEpoch = epoch;
  const deadline = setTimeout(() => void cancelChat(), 55_000);
  try {
    const loaded = await loadContext();
    if (requestEpoch !== epoch) throw new Error('Request cancelled.');
    const result = await loaded.completion({
      messages: intentMessages(request),
      jinja: true,
      enable_thinking: false,
      response_format: { type: 'json_schema', json_schema: { strict: true, schema: intentSchema } },
      n_predict: 160,
      temperature: 0.2,
      seed: 42,
      stop: ['<|im_end|>', '<|endoftext|>'],
    });
    if (requestEpoch !== epoch) throw new Error('Request cancelled.');
    return JSON.stringify(constrainIntent(parseIntent(result.text), request));
  } finally {
    clearTimeout(deadline);
    busy = false;
    // A small iPhone must not keep an unused model resident while exploring the 3D map.
    clearTimeout(idleTimer);
    if (disposeWhenIdle) void disposeContext();
    else idleTimer = setTimeout(() => void releaseChat(), 45_000);
  }
}
