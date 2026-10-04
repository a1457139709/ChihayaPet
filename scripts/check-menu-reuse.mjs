// Exercise the real menu renderer across reopen cycles in Electron. Uses no
// personal data, network services, screenshots or production application state.
import { _electron as electron } from 'playwright-core';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const work = mkdtempSync(path.join(os.tmpdir(), 'chihaya-menu-reuse-'));
let application;
try {
  await build({ stdin: { contents: `import { mountMenu } from './app/renderer/menu';
    window.actions = []; window.menu = mountMenu(document.getElementById('app'), a => window.actions.push(a));`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'browser', outfile: path.join(work, 'menu.js') });
  writeFileSync(path.join(work, 'index.html'), '<div id="app"></div><script src="menu.js"></script>');
  writeFileSync(path.join(work, 'main.cjs'), `const {app,BrowserWindow}=require('electron'); app.setPath('userData', ${JSON.stringify(path.join(work, 'Data'))}); app.whenReady().then(()=>{const w=new BrowserWindow({show:false});w.loadFile(${JSON.stringify(path.join(work, 'index.html'))});});`);
  application = await electron.launch({ args: [path.join(work, 'main.cjs')] });
  const page = await application.firstWindow();
  await page.waitForFunction(() => Boolean(window.menu));
  const state = { menuSession: 1, desktop: { outfit: 'a', framing: 'full', expression: '00', height: 256, onTop: true, animations: true, headPetting: true }, outfits: [{ id: 'a', name: '冬服' }], expressions: [], music: { tracks: [], wantsPlayback: false }, idleFrequency: 2, visible: true };
  await page.evaluate(s => window.menu.render(s), state);
  const clickSize = () => page.getByRole('menuitem').filter({ hasText: '角色大小' }).evaluate(button => button.click());
  await clickSize();
  await page.locator('input[type=range]').evaluate(input => { input.focus(); input.value = '333'; input.dispatchEvent(new Event('input')); });
  assert.ok(await page.evaluate(() => window.actions.some(a => a.type === 'desktop' && a.field === 'height' && a.value === 333)));
  await page.evaluate(s => window.menu.render(s), { ...state, desktop: { ...state.desktop, height: 333 } });
  assert.equal(await page.locator('input[type=range]').count(), 1, 'State refresh preserves active slider');
  await page.evaluate(s => window.menu.render(s), { ...state, menuSession: 2, desktop: { ...state.desktop, height: 400 }, music: { tracks: [], wantsPlayback: true } });
  assert.equal(await page.locator('input[type=range]').count(), 0, 'Reopen resets the submenu even while the old slider had focus');
  assert.equal(await page.getByRole('menuitem').filter({ hasText: '暂停背景音乐' }).count(), 1, 'Reopen renders current state');
  await clickSize();
  assert.equal(await page.locator('input[type=range]').inputValue(), '400');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(await page.locator('input[type=range]').count(), 0, 'Escape goes back from submenu');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.ok(await page.evaluate(() => window.actions.some(a => a.type === 'close' && a.window === 'menu')));
  console.log('Menu renderer reuse passed: slider continuity, fresh state, submenu reset and Escape.');
} finally { await application?.close(); rmSync(work, { recursive: true, force: true }); }
