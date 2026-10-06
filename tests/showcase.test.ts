import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
// Browser-independent playback contract; genuine recordings are still pending.
// @ts-expect-error Static site intentionally ships browser JavaScript without a TS build.
import { setupDemoPlayback } from '../showcase/site/media.js';
class Video extends EventTarget {
  paused = true;
  muted = false;
  async play() { this.paused = false; this.dispatchEvent(new Event('play')); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
}
function fixture(reduced: boolean) {
  const videos = [new Video(), new Video()];
  const button = Object.assign(new EventTarget(), {textContent: '', disabled: true});
  const preference = Object.assign(new EventTarget(), {matches: reduced});
  const root = {querySelectorAll: () => videos, getElementById: () => button};
  const cleanup = setupDemoPlayback(root, preference);
  return {videos, button, preference, cleanup};
}
test('showcase respects reduced motion and supports individual and group playback', () => {
  const {videos, button, cleanup} = fixture(true);
  assert.ok(videos.every(v => v.paused && v.muted));
  button.dispatchEvent(new Event('click'));
  assert.ok(videos.every(v => !v.paused));
  videos[0]!.pause();
  assert.equal(button.textContent, '暂停全部演示');
  button.dispatchEvent(new Event('click'));
  assert.ok(videos.every(v => v.paused));
  cleanup();
});
test('showcase pauses on preference change and detaches playback when leaving page', () => {
  const {videos, button, preference, cleanup} = fixture(false);
  assert.ok(videos.every(v => !v.paused));
  preference.matches = true;
  preference.dispatchEvent(new Event('change'));
  assert.ok(videos.every(v => v.paused));
  cleanup();
  button.dispatchEvent(new Event('click'));
  assert.ok(videos.every(v => v.paused));
});
test('selected showcase assets are exact copies of tracked runtime images', () => {
  const selections = JSON.parse(readFileSync('showcase/selection.json', 'utf8'));
  assert.equal(selections.length, 15);
  const faces = new Map<string, string[]>();
  for (const item of selections) {
    assert.deepEqual(readFileSync(`showcase/site/assets/${item.outfit}-${item.id}.png`), readFileSync(item.path));
    faces.set(item.outfit, [...(faces.get(item.outfit) ?? []), item.id]);
  }
  assert.equal(faces.size, 3);
  for (const ids of faces.values()) assert.deepEqual(ids, ['01', '03', '05', '09', '11']);
});
