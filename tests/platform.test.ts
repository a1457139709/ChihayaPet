import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, renameSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolvePaths, initializePaths } from '../app/main/paths.ts';
import { ConfigStore } from '../app/main/storage.ts';
import { fromMacOrigin, toMacOrigin, clamped, bubbleFrame } from '../app/shared/geometry.ts';
import { inputCommand, validateInput } from '../app/shared/text.ts';
import { IdleCatalog, idleAllowed, idleDelay } from '../app/shared/idle.ts';

test('custom persona belongs to the local data directory and never overwrites build source', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'chihaya-prompt-paths-'));
  try {
    const projectRoot = path.join(root, 'project'); mkdirSync(projectRoot);
    writeFileSync(path.join(projectRoot, 'package.json'), '{}');
    for (const packaged of [false, true]) {
      const options = { platform: 'darwin' as const, packaged, executable: '/Applications/ChihayaPet.app/Contents/MacOS/ChihayaPet', appPath: packaged ? '/Applications/ChihayaPet.app/Contents/Resources/app.asar' : path.join(projectRoot, 'dist'), home: root };
      const paths = resolvePaths(options);
      assert.equal(paths.prompt, path.join(paths.root, 'persona.md'));
      const qaRoot = path.join(root, 'qa');
      assert.equal(resolvePaths({ ...options, qaRoot }).prompt, path.join(qaRoot, 'persona.md'));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('portable data follows the executable directory when the entire Windows folder moves', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'chihaya-portable-'));
  try {
    const original = path.join(root, 'first'); mkdirSync(original);
    const paths = resolvePaths({ platform: 'win32', packaged: true, executable: path.join(original, 'ChihayaPet.exe'), appPath: path.join(original, 'resources/app.asar') }); initializePaths(paths);
    assert.ok(statSync(paths.music).isDirectory(), 'First startup creates the music import directory');
    new ConfigStore(paths.config).saveService('https://example.com/v1', 'model', 'synthetic');
    const moved = path.join(root, 'moved'); renameSync(original, moved);
    const next = resolvePaths({ platform: 'win32', packaged: true, executable: path.join(moved, 'ChihayaPet.exe'), appPath: path.join(moved, 'resources/app.asar') });
    assert.equal(new ConfigStore(next.config).key('https://example.com/v1'), 'synthetic');
    for (const key of ['root', 'config', 'prompt', 'preferences', 'music', 'runtime', 'session', 'cache', 'logs', 'crashes', 'temp'] as const) assert.equal(next[key].startsWith(moved + path.sep), true);
    assert.equal(next.files, path.join(moved, 'FILES.txt'));
    const mac = resolvePaths({ platform: 'darwin', packaged: true, executable: '/custom/ChihayaPet.app/Contents/MacOS/ChihayaPet', appPath: '/custom/ChihayaPet.app', home: '/Users/example' });
    assert.equal(mac.config, '/Users/example/Library/Application Support/ChihayaPet/config.json');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('an unwritable portable Data location reports relocation instead of silently using user folders', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'chihaya-readonly-'));
  try {
    writeFileSync(path.join(root, 'Data'), 'blocking-file');
    const paths = resolvePaths({ platform: 'win32', packaged: true, executable: path.join(root, 'ChihayaPet.exe'), appPath: path.join(root, 'resources/app.asar') });
    assert.throws(() => initializePaths(paths), /整个应用文件夹/);
    assert.equal(readFileSync(path.join(root, 'Data'), 'utf8'), 'blocking-file');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('Mac bottom-left position survives migration; unplugged or scaled displays clamp visible windows', () => {
  const frame = fromMacOrigin({ x: 1800, y: 30 }, { width: 200, height: 280 }, 1000);
  assert.deepEqual(frame, { x: 1800, y: 690, width: 200, height: 280 });
  assert.deepEqual(toMacOrigin(frame, 1000), { x: 1800, y: 30 });
  assert.deepEqual(clamped(frame, { x: 0, y: 24, width: 1440, height: 900 }), { x: 1240, y: 644, width: 200, height: 280 });
  const bubble = bubbleFrame({ x: 0, y: 400, width: 280, height: 280 }, { x: 0, y: 0, width: 1440, height: 900 }, { mouth: [100, 100], hairLeft: 50, hairRight: 150 }, 606, 256, { width: 296, height: 160 });
  assert.equal(bubble.side, 'right'); assert.ok(bubble.x >= 0 && bubble.y >= 0);
});
test('composition confirmation never sends or closes; idle speech avoids drafts and eight recent lines', () => {
  assert.equal(inputCommand({ key: 'Enter', shiftKey: false, isComposing: true }, false), undefined);
  assert.equal(inputCommand({ key: 'Escape', shiftKey: false, isComposing: false, keyCode: 229 }, false), undefined);
  assert.equal(inputCommand({ key: 'Enter', shiftKey: true, isComposing: false }, false), undefined);
  assert.equal(inputCommand({ key: 'Enter', shiftKey: false, isComposing: false }, false), 'send');
  validateInput('👩🏽‍💻'.repeat(2_000)); assert.throws(() => validateInput('👩🏽‍💻'.repeat(2_001)));
  const context = { visible: true, awake: true, clickThrough: false, chat: false, settings: false, input: '', busy: false, bubble: false };
  assert.equal(idleAllowed(context), true);
  for (const field of ['clickThrough', 'chat', 'settings', 'busy', 'bubble']) assert.equal(idleAllowed({ ...context, [field]: true }), false);
  assert.equal(idleAllowed({ ...context, input: ' ' }), false);
  const catalog = new IdleCatalog(), lines = Array.from({ length: 9 }, () => catalog.next(12, () => 0));
  assert.equal(new Set(lines).size, 9); assert.equal(idleDelay(1, () => 0), 60_000); assert.equal(idleDelay(3, () => 1), 900_000);
});
