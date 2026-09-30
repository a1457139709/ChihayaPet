'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pet = require('../src/renderer/pet.js');
const panel = require('../src/renderer/panel.js');
const bubble = require('../src/renderer/bubble.js');

function panelInBrowserlessVM() {
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/panel.js'), 'utf8');
  const context = {
    module: {exports: {}},
    Intl,
    Promise,
    Math,
    Date,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, context, {filename: 'panel.js'});
  return context.module.exports;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return {promise, resolve, reject};
}

test('pet frame spec preserves manifest dimensions and face offsets', () => {
  const variant = {
    width: 268,
    height: 606,
    body: 'assets/body-a-full.png',
    faceOffset: [79, 76],
    faceSize: [122, 104],
    frames: { smile: { half: { medium: 'assets/face-smile.png' } } },
  };

  assert.deepEqual(pet.frameSpec(variant, 'smile', 'half', 'medium'), {
    width: 268,
    height: 606,
    body: 'assets/body-a-full.png',
    face: 'assets/face-smile.png',
    faceX: 79,
    faceY: 76,
    faceWidth: 122,
    faceHeight: 104,
  });
});

test('automatic expression follows speaking and waiting state', () => {
  assert.equal(pet.resolveExpression('automatic', false, false), 'neutral');
  assert.equal(pet.resolveExpression('automatic', true, false), 'serious');
  assert.equal(pet.resolveExpression('automatic', true, true), 'smile');
  assert.equal(pet.resolveExpression('surprised', true, true), 'surprised');
});

test('pet canvas uses device pixels while preserving DIP layout geometry', () => {
  assert.deepEqual(pet.canvasGeometry({width: 268, height: 606}, 256, 1.5), {
    displayWidth: 114,
    displayHeight: 256,
    backingWidth: 171,
    backingHeight: 384,
    imageScale: 256 / 606,
    pixelRatio: 1.5,
  });
});

test('drag reducer distinguishes a click from a four-DIP drag', () => {
  let state = pet.dragTransition(null, {type: 'down', x: 20, y: 30}).state;
  let result = pet.dragTransition(state, {type: 'move', x: 23, y: 30});
  assert.deepEqual(result.effects, []);

  result = pet.dragTransition(result.state, {type: 'up', x: 23, y: 30});
  assert.deepEqual(result.effects, [{action: 'petClick'}]);

  state = pet.dragTransition(null, {type: 'down', x: 20, y: 30}).state;
  result = pet.dragTransition(state, {type: 'move', x: 24, y: 30});
  assert.deepEqual(result.effects, [
    {action: 'dragStart', payload: {x: 20, y: 30}},
    {action: 'dragMove', payload: {x: 24, y: 30}},
  ]);
  result = pet.dragTransition(result.state, {type: 'up', x: 25, y: 31});
  assert.deepEqual(result.effects, [
    {action: 'dragMove', payload: {x: 25, y: 31}},
    {action: 'dragEnd'},
  ]);
});

test('pet effects stay ordered when an earlier IPC invocation is pending', async () => {
  const first = deferred();
  const calls = [];
  const enqueue = pet.createEffectQueue(effect => {
    calls.push(effect.action);
    return effect.action === 'dragStart' ? first.promise : Promise.resolve();
  });
  const moving = enqueue([{action: 'dragStart'}, {action: 'dragMove'}]);
  const ending = enqueue([{action: 'dragEnd'}]);
  await Promise.resolve();
  assert.deepEqual(calls, ['dragStart']);
  first.resolve();
  await Promise.all([moving, ending]);
  assert.deepEqual(calls, ['dragStart', 'dragMove', 'dragEnd']);
});

test('untouched service key is omitted while an explicitly cleared key is sent', () => {
  const draft = {baseURL: ' https://example.test/v1 ', model: ' model ', apiKey: ''};
  assert.deepEqual(panel.servicePayload(draft, false), {
    baseURL: ' https://example.test/v1 ',
    model: ' model ',
  });
  assert.deepEqual(panel.servicePayload(draft, true), {
    baseURL: ' https://example.test/v1 ',
    model: ' model ',
    apiKey: '',
  });
});

test('audio reconciliation does nothing on an unrelated snapshot', () => {
  const previous = {selectedId: 'one', url: 'file:///Music/one.mp3', shouldPlay: true};
  assert.deepEqual(panel.playbackTransition(previous, previous), []);
  assert.deepEqual(panel.playbackTransition(previous, {...previous, shouldPlay: false}), ['pause']);
  assert.deepEqual(panel.playbackTransition(previous, {
    selectedId: 'two', url: 'file:///Music/two.mp3', shouldPlay: true,
  }), ['source', 'play']);
  assert.deepEqual(panel.playbackTransition(previous, previous, true), ['play']);
});

