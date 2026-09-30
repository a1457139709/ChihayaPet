'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULT_PROMPT = '你正在扮演《少女爱上姐姐2》中的妃宫千早，作为用户桌面上的文字聊天伙伴。默认使用简体中文，以礼貌、克制、细腻而自然的方式交谈，避免每句话都使用夸张的语气或动作描写。日常回复通常为一至三句，用户需要详细解释时可以展开。不要主动透露原作关键剧情；不确定的原作细节不要编造。不要声称能看到用户屏幕、读取文件、执行操作，或记得本次提供的会话以外的经历。不要把生成的台词称作原作对白。用户询问应用或模型身份时如实说明这是千早的同人桌宠演绎。以“你”称呼用户，用户在本次聊天指定称呼后再调整。';

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && Object.getPrototypeOf(value) === Object.prototype;
}

function normalizeService(draft) {
  if (!isPlainObject(draft) || typeof draft.baseURL !== 'string') {
    fail('请填写有效的 HTTPS 基础地址。');
  }
  if (typeof draft.model !== 'string' || draft.model.trim() === '') {
    fail('请填写模型名称。');
  }

  const source = draft.baseURL.trim();
  if (source.includes('?') || source.includes('#')) {
    fail('请填写不含查询参数或片段的 HTTPS 基础地址。');
  }

  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    fail('请填写有效的 HTTPS 基础地址。');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    fail('请填写有效的 HTTPS 基础地址，且不要包含用户信息。');
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  return {
    baseURL: parsed.href.replace(/\/$/u, ''),
    model: draft.model.trim(),
  };
}

function decodeJSONFile(file, emptyValue, label) {
  if (!fs.existsSync(file)) return emptyValue;
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fail(`${label} 格式损坏，未覆盖原文件。`);
  }
  if (!isPlainObject(value)) fail(`${label} 格式无效，未覆盖原文件。`);
  return value;
}

function validateConfig(raw) {
  const keys = raw.apiKeys === undefined ? {} : raw.apiKeys;
  const baseURL = raw.baseURL === undefined ? '' : raw.baseURL;
  const model = raw.model === undefined ? '' : raw.model;
  if (typeof baseURL !== 'string' || typeof model !== 'string' || !isPlainObject(keys)) {
    fail('config.json 格式无效，未覆盖原文件。');
  }

  const apiKeys = {};
  for (const [endpoint, key] of Object.entries(keys)) {
    if (typeof key !== 'string') fail('config.json 格式无效，未覆盖原文件。');
    let normalized;
    try {
      normalized = normalizeService({ baseURL: endpoint, model: 'credential' }).baseURL;
    } catch {
      fail('config.json 格式无效，未覆盖原文件。');
    }
    if (normalized !== endpoint) fail('config.json 格式无效，未覆盖原文件。');
    apiKeys[endpoint] = key;
  }

  if ((baseURL === '') !== (model === '')) {
    fail('config.json 格式无效，未覆盖原文件。');
  }
  if (baseURL === '') return { baseURL: '', model: '', apiKeys };
  let service;
  try {
    service = normalizeService({ baseURL, model });
  } catch {
    fail('config.json 格式无效，未覆盖原文件。');
  }
  if (service.baseURL !== baseURL || service.model !== model) {
    fail('config.json 格式无效，未覆盖原文件。');
  }
  return { baseURL, model, apiKeys };
}

function validatePreferences(raw) {
  const prompt = raw.prompt === undefined ? DEFAULT_PROMPT : raw.prompt;
  const prefs = raw.prefs === undefined ? {} : raw.prefs;
  if (typeof prompt !== 'string' || !isPlainObject(prefs)) {
    fail('preferences.json 格式无效，未覆盖原文件。');
  }
  return { prompt, prefs: cloneJSON(prefs, '偏好设置') };
}

function cloneJSON(value, label) {
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    fail(`${label}必须是有效的 JSON 数据。`);
  }
  if (encoded === undefined) fail(`${label}必须是有效的 JSON 数据。`);
  return JSON.parse(encoded);
}

