import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bubbleFrame, nearbyPanel } from '../app/shared/geometry.ts';

test('visible bubble tips include ornament margins and follow the mouth after screen clamping', () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 };
  const speech = { mouth: [200, 80], hairLeft: 100, hairRight: 300 };
  const size = { width: 278, height: 300 };
  const left = bubbleFrame({ x: 500, y: -12, width: 630, height: 630 }, area, speech, 606, 606, size);
  assert.equal(left.side, 'left');
  assert.equal(left.x, 342);
  assert.equal(left.y, 0);
  assert.equal(left.tailY, 80);
  const right = bubbleFrame({ x: -80, y: 200, width: 630, height: 630 }, area, speech, 606, 606, size);
  assert.equal(right.side, 'right');
  assert.equal(right.x, 224);
  assert.equal(right.y + right.tailY, 292);
  assert.deepEqual(nearbyPanel({ x: 1430, y: 890, width: 280, height: 280 }, area, { width: 360, height: 420 }), { x: 1062, y: 480, width: 360, height: 420 });
});

test('real window bounds cannot overwrite newly calculated chat and bubble positions', () => {
  const pet = { x: 100, y: 100, width: 180, height: 280 }, area = { x: 0, y: 0, width: 1440, height: 900 };
  const dimensions = { width: 278, height: 180 }, oldBounds = { ...dimensions, x: 600, y: 350 };
  const speech = { mouth: [100, 100], hairLeft: 0, hairRight: 200 };
  assert.deepEqual(nearbyPanel(pet, area, oldBounds), nearbyPanel(pet, area, dimensions));
  assert.deepEqual(bubbleFrame(pet, area, speech, 500, 256, oldBounds), bubbleFrame(pet, area, speech, 500, 256, dimensions));
});
