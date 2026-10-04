import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Companion } from '../app/main/companion.ts';
import { ConfigStore, PromptStore } from '../app/main/storage.ts';
import { MusicLibrary, AudioDecoder, MusicController } from '../app/main/music.ts';
import { Platform } from '../app/platform/native.ts';
import { resolvePaths } from '../app/main/paths.ts';
import type { Rect } from '../app/shared/contracts.ts';

// Replace only the external Electron window/screen boundary. These tests observe
// public controller state and persisted preferences without launching any UI.
class WindowBoundary extends EventEmitter {
  static instances: WindowBoundary[] = [];
  private bounds: Rect;
  private visible = false;
  private destroyed = false;
  webContents = Object.assign(new EventEmitter(), { id: Math.random(), send() {}, setWindowOpenHandler() {} });
  constructor(options: { width: number; height: number }) { super(); this.bounds = { x: 0, y: 0, width: options.width, height: options.height }; WindowBoundary.instances.push(this); }
  loadFile(): Promise<void> { queueMicrotask(() => this.emit('ready-to-show')); return Promise.resolve(); }
  setMenuBarVisibility(): void {}
  setVisibleOnAllWorkspaces(): void {}
  setAlwaysOnTop(): void {}
  setIgnoreMouseEvents(): void {}
  getNativeWindowHandle(): Buffer { return Buffer.alloc(8); }
  getBounds(): Rect { return { ...this.bounds }; }
  setBounds(bounds: Rect): void { this.bounds = { ...bounds }; }
  setSize(width: number, height: number): void { this.bounds = { ...this.bounds, width, height }; }
  center(): void { this.bounds = { ...this.bounds, x: 400, y: 200 }; }
  show(): void { this.visible = true; this.emit('show'); }
  showInactive(): void { this.show(); }
  hide(): void { this.visible = false; }
  focus(): void {}
  isVisible(): boolean { return this.visible; }
  isDestroyed(): boolean { return this.destroyed; }
  destroy(): void { this.destroyed = true; this.visible = false; this.emit('closed'); }
  close(): void { let prevented = false; this.emit('close', { preventDefault() { prevented = true; } }); if (!prevented) this.destroy(); }
}
const display = { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 24, width: 1440, height: 876 } };
const electron = {
  BrowserWindow: WindowBoundary,
  screen: Object.assign(new EventEmitter(), { getPrimaryDisplay: () => display, getAllDisplays: () => [display], getDisplayMatching: () => display, getDisplayNearestPoint: () => display, getCursorScreenPoint: () => ({ x: 700, y: 500 }) }),
  nativeTheme: new EventEmitter(), systemPreferences: { getAnimationSettings: () => ({ prefersReducedMotion: false }) },
  dialog: { showMessageBox: async () => ({ response: 0 }) }, app: { quit() {} },
};
const require = createRequire(import.meta.url), electronPath = require.resolve('electron');
require.cache[electronPath] = { id: electronPath, filename: electronPath, loaded: true, exports: electron } as NodeModule;

async function fixture() {
  const { DesktopApplication } = await import('../app/main/desktop.ts');
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-desktop-state-'));
  const paths = resolvePaths({ platform: 'win32', packaged: false, executable: '/unused', appPath: root, qaRoot: root });
  const platform = new Platform('win32', root, paths.preferences, undefined, { foreground: () => null, isWindow: () => false, processID: () => 0, activate() {} });
  platform.save({ 'desktop.headPettingEnabled': false });
  const config = new ConfigStore(paths.config); config.saveService('https://example.com/v1', 'fixture', 'synthetic');
  const companion = new Companion(config, new PromptStore(paths.prompt), async () => new Response('{"choices":[{"message":{"content":"完整回复"}}]}'));
  const music = new MusicController(new MusicLibrary(paths.music), new AudioDecoder('/unused', paths.cache), platform);
  await music.ready;
  const controller = new DesktopApplication(companion, music, platform, paths, path.resolve('dist'), path.resolve('ChihayaPet/Resources'));
  await Promise.resolve();
  return { controller, companion, platform, close() { controller.shutdown(); rmSync(root, { recursive: true, force: true }); } };
}

