'use strict';

const https = require('node:https');
const { StringDecoder } = require('node:string_decoder');
const { randomUUID } = require('node:crypto');
const { normalizeService } = require('./storage.cjs');

const INPUT_LIMIT = 2_000;
const REPLY_LIMIT = 20_000;
const CONTEXT_ROUND_LIMIT = 10;
const CONTEXT_GRAPHEME_LIMIT = 12_000;
const DISPLAY_ROUND_LIMIT = 50;
const DISPLAY_GRAPHEME_LIMIT = 100_000;
const RESPONSE_BYTE_LIMIT = 2_000_000;
const REQUEST_TIMEOUT_MS = 60_000;

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

class SafeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'Error';
    this.code = code;
  }
}

function graphemeCount(value) {
  let count = 0;
  for (const _segment of segmenter.segment(value)) count += 1;
  return count;
}

function graphemePrefix(value, limit) {
  if (limit <= 0) return '';
  let end = 0;
  let count = 0;
  for (const part of segmenter.segment(value)) {
    if (count >= limit) break;
    end = part.index + part.segment.length;
    count += 1;
  }
  return value.slice(0, end);
}

function requireReply(reply) {
  if (!reply || typeof reply.text !== 'string' || reply.text.trim() === '') {
    throw new SafeError('服务未返回可用的文本回复，请检查接口兼容性。', 'invalid-response');
  }
  if (graphemeCount(reply.text) > REPLY_LIMIT) {
    throw new SafeError('回复超过本地允许的 20,000 字符大小。', 'response-too-large');
  }
  return { text: reply.text, truncated: reply.truncated === true };
}

function validateInput(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new SafeError('请输入消息，不能只包含空白。', 'invalid-input');
  }
  if (graphemeCount(text) > INPUT_LIMIT) {
    throw new SafeError('单次输入最多 2,000 个字符。', 'input-too-long');
  }
}

function sanitizedError(error, apiKey = '') {
  if (error instanceof SafeError) return error;
  let message = error instanceof Error ? error.message : String(error || '请求失败。');
  if (!message) message = '请求失败。';
  if (apiKey) message = message.split(apiKey).join('[已隐藏]');
  return new SafeError(message, 'request-failed');
}

class ChatController {
  constructor({ getService, getPrompt, onChange, request = requestCompletion }) {
    if (typeof getService !== 'function' || typeof getPrompt !== 'function'
        || typeof onChange !== 'function' || typeof request !== 'function') {
      throw new TypeError('ChatController requires service, prompt, change, and request functions.');
    }
    this.getService = getService;
    this.getPrompt = getPrompt;
    this.onChange = onChange;
    this.request = request;
    this.turns = [];
    this.pending = null;
    this.error = '';
    this.active = null;
  }

  snapshot() {
    return {
      turns: this.turns.map((turn) => ({ ...turn })),
      pending: this.pending ? { ...this.pending } : null,
      busy: this.active !== null,
      error: this.error,
    };
  }

  _changed() {
    this.onChange();
  }

  _throwVisible(error, apiKey = '') {
    const safe = sanitizedError(error, apiKey);
    this.error = safe.message;
    this._changed();
    throw safe;
  }

  _assertAvailable() {
    if (this.active) {
      this._throwVisible(new SafeError('已有请求正在进行。', 'busy'));
    }
  }

  _contextMessages() {
    const recent = this.turns.slice(-CONTEXT_ROUND_LIMIT);
    let count = recent.reduce(
      (total, turn) => total + graphemeCount(turn.user) + graphemeCount(turn.assistant),
      0,
    );
    while (recent.length > 0 && count > CONTEXT_GRAPHEME_LIMIT) {
      const removed = recent.shift();
      count -= graphemeCount(removed.user) + graphemeCount(removed.assistant);
    }
    return recent.flatMap((turn) => [
      { role: 'user', content: turn.user },
      { role: 'assistant', content: turn.assistant },
    ]);
  }

  _trimDisplay() {
    let count = this.turns.reduce(
      (total, turn) => total + graphemeCount(turn.user) + graphemeCount(turn.assistant),
      0,
    );
    while (this.turns.length > DISPLAY_ROUND_LIMIT
        || (this.turns.length > 0 && count > DISPLAY_GRAPHEME_LIMIT)) {
      const removed = this.turns.shift();
      count -= graphemeCount(removed.user) + graphemeCount(removed.assistant);
    }
  }

  async send(text) {
    this._assertAvailable();
    try {
      validateInput(text);
    } catch (error) {
      return this._throwVisible(error);
    }
    const pending = { id: randomUUID(), user: text, assistant: '', complete: false };
    this.pending = pending;
    return this._runChat(pending);
  }

  async retry() {
    this._assertAvailable();
    if (!this.pending) {
      return this._throwVisible(new SafeError('没有可重试的消息。', 'nothing-to-retry'));
    }
    const pending = { ...this.pending, assistant: '' };
    this.pending = pending;
    return this._runChat(pending);
  }

