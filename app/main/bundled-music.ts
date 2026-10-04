import { existsSync, mkdirSync, readFileSync, readdirSync, copyFileSync, constants, lstatSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { atomicJSON } from './storage';

// A completion marker, not a library index: MusicLibrary still scans filenames.
export function installBundledMusic(bundle: string, music: string): void {
  const marker = path.join(music, '.bundled-bgm-installed.json');
  if (existsSync(music) && lstatSync(music).isSymbolicLink()) throw new Error('音乐目录不能是符号链接。');
  if (existsSync(marker)) return;
  const catalog = JSON.parse(readFileSync(path.join(bundle, 'catalog.json'), 'utf8')) as { sourceTree: string; tracks: { fileName: string }[] };
  for (const track of catalog.tracks) {
    if (!track.fileName || path.basename(track.fileName) !== track.fileName || /[\\/]/.test(track.fileName) || !track.fileName.endsWith('.wav')) throw new Error('随包音乐清单包含无效文件名。');
  }
  mkdirSync(music, { recursive: true });
  const removed = path.join(music, '已移除');
  const occupied = new Set([...readdirSync(music), ...(existsSync(removed) ? readdirSync(removed) : [])].map(name => name.toLowerCase()));
  for (const track of catalog.tracks) {
    // A killed copy may leave this private staging file, never a partial WAV.
    const temporary = path.join(music, `.bundled-bgm-${track.fileName}.tmp`);
    rmSync(temporary, { force: true });
    if (occupied.has(track.fileName.toLowerCase())) continue;
    try {
      copyFileSync(path.join(bundle, track.fileName), temporary, constants.COPYFILE_EXCL);
      // Startup holds the application single-instance lock. Recheck after the
      // long copy in case the user imported or removed a track in the meantime.
      const current = [...readdirSync(music), ...(existsSync(removed) ? readdirSync(removed) : [])];
      if (!current.some(name => name.toLowerCase() === track.fileName.toLowerCase())) {
        renameSync(temporary, path.join(music, track.fileName));
      }
    } finally { rmSync(temporary, { force: true }); }
  }
  atomicJSON(marker, { sourceTree: catalog.sourceTree });
}
