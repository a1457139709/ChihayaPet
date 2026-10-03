import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestReply } from '../app/main/network.ts';
test('chat parses split UTF-8 SSE and sends only the compatible request fields', async () => {
  const wire = new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"content":"你👩🏽‍💻"}}]}\r\n\r\ndata: {"choices":[{"index":0,"delta":{"content":"好"},"finish_reason":"stop"}]}\n\n');
  const deltas: string[] = [];
  const result = await requestReply({ baseURL: 'https://example.com/api/v2///', model: 'model', key: ' test ', messages: [{ role: 'user', content: '你好' }], stream: true }, delta => deltas.push(delta), async (url, options) => {
    assert.equal(url, 'https://example.com/api/v2/chat/completions');
    assert.equal(options?.redirect, 'manual');
    assert.deepEqual(JSON.parse(options!.body as string), { model: 'model', messages: [{ role: 'user', content: '你好' }], stream: true });
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(wire.subarray(0, 62)); c.enqueue(wire.subarray(62)); c.close(); } });
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
  });
  assert.deepEqual(result, { text: '你👩🏽‍💻好', truncated: false });
  assert.equal(deltas.join(''), '你👩🏽‍💻好');
});

test('complete JSON fallback, grapheme limits, truncated streams and total timeout retain native semantics', async () => {
  const request = { baseURL: 'https://example.com/v1', model: 'model', key: 'key', messages: [] as const, stream: true };
  const run = (body: string) => requestReply({ ...request, messages: [] }, () => {}, async () => new Response(body));
  assert.deepEqual(await run(JSON.stringify({ choices: [{ message: { content: '👩🏽‍💻'.repeat(20_000) }, finish_reason: 'length' }] })), { text: '👩🏽‍💻'.repeat(20_000), truncated: true });
  await assert.rejects(run(JSON.stringify({ choices: [{ message: { content: '好'.repeat(20_001) } }] })), /大小/);
  await assert.rejects(run('data: {"choices":[{"index":0,"delta":{"content":"未完成"}}]}\n\n'), /可用/);
  await assert.rejects(requestReply({ ...request, messages: [], timeoutMS: 10 }, () => {}, () => new Promise(() => {})), /超时/);
  await assert.rejects(requestReply({ ...request, messages: [] }, () => {}, async () => new Response('', { status: 302 })), /重定向/);
});
