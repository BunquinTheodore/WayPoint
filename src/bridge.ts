let counter = 0;
const waiting = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
window.addEventListener('native-response', ((event: CustomEvent) => {
  const { id, value, error } = event.detail;
  const pending = waiting.get(id);
  if (!pending) return;
  clearTimeout(pending.timer);
  waiting.delete(id);
  if (error) pending.reject(new Error(error));
  else pending.resolve(value);
}) as EventListener);
export const isNative = () => !!window.ReactNativeWebView;
export function nativeRequest<T = unknown>(
  type: string,
  payload: unknown = {},
  timeout = 90000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!window.ReactNativeWebView) {
      reject(new Error('This feature needs the installed mobile app.'));
      return;
    }
    const id = ++counter;
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error('The request timed out. Please try again.'));
    }, timeout);
    waiting.set(id, { resolve: (value) => resolve(value as T), reject, timer });
    window.ReactNativeWebView.postMessage(JSON.stringify({ id, type, payload }));
  });
}
export const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
export function toBase64(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 32768)
    text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}
