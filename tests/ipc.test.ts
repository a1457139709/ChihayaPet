import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validAction } from '../app/main/ipc.ts';

test('restored controls accept valid settings, head-petting and consumed-focus actions only from their windows', () => {
  assert.equal(validAction({ type: 'desktop', field: 'headPetting', value: true }, 'settings'), true);
  assert.equal(validAction({ type: 'desktop', field: 'headPetting', value: 'true' }, 'settings'), false);
  assert.equal(validAction({ type: 'settings', tab: 'music' }, 'chat'), true);
  assert.equal(validAction({ type: 'settings', tab: 'files' }, 'chat'), false);
  assert.equal(validAction({ type: 'settings-tab', tab: 'portrait' }, 'settings'), true);
  assert.equal(validAction({ type: 'settings-tab', tab: 'portrait' }, 'pet'), false);
  assert.equal(validAction({ type: 'chat-focus-consumed', id: 'request-id' }, 'chat'), true);
  assert.equal(validAction({ type: 'chat-focus-consumed', id: 'request-id' }, 'settings'), false);
  assert.equal(validAction({ type: 'files' }, 'chat'), false);
});

test('menu sizing accepts finite bounded heights only from the menu window', () => {
  assert.equal(validAction({ type: 'menu-size', height: 178 }, 'menu'), true);
  assert.equal(validAction({ type: 'menu-size', height: 178 }, 'chat'), false);
  for (const height of [NaN, Infinity, 59, 2001, '178']) assert.equal(validAction({ type: 'menu-size', height }, 'menu'), false);
});
