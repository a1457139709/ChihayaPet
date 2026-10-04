import { mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

export const bgmCatalog = JSON.parse(readFileSync(new URL('./bgm-catalog.json', import.meta.url), 'utf8'));

function verifyTrack(bytes, track) {
  assert.equal(bytes.length, track.bytes, `BGM size mismatch: ${track.fileName}`);
  const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(hash, track.gitBlob, `BGM hash mismatch: ${track.fileName}`);
}

export function verifyBundledBGM(directory) {
  assert.deepEqual(JSON.parse(readFileSync(path.join(directory, 'catalog.json'), 'utf8')), bgmCatalog);
  assert.deepEqual(readdirSync(directory).sort(), ['catalog.json', ...bgmCatalog.tracks.map(track => track.fileName)].sort());
  for (const track of bgmCatalog.tracks) verifyTrack(readFileSync(path.join(directory, track.fileName)), track);
}

export function stageBundledBGM(root, directory) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  for (const track of bgmCatalog.tracks) {
    let bytes;
    try {
      bytes = execFileSync('git', ['cat-file', 'blob', track.gitBlob], { cwd: root, maxBuffer: track.bytes + 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { throw new Error('缺少清单指定的 BGM Git 对象。请先执行 git fetch origin bgm，再重新打包；不会使用本机 Music/。'); }
    verifyTrack(bytes, track);
    writeFileSync(path.join(directory, track.fileName), bytes);
  }
  writeFileSync(path.join(directory, 'catalog.json'), JSON.stringify(bgmCatalog, null, 2) + '\n');
}
