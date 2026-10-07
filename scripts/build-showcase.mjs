import { createHash } from 'node:crypto';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = new URL('../showcase/site/', import.meta.url);
const destination = new URL('../dist/showcase/', import.meta.url);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
// Changed assets get a new URL so a fresh deployment cannot reuse an old script.
const indexFile = new URL('index.html', destination);
let html = await readFile(indexFile, 'utf8');
for (const asset of ['app.js', 'style.css']) {
  const content = await readFile(new URL(asset, destination));
  const version = createHash('sha256').update(content).digest('hex').slice(0, 12);
  html = html.replaceAll(`"${asset}"`, `"${asset}?v=${version}"`);
}
await writeFile(indexFile, html);
console.log(`Showcase built: ${fileURLToPath(destination)}`);
