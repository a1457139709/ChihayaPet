'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const { PassThrough } = require('node:stream');
const test = require('node:test');

const { ChatController, requestCompletion } = require('../src/core/chat.cjs');

const SERVICE = {
  baseURL: 'https://example.com/v1',
  model: 'fixture-model',
  apiKey: 'fixture-secret',
};

function deferredRequest() {
  const calls = [];
  const request = (input) => new Promise((resolve, reject) => {
    calls.push({ ...input, resolve, reject });
  });
  return { calls, request };
}

function makeController(request, changes = []) {
  return new ChatController({
    getService: () => ({ ...SERVICE }),
    getPrompt: () => '角色设定',
    onChange: (...args) => changes.push(args),
    request,
  });
}

function jsonReply(text, finishReason = 'stop') {
  return JSON.stringify({
    choices: [{ message: { role: 'assistant', content: text }, finish_reason: finishReason }],
  });
}

function installHTTPS(t, responseFactory) {
  const requests = [];
  t.mock.method(https, 'request', (options, callback) => {
    const request = new EventEmitter();
    request.destroyed = false;
    request.setTimeout = () => request;
    request.destroy = (error) => {
      if (request.destroyed) return;
      request.destroyed = true;
      if (error) queueMicrotask(() => request.emit('error', error));
    };
    request.end = (body) => {
      request.body = Buffer.from(body || '');
      requests.push(request);
      queueMicrotask(() => {
        if (request.destroyed) return;
        const response = responseFactory({ options, request });
        if (!response) return;
        callback(response);
      });
    };
    request.options = options;
    return request;
  });
  return requests;
}

function response(statusCode, chunks, headers = {}) {
  const stream = new PassThrough();
  stream.statusCode = statusCode;
  stream.headers = headers;
  queueMicrotask(() => {
    for (const chunk of chunks) stream.write(chunk);
    stream.end();
  });
  return stream;
}

test('send streams a pending reply and commits only a successful complete turn', async () => {
  const changes = [];
  const network = deferredRequest();
  const chat = makeController(network.request, changes);

  const sending = chat.send('你好');
  assert.equal(network.calls.length, 1);
  assert.deepEqual(chat.snapshot(), {
    turns: [],
    pending: { id: chat.snapshot().pending.id, user: '你好', assistant: '', complete: false },
    busy: true,
    error: '',
  });
  assert.deepEqual(network.calls[0].messages, [
    { role: 'system', content: '角色设定' },
    { role: 'user', content: '你好' },
  ]);
  assert.equal(network.calls[0].stream, true);

  network.calls[0].onDelta('你');
  network.calls[0].onDelta('好呀');
  assert.equal(chat.snapshot().pending.assistant, '你好呀');
  assert.equal(chat.snapshot().turns.length, 0);
  network.calls[0].resolve({ text: '你好呀', truncated: false });
  assert.deepEqual(await sending, { text: '你好呀', truncated: false });

  const snapshot = chat.snapshot();
  assert.deepEqual(snapshot, {
    turns: [{ id: snapshot.turns[0].id, user: '你好', assistant: '你好呀', complete: true }],
    pending: null,
    busy: false,
    error: '',
  });
  assert.ok(changes.length >= 4);
  assert.equal(changes.every((args) => args.length === 0), true);
});

test('failed partial replies stay retryable and retry replaces their partial text', async () => {
  const network = deferredRequest();
  const chat = makeController(network.request);
  const first = chat.send('问题');
  const id = chat.snapshot().pending.id;
  network.calls[0].onDelta('未完成');
  network.calls[0].reject(new Error('连接失败'));
  await assert.rejects(first, /连接失败/);
  assert.deepEqual(chat.snapshot().pending, {
    id,
    user: '问题',
    assistant: '未完成',
    complete: false,
  });

  const retrying = chat.retry();
  assert.deepEqual(chat.snapshot().pending, {
    id,
    user: '问题',
    assistant: '',
    complete: false,
  });
  assert.deepEqual(network.calls[1].messages, [
    { role: 'system', content: '角色设定' },
    { role: 'user', content: '问题' },
  ]);
  network.calls[1].onDelta('新');
  network.calls[1].resolve({ text: '新回复', truncated: false });
  await retrying;
  assert.equal(chat.snapshot().turns.length, 1);
  assert.equal(chat.snapshot().turns[0].assistant, '新回复');
  assert.equal(chat.snapshot().pending, null);
});

test('length-limited replies remain incomplete and retry without entering context', async () => {
  const network = deferredRequest();
  const chat = makeController(network.request);
  const first = chat.send('请详细回答');
  const id = chat.snapshot().pending.id;
  network.calls[0].onDelta('被截断的部分');
  network.calls[0].resolve({ text: '被截断的部分回复', truncated: true });

  await assert.rejects(first, /长度|截断/);
  assert.deepEqual(chat.snapshot(), {
    turns: [],
    pending: {
      id,
      user: '请详细回答',
      assistant: '被截断的部分回复',
      complete: false,
    },
    busy: false,
    error: chat.snapshot().error,
  });
  assert.match(chat.snapshot().error, /长度|截断/);

  const retry = chat.retry();
  assert.deepEqual(network.calls[1].messages, [
    { role: 'system', content: '角色设定' },
    { role: 'user', content: '请详细回答' },
  ]);
  assert.equal(chat.snapshot().pending.assistant, '');
  network.calls[1].resolve({ text: '完整回复', truncated: false });
  await retry;
  assert.equal(chat.snapshot().turns.length, 1);
  assert.equal(chat.snapshot().turns[0].assistant, '完整回复');
});

