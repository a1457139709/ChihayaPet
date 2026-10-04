import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Companion } from '../app/main/companion.ts';
import { ConfigStore, JSONPreferences, PromptStore } from '../app/main/storage.ts';
import { defaultPrompt } from '../app/shared/contracts.ts';

test('startup reads the project prompt file', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-prompt-startup-'));
  let app: Companion | undefined;
  try {
    const prompt = '# 千早\n文件里的角色设定。\n';
    writeFileSync(path.join(root, 'chihaya_prompt.md'), prompt);
    app = new Companion(new ConfigStore(path.join(root, 'config.json')), new PromptStore(path.join(root, 'chihaya_prompt.md')));
    app.beginSettings();
    assert.equal(app.snapshot().draft.prompt === prompt, true, 'Startup must load chihaya_prompt.md into settings.');
  } finally { app?.shutdown(); rmSync(root, { recursive: true, force: true }); }
});

test('saving the prompt from settings writes the project prompt file', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-prompt-save-'));
  let app: Companion | undefined;
  try {
    const file = path.join(root, 'chihaya_prompt.md');
    writeFileSync(file, '启动时的设定');
    app = new Companion(new ConfigStore(path.join(root, 'config.json')), new PromptStore(file));
    app.beginSettings(); app.setDraft('prompt', '菜单保存的设定');
    assert.equal(app.savePrompt(), true);
    assert.equal(readFileSync(file, 'utf8'), '菜单保存的设定');
  } finally { app?.shutdown(); rmSync(root, { recursive: true, force: true }); }
});

test('prompt file is loaded at startup, saved from settings, and external edits apply on restart', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-prompt-'));
  const file = path.join(root, 'chihaya_prompt.md');
  const config = new ConfigStore(path.join(root, 'config.json'));
  const preferences = new JSONPreferences(path.join(root, 'preferences.json'));
  const initial = '# 千早\n\n启动时读取的角色设定。\n';
  const saved = '# 千早\n\n菜单保存的角色设定。\n';
  const external = '# 千早\n\n运行中从文件修改的角色设定。\n';
  let sentPrompt: string | undefined;
  const start = () => new Companion(config, new PromptStore(file), async (_url, options) => {
    sentPrompt = JSON.parse(String(options?.body)).messages[0].content;
    return new Response('{"choices":[{"message":{"content":"收到"}}]}');
  });
  const apps: Companion[] = [];
  try {
    config.saveService('https://example.com/v1', 'fixture-model', 'fixture-key');
    preferences.save({ 'persona.prompt': '旧偏好中的角色设定' });
    writeFileSync(file, initial);
    const app = start(); apps.push(app);
    assert.equal(app.snapshot().draft.prompt, initial);
    app.beginSettings();
    assert.equal(app.snapshot().draft.prompt, initial, 'Settings must show the prompt loaded from the project file.');
    app.setInput('启动后聊天'); await app.send();
    assert.equal(sentPrompt, initial);

    app.setDraft('prompt', saved);
    assert.equal(app.savePrompt(), true);
    assert.equal(readFileSync(file, 'utf8'), saved, 'Saving from settings must update the same Markdown file.');
    assert.equal(preferences.load()['persona.prompt'], '旧偏好中的角色设定');
    app.setInput('保存后聊天'); await app.send();
    assert.equal(sentPrompt, saved);

    writeFileSync(file, external);
    app.beginSettings();
    assert.equal(app.snapshot().draft.prompt, saved, 'Opening settings must preserve the running prompt until restart.');
    app.setInput('运行中聊天'); await app.send();
    assert.equal(sentPrompt, saved);
    assert.equal(readFileSync(file, 'utf8'), external);
    app.shutdown();

    const restarted = start(); apps.push(restarted);
    restarted.beginSettings();
    assert.equal(restarted.snapshot().draft.prompt, external);
    restarted.setInput('重启后聊天'); await restarted.send();
    assert.equal(sentPrompt, external);
    assert.equal(readFileSync(file, 'utf8'), external, 'Startup must not rewrite the prompt file.');
  } finally {
    for (const app of apps) app.shutdown();
    rmSync(root, { recursive: true, force: true });
  }
});

