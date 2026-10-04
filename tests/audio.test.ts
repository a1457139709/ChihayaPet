import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MusicPlayer } from '../app/renderer/audio.ts';
import type { Action, MusicState } from '../app/shared/contracts.ts';

class MediaBoundary {
  static instances: MediaBoundary[] = [];
  constructor() { MediaBoundary.instances.push(this); }
  preload = ''; src = ''; volume = 1; paused = true; currentTime = 0; readyState = 1;
  onended: (() => void) | null = null; onerror: (() => void) | null = null;
  load(): void {}
  removeAttribute(): void { this.src = ''; }
  pause(): void { this.paused = true; }
  play(): Promise<void> { this.paused = false; return Promise.resolve(); }
}
const state = (revision: number, source?: string): MusicState => ({ tracks: [], selected: 'fixture', wantsPlayback: true, playing: false, volume: .2, loop: 'playlist', autoplay: false, suspended: false, suspensionReasons: [], revision, playbackID: revision, busy: false, source });

test('the fading old track cannot report ended or failure as the newly selected track', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  context.mock.method(performance, 'now', () => Date.now());
  const original = globalThis.Audio;
  globalThis.Audio = MediaBoundary as unknown as typeof Audio;
  const actions: Action[] = [], player = new MusicPlayer(action => actions.push(action));
  try {
    player.sync(state(1, '/cache/one.wav'));
    await Promise.resolve(); context.mock.timers.tick(500); await Promise.resolve(); await Promise.resolve();
    const old = MediaBoundary.instances.at(-1)!;
    assert.equal(old.paused, false);
    actions.length = 0;
    player.sync(state(2)); // New track is being decoded while the old one fades.
    old.onended?.(); old.onerror?.();
    assert.equal(actions.some(action => action.type === 'music-status' && (action.ended || action.error)), false);
  } finally { player.stop(); globalThis.Audio = original; context.mock.restoreAll(); context.mock.timers.reset(); }
});
