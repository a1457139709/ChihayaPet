import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StandingLibrary } from '../app/main/resources.ts';
const source = path.resolve('ChihayaPet/Resources/Characters/Standing');
test('all approved outfits, framings and numbered expressions decode with their original hashes', () => {
  const library = new StandingLibrary(source);
  let count = 0;
  for (const [key, variant] of Object.entries(library.manifest.variants)) for (const result of variant.results) {
    const frame = library.resolve(key, result.id);
    assert.ok(frame, `${key}/${result.id}`);
    assert.deepEqual(frame.canvas, variant.canvas); count++;
  }
  assert.equal(count, 292);
  assert.equal(library.manifest.outfits.length, 13);
  assert.equal(library.number('a/full', 'automatic', 'smile', '03'), '03');
});
test('a missing or corrupt requested image yields no frame instead of the previous expression', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-sprite-'));
  try {
    copyFileSync(path.join(source, 'manifest.json'), path.join(root, 'manifest.json'));
    mkdirSync(path.join(root, 'sprites/a/full'), { recursive: true });
    copyFileSync(path.join(source, 'sprites/a/full/00.png'), path.join(root, 'sprites/a/full/00.png'));
    const library = new StandingLibrary(root);
    assert.ok(library.resolve('a/full', '00'));
    assert.equal(library.resolve('a/full', '01'), undefined);
    writeFileSync(path.join(root, 'sprites/a/full/00.png'), 'bad');
    assert.equal(library.resolve('a/full', '00'), undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
