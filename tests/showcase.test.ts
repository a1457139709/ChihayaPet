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

test('wardrobe renders after conversation navigation and on direct entry', async () => {
  const { runInNewContext } = await import('node:vm');
  const source = readFileSync('showcase/site/app.js', 'utf8');
  for (const initial of ['conversation', 'wardrobe']) {
    const nodes = new Map<string, any>();
    const get = (id: string) => {
      if (!nodes.has(id)) nodes.set(id, { innerHTML: '', addEventListener() {}, insertAdjacentHTML() {}, focus() {} });
      return nodes.get(id);
    };
    const listeners: Record<string, Function> = {};
    const location = { search: `?page=${initial}` };
    runInNewContext(source, {
      URLSearchParams, location,
      document: {
        getElementById: get,
        querySelector: (selector: string) => selector === '.character-image'
          ? (get('app').innerHTML.includes('character-image') ? get('image') : null)
          : get(selector),
        querySelectorAll: () => [],
        addEventListener: (name: string, listener: Function) => { listeners[name] = listener; },
      },
      history: { pushState: (_a: unknown, _b: unknown, href: string) => { location.search = new URL(href).search; } },
      window: { addEventListener() {}, scrollTo() {} },
    });
    if (initial === 'conversation') {
      assert.match(get('app').innerHTML, /conversation-reply/);
      listeners.click!({ button: 0, preventDefault() {}, target: { closest: () => ({ href: 'https://example.test/ChihayaPet/?page=wardrobe' }) } });
    }
    assert.match(get('app').innerHTML, /class="character-image"/);
    assert.match(get('app').innerHTML, /assets\/a_-01\.png/);
    assert.doesNotMatch(get('app').innerHTML, /conversation-reply/);
  }
});
