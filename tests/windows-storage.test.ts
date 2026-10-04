import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { ConfigStore, JSONPreferences, PromptStore } from '../app/main/storage.ts';

// Enforce Windows FlushFileBuffers' writable-handle requirement on every host.
// All actual writes, renames and reads still use the real filesystem.
for (const kind of ['preferences', 'config', 'prompt'] as const) {
  test(`Windows ${kind}: first save, replacement and relocation persist`, context => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chihaya-win-save-'));
    const open = fs.openSync, sync = fs.fsyncSync;
    const writable = new Map<number, boolean>();
    let flushes = 0;
    context.mock.method(fs, 'openSync', (...args: Parameters<typeof fs.openSync>) => {
      const fd = open(...args), flags = args[1];
      writable.set(fd, typeof flags === 'number'
        ? !!(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR))
        : /[wa+]/.test(flags));
      return fd;
    });
    context.mock.method(fs, 'fsyncSync', (fd: number) => {
      flushes++;
      if (!writable.get(fd)) throw Object.assign(new Error('EPERM: operation not permitted, fsync'), { code: 'EPERM', syscall: 'fsync' });
      sync(fd);
    });
    syncBuiltinESMExports();
    const save = (directory: string, value: number) => {
      if (kind === 'preferences') new JSONPreferences(path.join(directory, 'preferences.json')).save({ volume: value });
      else if (kind === 'config') new ConfigStore(path.join(directory, 'config.json')).saveService('https://example.com', String(value), 'synthetic');
      else new PromptStore(path.join(directory, 'persona.md')).save(String(value));
    };
    const load = (directory: string) => kind === 'preferences'
      ? new JSONPreferences(path.join(directory, 'preferences.json')).load().volume
      : kind === 'config' ? Number(new ConfigStore(path.join(directory, 'config.json')).load().model)
      : Number(new PromptStore(path.join(directory, 'persona.md')).load());
    try {
      const first = path.join(root, 'first'), moved = path.join(root, 'moved');
      save(first, 1); assert.equal(load(first), 1);
      save(first, 2); assert.equal(load(first), 2);
      fs.renameSync(first, moved);
      assert.equal(load(moved), 2);
      save(moved, 3); assert.equal(load(moved), 3);
      assert.equal(flushes, 3);
      assert.equal(fs.readdirSync(moved).some(name => name.endsWith('.tmp')), false);
    } finally {
      context.mock.restoreAll(); syncBuiltinESMExports();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test('failed flush preserves saved preferences and removes the temporary file', context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chihaya-flush-failure-'));
  const file = path.join(root, 'preferences.json');
  try {
    new JSONPreferences(file).save({ volume: 1 });
    const before = fs.readFileSync(file, 'utf8');
    context.mock.method(fs, 'fsyncSync', () => { throw Object.assign(new Error('disk error'), { code: 'EIO' }); });
    syncBuiltinESMExports();
    assert.throws(() => new JSONPreferences(file).save({ volume: 2 }), /disk error/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.deepEqual(fs.readdirSync(root), ['preferences.json']);
  } finally {
    context.mock.restoreAll(); syncBuiltinESMExports();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('corrupt preferences are not replaced on save', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chihaya-corrupt-prefs-'));
  const file = path.join(root, 'preferences.json');
  try {
    fs.writeFileSync(file, '{broken');
    assert.throws(() => new JSONPreferences(file).save({ volume: 2 }), /未覆盖/);
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
    assert.deepEqual(fs.readdirSync(root), ['preferences.json']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
