import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const model = JSON.parse(await readFile('chat-model.json', 'utf8'));
const destination = '.local/chat/' + model.file;
await mkdir('.local/chat', { recursive: true });
// Never let two setup processes append to the same resumed download.
const lockPath = destination + '.lock';
let lock;
try {
  lock = await open(lockPath, 'wx');
} catch {
  throw new Error(
    'Another chat setup owns the download. If it has stopped, remove the .lock file in .local/chat and retry.',
  );
}
await lock.writeFile(String(process.pid));
try {
  async function checksum(file) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
  }
  if (
    (await stat(destination)
      .then(() => checksum(destination))
      .catch(() => '')) !== model.sha256
  ) {
    console.log(
      `Downloading ${model.file} (~${model.approximateSizeMB} MB). This is a build-time download only.`,
    );
    for (let attempt = 1; attempt <= 12; attempt++) {
      const offset = await stat(destination + '.pending')
        .then((value) => value.size)
        .catch(() => 0);
      const controller = new AbortController();
      let stalled = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(
          `https://huggingface.co/${model.repo}/resolve/${model.revision}/${model.file}`,
          {
            signal: controller.signal,
            headers: offset ? { Range: `bytes=${offset}-` } : {},
          },
        );
        if (response.status === 416 && (await checksum(destination + '.pending')) === model.sha256)
          break;
        if (!response.ok || !response.body)
          throw new Error(`Model download failed: ${response.status}`);
        if (
          response.status === 206 &&
          !response.headers.get('content-range')?.startsWith(`bytes ${offset}-`)
        )
          throw new Error('Unexpected download range.');
        console.log(
          `${response.status === 206 ? 'Resuming' : 'Starting'} download at ${response.status === 206 ? Math.round(offset / 1e6) : 0} MB (attempt ${attempt}).`,
        );
        const progress = new Transform({
          transform(chunk, _encoding, done) {
            clearTimeout(stalled);
            stalled = setTimeout(() => controller.abort(), 30_000);
            done(null, chunk);
          },
        });
        await pipeline(
          Readable.fromWeb(response.body),
          progress,
          createWriteStream(destination + '.pending', {
            flags: response.status === 206 ? 'a' : 'w',
          }),
        );
        break;
      } catch (error) {
        if (attempt === 12) throw error;
        console.log(`Connection interrupted; retaining partial download. ${error.message}`);
      } finally {
        clearTimeout(stalled);
      }
    }
    if ((await checksum(destination + '.pending')) !== model.sha256) {
      await unlink(destination + '.pending');
      throw new Error(
        'Chat model checksum mismatch; invalid partial download removed. Run setup:chat again.',
      );
    }
    await rename(destination + '.pending', destination);
  }
  console.log(
    `Verified ${model.repo}: ${destination}. Run npm run build to include it in the installed app.`,
  );
} finally {
  await lock.close();
  await unlink(lockPath);
}
