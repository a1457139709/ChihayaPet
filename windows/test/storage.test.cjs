'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  DEFAULT_PROMPT,
  Storage,
  normalizeService,
} = require('../src/core/storage.cjs');

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chihaya-storage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('normalizeService trims fields and canonicalizes an HTTPS endpoint', () => {
  assert.deepEqual(
    normalizeService({ baseURL: '  HTTPS://EXAMPLE.COM/v1///  ', model: '  model-name  ' }),
    { baseURL: 'https://example.com/v1', model: 'model-name' },
  );
});

test('normalizeService rejects unsafe or incomplete service values', () => {
  for (const draft of [
    { baseURL: 'http://example.com/v1', model: 'model' },
    { baseURL: 'https://user@example.com/v1', model: 'model' },
    { baseURL: 'https://example.com/v1?key=value', model: 'model' },
    { baseURL: 'https://example.com/v1#fragment', model: 'model' },
    { baseURL: 'https://example.com/v1', model: '  ' },
    { baseURL: 42, model: 'model' },
  ]) {
    assert.throws(() => normalizeService(draft), Error, JSON.stringify(draft));
  }
});

test('missing files produce public defaults without creating files', (t) => {
  const root = temporaryRoot(t);
  const storage = new Storage(root);

  assert.deepEqual(storage.getSettings(), {
    baseURL: '',
    model: '',
    prompt: DEFAULT_PROMPT,
    hasKey: false,
  });
  assert.deepEqual(storage.getService(), { baseURL: '', model: '', apiKey: '' });
  assert.deepEqual(storage.getPrefs(), {});
  assert.deepEqual(fs.readdirSync(root), []);
});

test('saveService atomically persists normalized settings and isolates endpoint keys', (t) => {
  const root = temporaryRoot(t);
  const storage = new Storage(root);

  storage.saveService({
    baseURL: 'https://ONE.example/v1/',
    model: ' first ',
    apiKey: ' first-secret ',
  });
  storage.saveService({
    baseURL: 'https://two.example/api',
    model: 'second',
    apiKey: 'second-secret',
  });
  storage.saveService({ baseURL: 'https://one.example/v1', model: 'changed' });

  assert.deepEqual(storage.getService(), {
    baseURL: 'https://one.example/v1',
    model: 'changed',
    apiKey: 'first-secret',
  });
  assert.deepEqual(storage.getSettings(), {
    baseURL: 'https://one.example/v1',
    model: 'changed',
    prompt: DEFAULT_PROMPT,
    hasKey: true,
  });
  assert.deepEqual(new Storage(root).serviceDraft({
    baseURL: 'https://two.example/api/',
    model: 'draft-model',
  }), {
    baseURL: 'https://two.example/api',
    model: 'draft-model',
    apiKey: 'second-secret',
  });

  const disk = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
  assert.deepEqual(disk, {
    apiKeys: {
      'https://one.example/v1': 'first-secret',
      'https://two.example/api': 'second-secret',
    },
    baseURL: 'https://one.example/v1',
    model: 'changed',
  });
  assert.equal(fs.statSync(path.join(root, 'config.json')).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(root), ['config.json']);
});

test('an explicit empty key deletes only that endpoint key', (t) => {
  const root = temporaryRoot(t);
  const storage = new Storage(root);
  storage.saveService({ baseURL: 'https://one.example', model: 'one', apiKey: 'one-key' });
  storage.saveService({ baseURL: 'https://two.example', model: 'two', apiKey: 'two-key' });
  storage.saveService({ baseURL: 'https://one.example', model: 'one-new', apiKey: '   ' });

  assert.deepEqual(storage.getService(), {
    baseURL: 'https://one.example',
    model: 'one-new',
    apiKey: '',
  });
  assert.deepEqual(storage.serviceDraft({ baseURL: 'https://two.example', model: 'draft' }), {
    baseURL: 'https://two.example',
    model: 'draft',
    apiKey: 'two-key',
  });
});

test('persona and preferences persist outside config and snapshots never expose keys', (t) => {
  const root = temporaryRoot(t);
  const storage = new Storage(root);
  storage.saveService({ baseURL: 'https://example.com/v1', model: 'model', apiKey: 'fixture-secret' });
  storage.savePersona('  自定义角色设定  ');
  assert.deepEqual(storage.savePrefs({ height: 320, alwaysOnTop: false }), {
    height: 320,
    alwaysOnTop: false,
  });
  assert.deepEqual(storage.savePrefs({ height: 360, style: 'b' }), {
    height: 360,
    alwaysOnTop: false,
    style: 'b',
  });

  const restarted = new Storage(root);
  assert.deepEqual(restarted.getSettings(), {
    baseURL: 'https://example.com/v1',
    model: 'model',
    prompt: '  自定义角色设定  ',
    hasKey: true,
  });
  assert.deepEqual(restarted.getPrefs(), {
    height: 360,
    alwaysOnTop: false,
    style: 'b',
  });
  assert.equal(JSON.stringify(restarted.getSettings()).includes('fixture-secret'), false);

  const config = fs.readFileSync(path.join(root, 'config.json'), 'utf8');
  const preferences = fs.readFileSync(path.join(root, 'preferences.json'), 'utf8');
  assert.equal(config.includes('自定义角色设定'), false);
  assert.equal(preferences.includes('fixture-secret'), false);
});

test('malformed stores fail construction and remain byte-for-byte untouched', (t) => {
  for (const fileName of ['config.json', 'preferences.json']) {
    const root = path.join(temporaryRoot(t), fileName.replace('.json', ''));
    fs.mkdirSync(root);
    const file = path.join(root, fileName);
    const corrupt = Buffer.from('{ definitely-not-json');
    fs.writeFileSync(file, corrupt);

    assert.throws(() => new Storage(root), /损坏|invalid|格式/i);
    assert.deepEqual(fs.readFileSync(file), corrupt);
    assert.deepEqual(fs.readdirSync(root), [fileName]);
  }
});

test('invalid preference patches and persona values do not touch existing files', (t) => {
  const root = temporaryRoot(t);
  const storage = new Storage(root);
  storage.savePrefs({ height: 300 });
  const before = fs.readFileSync(path.join(root, 'preferences.json'));

  assert.throws(() => storage.savePrefs(null), /偏好|preferences/i);
  assert.throws(() => storage.savePrefs({ __proto__: { polluted: true } }), /偏好|preferences/i);
  assert.throws(() => storage.savePersona(12), /角色|persona/i);
  assert.deepEqual(fs.readFileSync(path.join(root, 'preferences.json')), before);
  assert.equal({}.polluted, undefined);
});
