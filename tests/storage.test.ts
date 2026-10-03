import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConfigStore, normalizeService } from '../app/main/storage.ts';

test('Mac config is read in place; saving another service preserves all keys across restart', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-config-'));
  try {
    const file = path.join(root, 'config.json');
    const original = '{"baseURL":"https://one.example/v1","model":"original","apiKeys":{"https://one.example/v1":"first","https://two.example:443/api":"second"}}';
    writeFileSync(file, original);
    const store = new ConfigStore(file);
    assert.equal(store.load().model, 'original');
    assert.equal(readFileSync(file, 'utf8'), original);
    store.saveService(' HTTPS://TWO.example:443/api/// ', ' newer ', ' replacement ');
    const restarted = new ConfigStore(file);
    assert.deepEqual(restarted.load(), { baseURL: 'https://two.example:443/api', model: 'newer', apiKeys: { 'https://one.example/v1': 'first', 'https://two.example:443/api': ' replacement ' } });
    assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('corrupt config cannot be replaced by save or delete; unsafe service addresses are rejected', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-corrupt-'));
  try {
    const file = path.join(root, 'config.json');
    writeFileSync(file, '{broken');
    const store = new ConfigStore(file);
    assert.throws(() => store.saveService('https://safe.example', 'model', 'key'), /未覆盖/);
    assert.throws(() => store.deleteKey('https://safe.example'), /未覆盖/);
    assert.equal(readFileSync(file, 'utf8'), '{broken');
    for (const invalid of ['http://example.com', 'https://user@example.com', 'https://@host', 'https://host/?', 'https://host/#', 'https://host\\evil', 'https://']) assert.throws(() => normalizeService(invalid));
    assert.equal(normalizeService(' HTTPS://Example.com/api/v2/// '), 'https://example.com/api/v2');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
