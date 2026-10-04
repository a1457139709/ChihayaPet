import type { Action, MusicState } from '../shared/contracts';

export class MusicPlayer {
  private audio = new Audio();
  private source?: string;
  private signature = '';
  private generation = 0;
  private playbackID = 0;
  private rewind = false;
  private transitioning = false;
  private volume = .2;
  private cancelFade?: () => void;
  constructor(private act: (action: Action) => void) { this.audio.preload = 'auto'; }
  private fade(to: number, duration: number): Promise<void> {
    this.cancelFade?.();
    const audio = this.audio, from = audio.volume, started = performance.now();
    return new Promise(resolve => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => { clearTimeout(timer); this.cancelFade = undefined; resolve(); };
      this.cancelFade = finish;
      const tick = () => {
        const progress = Math.min(1, (performance.now() - started) / duration);
        audio.volume = from + (to - from) * progress;
        if (progress < 1) timer = setTimeout(tick, 16); else finish();
      };
      tick();
    });
  }
  sync(music: MusicState): void {
    const next = JSON.stringify([music.revision, music.source, music.wantsPlayback, music.suspended, music.playbackID]);
    const volumeChanged = Math.abs(this.volume - music.volume) > .001;
    this.volume = music.volume;
    if (next === this.signature) {
      if (volumeChanged && !this.transitioning && !this.audio.paused) void this.fade(this.volume, 100);
      return;
    }
    this.signature = next; const generation = ++this.generation; this.cancelFade?.();
    if (music.playbackID !== this.playbackID) { this.playbackID = music.playbackID; this.rewind = true; }
    this.transitioning = true;
    void this.apply(music, generation).finally(() => { if (generation === this.generation) this.transitioning = false; });
  }
  private async apply(music: MusicState, generation: number): Promise<void> {
    const report = (playing: boolean, extra: { ended?: boolean; error?: boolean } = {}) => {
      if (generation === this.generation) this.act({ type: 'music-status', revision: music.revision, playing, ...extra });
    };
    // A pending decode or fade still owns the old media element. Only bind
    // this revision after its source/rewind has actually been applied.
    this.audio.onended = null; this.audio.onerror = null;
    if (!music.wantsPlayback || music.suspended || !music.source) {
      if (this.rewind && !music.wantsPlayback && this.audio.readyState) this.audio.currentTime = 0;
      if (!this.audio.paused) await this.fade(0, 350);
      if (generation !== this.generation) return;
      this.audio.pause(); report(false); return;
    }
    const changed = this.source !== music.source;
    if (changed || this.rewind) {
      if (!this.audio.paused) await this.fade(0, 350);
      if (generation !== this.generation) return;
      this.audio.onended = null; this.audio.onerror = null; this.audio.pause();
      if (changed) {
        this.audio.removeAttribute('src'); this.audio.load();
        this.audio = new Audio(); this.audio.preload = 'auto'; this.source = music.source;
        this.audio.src = `chihaya://audio/current?source=${encodeURIComponent(music.source.split(/[\\/]/).at(-1)!)}`;
        this.audio.load();
      } else this.audio.currentTime = 0;
      this.rewind = false; this.audio.volume = 0;
    }
    this.audio.onended = () => report(false, { ended: true });
    this.audio.onerror = () => report(false, { error: true });
    const wasPaused = this.audio.paused;
    try {
      await this.audio.play();
      if (generation !== this.generation) return;
      report(true); await this.fade(this.volume, wasPaused || changed ? 500 : 100);
      while (generation === this.generation && Math.abs(this.audio.volume - this.volume) > .001) await this.fade(this.volume, 100);
    } catch { report(false, { error: true }); }
  }
  stop(): void { this.generation++; this.cancelFade?.(); this.audio.onended = null; this.audio.onerror = null; this.audio.pause(); }
}
