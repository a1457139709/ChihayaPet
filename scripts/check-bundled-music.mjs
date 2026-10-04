import { _electron as electron } from 'playwright-core';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { bgmCatalog } from './bundled-bgm.mjs';
import { waitForSprite } from './ready-sprite.mjs';

const executablePath = process.argv[2];
if (!executablePath) throw new Error('Pass the packaged ChihayaPet executable path.');
const data = mkdtempSync(path.join(os.tmpdir(), 'chihaya-bundled-bgm-'));
const domain = `local.ChihayaPet.QA.${path.basename(data).replace(/[^a-zA-Z\d]/g, '')}`;
const names = bgmCatalog.tracks.map(track => track.fileName).sort();
let app;
try {
  if (process.platform === 'darwin') {
    execFileSync('/usr/bin/defaults', ['write', domain, 'music.autoplayEnabled', '-bool', 'false']);
    execFileSync('/usr/bin/defaults', ['write', domain, 'music.volume', '-float', '0']);
  } else writeFileSync(path.join(data, 'preferences.json'), JSON.stringify({ 'music.autoplayEnabled': false, 'music.volume': 0 }));
  const launch = async () => {
    app = await electron.launch({ executablePath: path.resolve(executablePath), args: [], env: { ...process.env, CHIHAYA_QA: '1', CHIHAYA_QA_DATA: data }, timeout: 60_000 });
    const pet = await app.firstWindow(); await waitForSprite(pet); return pet;
  };
  let pet = await launch();
  assert.deepEqual(await pet.evaluate(() => window.chihaya.snapshot().then(s => s.music.tracks.map(track => track.fileName).sort())), names);
  await pet.evaluate(() => window.chihaya.act({ type: 'music-toggle' }));
  await pet.waitForFunction(() => window.chihaya.snapshot().then(s => s.music.playing), undefined, { timeout: 15_000 });
  assert.equal(await pet.evaluate(() => window.chihaya.snapshot().then(s => s.music.error)), undefined);
  await app.close(); app = undefined;
  mkdirSync(path.join(data, 'Music/已移除'));
  renameSync(path.join(data, 'Music', names[0]), path.join(data, 'Music/已移除', names[0]));
  pet = await launch();
  assert.deepEqual(await pet.evaluate(() => window.chihaya.snapshot().then(s => s.music.tracks.map(track => track.fileName).sort())), names.slice(1));
  console.log('Packaged BGM verified: fresh startup imports 43 tracks, real playback succeeds muted, restart preserves removal.');
} finally {
  if (app) await app.close();
  rmSync(data, { recursive: true, force: true });
  if (process.platform === 'darwin') {
    try { execFileSync('/usr/bin/defaults', ['delete', domain], { stdio: 'ignore' }); } catch {}
  }
}