test('chat collapse preserves multiline drafts; settings remember their last tab; height and head-petting preferences persist', async () => {
  const f = await fixture();
  try {
    assert.equal(f.controller.snapshot().desktop.headPetting, false);
    await f.controller.act({ type: 'chat' });
    await f.controller.act({ type: 'input', text: '未发送\n👩🏽‍💻草稿' });
    await f.controller.act({ type: 'close', window: 'chat' });
    assert.equal(f.controller.snapshot().chatVisible, false);
    await f.controller.act({ type: 'chat' });
    assert.equal(f.controller.snapshot().input, '未发送\n👩🏽‍💻草稿');
    await f.controller.act({ type: 'settings', tab: 'portrait' });
    await f.controller.act({ type: 'close', window: 'settings' }); await f.controller.act({ type: 'settings' });
    assert.equal(f.controller.snapshot().settingsTab, 'portrait');
    await f.controller.act({ type: 'desktop', field: 'headPetting', value: true });
    await f.controller.act({ type: 'desktop', field: 'height', value: 333 });
    assert.equal(f.controller.snapshot().desktop.height, 333);
    f.controller.shutdown();
    assert.equal(f.platform.load()['desktop.headPettingEnabled'], true);
    assert.equal(f.platform.load()['desktop.imageHeight'], 333);
  } finally { f.close(); }
});

test('a reply keeps its presentation identity across chat collapse with a draft; consumed replies never reappear', async () => {
  const f = await fixture();
  try {
    await f.controller.act({ type: 'chat' }); await f.controller.act({ type: 'input', text: '你好' }); await f.controller.act({ type: 'send' });
    await f.controller.act({ type: 'close', window: 'chat' });
    const id = f.controller.snapshot().bubble?.id; assert.ok(id);
    await f.controller.act({ type: 'chat' }); await f.controller.act({ type: 'input', text: '新的未发送草稿' });
    await f.controller.act({ type: 'close', window: 'chat' });
    assert.equal(f.controller.snapshot().bubble?.id, id);
    assert.equal(f.controller.snapshot().input, '新的未发送草稿');
    await f.controller.act({ type: 'bubble-dismiss' }); await f.controller.act({ type: 'chat' }); await f.controller.act({ type: 'close', window: 'chat' });
    assert.equal(f.controller.snapshot().bubble, undefined);
  } finally { f.close(); }
});

test('read-more focus is consumed once and a later request for the same turn gets a new identity', async () => {
  const f = await fixture();
  try {
    await f.controller.act({ type: 'chat' }); await f.controller.act({ type: 'input', text: '你好' }); await f.controller.act({ type: 'send' });
    await f.controller.act({ type: 'close', window: 'chat' }); await f.controller.act({ type: 'read-more' });
    const focus = f.controller.snapshot().chatFocus!; assert.ok(focus.id);
    await f.controller.act({ type: 'chat-focus-consumed', id: focus.id }); await f.controller.act({ type: 'input', text: '继续编辑' });
    assert.equal(f.controller.snapshot().chatFocus, undefined);
    await f.controller.act({ type: 'close', window: 'chat' }); await f.controller.act({ type: 'read-more' });
    assert.equal(f.controller.snapshot().chatFocus?.turnID, focus.turnID);
    assert.notEqual(f.controller.snapshot().chatFocus?.id, focus.id);
  } finally { f.close(); }
});

test('opening a panel closes a menu still loading and preserves the original focus owner', async context => {
  const f = await fixture();
  let remembered = 0, restored = 0;
  context.mock.method(f.platform, 'rememberFocus', () => { remembered++; });
  context.mock.method(f.platform, 'restoreFocus', () => { restored++; });
  try {
    f.controller.openMenu();
    const menu = WindowBoundary.instances.at(-1)!;
    f.controller.open('chat');
    assert.equal(menu.isDestroyed(), false);
    await Promise.resolve();
    menu.emit('ready-to-show'); // A late native readiness event cannot show it.
    assert.equal(menu.isVisible(), false);
    assert.equal(remembered, 1);
    assert.equal(restored, 0);
    await f.controller.act({ type: 'close', window: 'chat' });
    assert.equal(restored, 1);
  } finally { f.close(); }
});

