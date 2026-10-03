import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Companion } from '../app/main/companion.ts';
import { ConfigStore, JSONPreferences } from '../app/main/storage.ts';

test('missing saved service routes to the first required field without discarding a settings draft', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-missing-service-'));
  try {
    for (const [baseURL, model, field] of [['', '', 'baseURL'], ['https://example.com/v1', ' ', 'model'], ['https://example.com/v1', 'model', 'key']] as const) {
      writeFileSync(path.join(root, 'config.json'), JSON.stringify({ baseURL, model, apiKeys: {} }));
      const app = new Companion(new ConfigStore(path.join(root, 'config.json')), new JSONPreferences(path.join(root, 'preferences.json')), async () => { throw new Error('Missing configuration must not send a request.'); });
      const requested: unknown[] = [];
      app.onNeedsSettings = () => requested.push(app.missingSettingsField());
      app.beginSettings(); app.setInput('定位缺少的配置'); await app.send();
      assert.deepEqual(requested, [field]);
      app.setDraft('baseURL', 'https://example.com/v1'); app.setDraft('model', 'unsaved-model'); await app.send();
      assert.deepEqual(requested, [field, 'key']);
      app.setDraft('key', 'unsaved-key'); await app.send();
      assert.deepEqual(requested, [field, 'key', undefined], 'Complete draft still gets a routing intent, without a missing-field focus.');
      assert.equal(app.snapshot().draft.model, 'unsaved-model');
      assert.equal(app.snapshot().input, '定位缺少的配置');
      app.setInput('字'.repeat(2001)); await app.send();
      assert.deepEqual(requested, [field, 'key', undefined], 'Invalid chat input does not open settings.');
      app.shutdown();
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('cancelled chat and edited connection test cannot commit a late result or release a newer request', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-chat-'));
  let release!: (value: Response) => void;
  const config = new ConfigStore(path.join(root, 'config.json'));
  config.saveService('https://example.com/v1', 'model', 'key');
  const app = new Companion(config, new JSONPreferences(path.join(root, 'preferences.json')), () => new Promise(r => { release = r; }));
  try {
    app.setInput('第一条'); const old = app.send(); app.cancel();
    const late = release;
    app.setInput('第二条'); const current = app.send();
    const fresh = release;
    late(new Response('{"choices":[{"message":{"content":"迟到"}}]}'));
    await old;
    assert.equal(app.snapshot().busy, 'chat');
    fresh(new Response('{"choices":[{"message":{"content":"新回复"}}]}'));
    await current;
    assert.deepEqual(app.snapshot().turns.map(t => [t.user, t.assistant]), [['第二条', '新回复']]);
    app.beginSettings(); const testRequest = app.testConnection(); const staleTest = release;
    app.setDraft('model', 'changed');
    staleTest(new Response('{"choices":[{"message":{"content":"成功"}}]}')); await testRequest;
    assert.equal(app.snapshot().testStatus, undefined);
    assert.equal(app.snapshot().busy, undefined);
  } finally { app.shutdown(); rmSync(root, { recursive: true, force: true }); }
});

test('settings test the draft without saving; changing services loads only that service key', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-settings-'));
  const config = new ConfigStore(path.join(root, 'config.json'));
  config.saveService('https://one.example/v1', 'original', 'one-key');
  config.saveService('https://two.example:443/api', 'current', 'two-key');
  const app = new Companion(config, new JSONPreferences(path.join(root, 'preferences.json')), async (_url, options) => {
    assert.deepEqual(JSON.parse(String(options?.body)).messages, [{ role: 'user', content: '请回复：连接成功' }]);
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer draft-key');
    return new Response('{"choices":[{"message":{"content":"成功"}}]}');
  });
  try {
    app.beginSettings(); app.setDraft('baseURL', 'https://one.example/v1///'); assert.equal(app.snapshot().draft.key, 'one-key');
    app.setDraft('baseURL', 'https://new.example'); assert.equal(app.snapshot().draft.key, '');
    app.setDraft('model', 'draft'); app.setDraft('key', 'draft-key'); await app.testConnection();
    assert.equal(config.load().baseURL, 'https://two.example:443/api');
    app.saveService(); assert.equal(config.key('https://new.example'), 'draft-key'); assert.equal(config.key('https://one.example/v1'), 'one-key');
    app.setDraft('prompt', '新的角色设定'); app.savePrompt(); assert.equal(new JSONPreferences(path.join(root, 'preferences.json')).load()['persona.prompt'], '新的角色设定');
  } finally { app.shutdown(); rmSync(root, { recursive: true, force: true }); }
});

test('only successful complete turns become context; request and UI histories have independent limits', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-history-'));
  const config = new ConfigStore(path.join(root, 'config.json')); config.saveService('https://example.com/v1', 'model', 'key');
  let messages: { role: string; content: string }[] = [];
  const app = new Companion(config, new JSONPreferences(path.join(root, 'preferences.json')), async (_url, options) => {
    messages = JSON.parse(String(options?.body)).messages;
    return new Response(JSON.stringify({ choices: [{ message: { content: '答'.repeat(1_000) } }] }));
  });
  try {
    for (let i = 0; i < 55; i++) { app.setInput('问'.repeat(1_000)); await app.send(); }
    assert.equal(app.snapshot().turns.length, 50); assert.equal(app.snapshot().didTrim, true);
    assert.equal(messages.length, 14); // system + six whole context turns + current user (12,000 context characters).
    app.clear(); assert.equal(app.snapshot().turns.length, 0); app.setInput('新会话'); await app.send();
    assert.deepEqual(messages.map(m => m.role), ['system', 'user']);
  } finally { app.shutdown(); rmSync(root, { recursive: true, force: true }); }
});
