import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
test('selected showcase assets are exact copies of tracked runtime images', () => {
  const selections = JSON.parse(readFileSync('showcase/selection.json', 'utf8'));
  assert.equal(selections.length, 15);
  const faces = new Map<string, string[]>();
  for (const item of selections) {
    assert.deepEqual(readFileSync(`showcase/site/assets/${item.outfit}-${item.id}.png`), readFileSync(item.path));
    faces.set(item.outfit, [...(faces.get(item.outfit) ?? []), item.id]);
  }
  assert.equal(faces.size, 3);
  for (const ids of faces.values()) assert.deepEqual(ids, ['01', '03', '05', '09', '11']);
});