test('restoring the default prompt writes the file and clears the conversation', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-prompt-restore-'));
  const file = path.join(root, 'chihaya_prompt.md');
  const config = new ConfigStore(path.join(root, 'config.json'));
  let app: Companion | undefined;
  try {
    writeFileSync(file, '自定义角色设定');
    config.saveService('https://example.com/v1', 'fixture-model', 'fixture-key');
    app = new Companion(config, new PromptStore(file), async () => new Response('{"choices":[{"message":{"content":"收到"}}]}'));
    app.setInput('你好'); await app.send();
    assert.equal(app.snapshot().turns.length, 1);
    app.beginSettings(); app.setDraft('prompt', '未保存的草稿');
    assert.equal(app.savePrompt(true), true);
    assert.equal(readFileSync(file, 'utf8'), defaultPrompt);
    assert.equal(app.snapshot().draft.prompt, defaultPrompt);
    assert.equal(app.snapshot().turns.length, 0);
  } finally { app?.shutdown(); rmSync(root, { recursive: true, force: true }); }
});

test('a failed prompt file save keeps the current prompt and conversation active', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-prompt-failure-'));
  const file = path.join(root, 'chihaya_prompt.md');
  const config = new ConfigStore(path.join(root, 'config.json'));
  let sentPrompt: string | undefined;
  let app: Companion | undefined;
  try {
    writeFileSync(file, '正在使用的角色设定');
    config.saveService('https://example.com/v1', 'fixture-model', 'fixture-key');
    app = new Companion(config, new PromptStore(file), async (_url, options) => {
      sentPrompt = JSON.parse(String(options?.body)).messages[0].content;
      return new Response('{"choices":[{"message":{"content":"收到"}}]}');
    });
    app.setInput('你好'); await app.send();
    app.beginSettings(); app.setDraft('prompt', '保存失败的草稿');
    rmSync(file); mkdirSync(file);
    assert.equal(app.savePrompt(), false);
    assert.match(app.snapshot().settingsError ?? '', /提示词/);
    assert.equal(app.snapshot().settingsNotice, undefined);
    assert.equal(app.snapshot().turns.length, 1);
    assert.equal(app.snapshot().draft.prompt, '保存失败的草稿');
    app.setInput('继续聊天'); await app.send();
    assert.equal(sentPrompt, '正在使用的角色设定');
  } finally { app?.shutdown(); rmSync(root, { recursive: true, force: true }); }
});

test('missing prompt uses the default without creating a file; an empty file remains an empty prompt', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-prompt-empty-'));
  const file = path.join(root, 'chihaya_prompt.md');
  const config = new ConfigStore(path.join(root, 'config.json'));
  const prompts = new PromptStore(file);
  const apps: Companion[] = [];
  try {
    const missing = new Companion(config, prompts); apps.push(missing);
    missing.beginSettings(); assert.equal(missing.snapshot().draft.prompt, defaultPrompt);
    assert.equal(existsSync(file), false);
    writeFileSync(file, '');
    const empty = new Companion(config, prompts); apps.push(empty);
    empty.beginSettings(); assert.equal(empty.snapshot().draft.prompt, '');
  } finally { for (const app of apps) app.shutdown(); rmSync(root, { recursive: true, force: true }); }
});

test('prompt read errors stay visible when opening settings and can be resolved by saving', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chihaya-prompt-read-error-'));
  const file = path.join(root, 'chihaya_prompt.md');
  let app: Companion | undefined;
  try {
    mkdirSync(file);
    app = new Companion(new ConfigStore(path.join(root, 'config.json')), new PromptStore(file));
    app.beginSettings();
    assert.match(app.snapshot().settingsError ?? '', /提示词/);
    rmSync(file, { recursive: true });
    app.setDraft('prompt', '修复后的角色设定'); assert.equal(app.savePrompt(), true);
    app.beginSettings();
    assert.equal(app.snapshot().settingsError, undefined);
    assert.equal(readFileSync(file, 'utf8'), '修复后的角色设定');
  } finally { app?.shutdown(); rmSync(root, { recursive: true, force: true }); }
});
