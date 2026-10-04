import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, renameSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { installBundledMusic } from '../app/main/bundled-music.ts';
import { MusicLibrary } from '../app/main/music.ts';
import { resolvePaths, initializePaths } from '../app/main/paths.ts';

for (const platform of ['win32', 'darwin'] as const) {
  test(`${platform}: bundled music reaches the active library once and survives relocation`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'chihaya-bgm-'));
    try {
      const bundle = path.join(root, 'BundledBGM'); mkdirSync(bundle);
      const options = { platform, packaged: true, executable: path.join(root, 'app/ChihayaPet.exe'), appPath: root, home: root };
      const paths = resolvePaths(options); initializePaths(paths);
      writeFileSync(path.join(bundle, 'catalog.json'), JSON.stringify({ sourceTree: 'fixture', tracks: [{ fileName: 'A.wav' }, { fileName: 'B.wav' }, { fileName: 'C.wav' }] }));
      for (const file of ['A.wav', 'B.wav', 'C.wav']) writeFileSync(path.join(bundle, file), 'bundled');
      writeFileSync(path.join(paths.music, 'a.wav'), 'personal version');
      mkdirSync(path.join(paths.music, '已移除'));
      writeFileSync(path.join(paths.music, '已移除/C.wav'), 'previously removed');
      installBundledMusic(bundle, paths.music);
      const library = new MusicLibrary(paths.music);
      assert.deepEqual(library.list().map(t => t.fileName), ['B.wav', 'a.wav']);
      assert.equal(readFileSync(path.join(paths.music, 'a.wav'), 'utf8'), 'personal version');
      assert.equal(readFileSync(path.join(paths.music, 'B.wav'), 'utf8'), 'bundled');
      library.remove('B.wav');
      installBundledMusic(bundle, paths.music);
      assert.deepEqual(library.list().map(t => t.fileName), ['a.wav']);
      const moved = path.join(root, 'moved-data'); renameSync(paths.root, moved);
      installBundledMusic(bundle, path.join(moved, 'Music'));
      assert.deepEqual(new MusicLibrary(path.join(moved, 'Music')).list().map(t => t.fileName), ['a.wav']);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('an incomplete bundled import can retry without overwriting existing tracks', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'chihaya-bgm-retry-'));
  try {
    const bundle = path.join(root, 'bundle'), music = path.join(root, 'Music'); mkdirSync(bundle);
    writeFileSync(path.join(bundle, 'catalog.json'), JSON.stringify({ sourceTree: 'fixture', tracks: [{ fileName: 'A.wav' }, { fileName: 'B.wav' }] }));
    writeFileSync(path.join(bundle, 'A.wav'), 'first');
    assert.throws(() => installBundledMusic(bundle, music), /ENOENT/);
    assert.equal(existsSync(path.join(music, '.bundled-bgm-installed.json')), false);
    writeFileSync(path.join(music, 'A.wav'), 'user edit');
    writeFileSync(path.join(bundle, 'B.wav'), 'second');
    installBundledMusic(bundle, music);
    assert.equal(readFileSync(path.join(music, 'A.wav'), 'utf8'), 'user edit');
    assert.equal(new MusicLibrary(music).list().length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
