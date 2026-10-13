import { isNative, nativeRequest } from './bridge';
import {
  constrainIntent,
  intentMessages,
  intentSchema,
  parseIntent,
  type ChatRequest,
} from './chat-intent';

export async function interpretChat(request: ChatRequest, signal: AbortSignal) {
  if (isNative()) return parseIntent(await nativeRequest<string>('chat', request, 65_000));
  // A remotely opened preview must never silently use someone else's computer for inference.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
    throw new Error('Local chat is available in the installed app.');
  const response = await fetch('/chat-local/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      messages: intentMessages(request),
      max_tokens: 160,
      temperature: 0.2,
      seed: 42,
      chat_template_kwargs: { enable_thinking: false },
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'navigation_intent', strict: true, schema: intentSchema },
      },
    }),
  });
  if (!response.ok) throw new Error('Local chat runtime is unavailable.');
  const result = await response.json();
  return constrainIntent(parseIntent(result.choices?.[0]?.message?.content ?? ''), request);
}

export function stopChat() {
  if (isNative()) void nativeRequest('chatCancel', {}, 5000).catch(() => {});
}
