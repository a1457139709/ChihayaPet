import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { Platform } from '../app/platform/native.ts';

test('Windows focus capture never starts a shell process', context => {
  let launches = 0;
  context.mock.method(childProcess, 'execFileSync', () => { launches++; return '123'; });
  syncBuiltinESMExports();
  try {
    let reads = 0;
    const platform = new Platform('win32', '/unused', '/unused/preferences.json', undefined, { foreground: () => { reads++; return null; }, isWindow: () => false, processID: () => 0, activate() {} });
    platform.rememberFocus();
    assert.equal(reads, 1, 'Capture reaches the native API boundary');
    assert.equal(launches, 0, 'Focus capture must call Windows directly');
  } finally { context.mock.restoreAll(); syncBuiltinESMExports(); }
});

import { WindowsFocus, type WindowHandle } from '../app/platform/windows-focus.ts';
test('focus restore respects user switches, expired handles and captures fresh ownership', () => {
  let current: WindowHandle = 0x20000000000001n;
  const original = current, own = 2n, other = 3n;
  const owners = new Map([[original, 42], [own, 100], [other, 43]]);
  const activated: WindowHandle[] = [];
  const focus = new WindowsFocus({ foreground: () => current, isWindow: w => owners.has(w!), processID: w => owners.get(w!) ?? 0, activate: w => { activated.push(w); } }, 100);
  focus.remember(); current = own; focus.restore();
  assert.deepEqual(activated, [original], 'Pointer-sized handles retain precision');
  focus.restore(); assert.equal(activated.length, 1, 'Each capture is consumed once');
  current = original; focus.remember(); current = other; focus.restore();
  assert.equal(activated.length, 1, 'Clicking another application must not steal focus');
  current = original; focus.remember(); owners.set(original, 99); current = own; focus.restore();
  assert.equal(activated.length, 1, 'A reused window handle is not the original owner');
  current = original; focus.remember(); owners.delete(original); current = own; focus.restore();
  assert.equal(activated.length, 1, 'Closed target windows are ignored');
  current = own; focus.remember(); current = null; focus.restore();
  assert.equal(activated.length, 1, 'Our own panels are not captured');
});
