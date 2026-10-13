import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const model = JSON.parse(await readFile('chat-model.json', 'utf8'));
const executable = process.env.WAYPOINT_LLAMA_SERVER || 'llama-server';
const port = process.env.WAYPOINT_CHAT_PORT || '8082';
// Loopback only: this server is for browser development on the same computer.
const child = spawn(
  executable,
  [
    '-m',
    resolve('.local/chat', model.file),
    '--host',
    '127.0.0.1',
    '--port',
    port,
    '-c',
    String(model.context),
    '-np',
    '1',
    '--jinja',
    '--chat-template-kwargs',
    '{"enable_thinking":false}',
    '-ngl',
    '99',
  ],
  { stdio: 'inherit', windowsHide: true },
);
child.on('error', (error) => {
  console.error(
    'Install llama.cpp or set WAYPOINT_LLAMA_SERVER to its llama-server executable.',
    error.message,
  );
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