  async _runChat(pending) {
    const service = this.getService();
    const messages = [
      { role: 'system', content: this.getPrompt() },
      ...this._contextMessages(),
      { role: 'user', content: pending.user },
    ];
    const active = this._begin('chat', service);
    this.error = '';
    this._changed();

    const onDelta = (delta) => {
      if (this.active !== active || this.pending?.id !== pending.id || typeof delta !== 'string') return;
      const combined = this.pending.assistant + delta;
      if (graphemeCount(combined) > REPLY_LIMIT) {
        this.pending.assistant = graphemePrefix(combined, REPLY_LIMIT);
        this._changed();
        throw new SafeError('回复超过本地允许的 20,000 字符大小。', 'response-too-large');
      }
      this.pending.assistant = combined;
      this._changed();
    };

    try {
      const result = await this._perform(active, { service, messages, onDelta, stream: true });
      const reply = requireReply(result);
      if (this.active !== active) throw active.cancelError;
      if (reply.truncated) {
        this.pending.assistant = reply.text;
        throw new SafeError('回复因模型长度限制而截断，可手动重试。', 'length-limited');
      }
      this.turns.push({
        id: pending.id,
        user: pending.user,
        assistant: reply.text,
        complete: true,
      });
      this._trimDisplay();
      this.pending = null;
      this.active = null;
      this.error = '';
      this._changed();
      return reply;
    } catch (error) {
      const safe = sanitizedError(error, service?.apiKey);
      if (this.active === active) {
        this.active = null;
        this.error = safe.message;
        this._changed();
      }
      throw safe;
    }
  }

  async test(service) {
    this._assertAvailable();
    const active = this._begin('test', service);
    this.error = '';
    this._changed();
    try {
      const result = requireReply(await this._perform(active, {
        service,
        messages: [{ role: 'user', content: '请回复：连接成功' }],
        onDelta: () => {},
        stream: false,
      }));
      if (this.active !== active) throw active.cancelError;
      this.active = null;
      this.error = '';
      this._changed();
      return result;
    } catch (error) {
      const safe = sanitizedError(error, service?.apiKey);
      if (this.active === active) {
        this.active = null;
        this.error = safe.message;
        this._changed();
      }
      throw safe;
    }
  }

  _begin(kind, service) {
    const controller = new AbortController();
    const active = {
      kind,
      controller,
      cancelError: new SafeError('请求已取消。', 'cancelled'),
      rejectCancellation: null,
      service,
    };
    active.cancellation = new Promise((resolve, reject) => {
      void resolve;
      active.rejectCancellation = reject;
    });
    this.active = active;
    return active;
  }

  _perform(active, input) {
    let work;
    try {
      work = Promise.resolve(this.request({ ...input, signal: active.controller.signal }));
    } catch (error) {
      work = Promise.reject(error);
    }
    return Promise.race([work, active.cancellation]);
  }

  cancel() {
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.controller.abort();
    active.rejectCancellation(active.cancelError);
    this.error = active.kind === 'chat' ? '已取消，可手动重试。' : '';
    this._changed();
  }

  clear() {
    const active = this.active;
    if (active) {
      this.active = null;
      active.controller.abort();
      active.rejectCancellation(active.cancelError);
    }
    this.turns = [];
    this.pending = null;
    this.error = '';
    this._changed();
  }
}

class SSEParser {
  constructor() {
    this.buffer = '';
    this.dataLines = [];
    this.sawData = false;
  }

  push(text) {
    this.buffer += text;
    const events = [];
    let newline;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      let line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      this._line(line, events);
    }
    return events;
  }

  finish() {
    const events = [];
    if (this.buffer) {
      let line = this.buffer;
      if (line.endsWith('\r')) line = line.slice(0, -1);
      this.buffer = '';
      this._line(line, events);
    }
    this._dispatch(events);
    return events;
  }

  _line(line, events) {
    if (line === '') {
      this._dispatch(events);
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') {
      this.sawData = true;
      this.dataLines.push(value);
    }
  }

  _dispatch(events) {
    if (this.dataLines.length === 0) return;
    events.push(this.dataLines.join('\n'));
    this.dataLines = [];
  }
}

function httpError(status) {
  if (status >= 300 && status < 400) {
    return new SafeError('服务返回了重定向，请填写重定向后的最终 HTTPS 地址。', 'redirect');
  }
  if (status === 401 || status === 403) {
    return new SafeError('鉴权失败，请检查 API Key、账户权限或账户状态。', 'authentication');
  }
  if (status === 404) return new SafeError('请求端点不可用，请检查基础地址和模型名称。', 'endpoint');
  if (status === 429) return new SafeError('额度或请求频率受限，请稍后手动重试。', 'rate-limited');
  if (status >= 500) return new SafeError('模型服务暂时不可用，请稍后重试。', 'server');
  return new SafeError('请求端点返回了不可用的状态。', 'endpoint');
}

function decodeJSONReply(buffer) {
  let decoded;
  try {
    decoded = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new SafeError('服务未返回可用的文本回复，请检查接口兼容性。', 'invalid-response');
  }
  const choice = decoded?.choices?.[0];
  return requireReply({
    text: choice?.message?.content,
    truncated: choice?.finish_reason === 'length',
  });
}

