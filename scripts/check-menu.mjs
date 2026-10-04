// Functional AppKit -> Node -> application -> renderer checks. No screenshots,
// pixel/layout assertions, UI appearance checks, or personal configuration.
import { _electron as electron } from 'playwright-core';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, symlinkSync, realpathSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

if (process.platform !== 'darwin') { console.log('AppKit menu check requires macOS.'); process.exit(0); }
const root = path.resolve(import.meta.dirname, '..'), work = mkdtempSync(path.join(os.tmpdir(), 'chihaya-menu-'));
const fixture = path.join(work, 'App'), data = path.join(work, 'Data');
let application;
try {
  mkdirSync(fixture); mkdirSync(data);
  // Keep the production bootstrap and bundles, replacing only the addon with
  // the same adapter plus test-only drivers for real NSMenu/NSSlider events.
  cpSync(path.join(root, 'dist'), path.join(fixture, 'dist'), { recursive: true, filter: source => source !== path.join(root, 'dist/media') });
  symlinkSync(path.join(root, 'dist/media'), path.join(fixture, 'dist/media'));
  mkdirSync(path.join(fixture, 'ChihayaPet'));
  symlinkSync(path.join(root, 'ChihayaPet/Resources'), path.join(fixture, 'ChihayaPet/Resources'));
  writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ name: 'chihaya-menu-check', main: 'dist/main.cjs' }));
  const headers = path.resolve(path.dirname(realpathSync(process.execPath)), '../include/node');
  execFileSync('/usr/bin/xcrun', ['clang++', '-bundle', '-undefined', 'dynamic_lookup', '-fobjc-arc', '-O2', '-arch', 'arm64', '-mmacosx-version-min=26.0', '-framework', 'AppKit', '-I', headers, path.join(root, 'tests/fixtures/native-menu.mm'), '-o', path.join(fixture, 'dist/platform/MacWindow.node')], { stdio: 'inherit' });
  // The production QA domain is derived from the data-directory basename.
  const uniqueData = path.join(data, path.basename(work)); mkdirSync(uniqueData);
  const qaDomain = `local.ChihayaPet.QA.${path.basename(uniqueData).replace(/[^a-zA-Z\d]/g, '')}`;
  writeFileSync(path.join(work, 'domain'), qaDomain);
  execFileSync('/usr/bin/defaults', ['write', qaDomain, 'music.autoplayEnabled', '-bool', 'false']);
  execFileSync('/usr/bin/defaults', ['write', qaDomain, 'music.volume', '-float', '0']);
  execFileSync('/usr/bin/defaults', ['write', qaDomain, 'idle.enabled', '-bool', 'false']);
  mkdirSync(path.join(uniqueData, 'Music'));
  const tracks = [0, 1].map(i => ({ id: `00000000-0000-4000-8000-00000000000${i}`, title: `Silent fixture ${i + 1}`, fileName: `00000000-0000-4000-8000-00000000000${i}.wav` }));
  for (const track of tracks) execFileSync(path.join(root, 'dist/media/ffmpeg'), ['-v', 'error', '-f', 'lavfi', '-i', 'anullsrc', '-t', '30', path.join(uniqueData, 'Music', track.fileName)]);
  writeFileSync(path.join(uniqueData, 'Music/library.json'), JSON.stringify(tracks));
  application = await electron.launch({ args: [fixture], env: { ...process.env, CHIHAYA_QA: '1', CHIHAYA_QA_DATA: uniqueData, CHIHAYA_QA_REPLY: '1' }, timeout: 30_000 });
  const pet = await application.firstWindow();
  const snapshot = () => pet.evaluate(() => window.chihaya.snapshot());
  await pet.waitForFunction(() => window.chihaya?.snapshot().then(s => s.music.tracks.length === 2));
  const native = (method, value) => application.evaluate(({ app }, { method, value }) => {
    const path = process.getBuiltinModule('path'), require = process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(), 'package.json'));
    return require(path.join(app.getAppPath(), 'dist/platform/MacWindow.node'))[method](value);
  }, { method, value });
  const wait = async (predicate, command = 'size slider') => {
    const deadline = Date.now() + 5000;
    while (!predicate(await snapshot())) { if (Date.now() >= deadline) assert.fail(`Native menu command ${command} did not reach the expected application state.`); await new Promise(resolve => setTimeout(resolve, 20)); }
    // Wait for the coalesced menu and renderer publication, not animation.
    await new Promise(resolve => setTimeout(resolve, 80));
  };
  const choose = async (labels, predicate) => { await native('choose', JSON.stringify(labels)); await wait(predicate, labels.join(' → ')); };
  const page = kind => application.windows().find(window => new URL(window.url()).searchParams.get('window') === kind);
  const visible = kind => application.evaluate(({ BrowserWindow }, kind) => Boolean(BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes(`window=${kind}`))?.isVisible()), kind);

  await choose(['打开聊天'], s => s.chatVisible);
  const chat = page('chat'); await chat.waitForSelector('#input'); assert.equal(await visible('chat'), true);
  await choose(['设置…'], s => s.settingsVisible);
  const settings = page('settings'); await settings.waitForSelector('#baseURL'); assert.equal(await visible('settings'), true);
  await choose(['背景音乐…'], s => s.settingsTab === 'music');
  assert.equal(await settings.locator('[data-tab="music"]').getAttribute('aria-selected'), 'true');
  await choose(['服装／姿态', '冬服侧身'], s => s.desktop.outfit === 'b');
  await choose(['取景', '近景'], s => s.desktop.framing === 'close');
  await choose(['表情', '03 · 生气'], s => s.desktop.expression === '03');
  await choose(['角色大小', '320 点'], s => s.desktop.height === 320);
  await native('slide', 333); await wait(s => s.desktop.height === 333);
  assert.equal(await settings.locator('#height').inputValue(), '333');
  assert.equal(await settings.locator('#outfit').inputValue(), 'b');
  assert.equal(await settings.locator('#framing').inputValue(), 'close');
  assert.equal(await settings.locator('#expression').inputValue(), '03');
  const original = await snapshot();
  for (const [label, field] of [['置顶', 'onTop'], ['启用动效', 'animations'], ['摸头互动', 'headPetting']]) await choose([label], s => s.desktop[field] !== original.desktop[field]);
  await choose(['鼠标穿透'], s => s.clickThrough); await choose(['鼠标穿透'], s => !s.clickThrough);
  await choose(['主动闲话'], s => s.idleEnabled);
  await choose(['闲话频率', '安静'], s => s.idleFrequency === 3);
  await choose(['播放背景音乐'], s => s.music.wantsPlayback);
  await choose(['下一首'], s => s.music.selected === tracks[1].title + '.wav');
  await choose(['上一首'], s => s.music.selected === tracks[0].title + '.wav');
  await choose(['暂停背景音乐'], s => !s.music.wantsPlayback);
  await settings.locator('#close').click(); await chat.locator('#close').click(); await wait(s => !s.chatVisible && !s.settingsVisible);
  await choose(['说一句'], s => s.bubble?.kind === 'idle');
  await page('bubble').locator('.bubble-close').evaluate(button => button.click()); await wait(s => !s.bubble, 'dismiss idle bubble');
  await choose(['隐藏桌宠'], s => !s.visible); assert.equal(await visible('pet'), false);
  await choose(['显示桌宠'], s => s.visible); assert.equal(await visible('pet'), true);
  await choose(['打开聊天'], s => s.chatVisible); assert.equal(await visible('chat'), true);
  assert.equal(Number(execFileSync('/usr/bin/defaults', ['read', qaDomain, 'desktop.imageHeight'], { encoding: 'utf8' })), 333);
  const quit = application.waitForEvent('close');
  const exit = new Promise(resolve => application.process().once('exit', (code, signal) => resolve({ code, signal })));
  await native('choose', JSON.stringify(['退出千早桌宠'])); await quit;
  assert.deepEqual(await exit, { code: 0, signal: null }, 'Quit must exit cleanly after the native callback.');
  application = undefined;
  console.log('Native menu verified: chat/settings, music tab, outfit/framing/expression, size preset/slider, toggles, idle, playback/previous/next, hide/show and quit. No visual checks or screenshots.');
} finally {
  await application?.close();
  // All preference writes use a disposable QA domain, never local.ChihayaPet.
  if (existsSync(path.join(work, 'domain'))) execFileSync('/usr/bin/defaults', ['delete', readFileSync(path.join(work, 'domain'), 'utf8')], { stdio: 'ignore' });
  rmSync(work, { recursive: true, force: true });
}
