import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { MusicLibrary, AudioDecoder, MusicController } from '../app/main/music.ts';
import { JSONPreferences } from '../app/main/storage.ts';

test('named audio files in all six formats play without an index', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-audio-'));
  const ffmpeg = path.resolve('node_modules/ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const music = path.join(root, 'Music'); mkdirSync(music);
  const tracks = ['wav', 'aiff', 'aif', 'mp3', 'm4a', 'aac'].map((ext, i) => ({ id: `${ext}.${ext}`, title: ext, fileName: `${ext}.${ext}` }));
  try {
    for (const t of tracks) execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', path.join(music, t.fileName)]);
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
  const id = 'one';
  const music = path.join(root, 'Music'); mkdirSync(music);
  let controller: MusicController | undefined;
  try {
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', path.join(music, id + '.wav')]);
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
  const tracks = [0, 1].map(i => ({ id: `${i}.wav`, title: String(i), fileName: `${i}.wav` }));
  let controller: MusicController | undefined;
  try {
    for (const track of tracks) execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', path.join(music, track.fileName)]);
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
