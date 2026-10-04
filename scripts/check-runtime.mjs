import { _electron as electron } from 'playwright-core';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { waitForSprite } from './ready-sprite.mjs';
const root = path.resolve(import.meta.dirname, '..');
const data = mkdtempSync(path.join(os.tmpdir(), 'chihaya-runtime-'));
const domain = `local.ChihayaPet.QA.${path.basename(data).replace(/[^a-zA-Z\d]/g, '')}`;
const fixtureTracks = ['wav', 'aiff', 'aif', 'mp3', 'm4a', 'aac'].map((ext, i) => ({ id: `${ext}.${ext}`, title: ext, fileName: `${ext}.${ext}` }));
mkdirSync(path.join(data, 'Music'));
const ffmpeg = path.join(root, 'node_modules/ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
for (const track of fixtureTracks) execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', path.join(data, 'Music', track.fileName)]);
if (process.platform === 'darwin') {
  execFileSync('/usr/bin/defaults', ['write', domain, 'music.autoplayEnabled', '-bool', 'false']);
  execFileSync('/usr/bin/defaults', ['write', domain, 'music.volume', '-float', '0']);
  execFileSync('/usr/bin/defaults', ['write', domain, 'music.loop', 'list']);
} else writeFileSync(path.join(data, 'preferences.json'), JSON.stringify({ 'music.autoplayEnabled': false, 'music.volume': 0, 'music.loop': 'list' }));
const executablePath = process.env.CHIHAYA_QA_EXECUTABLE;
const launch = { args: executablePath ? [] : [root], executablePath, env: { ...process.env, CHIHAYA_QA: '1', CHIHAYA_QA_DATA: data, CHIHAYA_QA_REPLY: '1' }, timeout: 30_000 };
let app;
try {
  app = await electron.launch(launch);
  const pet = await app.firstWindow();
  const openWindow = async action => {
    const kind = action.type === 'say' ? 'bubble' : action.type;
    const existing = app.windows().find(page => new URL(page.url()).searchParams.get('window') === kind);
    const waiting = existing ? Promise.resolve(existing) : app.waitForEvent('window');
    await pet.evaluate(a => window.chihaya.act(a), action); return waiting;
  };
  const closeWindow = async page => {
    const kind = new URL(page.url()).searchParams.get('window');
    await page.locator('#close').click();
    await page.waitForFunction(kind => window.chihaya.snapshot().then(s => !s[kind + 'Visible']), kind);
  };
  const visibleCount = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => w.isVisible()).length);
  const bubbleVisible = () => app.evaluate(({ BrowserWindow }) => Boolean(BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('window=bubble'))?.isVisible()));
  const checkSpaces = async (kind, allSpaces) => {
    if (process.platform !== 'darwin') return;
    const behavior = await app.evaluate(({ app, BrowserWindow }, kind) => {
      const path = process.getBuiltinModule('path');
      const require = process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(), 'package.json'));
      const directory = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked/dist/platform') : path.join(app.getAppPath(), 'dist/platform');
      const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes(`window=${kind}`));
      return require(path.join(directory, 'MacWindow.node')).behavior(window.getNativeWindowHandle());
    }, kind);
    // AppKit may also add Managed; inspect only the Spaces/fullscreen policy bits.
    assert.equal(behavior & (1 | 2 | 128 | 256 | 512), 512 | (allSpaces ? 1 : 2), `${kind}: preserve native Spaces/fullscreen collection behavior`);
  };
  const errors = []; pet.on('pageerror', error => errors.push(error.message));
  pet.on('console', message => { if (message.type() === 'error') console.error('Renderer:', message.text()); });
  await waitForSprite(pet).catch(async error => { console.error('Renderer failures:', errors, await pet.evaluate(() => ({ html: document.body.innerHTML.slice(0, 500), bridge: typeof window.chihaya }))); throw error; });
  assert.equal(await pet.evaluate(() => window.chihaya.snapshot().then(s => s.outfits.length)), 13);
  await checkSpaces('pet', true);
  await app.evaluate(({ BrowserWindow }) => {
    const pet = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('window=pet'));
    if (!pet || pet.isFocusable()) throw new Error('Pet must remain non-activating');
    const setIgnore = pet.setIgnoreMouseEvents.bind(pet);
    pet.setIgnoreMouseEvents = (ignore, options) => { pet.qaIgnored = ignore; setIgnore(ignore, options); };
  });
  await pet.evaluate(() => window.chihaya.act({ type: 'desktop', field: 'animations', value: false }));
  await pet.waitForFunction(() => !document.body.classList.contains('motion'));
  await checkSpaces('pet', true);
  for (const value of [true, true, false, true]) {
    await pet.evaluate(value => window.chihaya.act({ type: 'desktop', field: 'onTop', value }), value);
    await checkSpaces('pet', true);
  }
  const opaque = await pet.evaluate(() => {
    const c = document.querySelector('canvas'), pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, rect = c.getBoundingClientRect();
    for (let y = Math.floor(c.height / 3); y < c.height - 12; y++) for (let x = 12; x < c.width - 12; x++) if ([-12, 0, 12].every(dy => [-12, 0, 12].every(dx => pixels[((y + dy) * c.width + x + dx) * 4 + 3] > 250))) return { x: rect.left + (x + .5) / c.width * rect.width, y: rect.top + (y + .5) / c.height * rect.height };
    throw new Error('Approved PNG has no opaque pixel.');
  });
  const ignoresMouse = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('window=pet')).qaIgnored);
  // Dispatch the forwarded coordinates directly: CDP pointer injection is suppressed by native ignore-mouse windows.
  const move = point => pet.evaluate(p => document.dispatchEvent(new MouseEvent('mousemove', { clientX: p.x, clientY: p.y, bubbles: true })), point);
  await move(opaque); await pet.waitForTimeout(100); assert.equal(await ignoresMouse(), false);
  await move({ x: 1, y: 1 }); await pet.waitForTimeout(100); assert.equal(await ignoresMouse(), true);
  await pet.evaluate(() => window.chihaya.act({ type: 'click-through', value: true }));
  await move(opaque); await pet.waitForTimeout(100); assert.equal(await ignoresMouse(), true);
  await pet.evaluate(() => window.chihaya.act({ type: 'click-through', value: false }));
  await pet.waitForTimeout(100); assert.equal(await ignoresMouse(), false);
  mkdirSync(path.join(root, 'build/QA/runtime'), { recursive: true });
  await pet.screenshot({ path: path.join(root, 'build/QA/runtime/pet.png'), omitBackground: true });
  let settings = await openWindow({ type: 'settings' }); await settings.waitForSelector('#baseURL');
  await checkSpaces('settings', false);
  await settings.locator('[data-tab="persona"]').click();
  await settings.locator('#prompt').fill('未保存的角色草稿');
  const missing = await openWindow({ type: 'chat' }); await missing.waitForSelector('#input');
  await missing.locator('#input').fill('缺少配置时定位设置字段'); await missing.locator('#input').press('Enter');
  await settings.waitForFunction(() => document.querySelector('[data-tab="service"]').getAttribute('aria-selected') === 'true' && document.activeElement.id === 'baseURL', undefined, { timeout: 5000 });
  assert.equal(await settings.locator('#prompt').inputValue(), '未保存的角色草稿');
  await settings.locator('#baseURL').fill('https://example.com/v1'); await settings.locator('#model').fill('unsaved-model');
  await settings.locator('[data-tab="persona"]').click(); await missing.locator('#input').press('Enter');
  await settings.waitForFunction(() => document.activeElement.id === 'key', undefined, { timeout: 5000 });
  assert.equal(await settings.locator('#model').inputValue(), 'unsaved-model');
  await settings.locator('#key').fill('unsaved-key'); await settings.locator('[data-tab="persona"]').click(); await missing.locator('#input').press('Enter');
  await settings.waitForFunction(() => document.querySelector('[data-tab="service"]').getAttribute('aria-selected') === 'true', undefined, { timeout: 5000 });
  await closeWindow(settings);
  await missing.locator('#input').press('Enter');
  await settings.waitForFunction(() => document.querySelector('[data-tab="service"]').getAttribute('aria-selected') === 'true');
  assert.equal(await settings.locator('#model').inputValue(), 'unsaved-model');
  await missing.evaluate(() => window.chihaya.act({ type: 'clear' })); await closeWindow(missing);
  await settings.locator('#baseURL').fill('https://Example.com/v1///'); await settings.locator('#model').fill('example-model'); await settings.locator('#key').fill('synthetic-key');
  await settings.locator('#save-service').click(); await settings.waitForFunction(() => document.querySelector('#settings-notice').textContent.includes('已保存'));
  assert.equal(JSON.parse(readFileSync(path.join(data, 'config.json'), 'utf8')).baseURL, 'https://example.com/v1');
  await settings.locator('[data-tab="portrait"]').click(); await settings.locator('#framing').selectOption('close');
  await pet.waitForFunction(() => document.querySelector('canvas').height === 670);
  await checkSpaces('pet', true);
  await settings.locator('#expression').selectOption('03');
  await pet.waitForFunction(() => window.chihaya.snapshot().then(s => s.sprite.faceID === '03'));
  await settings.locator('#framing').selectOption('full'); await settings.locator('#expression').selectOption('11');
  await settings.locator('#outfit').selectOption('b');
  await pet.waitForTimeout(100);
  assert.equal(await pet.evaluate(() => window.chihaya.snapshot().then(s => s.desktop.expression)), '00');
  await settings.locator('#outfit').selectOption('a');
  assert.equal(await pet.evaluate(() => window.chihaya.snapshot().then(s => s.desktop.expression)), '00');
  await settings.locator('#framing').selectOption('close'); await settings.locator('#expression').selectOption('03');
  await settings.screenshot({ path: path.join(root, 'build/QA/runtime/settings.png') });
  await closeWindow(settings);
  const chat = await openWindow({ type: 'chat' }); await chat.waitForSelector('#input');
  await checkSpaces('chat', false);
  await chat.locator('#input').fill('中文输入');
  await chat.locator('#input').evaluate(el => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }));
  });
  assert.equal(await chat.locator('#input').inputValue(), '中文输入');
  await chat.locator('#input').evaluate(el => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await chat.locator('#input').press('Shift+Enter'); assert.equal((await chat.locator('#input').inputValue()).includes('\n'), true);
  await chat.screenshot({ path: path.join(root, 'build/QA/runtime/chat.png') });
  // Exercise the renderer's public snapshot contract at the history cap.
  await chat.waitForTimeout(600); // Let preceding input and audio state publications finish before isolated renderer fixtures.
  const base = await chat.evaluate(() => window.chihaya.snapshot());
  const partial = '逐字播放需要保留已显示的前缀。'.repeat(100);
  const oldTurns = Array.from({ length: 50 }, (_, i) => ({ id: `fixture-${i}`, user: `虚构消息 ${i}`, assistant: `虚构回复 ${i}`, truncated: false }));
  const pending = { ...base, desktop: { ...base.desktop, animations: true }, reducedMotion: false, input: '', busy: 'chat', turns: oldTurns, pending: '下一条虚构消息', pendingID: 'pending-fixture', partial, didTrim: true };
  const inject = value => app.evaluate(({ BrowserWindow }, snapshot) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('window=chat')).webContents.send('chihaya:state', snapshot), value);
  await inject(pending); await chat.waitForSelector('#history .incomplete'); await chat.waitForTimeout(500);
  const gap = () => chat.locator('#history').evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight);
  assert.ok(await gap() <= 4, 'Streaming should continue following the bottom.');
  const readingPosition = await chat.locator('#history').evaluate(el => { el.scrollTop -= 150; return el.scrollTop; });
  await chat.waitForTimeout(200);
  assert.ok(Math.abs(await chat.locator('#history').evaluate(el => el.scrollTop) - readingPosition) < 2, 'Typing must preserve the reader’s scroll position.');
  await chat.locator('#history').evaluate(el => { el.scrollTop = el.scrollHeight; });
  const prefix = await chat.locator('#pending-reply .text').textContent();
  await inject({ ...pending, busy: undefined, pending: undefined, pendingID: undefined, partial: '', turns: [...oldTurns.slice(1), { id: 'completed-fixture', user: pending.pending, assistant: partial, truncated: false }] });
  await chat.waitForSelector('#turn-completed-fixture');
  const displayed = await chat.locator('#turn-completed-fixture .text').textContent();
  assert.ok(displayed.startsWith(prefix) && displayed.length < partial.length, `History trimming must preserve gradual playback and its prefix: ${JSON.stringify({ prefix: prefix.slice(0, 30), displayed: displayed.slice(0, 30), prefixLength: prefix.length, displayedLength: displayed.length, targetLength: partial.length })}`);
  await inject({ ...pending, busy: undefined, pending: undefined, pendingID: undefined, partial: '', turns: [...oldTurns.slice(1), { id: 'fast-json-fixture', user: '快速 JSON 回复', assistant: partial, truncated: false }] });
  await chat.waitForSelector('#turn-fast-json-fixture');
  assert.ok((await chat.locator('#turn-fast-json-fixture .text').textContent()).length < partial.length, 'Fast complete responses should animate even if the pending state was coalesced.');
  await chat.evaluate(() => window.chihaya.act({ type: 'clear' }));
  await chat.evaluate(() => { void window.chihaya.act({ type: 'input', text: '虚构回复测试' }).then(() => window.chihaya.act({ type: 'send' })); });
  await chat.waitForFunction(() => window.chihaya.snapshot().then(s => s.turns.length === 1 && !s.busy));
  const replyCreated = app.waitForEvent('window'); await closeWindow(chat); const reply = await replyCreated;
  await reply.waitForSelector('#bubble');
  const replyID = await pet.evaluate(() => window.chihaya.snapshot().then(s => s.bubble.id));
  await pet.evaluate(() => window.chihaya.act({ type: 'click-through', value: true })); assert.equal(await bubbleVisible(), false);
  await pet.evaluate(() => window.chihaya.act({ type: 'click-through', value: false })); assert.equal(await bubbleVisible(), true);
  assert.equal(await pet.evaluate(() => window.chihaya.snapshot().then(s => s.bubble.id)), replyID);
  const second = await openWindow({ type: 'chat' }); await second.waitForSelector('#input');
  await checkSpaces('chat', false);
  await second.evaluate(() => { void window.chihaya.act({ type: 'input', text: '第二条虚构请求' }).then(() => window.chihaya.act({ type: 'send' })).catch(() => {}); });
  await second.waitForFunction(() => window.chihaya.snapshot().then(s => s.busy === 'chat'));
  await closeWindow(second); await pet.waitForTimeout(150);
  assert.equal(await visibleCount(), 1, 'Pending requests hide the preserved reply bubble.');
  await pet.evaluate(() => window.chihaya.act({ type: 'cancel' }));
  assert.equal(await visibleCount(), 1);
  await pet.evaluate(() => window.chihaya.act({ type: 'input', text: '' })).catch(() => {});
  // Clear the preserved draft through the public chat input, then test idle bubble lifetime.
  const fresh = await openWindow({ type: 'chat' }); await fresh.waitForSelector('#input');
  await fresh.evaluate(() => window.chihaya.act({ type: 'clear' })); await closeWindow(fresh);
  const bubble = await openWindow({ type: 'say' }); await bubble.waitForSelector('#bubble');
  await checkSpaces('bubble', true);
  await bubble.locator('.text').click(); await bubble.screenshot({ path: path.join(root, 'build/QA/runtime/bubble.png'), omitBackground: true });
  await Promise.all([bubble.waitForEvent('close'), bubble.locator('.bubble-close').click({ force: true })]);
  assert.equal(await visibleCount(), 1);
  assert.equal(readFileSync(path.join(data, 'FILES.txt'), 'utf8').includes(data), true);
  const runtimePaths = await app.evaluate(({ app }) => ['userData', 'sessionData', 'temp', 'logs', 'crashDumps'].map(n => app.getPath(n)));
  for (const value of runtimePaths) assert.equal(realpathSync(value).startsWith(path.join(realpathSync(data), 'ElectronRuntime')), true, JSON.stringify({ data, runtimePaths }));
  assert.equal(await pet.evaluate(() => window.chihaya.snapshot().then(s => s.music.loop)), 'playlist');
  for (const track of fixtureTracks) {
    await pet.evaluate(id => window.chihaya.act({ type: 'music-select', id }), `${track.title}.${path.extname(track.fileName).slice(1)}`);
    const playing = await pet.evaluate(() => window.chihaya.snapshot().then(s => s.music.wantsPlayback));
    if (!playing) await pet.evaluate(() => window.chihaya.act({ type: 'music-toggle' }));
    await pet.waitForFunction(() => window.chihaya.snapshot().then(s => s.music.playing), { timeout: 10_000 });
  }
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('suspend'));
  await pet.waitForFunction(() => window.chihaya.snapshot().then(s => !s.awake && s.music.suspended));
  await pet.evaluate(() => window.chihaya.act({ type: 'music-toggle' }));
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
  assert.equal(await pet.evaluate(() => window.chihaya.snapshot().then(s => s.music.wantsPlayback)), false);
  assert.equal(existsSync(path.join(data, 'Music/library.json')), false);
  assert.deepEqual(errors, []);
  console.log('Runtime verified: isolated storage, approved rendering, native Spaces/fullscreen flags after repeated top-level setters, alpha hit/click-through commands, missing service routing/focus/draft preservation/reopened settings, settings save, expression normalization, Chinese composition, capped-history playback/prefix, scroll following/reader position, fast JSON playback, reply suppression/restoration, panel reuse, idle bubble, all six music formats, simulated sleep/manual pause and FILES.txt.');
} finally {
  await app?.close();
  if (process.platform === 'darwin') {
    try { execFileSync('/usr/bin/defaults', ['delete', domain], { stdio: 'ignore' }); } catch {}
  }
  rmSync(data, { recursive: true, force: true });
}