test('panel draft reports only meaningful unsent text', () => {
  assert.equal(panel.hasPanelDraft('   \n'), false);
  assert.equal(panel.hasPanelDraft(' 等一下 '), true);
});

test('audio coordinator ignores stale play rejection after a track switch', async () => {
  const browserPanel = panelInBrowserlessVM();
  const plays = [];
  const errors = [];
  const scheduled = [];
  const audio = {
    src: '', volume: 0.2, loop: false, ended: false,
    pause() {}, load() {}, removeAttribute() { this.src = ''; },
    play() { const call = deferred(); plays.push(call); return call.promise; },
  };
  const coordinator = browserPanel.createAudioCoordinator(audio, {
    onError: message => errors.push(message),
    schedule: callback => { scheduled.push(callback); return callback; },
    cancelSchedule: () => {},
  });

  coordinator.reconcile({selectedId: 'a', url: 'file:///a.mp3', shouldPlay: true}, 0.2, false);
  coordinator.reconcile({selectedId: 'b', url: 'file:///b.mp3', shouldPlay: true}, 0.2, false);
  plays[0].reject(new Error('old decoder failure'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(errors.length, 0);
  assert.equal(scheduled.length, 0);

  plays[1].reject(new Error('current decoder failure'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(errors.length, 1);
});

test('audio coordinator keeps a later pause authoritative over a stale play resolve', async () => {
  const browserPanel = panelInBrowserlessVM();
  const play = deferred();
  let pauses = 0;
  const scheduled = [];
  const audio = {
    src: '', volume: 0.2, loop: false, ended: false,
    pause() { pauses += 1; }, load() {}, removeAttribute() { this.src = ''; },
    play() { return play.promise; },
  };
  const coordinator = browserPanel.createAudioCoordinator(audio, {
    onError: () => assert.fail('stale play must not report an error'),
    schedule: callback => { scheduled.push(callback); return callback; },
    cancelSchedule: () => {},
  });

  coordinator.reconcile({selectedId: 'a', url: 'file:///a.mp3', shouldPlay: true}, 0.2, false);
  coordinator.reconcile({selectedId: 'a', url: 'file:///a.mp3', shouldPlay: false}, 0.2, false);
  assert.ok(pauses >= 2, 'source replacement and suspension both pause immediately');
  play.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(pauses >= 3, 'stale play completion reasserts the later pause');
  assert.equal(scheduled.length, 0, 'stale completion cannot start a fade');
});

test('chat submission respects IME composition and counts graphemes', () => {
  assert.equal(panel.shouldSubmitKey({key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13}), true);
  assert.equal(panel.shouldSubmitKey({key: 'Enter', shiftKey: false, isComposing: true, keyCode: 13}), false);
  assert.equal(panel.shouldSubmitKey({key: 'Enter', shiftKey: false, isComposing: false, keyCode: 229}), false);
  assert.equal(panel.shouldSubmitKey({key: 'Enter', shiftKey: true, isComposing: false, keyCode: 13}), false);
  assert.equal(panel.graphemeCount('👨‍👩‍👧‍👦'.repeat(2000)), 2000);
  assert.equal(panel.canSendText('👨‍👩‍👧‍👦'.repeat(2000)), true);
  assert.equal(panel.canSendText('👨‍👩‍👧‍👦'.repeat(2001)), false);
});

test('startup greeting is chosen once from the bounded catalog', () => {
  assert.equal(panel.chooseGreeting(() => 0), '贵安。今天想聊些什么？');
  assert.equal(panel.chooseGreeting(() => 0.999), '如果只是想安静地待一会儿，也很好。');
});

test('bubble typing timing respects punctuation and reduced motion', () => {
  assert.equal(bubble.typingDelay('字'), 42);
  assert.equal(bubble.typingDelay('，'), 130);
  assert.equal(bubble.typingDelay('。'), 240);
  assert.equal(bubble.shouldType({animations: true}, false), true);
  assert.equal(bubble.shouldType({animations: true}, true), false);
  assert.equal(bubble.shouldType({animations: false}, false), false);
  assert.equal(bubble.typingTransition('same', 'same', true, false), 'finish');
  assert.equal(bubble.typingTransition('same', 'same', false, false), 'none');
  assert.equal(bubble.typingTransition('old', 'new', false, true), 'start');
});