test('cancelled chat can retry while manual idle speech remains visible after closing chat', async context => {
  const f = await fixture();
  try {
    // Hold the real conversation request until cancellation.
    context.mock.method(f.companion as unknown as { fetcher: typeof fetch }, 'fetcher', (_url: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    }));
    await f.controller.act({ type: 'chat' }); await f.controller.act({ type: 'input', text: '保留重试的问题' });
    const request = f.controller.act({ type: 'send' });
    await f.controller.act({ type: 'cancel' }); await request;
    await f.controller.act({ type: 'close', window: 'chat' });
    await f.controller.act({ type: 'say' }); await Promise.resolve();
    assert.equal(f.controller.snapshot().pending, '保留重试的问题');
    assert.equal(f.controller.snapshot().turns.length, 0);
    assert.equal(f.controller.snapshot().bubble?.kind, 'idle');
    assert.equal(WindowBoundary.instances.at(-1)!.isVisible(), true);
    assert.equal(f.controller.snapshot().canSay, false);
    await f.controller.act({ type: 'chat' });
    assert.equal(f.controller.snapshot().bubble, undefined);
    context.mock.method(f.companion as unknown as { fetcher: typeof fetch }, 'fetcher', async () => new Response('{"choices":[{"message":{"content":"重试完成"}}]}'));
    await f.controller.act({ type: 'retry' });
    assert.equal(f.controller.snapshot().turns[0]?.user, '保留重试的问题');
    assert.equal(f.controller.snapshot().turns[0]?.assistant, '重试完成');
    assert.equal(f.controller.snapshot().cancelled, false);

  } finally { f.close(); }
});

test('menu opens reuse one prepared window without waiting for another page load', async context => {
  const f = await fixture();
  context.mock.method(f.platform, 'rememberFocus', () => {});
  context.mock.method(f.platform, 'restoreFocus', () => {});
  try {
    f.controller.openMenu(); await Promise.resolve();
    const menu = WindowBoundary.instances.at(-1)!;
    assert.equal(menu.isVisible(), true);
    await f.controller.act({ type: 'close', window: 'menu' });
    assert.equal(menu.isDestroyed(), false, 'Closing must retain the prepared menu');
    assert.equal(menu.isVisible(), false);
    const count = WindowBoundary.instances.length;
    f.controller.openMenu();
    assert.equal(WindowBoundary.instances.length, count, 'Reopening must not load another page');
    assert.equal(menu.isVisible(), true, 'Warm menu must show in the same turn');
  } finally { f.close(); }
});

test('repeated requests while menu loads never show an unready window', async context => {
  const f = await fixture();
  context.mock.method(f.platform, 'rememberFocus', () => {});
  try {
    f.controller.openMenu();
    const menu = WindowBoundary.instances.at(-1)!;
    f.controller.openMenu();
    assert.equal(menu.isVisible(), false);
    await Promise.resolve();
    assert.equal(menu.isVisible(), true);
  } finally { f.close(); }
});

test('Windows prewarms after pet readiness, refreshes each opening and never restores focus just for warming', async context => {
  const f = await fixture(); let remembered = 0, restored = 0;
  context.mock.method(f.platform, 'rememberFocus', () => { remembered++; });
  context.mock.method(f.platform, 'restoreFocus', () => { restored++; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    const menu = WindowBoundary.instances.at(-1)!;
    assert.notEqual(menu, f.controller.pet);
    assert.equal(menu.isVisible(), false);
    assert.equal(remembered, 0); assert.equal(restored, 0);
    const count = WindowBoundary.instances.length;
    f.controller.openMenu();
    assert.equal(menu.isVisible(), true);
    const first = f.controller.snapshot().menuSession;
    menu.emit('blur');
    assert.equal(menu.isVisible(), false); assert.equal(restored, 1);
    f.controller.openMenu();
    assert.equal(WindowBoundary.instances.length, count);
    assert.notEqual(f.controller.snapshot().menuSession, first);
    assert.equal(remembered, 2);
    f.controller.shutdown(); assert.equal(menu.isDestroyed(), true);
  } finally { f.close(); }
});
