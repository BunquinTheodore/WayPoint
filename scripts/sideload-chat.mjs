// Metro cannot bundle an asset larger than about 500 MB, so the chat interpreter is pushed to
// the phone's app-specific folder with adb instead of being embedded in the APK. The app looks
// there first and falls back to a bundled copy only for models small enough to bundle.
import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const model = JSON.parse(await readFile('chat-model.json', 'utf8'));
const source = join('.local', 'chat', model.file);
const size = (await stat(source).catch(() => null))?.size;
if (!size) {
  console.error(`Missing ${source}. Run npm run setup:chat first.`);
  process.exit(1);
}
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const adb = sdk
  ? join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
  : 'adb';
const target = '/sdcard/Android/data/com.waypoint.offline/files/chat.gguf';
const device = process.argv[2] ? ['-s', process.argv[2]] : [];
console.log(`Pushing ${model.file} (${(size / 1e6).toFixed(0)} MB) to ${target} ...`);
const result = spawnSync(adb, [...device, 'push', source, target], { stdio: 'inherit' });
if (result.status !== 0) {
  console.error(
    'adb push failed. Install the app first (the folder exists only after first launch), ' +
      'enable USB debugging, and pass the device serial as an argument if several are connected.',
  );
  process.exit(result.status ?? 1);
}
console.log('Done. Restart Waypoint; the chat interpreter now loads from that file.');