function atomicWriteJSON(root, fileName, value) {
  fs.mkdirSync(root, { recursive: true });
  const destination = path.join(root, fileName);
  const temporary = path.join(root, `.${fileName}-${randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    const body = `${JSON.stringify(value, null, 2)}\n`;
    fs.writeFileSync(descriptor, body, { encoding: 'utf8' });
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.chmodSync(temporary, 0o600);
    fs.renameSync(temporary, destination);
  } catch {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* best effort */ }
    }
    try { fs.unlinkSync(temporary); } catch { /* best effort */ }
    fail(`无法保存 ${fileName}，原文件未被覆盖。`);
  }
}

class Storage {
  constructor(root) {
    if (typeof root !== 'string' || root.trim() === '') fail('存储目录无效。');
    this.root = path.resolve(root);
    this.configPath = path.join(this.root, 'config.json');
    this.preferencesPath = path.join(this.root, 'preferences.json');
    this._readConfig();
    this._readPreferences();
  }

  _readConfig() {
    return validateConfig(decodeJSONFile(this.configPath, {}, 'config.json'));
  }

  _readPreferences() {
    return validatePreferences(decodeJSONFile(this.preferencesPath, {}, 'preferences.json'));
  }

  getSettings() {
    const config = this._readConfig();
    const preferences = this._readPreferences();
    return {
      baseURL: config.baseURL,
      model: config.model,
      prompt: preferences.prompt,
      hasKey: Boolean(config.baseURL && config.apiKeys[config.baseURL]?.trim()),
    };
  }

  getService() {
    const config = this._readConfig();
    return {
      baseURL: config.baseURL,
      model: config.model,
      apiKey: config.baseURL ? (config.apiKeys[config.baseURL] || '') : '',
    };
  }

  serviceDraft(draft) {
    const service = normalizeService(draft);
    const config = this._readConfig();
    let apiKey;
    if (Object.prototype.hasOwnProperty.call(draft, 'apiKey')) {
      if (typeof draft.apiKey !== 'string') fail('API Key 格式无效。');
      apiKey = draft.apiKey.trim();
    } else {
      apiKey = config.apiKeys[service.baseURL] || '';
    }
    return { ...service, apiKey };
  }

  saveService(draft) {
    const service = normalizeService(draft);
    const config = this._readConfig();
    const apiKeys = { ...config.apiKeys };
    if (Object.prototype.hasOwnProperty.call(draft, 'apiKey')) {
      if (typeof draft.apiKey !== 'string') fail('API Key 格式无效。');
      const apiKey = draft.apiKey.trim();
      if (apiKey) apiKeys[service.baseURL] = apiKey;
      else delete apiKeys[service.baseURL];
    }
    atomicWriteJSON(this.root, 'config.json', {
      baseURL: service.baseURL,
      model: service.model,
      apiKeys,
    });
    return this.getSettings();
  }

  savePersona(prompt) {
    if (typeof prompt !== 'string') fail('角色设定格式无效。');
    const preferences = this._readPreferences();
    atomicWriteJSON(this.root, 'preferences.json', { ...preferences, prompt });
    return this.getSettings();
  }

  getPrefs() {
    return cloneJSON(this._readPreferences().prefs, '偏好设置');
  }

  savePrefs(patch) {
    if (!isPlainObject(patch)) fail('偏好设置必须是普通对象。');
    for (const key of Object.keys(patch)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        fail('偏好设置包含无效字段。');
      }
    }
    const safePatch = cloneJSON(patch, '偏好设置');
    const preferences = this._readPreferences();
    const prefs = { ...preferences.prefs, ...safePatch };
    atomicWriteJSON(this.root, 'preferences.json', { ...preferences, prefs });
    return cloneJSON(prefs, '偏好设置');
  }
}

module.exports = {
  DEFAULT_PROMPT,
  Storage,
  normalizeService,
};