test('cancel releases the shared slot immediately and blocks stale callbacks', async () => {
  const network = deferredRequest();
  const chat = makeController(network.request);
  const firstOutcome = chat.send('旧问题').catch((error) => error);
  const stale = network.calls[0];
  stale.onDelta('旧片段');

  chat.cancel();
  assert.equal(chat.snapshot().busy, false);
  assert.equal(chat.snapshot().pending.assistant, '旧片段');
  assert.match(chat.snapshot().error, /取消/);
  const cancellation = await firstOutcome;
  assert.match(cancellation.message, /取消/);

  const second = chat.send('新问题');
  assert.equal(chat.snapshot().busy, true);
  stale.onDelta('迟到片段');
  stale.resolve({ text: '旧回复', truncated: false });
  await Promise.resolve();
  assert.equal(chat.snapshot().pending.user, '新问题');
  assert.equal(chat.snapshot().pending.assistant, '');
  assert.equal(chat.snapshot().busy, true);

  network.calls[1].resolve({ text: '新回复', truncated: false });
  await second;
  assert.equal(chat.snapshot().turns[0].assistant, '新回复');
});

test('clear cancels requests, removes all conversation state, and rejects late data', async () => {
  const network = deferredRequest();
  const chat = makeController(network.request);
  const outcome = chat.send('问题').catch((error) => error);
  const stale = network.calls[0];
  stale.onDelta('片段');
  chat.clear();

  assert.deepEqual(chat.snapshot(), {
    turns: [], pending: null, busy: false, error: '',
  });
  await outcome;
  stale.onDelta('迟到');
  stale.resolve({ text: '迟到回复', truncated: false });
  await Promise.resolve();
  assert.deepEqual(chat.snapshot(), {
    turns: [], pending: null, busy: false, error: '',
  });
});

test('test shares the request slot and never enters conversation history', async () => {
  const network = deferredRequest();
  const chat = makeController(network.request);
  const testing = chat.test({
    baseURL: 'https://draft.example/api',
    model: 'draft-model',
    apiKey: 'draft-key',
  });
  assert.equal(chat.snapshot().busy, true);
  assert.deepEqual(network.calls[0].messages, [{ role: 'user', content: '请回复：连接成功' }]);
  assert.equal(network.calls[0].stream, false);
  await assert.rejects(chat.send('不能并发'), /正在进行/);
  network.calls[0].resolve({ text: '连接正常', truncated: false });
  assert.deepEqual(await testing, { text: '连接正常', truncated: false });
  assert.deepEqual(chat.snapshot(), { turns: [], pending: null, busy: false, error: '' });
});

test('only complete bounded history is sent as context', async () => {
  const calls = [];
  const chat = makeController(async (input) => {
    calls.push(input);
    return { text: `答${calls.length}`, truncated: false };
  });
  for (let index = 1; index <= 12; index += 1) await chat.send(`问${index}`);

  assert.equal(chat.snapshot().turns.length, 12);
  assert.deepEqual(calls[11].messages.slice(1, -1).map((message) => message.content), [
    '问2', '答2', '问3', '答3', '问4', '答4', '问5', '答5', '问6', '答6',
    '问7', '答7', '问8', '答8', '问9', '答9', '问10', '答10', '问11', '答11',
  ]);

  const largeCalls = [];
  const large = makeController(async (input) => {
    largeCalls.push(input);
    return { text: '答'.repeat(2_000), truncated: false };
  });
  for (let index = 1; index <= 7; index += 1) await large.send(`问${index}`);
  const context = largeCalls[6].messages.slice(1, -1);
  assert.deepEqual(context.filter((message) => message.role === 'user').map((message) => message.content), [
    '问2', '问3', '问4', '问5', '问6',
  ]);
});

test('display history obeys independent round and grapheme budgets', async () => {
  const rounds = makeController(async ({ messages }) => ({
    text: `答${messages.at(-1).content}`,
    truncated: false,
  }));
  for (let index = 0; index < 51; index += 1) await rounds.send(`问${index}`);
  assert.equal(rounds.snapshot().turns.length, 50);
  assert.equal(rounds.snapshot().turns[0].user, '问1');

  const graphemes = makeController(async () => ({ text: '答'.repeat(20_000), truncated: false }));
  for (let index = 0; index < 6; index += 1) await graphemes.send('问');
  assert.equal(graphemes.snapshot().turns.length, 4);
});

