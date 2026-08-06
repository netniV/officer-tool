import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const outputDir = fileURLToPath(new URL('../dist/', import.meta.url));
const clientDir = fileURLToPath(new URL('../dist/client/', import.meta.url));
const serverDir = fileURLToPath(new URL('../dist/server/', import.meta.url));

await mkdir(clientDir, { recursive: true });
await mkdir(serverDir, { recursive: true });

for (const entry of await readdir(outputDir, { withFileTypes: true })) {
  if (entry.name === 'client' || entry.name === 'server' || entry.name === '.openai') continue;
  await cp(join(outputDir, entry.name), join(clientDir, entry.name), { recursive: true });
}

await writeFile(join(serverDir, 'index.js'), `export default {
  async fetch(request, env) {
    if (env?.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response('Static asset binding unavailable.', { status: 503 });
  },
};
`);
