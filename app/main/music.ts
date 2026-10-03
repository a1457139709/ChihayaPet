import { readFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import type { MusicState, Track } from '../shared/contracts';
import { atomicJSON, type PreferenceStore } from './storage';
import { safeChild } from './paths';
const extensions = new Set(['wav', 'aiff', 'aif', 'mp3', 'm4a', 'aac']);
export class MusicLibrary {
  private tracks: Track[] = [];
  private error?: string;
  constructor(readonly directory: string) {
    const index = path.join(directory, 'library.json');
    if (!existsSync(index)) return;
    try {
      const value: unknown = JSON.parse(readFileSync(index, 'utf8'));
      if (!Array.isArray(value)) throw new Error();
      this.tracks = value.filter((t: Track) => t && typeof t.title === 'string' && typeof t.id === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(t.id) && typeof t.fileName === 'string' && t.fileName === t.id + path.extname(t.fileName) && extensions.has(path.extname(t.fileName).slice(1).toLowerCase()));
    } catch { this.error = 'Music/library.json 格式无效，未覆盖原索引。'; }
  }
  list(): Track[] { if (this.error) throw new Error(this.error); return structuredClone(this.tracks); }
  file(track: Track): string { return safeChild(this.directory, track.fileName); }
  async importFiles(files: string[], decoder: AudioDecoder): Promise<{ tracks: Track[]; imported: number; failures: string[] }> {
    this.list(); let imported = 0; const failures: string[] = [];
    for (const file of files) {
      const ext = path.extname(file).slice(1).toLowerCase();
      if (!extensions.has(ext)) { failures.push(`${path.basename(file)}：暂不支持，请转换为 WAV 或 M4A。`); continue; }
      const id = randomUUID().toUpperCase(), track = { id, title: path.basename(file, path.extname(file)), fileName: `${id}.${ext}` };
      const target = path.join(this.directory, track.fileName);
      try {
        await decoder.validate(file); mkdirSync(this.directory, { recursive: true }); copyFileSync(file, target);
        const proposed = [...this.tracks, track]; atomicJSON(path.join(this.directory, 'library.json'), proposed);
        this.tracks = proposed; imported++;
      } catch { try { unlinkSync(target); } catch {} failures.push(`${path.basename(file)}：无法导入，请检查音频文件和存储空间。`); }
    }
    return { tracks: this.list(), imported, failures };
  }
  remove(id: string): Track[] {
    const proposed = this.list().filter(t => t.id !== id);
    atomicJSON(path.join(this.directory, 'library.json'), proposed); this.tracks = proposed;
    // Match the native library: removing the index entry does not delete the audio copy.
    return this.list();
  }
}
export class AudioDecoder {
  private children = new Set<ChildProcess>();
  private current?: string;
  private cleanupTimer?: NodeJS.Timeout;
  constructor(readonly executable: string, readonly cache: string) { mkdirSync(cache, { recursive: true }); this.cleanup(); }
  private cleanup(): void {
    for (const name of readdirSync(this.cache)) if (/^audio-[a-f\d]{20}\.wav$/.test(name)) {
      const file = path.join(this.cache, name); if (file !== this.current) try { unlinkSync(file); } catch { /* Windows may still be closing the old media stream. */ }
    }
  }
  private run(args: string[], signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, ['-nostdin', '-v', 'error', ...args], { windowsHide: true, stdio: 'ignore', signal });
      this.children.add(child);
      child.on('error', reject);
      child.on('close', code => { this.children.delete(child); if (code === 0) resolve(); else reject(new Error('无法播放这首音乐，请检查文件或选择下一首。')); });
    });
  }
  async validate(file: string): Promise<void> { await this.run(['-i', file, '-t', '0.05', '-map', '0:a:0', '-f', 'null', '-']); }
  async prepare(file: string, signal?: AbortSignal): Promise<string> {
    const stat = statSync(file);
    const digest = createHash('sha256').update(file + stat.size + stat.mtimeMs).digest('hex').slice(0, 20);
    const output = path.join(this.cache, `audio-${digest}.wav`);
    if (!existsSync(output)) {
      const temporary = path.join(this.cache, `decode-${randomUUID()}.wav`);
      try {
        await this.run(['-i', file, '-map', '0:a:0', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', '-y', temporary], signal);
        if (signal?.aborted) throw new Error('已取消播放。');
        const { renameSync } = await import('node:fs'); renameSync(temporary, output);
      } finally { try { unlinkSync(temporary); } catch {} }
    }
    this.current = output; this.cleanup(); clearTimeout(this.cleanupTimer);
    this.cleanupTimer = setTimeout(() => this.cleanup(), 1_000); this.cleanupTimer.unref();
    return output;
  }
  shutdown(): void { clearTimeout(this.cleanupTimer); for (const child of this.children) child.kill(); this.children.clear(); }
}
export class MusicController {
  private state: MusicState;
  private reasons = new Set<string>();
  private task?: AbortController;
  private closed = false;
  readonly ready: Promise<void>;
  onChange: () => void = () => {};
  constructor(private library: MusicLibrary, private decoder: AudioDecoder, private preferences: PreferenceStore) {
    let prefs = {}; try { prefs = preferences.load(); } catch {}
    const values = prefs as Record<string, unknown>;
    this.state = { tracks: [], wantsPlayback: false, playing: false, volume: Math.min(1, Math.max(0, Number(values['music.volume'] ?? 0.2))), loop: ['list', 'playlist'].includes(String(values['music.loop'])) ? 'playlist' : 'single', autoplay: values['music.autoplayEnabled'] !== false, suspended: false, revision: 0, busy: false };
    if (!Number.isFinite(this.state.volume)) this.state.volume = 0.2;
    try { this.state.tracks = library.list(); } catch (e) { this.state.error = (e as Error).message; }
    this.state.selected = this.state.tracks.find(t => t.id === values['music.selected'])?.id ?? this.state.tracks[0]?.id;
    this.state.wantsPlayback = this.state.autoplay && Boolean(this.state.selected);
    this.ready = this.reconcile();
  }
  snapshot(): MusicState { return structuredClone(this.state); }
  private save(changes: Record<string, string | number | boolean>): boolean {
    try { this.preferences.save(changes); return true; } catch { this.state.error = '音乐偏好保存失败，请检查数据目录。'; this.onChange(); return false; }
  }
  setVolume(value: number): void { if (!Number.isFinite(value)) return; value = Math.min(1, Math.max(0, value)); if (this.save({ 'music.volume': value })) this.state.volume = value; this.onChange(); }
  setLoop(value: 'single' | 'playlist'): void { if (this.save({ 'music.loop': value === 'playlist' ? 'list' : 'single' })) this.state.loop = value; this.onChange(); }
  setAutoplay(value: boolean): void { if (this.save({ 'music.autoplayEnabled': value })) this.state.autoplay = value; this.onChange(); }
  async select(id: string): Promise<void> {
    if (this.state.busy || !this.state.tracks.some(t => t.id === id) || this.state.selected === id) return;
    if (!this.save({ 'music.selected': id })) return;
    this.state.selected = id; if (this.reasons.size) this.state.wantsPlayback = false;
    this.state.source = undefined; await this.reconcile();
  }
  async play(): Promise<void> { if (this.state.busy || !this.state.selected) return; this.state.wantsPlayback = true; this.state.error = undefined; await this.reconcile(); }
  pause(): void { this.state.wantsPlayback = false; void this.reconcile(); }
  async toggle(): Promise<void> { if (this.state.wantsPlayback) this.pause(); else await this.play(); }
  async next(direction = 1): Promise<void> {
    if (!this.state.tracks.length || this.state.busy) return;
    const index = this.state.tracks.findIndex(t => t.id === this.state.selected);
    const next = this.state.tracks[(Math.max(0, index) + direction + this.state.tracks.length) % this.state.tracks.length]!;
    if (next.id === this.state.selected) { if (this.reasons.size) this.state.wantsPlayback = false; this.state.source = undefined; await this.reconcile(); }
    else await this.select(next.id);
  }
  suspend(reason: string): void { if (this.reasons.has(reason)) return; this.reasons.add(reason); void this.reconcile(); }
  async resume(reason: string): Promise<void> { if (!this.reasons.delete(reason)) return; await this.reconcile(); }
  async importFiles(files: string[]): Promise<void> {
    if (this.state.busy || this.closed) return; this.state.busy = true; this.state.error = undefined; this.onChange();
    try {
      const result = await this.library.importFiles(files, this.decoder);
      if (this.closed) return; this.state.tracks = result.tracks; this.state.selected ??= result.tracks[0]?.id;
      this.state.notice = `已导入 ${result.imported} 首音乐。`; this.state.error = result.failures.join('\n') || undefined;
    } catch (e) { this.state.error = (e as Error).message; }
    finally { this.state.busy = false; this.onChange(); }
  }
  async remove(): Promise<void> {
    if (this.state.busy || !this.state.selected) return;
    this.pause();
    try { this.state.tracks = this.library.remove(this.state.selected); this.state.selected = this.state.tracks[0]?.id; this.state.source = undefined; this.save({ 'music.selected': this.state.selected ?? '' }); this.state.notice = '已从曲库移除，原文件未改动。'; }
    catch (e) { this.state.error = (e as Error).message; }
    this.onChange();
  }
  status(revision: number, playing: boolean, ended = false, error = false): void {
    if (revision !== this.state.revision || this.closed) return;
    this.state.playing = playing;
    if (error) { this.state.error = '无法播放这首音乐，请检查文件或选择下一首。'; this.pause(); }
    else if (ended && this.state.wantsPlayback && !this.reasons.size) { if (this.state.loop === 'playlist') void this.next(); else { this.state.source = undefined; void this.reconcile(); } }
    this.onChange();
  }
  private async reconcile(): Promise<void> {
    this.task?.abort(); this.task = undefined;
    const task = new AbortController(); this.task = task;
    this.state.revision++; this.state.suspended = this.reasons.size > 0; this.state.playing = false;
    if (!this.state.wantsPlayback || this.state.suspended || this.closed || !this.state.selected) { this.onChange(); return; }
    this.onChange();
    try {
      const track = this.state.tracks.find(t => t.id === this.state.selected)!;
      const source = await this.decoder.prepare(this.library.file(track), task.signal);
      if (this.task !== task || this.closed) return;
      this.state.source = source; this.onChange();
    } catch { if (this.task === task && !this.closed) { this.state.wantsPlayback = false; this.state.error = '无法播放这首音乐，请检查文件或选择下一首。'; this.onChange(); } }
  }
  shutdown(): void { this.closed = true; this.task?.abort(); this.decoder.shutdown(); }
}