test('input and response limits count user-perceived graphemes', async () => {
  const chat = makeController(async () => ({ text: '好', truncated: false }));
  const family = '👨‍👩‍👧‍👦';
  await chat.send(family.repeat(2_000));
  await assert.rejects(chat.send(family.repeat(2_001)), /2,000|2000/);

  const tooLarge = makeController(async () => ({ text: '好'.repeat(20_001), truncated: false }));
  await assert.rejects(tooLarge.send('问题'), /过大|20,000|20000/);
  assert.equal(tooLarge.snapshot().turns.length, 0);
  assert.equal(tooLarge.snapshot().pending.user, '问题');
});

test('controller errors never reveal the active API key', async () => {
  const chat = makeController(async () => {
    throw new Error('socket failed while sending fixture-secret');
  });
  await assert.rejects(chat.send('问题'), (error) => {
    assert.equal(error.message.includes('fixture-secret'), false);
    return true;
  });
  assert.equal(chat.snapshot().error.includes('fixture-secret'), false);
});

test('requestCompletion parses multiline SSE split across UTF-8 byte boundaries', async (t) => {
  const payload = Buffer.from([
    'data: {"choices":[\n',
    'data: {"index":0,"delta":{"content":"你好"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"index":0,"delta":{},"finish_reason":"length"}]}\n\n',
  ].join(''));
  const split = payload.indexOf(Buffer.from('你')) + 1;
  const requests = installHTTPS(t, () => response(200, [
    payload.subarray(0, split), payload.subarray(split),
  ], { 'content-type': 'text/event-stream' }));
  const deltas = [];

  const result = await requestCompletion({
    service: SERVICE,
    messages: [{ role: 'user', content: '问题' }],
    signal: new AbortController().signal,
    onDelta: (delta) => deltas.push(delta),
    stream: true,
  });

  assert.deepEqual(result, { text: '你好', truncated: true });
  assert.deepEqual(deltas, ['你好']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.protocol, 'https:');
  assert.equal(requests[0].options.hostname, 'example.com');
  assert.equal(requests[0].options.path, '/v1/chat/completions');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer fixture-secret');
  assert.deepEqual(JSON.parse(requests[0].body), {
    model: 'fixture-model',
    messages: [{ role: 'user', content: '问题' }],
    stream: true,
  });
});

test('requestCompletion accepts DONE and a complete JSON fallback', async (t) => {
  let invocation = 0;
  installHTTPS(t, () => {
    invocation += 1;
    if (invocation === 1) {
      return response(200, [
        'data: {"choices":[{"index":0,"delta":{"content":"完成"},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ]);
    }
    return response(200, [jsonReply('兼容回复', 'length')], { 'content-type': 'application/json' });
  });

  const streamed = await requestCompletion({
    service: SERVICE, messages: [], signal: undefined, onDelta: () => {}, stream: true,
  });
  const fallback = await requestCompletion({
    service: SERVICE, messages: [], signal: undefined, onDelta: () => {}, stream: true,
  });
  assert.deepEqual(streamed, { text: '完成', truncated: false });
  assert.deepEqual(fallback, { text: '兼容回复', truncated: true });
});

test('requestCompletion rejects abnormal SSE EOF and oversized responses', async (t) => {
  let invocation = 0;
  installHTTPS(t, () => {
    invocation += 1;
    if (invocation === 1) {
      return response(200, [
        'data: {"choices":[{"index":0,"delta":{"content":"部分"},"finish_reason":null}]}\n\n',
      ]);
    }
    return response(200, [], { 'content-length': '2000001' });
  });

  await assert.rejects(requestCompletion({
    service: SERVICE, messages: [], signal: undefined, onDelta: () => {}, stream: true,
  }), /中断|完整|响应/i);
  await assert.rejects(requestCompletion({
    service: SERVICE, messages: [], signal: undefined, onDelta: () => {}, stream: false,
  }), /过大|大小/i);
});

test('requestCompletion rejects redirects and network failures without exposing secrets', async (t) => {
  let invocation = 0;
  installHTTPS(t, ({ request }) => {
    invocation += 1;
    if (invocation === 1) {
      return response(302, ['redirect fixture-secret'], { location: 'https://other.example/' });
    }
    queueMicrotask(() => request.emit('error', new Error('TLS fixture-secret')));
    return null;
  });

  for (let index = 0; index < 2; index += 1) {
    await assert.rejects(requestCompletion({
      service: SERVICE, messages: [], signal: undefined, onDelta: () => {}, stream: false,
    }), (error) => {
      assert.equal(error.message.includes('fixture-secret'), false);
      return true;
    });
  }
});

test('requestCompletion aborts without waiting for a silent network request', async (t) => {
  const requests = installHTTPS(t, () => null);
  const abort = new AbortController();
  const pending = requestCompletion({
    service: SERVICE, messages: [], signal: abort.signal, onDelta: () => {}, stream: true,
  });
  await Promise.resolve();
  requests[0].destroy = function destroySynchronously() {
    this.destroyed = true;
    this.emit('error', new Error('socket teardown'));
  };
  abort.abort();
  await assert.rejects(pending, /取消|cancel/i);
  assert.equal(requests[0].destroyed, true);
});
