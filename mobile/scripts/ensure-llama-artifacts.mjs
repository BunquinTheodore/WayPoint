// llama.rn fetches its prebuilt native libraries in its own postinstall. Inside Git Bash on
// Windows, GNU tar is first on PATH and treats "C:\..." as a remote host, so that extraction
// fails and the Android app silently ships without the chat interpreter. This re-runs the
// download with the Windows tar first on PATH and reports clearly when the libraries are missing.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const llama = fileURLToPath(new URL('../node_modules/llama.rn/', import.meta.url));
const marker = join(llama, 'android', 'src', 'main', 'jniLibs', '.llama-rn.sha256');
if (existsSync(marker) || process.env.RNLLAMA_SKIP_POSTINSTALL === '1') process.exit(0);

const env = { ...process.env };
if (process.platform === 'win32') {
  const key = Object.keys(env).find((name) => name.toLowerCase() === 'path') ?? 'PATH';
  env[key] = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32') + delimiter + env[key];
}
const result = spawnSync(
  process.execPath,
  [join(llama, 'install', 'download-native-artifacts.js')],
  { stdio: 'inherit', env },
);
if (result.status !== 0 || !existsSync(marker))
  console.warn(
    'llama.rn native libraries are missing, so the installed app will fall back to limited search. ' +
      'Re-run from PowerShell or cmd: node node_modules/llama.rn/install/download-native-artifacts.js',
  );