async function consumeResponse(response, stream, onDelta) {
  const status = Number(response.statusCode);
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    response.resume?.();
    throw httpError(status);
  }
  const declaredLength = Number(response.headers?.['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > RESPONSE_BYTE_LIMIT) {
    response.destroy?.();
    throw new SafeError('回复超过本地允许的大小。', 'response-too-large');
  }

  const chunks = [];
  let bytes = 0;
  const decoder = new StringDecoder('utf8');
  const parser = new SSEParser();
  let text = '';
  let terminal = false;
  let truncated = false;

  const processEvents = async (events) => {
    for (const payload of events) {
      if (payload === '[DONE]') {
        terminal = true;
        return;
      }
      let event;
      try {
        event = JSON.parse(payload);
      } catch {
        throw new SafeError('服务返回了无法解析的流式响应。', 'invalid-response');
      }
      const choice = event?.choices?.find((candidate) => candidate?.index === 0);
      if (!choice) continue;
      const delta = choice.delta?.content;
      if (typeof delta === 'string' && delta !== '') {
        const combined = text + delta;
        if (graphemeCount(combined) > REPLY_LIMIT) {
          const bounded = graphemePrefix(combined, REPLY_LIMIT);
          const accepted = bounded.slice(text.length);
          if (accepted) await onDelta(accepted);
          text = bounded;
          throw new SafeError('回复超过本地允许的大小。', 'response-too-large');
        }
        text = combined;
        await onDelta(delta);
      }
      if (choice.finish_reason === 'stop' || choice.finish_reason === 'length') {
        terminal = true;
        truncated = choice.finish_reason === 'length';
        return;
      }
    }
  };

  for await (const value of response) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    bytes += chunk.length;
    if (bytes > RESPONSE_BYTE_LIMIT) {
      throw new SafeError('回复超过本地允许的大小。', 'response-too-large');
    }
    chunks.push(chunk);
    if (stream && !terminal) {
      await processEvents(parser.push(decoder.write(chunk)));
      if (terminal) break;
    }
  }

  const raw = Buffer.concat(chunks);
  if (!stream) return decodeJSONReply(raw);

  if (!terminal) {
    await processEvents(parser.push(decoder.end()));
    await processEvents(parser.finish());
  }
  if (!parser.sawData) {
    const fallback = decodeJSONReply(raw);
    await onDelta(fallback.text);
    return fallback;
  }
  if (!terminal) {
    throw new SafeError('流式回复在完整结束前中断。', 'invalid-response');
  }
  return requireReply({ text, truncated });
}

function requestCompletion({ service, messages, signal, onDelta = () => {}, stream = true }) {
  let normalized;
  try {
    normalized = normalizeService(service);
  } catch (error) {
    return Promise.reject(sanitizedError(error));
  }
  if (typeof service?.apiKey !== 'string' || service.apiKey.trim() === '') {
    return Promise.reject(new SafeError('请填写 API Key。', 'missing-key'));
  }
  const apiKey = service.apiKey.trim();
  if (!Array.isArray(messages) || typeof onDelta !== 'function') {
    return Promise.reject(new SafeError('请求参数无效。', 'invalid-request'));
  }
  if (signal?.aborted) return Promise.reject(new SafeError('请求已取消。', 'cancelled'));

  let body;
  try {
    body = Buffer.from(JSON.stringify({ model: normalized.model, messages, stream: Boolean(stream) }));
  } catch {
    return Promise.reject(new SafeError('请求参数无效。', 'invalid-request'));
  }
  const endpoint = new URL(`${normalized.baseURL}/chat/completions`);

  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    let response;
    const finish = (result, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(sanitizedError(error, apiKey));
      else resolve(result);
    };
    const abort = () => {
      finish(undefined, new SafeError('请求已取消。', 'cancelled'));
      response?.destroy?.();
      request?.destroy?.();
    };
    const timer = setTimeout(() => {
      finish(undefined, new SafeError('请求超时，请稍后手动重试。', 'timeout'));
      response?.destroy?.();
      request?.destroy?.();
    }, REQUEST_TIMEOUT_MS);
    timer.unref?.();

    try {
      request = https.request({
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port || undefined,
        path: `${endpoint.pathname}${endpoint.search}`,
        method: 'POST',
        headers: {
          Accept: stream ? 'text/event-stream, application/json' : 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': String(body.length),
        },
        timeout: REQUEST_TIMEOUT_MS,
      }, (incoming) => {
        response = incoming;
        consumeResponse(incoming, Boolean(stream), onDelta)
          .then((result) => finish(result))
          .catch((error) => finish(undefined, error));
      });
      request.once('error', () => {
        finish(undefined, new SafeError('连接失败，请检查网络、服务地址和 TLS 配置。', 'connection'));
      });
      signal?.addEventListener('abort', abort, { once: true });
      request.end(body);
    } catch {
      finish(undefined, new SafeError('连接失败，请检查网络、服务地址和 TLS 配置。', 'connection'));
    }
  });
}

module.exports = {
  ChatController,
  requestCompletion,
};
