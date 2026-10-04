import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { MusicLibrary, AudioDecoder, MusicController } from '../app/main/music.ts';
import { JSONPreferences } from '../app/main/storage.ts';

test('existing WAV/AIFF/AIF/MP3/M4A/AAC copies play without reimport or index rewrite', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-audio-'));
  const ffmpeg = path.resolve('node_modules/ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const music = path.join(root, 'Music'); mkdirSync(music);
  const tracks = ['wav', 'aiff', 'aif', 'mp3', 'm4a', 'aac'].map((ext, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, title: ext, fileName: `00000000-0000-4000-8000-00000000000${i}.${ext}` }));
  try {
    for (const t of tracks) execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', path.join(music, t.fileName)]);
    const original = JSON.stringify(tracks); writeFileSync(path.join(music, 'library.json'), original);
    const library = new MusicLibrary(music), decoder = new AudioDecoder(ffmpeg, path.join(root, 'Cache'));
    assert.deepEqual(library.list(), tracks);
    for (const t of library.list()) {
      const wave = await decoder.prepare(library.file(t));
      assert.equal(readFileSync(wave).subarray(0, 4).toString(), 'RIFF');
    }
    assert.equal(readFileSync(path.join(music, 'library.json'), 'utf8'), original);
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
    const importing = controller.importFiles([path.join(music, tracks[0]!.fileName)]);
    assert.equal(controller.snapshot().operation, 'import');
    await controller.select(tracks[1]!.id); await controller.play();
    assert.equal(controller.snapshot().selected, tracks[1]!.id);
    assert.equal(controller.snapshot().wantsPlayback, true);
    controller.pause(); assert.equal(controller.snapshot().wantsPlayback, false);
    await importing; await controller.play(); controller.suspend('sleep');
    assert.deepEqual(controller.snapshot().suspensionReasons, ['sleep']);
    assert.equal(controller.snapshot().wantsPlayback, true);
    assert.equal(controller.snapshot().operation, undefined);
  } finally { controller?.shutdown(); rmSync(root, { recursive: true, force: true }); }
});
