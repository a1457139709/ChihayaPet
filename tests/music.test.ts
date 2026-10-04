import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { MusicLibrary, AudioDecoder, MusicController } from '../app/main/music.ts';
import { JSONPreferences } from '../app/main/storage.ts';

test('legacy audio migrates to named files and all six formats play without reimport', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-audio-'));
  const ffmpeg = path.resolve('node_modules/ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const music = path.join(root, 'Music'); mkdirSync(music);
  const tracks = ['wav', 'aiff', 'aif', 'mp3', 'm4a', 'aac'].map((ext, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, title: ext, fileName: `00000000-0000-4000-8000-00000000000${i}.${ext}` }));
  try {
    for (const t of tracks) execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', path.join(music, t.fileName)]);
    const original = JSON.stringify(tracks); writeFileSync(path.join(music, 'library.json'), original);
    const library = new MusicLibrary(music), decoder = new AudioDecoder(ffmpeg, path.join(root, 'Cache'));
    assert.equal(library.list().length, tracks.length);
    assert.ok(library.list().every(t => t.fileName === `${t.title}.${t.title}`));
    for (const t of library.list()) {
      const wave = await decoder.prepare(library.file(t));
      assert.equal(readFileSync(wave).subarray(0, 4).toString(), 'RIFF');
    }
    assert.equal(existsSync(path.join(music, 'library.json')), false);
    const prefs = new JSONPreferences(path.join(root, 'preferences.json'));
    prefs.save({ 'music.autoplayEnabled': false });
    const controller = new MusicController(library, decoder, prefs);
    await controller.ready; await controller.play();
    const playingRevision = controller.snapshot().revision;
    await controller.resume('hidden');
    assert.equal(controller.snapshot().revision, playingRevision, 'Opening an already-visible panel must not restart music.');
    controller.suspend('hidden'); controller.pause(); await controller.resume('hidden');
    assert.equal(controller.snapshot().wantsPlayback, false);
    controller.shutdown(); decoder.shutdown();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('single-track previous and next explicitly rewind with playback intent preserved, on cold and warm caches', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-rewind-'));
  const ffmpeg = path.resolve('node_modules/ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const id = '00000000-0000-4000-8000-000000000000';
  const music = path.join(root, 'Music'); mkdirSync(music);
  let controller: MusicController | undefined;
  try {
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', path.join(music, id + '.wav')]);
    writeFileSync(path.join(music, 'library.json'), JSON.stringify([{ id, title: 'one', fileName: id + '.wav' }]));
    const prefs = new JSONPreferences(path.join(root, 'preferences.json')); prefs.save({ 'music.autoplayEnabled': false });
    controller = new MusicController(new MusicLibrary(music), new AudioDecoder(ffmpeg, path.join(root, 'Cache')), prefs);
    await controller.ready;
    await controller.next(-1);
    assert.equal(controller.snapshot().playbackID, 1);
    assert.equal(controller.snapshot().wantsPlayback, false);
    await controller.play(); const source = controller.snapshot().source;
    await controller.next();
    assert.equal(controller.snapshot().playbackID, 2);
    assert.equal(controller.snapshot().source, source);
    assert.equal(controller.snapshot().wantsPlayback, true);
    controller.pause(); await controller.next(-1);
    assert.equal(controller.snapshot().playbackID, 3);
    assert.equal(controller.snapshot().wantsPlayback, false);
  } finally { controller?.shutdown(); rmSync(root, { recursive: true, force: true }); }
});

test('existing tracks remain selectable and playable while importing; automatic pause reports its reason', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-import-controls-'));
  const ffmpeg = path.resolve('node_modules/ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const music = path.join(root, 'Music'); mkdirSync(music);
  const tracks = [0, 1].map(i => ({ id: `00000000-0000-4000-8000-00000000000${i}`, title: String(i), fileName: `00000000-0000-4000-8000-00000000000${i}.wav` }));
  let controller: MusicController | undefined;
  try {
    for (const track of tracks) execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', path.join(music, track.fileName)]);
    writeFileSync(path.join(music, 'library.json'), JSON.stringify(tracks));
    const prefs = new JSONPreferences(path.join(root, 'preferences.json')); prefs.save({ 'music.autoplayEnabled': false });
    controller = new MusicController(new MusicLibrary(music), new AudioDecoder(ffmpeg, path.join(root, 'Cache')), prefs);
    await controller.ready;
    const importing = controller.importFiles([path.join(music, '0.wav')]);
    assert.equal(controller.snapshot().operation, 'import');
    await controller.select('1.wav'); await controller.play();
    assert.equal(controller.snapshot().selected, '1.wav');
    assert.equal(controller.snapshot().wantsPlayback, true);
    controller.pause(); assert.equal(controller.snapshot().wantsPlayback, false);
    await importing; await controller.play(); controller.suspend('sleep');
    assert.deepEqual(controller.snapshot().suspensionReasons, ['sleep']);
    assert.equal(controller.snapshot().wantsPlayback, true);
    assert.equal(controller.snapshot().operation, undefined);
  } finally { controller?.shutdown(); rmSync(root, { recursive: true, force: true }); }
});


test('directory libraries preserve names, avoid collisions, and removal survives restart without deleting audio', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-directory-'));
  try {
    const music = path.join(root, 'Music'); mkdirSync(music);
    const source = path.join(root, '自由な翼.wav'); writeFileSync(source, 'audio');
    const library = new MusicLibrary(music);
    const decoder = { validate: async () => {} } as unknown as AudioDecoder;
    await library.importFiles([source, source], decoder);
    assert.deepEqual(library.list().map(t => t.fileName), ['自由な翼 (2).wav', '自由な翼.wav']);
    assert.equal(existsSync(path.join(music, 'library.json')), false);
    library.remove('自由な翼.wav');
    assert.equal(readFileSync(path.join(music, '已移除/自由な翼.wav'), 'utf8'), 'audio');
    assert.equal(new MusicLibrary(music).list().length, 1);
    writeFileSync(path.join(music, '直接添加.mp3'), 'other');
    symlinkSync(source, path.join(music, 'link.wav'));
    assert.deepEqual(library.list().map(t => t.title), ['直接添加', '自由な翼 (2)']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('migration resumes after preference failure, preserving selection and duplicate titles', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-migration-'));
  try {
    const tracks = [0, 1].map(i => ({id: `old-${i}`, title: '同名', fileName: `old-${i}.wav`}));
    tracks.forEach(t => writeFileSync(path.join(root, t.fileName), t.id));
    writeFileSync(path.join(root, 'library.json'), JSON.stringify(tracks));
    const values: Record<string, string> = { 'music.selected': 'old-1' };
    assert.throws(() => new MusicLibrary(root, { load: () => values, save: () => { throw new Error('disk full'); } }).list(), /disk full/);
    assert.ok(existsSync(path.join(root, 'library.json')));
    const library = new MusicLibrary(root, { load: () => values, save: changes => Object.assign(values, changes) });
    assert.equal(values['music.selected'], '同名 (2).wav');
    assert.equal(library.list().length, 2);
    assert.equal(readFileSync(path.join(root, '同名 (2).wav'), 'utf8'), 'old-1');
    assert.equal(existsSync(path.join(root, 'library.json')), false);
    assert.deepEqual(new MusicLibrary(root).list(), library.list());
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('invalid or missing legacy audio leaves the old index and files intact', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-invalid-music-'));
  try {
    const original = JSON.stringify([{id:'old',title:'song',fileName:'missing.wav'}]);
    writeFileSync(path.join(root, 'library.json'), original);
    assert.throws(() => new MusicLibrary(root).list(), /音频缺失/);
    assert.equal(readFileSync(path.join(root, 'library.json'), 'utf8'), original);
    assert.deepEqual(readdirSync(root), ['library.json']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('migration keeps previously removed UUID copies outside the scanned library', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-orphan-'));
  try {
    const orphan = '00000000-0000-4000-8000-000000000000.wav';
    writeFileSync(path.join(root, orphan), 'removed audio');
    writeFileSync(path.join(root, 'library.json'), '[]');
    assert.deepEqual(new MusicLibrary(root).list(), []);
    assert.equal(readFileSync(path.join(root, '已移除', orphan), 'utf8'), 'removed audio');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
