// llama.rn compiles its JNI wrapper under node_modules/llama.rn/android/.cxx. On Windows the
// object-file paths for the release variant (RelWithDebInfo) exceed the 260-character limit when
// the repository lives in a long folder such as OneDrive, and ninja fails with
// "mkdir ... No such file or directory". Point the native build at a short staging directory.
import { readFile, writeFile } from 'node:fs/promises';

const gradle = new URL('../node_modules/llama.rn/android/build.gradle', import.meta.url);
let source = await readFile(gradle, 'utf8');
const anchor = "path = file('src/main/CMakeLists.txt')";
const staging =
  "buildStagingDirectory System.getProperty('os.name').toLowerCase().contains('win') && System.getenv('LOCALAPPDATA') ? new File(System.getenv('LOCALAPPDATA'), 'llama-rn-cxx') : file('.cxx')";
if (!source.includes(anchor)) {
  console.warn('patch-llama: CMake path line not found; llama.rn layout changed, skipping.');
} else if (!source.includes('buildStagingDirectory')) {
  source = source.replace(anchor, `${anchor}\n      ${staging}`);
  await writeFile(gradle, source);
  console.log('patch-llama: native build staging directory shortened for Windows.');
}
