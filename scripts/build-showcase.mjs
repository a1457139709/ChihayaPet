import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = new URL('../showcase/site/', import.meta.url);
const destination = new URL('../dist/showcase/', import.meta.url);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
console.log(`Showcase built: ${fileURLToPath(destination)}`);
