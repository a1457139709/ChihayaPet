import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { MusicLibrary } from '../app/main/music.ts';

const repair = path.resolve('scripts/restore_bgm_names.py');

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-bgm-'));
  const wav = path.join(root, 'assets/bgm/wav'), ogg = path.join(root, 'assets/bgm/ogg'), music = path.join(root, 'Music');
  for (const directory of [wav, ogg, music]) mkdirSync(directory, { recursive: true });
  const audio = Buffer.from('same audio, different source and imported filenames');
  const id = '00000000-0000-4000-8000-000000000000';
  const track = { id, title: '02', fileName: id + '.wav' };
  writeFileSync(path.join(wav, '02.wav'), audio);
  writeFileSync(path.join(ogg, '02.ogg'), 'obsolete OGG');
  writeFileSync(path.join(music, track.fileName), audio);
  const other = { id: '00000000-0000-4000-8000-000000000001', title: '02', fileName: '00000000-0000-4000-8000-000000000001.wav' };
  writeFileSync(path.join(music, other.fileName), 'a different personal track also named 02');
  writeFileSync(path.join(music, 'library.json'), JSON.stringify([track, other]));
  const catalog = path.join(root, 'catalog.json');
  writeFileSync(catalog, JSON.stringify({ tracks: [{ fileName: '自由な翼.wav', gitBlob: createHash('sha1').update(`blob ${audio.length}\0`).update(audio).digest('hex') }] }));
  return { root, wav, ogg, music, audio, track, other, catalog };
}

test('BGM repair restores source and imported titles by audio content, preserves UUIDs and personal tracks, and removes OGG', () => {
  const f = fixture();
  try {
    execFileSync('python3', [repair, '--root', f.root, '--catalog', f.catalog]);
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.music, 'library.json'), 'utf8')), [{ ...f.track, title: '自由な翼' }, f.other]);
    assert.deepEqual(readdirSync(f.wav), ['自由な翼.wav']);
    assert.deepEqual(readFileSync(path.join(f.wav, '自由な翼.wav')), f.audio);
    assert.deepEqual(readFileSync(path.join(f.music, f.track.fileName)), f.audio);
    assert.deepEqual(readdirSync(path.join(f.root, 'assets/bgm')), ['wav']);
    const index = readFileSync(path.join(f.music, 'library.json'));
    execFileSync('python3', [repair, '--root', f.root, '--catalog', f.catalog]);
    assert.deepEqual(readFileSync(path.join(f.music, 'library.json')), index, 'A repeated repair must leave the library unchanged.');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('a conflicting canonical file stops the BGM repair before titles, source files or OGG are changed', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.wav, '自由な翼.wav'), 'conflicting audio');
    const index = readFileSync(path.join(f.music, 'library.json'));
    assert.throws(() => execFileSync('python3', [repair, '--root', f.root, '--catalog', f.catalog], { stdio: 'pipe' }), /Conflicting canonical BGM file/);
    assert.deepEqual(readFileSync(path.join(f.music, 'library.json')), index);
    assert.deepEqual(readFileSync(path.join(f.wav, '02.wav')), f.audio);
    assert.deepEqual(readdirSync(f.ogg), ['02.ogg']);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
