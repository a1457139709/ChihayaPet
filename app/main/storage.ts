import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Configuration, Preferences } from '../shared/contracts';
import { defaultPrompt } from './default-prompt';

export function normalizeService(input: string): string {
  const raw = input.trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || raw.includes('?') || raw.includes('#') || raw.includes('\\') || /\s/.test(raw)) throw new Error();
    const match = /^https:\/\/([^/]+)(.*)$/i.exec(raw);
    if (!match || match[1]!.includes('@')) throw new Error();
    // URL.href drops explicit :443. Native URLComponents retains it, so preserve that account key.
    const authority = match[1]!.toLowerCase();
    const pathname = match[2]!.replace(/\/+$/, '').replace(/[^\x21-\x7e]/gu, c => encodeURIComponent(c));
    return `https://${authority}${pathname}`;
  } catch { throw new Error('请填写有效的 HTTPS 基础地址，且不要包含用户信息、查询参数或片段。'); }
}
export function connection(baseURL: string, model: string): { baseURL: string; model: string } {
  if (!model.trim()) throw new Error('请填写模型名称。');
  return { baseURL: normalizeService(baseURL), model: model.trim() };
}
function atomicText(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.config-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, text, { mode: 0o600, flag: 'wx' });
    const fd = openSync(temporary, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, file);
  } finally { try { unlinkSync(temporary); } catch { /* Renamed, or never created. */ } }
}
export function atomicJSON(file: string, values: unknown): void { atomicText(file, JSON.stringify(values, null, 2) + '\n'); }
export class PromptStore {
  constructor(readonly file: string) {}
  load(): string {
    try { return readFileSync(this.file, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultPrompt;
      throw new Error(`无法读取角色提示词文件：${this.file}。请检查文件和读取权限。`);
    }
  }
  save(prompt: string): void {
    try { atomicText(this.file, prompt); }
    catch { throw new Error(`无法保存角色提示词文件：${this.file}。请检查文件和目录写入权限，当前角色设定未更改。`); }
  }
}
export class ConfigStore {
  constructor(readonly file: string) {}
  load(): Configuration {
    if (!existsSync(this.file)) return { baseURL: '', model: '', apiKeys: {} };
    try {
      const value = JSON.parse(readFileSync(this.file, 'utf8')) as Configuration;
      if (!value || typeof value.baseURL !== 'string' || typeof value.model !== 'string' || !value.apiKeys || Array.isArray(value.apiKeys) || typeof value.apiKeys !== 'object' || Object.values(value.apiKeys).some(v => typeof v !== 'string')) throw new Error();
      return value;
    } catch { throw new Error('config.json 格式无效，未覆盖原文件。'); }
  }
  key(service: string): string { return this.load().apiKeys[normalizeService(service)] ?? ''; }
  saveService(baseURL: string, model: string, key: string): Configuration {
    const config = connection(baseURL, model);
    if (!key.trim()) throw new Error('请填写 API Key。');
    const values = this.load();
    values.baseURL = config.baseURL; values.model = config.model;
    Object.defineProperty(values.apiKeys, config.baseURL, { value: key, enumerable: true, configurable: true, writable: true });
    atomicJSON(this.file, values); return values;
  }
  deleteKey(service: string): Configuration {
    const values = this.load();
    delete values.apiKeys[normalizeService(service)];
    atomicJSON(this.file, values); return values;
  }
}
export interface PreferenceStore { load(): Preferences; save(changes: Preferences): void }
export class JSONPreferences implements PreferenceStore {
  constructor(readonly file: string) {}
  load(): Preferences {
    if (!existsSync(this.file)) return {};
    try {
      const value: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!value || Array.isArray(value) || typeof value !== 'object' || Object.values(value).some(v => !['string', 'boolean', 'number'].includes(typeof v))) throw new Error();
      return value as Preferences;
    } catch { throw new Error('preferences.json 格式无效，未覆盖原文件。'); }
  }
  save(changes: Preferences): void { atomicJSON(this.file, { ...this.load(), ...changes }); }
}
