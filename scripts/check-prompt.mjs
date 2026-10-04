import { _electron as electron } from 'playwright-core';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const data = mkdtempSync(path.join(os.tmpdir(), 'chihaya-prompt-runtime-'));
const file = path.join(data, 'chihaya_prompt.md');
const domain = `local.ChihayaPet.QA.${path.basename(data).replace(/[^a-zA-Z\d]/g, '')}`;
const initial = '# 千早\n\n启动读取的角色设定。\n';
const saved = '# 千早\n\n菜单保存的角色设定。\n';
const external = '# 千早\n\n运行中编辑、重启后生效的角色设定。\n';
let app;

async function start() {
  const executablePath = process.env.CHIHAYA_QA_EXECUTABLE;
  app = await electron.launch({ args: executablePath ? [] : [root], executablePath, env: { ...process.env, CHIHAYA_QA: '1', CHIHAYA_QA_DATA: data }, timeout: 30_000 });
  // Automate the save confirmation while retaining the real settings/IPC/file path.
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
  const pet = await app.firstWindow();
  await pet.waitForFunction(() => Boolean(window.chihaya));
  const opened = app.waitForEvent('window');
  await pet.evaluate(() => window.chihaya.act({ type: 'settings', tab: 'persona' }));
  const settings = await opened;
  await settings.waitForSelector('#prompt');
  await settings.waitForFunction(() => document.querySelector('[data-tab="persona"]').getAttribute('aria-selected') === 'true');
  return settings;
}

try {
  writeFileSync(file, initial);
  let settings = await start();
  assert.equal(await settings.locator('#prompt').inputValue(), initial);
  assert.equal(readFileSync(file, 'utf8'), initial, 'Startup must not rewrite the prompt file.');
  await settings.locator('#prompt').fill(saved);
  await settings.locator('#save-prompt').click();
  await settings.waitForFunction(() => window.chihaya.snapshot().then(s => s.settingsNotice?.includes('已保存')));
  assert.equal(readFileSync(file, 'utf8'), saved, 'The settings save action must write the bound file.');

  writeFileSync(file, external);
  await settings.evaluate(() => window.chihaya.act({ type: 'close', window: 'settings' }));
  const pet = app.windows().find(page => new URL(page.url()).searchParams.get('window') === 'pet');
  assert.ok(pet);
  await pet.evaluate(() => window.chihaya.act({ type: 'settings', tab: 'persona' }));
  await settings.waitForFunction(() => window.chihaya.snapshot().then(s => s.settingsVisible));
  await settings.waitForSelector('#prompt');
  assert.equal(await settings.locator('#prompt').inputValue(), saved, 'Reopening settings must keep the running prompt.');
  assert.equal(readFileSync(file, 'utf8'), external);
  await app.close(); app = undefined;

  settings = await start();
  assert.equal(await settings.locator('#prompt').inputValue(), external, 'The next process must read the external edit.');
  assert.equal(readFileSync(file, 'utf8'), external);
  assert.equal(readFileSync(path.join(data, 'FILES.txt'), 'utf8').includes(file), true);
  console.log('Prompt verified: startup file load, settings save, running prompt retained after external edit, next-launch reload, and actual file path in FILES.txt.');
} finally {
  await app?.close();
  if (process.platform === 'darwin') {
    try { execFileSync('/usr/bin/defaults', ['delete', domain], { stdio: 'ignore' }); } catch {}
  }
  rmSync(data, { recursive: true, force: true });
}
