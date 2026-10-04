import { randomUUID } from 'node:crypto';
import type { Message, Snapshot, Turn, Configuration, SettingsField } from '../shared/contracts';
import { defaultPrompt } from '../shared/contracts';
import { characterCount, validateInput } from '../shared/text';
import { ConfigStore, connection, normalizeService, type PreferenceStore } from './storage';
import { requestReply } from './network';

type ConversationState = Pick<Snapshot, 'greeting' | 'turns' | 'didTrim' | 'input' | 'pending' | 'pendingID' | 'partial' | 'error' | 'busy' | 'settingsError' | 'settingsNotice' | 'testStatus' | 'draft'>;
const greetings = ['你好，我是妃宫千早。今天过得怎么样？', '来了呀。先坐一会儿吧，今天想聊些什么？', '忙到现在，辛苦了。要不要稍微歇一歇？', '今天也请多关照。有什么想说的，我听着。', '一直这样看着我……是有什么话想说吗？'];
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请检查本机数据目录。';
export class Companion {
  private settings: Configuration = { baseURL: '', model: '', apiKeys: {} };
  private prompt = defaultPrompt;
  private active?: { kind: 'chat' | 'test'; controller: AbortController };
  private state: ConversationState;
  onChange: () => void = () => {};
  onReply: (turn: Turn) => void = () => {};
  onNeedsSettings: () => void = () => {};
  onInvalidSettings: () => void = () => {};
  onCleared: () => void = () => {};
  constructor(private config: ConfigStore, private preferences: PreferenceStore, private fetcher: typeof fetch = fetch, random: () => number = Math.random) {
    this.state = { greeting: greetings[Math.min(4, Math.floor(random() * 5))]!, turns: [], didTrim: false, input: '', partial: '', draft: { baseURL: '', model: '', key: '', prompt: defaultPrompt } };
    try { this.settings = config.load(); } catch (e) { this.state.settingsError = errorText(e); }
    try { this.prompt = String(preferences.load()['persona.prompt'] ?? defaultPrompt); } catch (e) { this.state.settingsError = errorText(e); }
  }
  snapshot(): ConversationState & Pick<Snapshot, 'savedService'> {
    return { ...structuredClone(this.state), savedService: this.settings.baseURL ? { baseURL: this.settings.baseURL, model: this.settings.model } : undefined };
  }
  setInput(text: string): void { this.state.input = text; this.onChange(); }
  async send(retry = false): Promise<void> {
    if (this.active) return;
    const text = retry ? this.state.pending : this.state.input;
    if (text === undefined) return;
    try { validateInput(text); } catch (e) { this.state.error = errorText(e); this.onChange(); return; }
    let config: { baseURL: string; model: string }, key: string;
    try {
      const baseURL = normalizeService(this.settings.baseURL);
      config = connection(baseURL, this.settings.model);
      key = this.config.key(config.baseURL);
      if (!key.trim()) throw new Error('请填写 API Key。');
    } catch (e) { this.state.error = errorText(e); this.onChange(); this.onNeedsSettings(); return; }
    const messages: Message[] = [{ role: 'system', content: this.prompt }];
    for (const turn of this.context()) messages.push({ role: 'user', content: turn.user }, { role: 'assistant', content: turn.assistant });
    messages.push({ role: 'user', content: text });
    const active = { kind: 'chat' as const, controller: new AbortController() };
    this.active = active; this.state.busy = 'chat'; this.state.error = undefined; this.state.partial = ''; this.state.pending = text; this.state.pendingID = randomUUID();
    if (!retry) this.state.input = '';
    this.onChange();
    try {
      const reply = await requestReply({ ...config, key, messages, stream: true, signal: active.controller.signal }, delta => {
        if (this.active === active) { this.state.partial += delta; this.onChange(); }
      }, this.fetcher);
      if (this.active !== active) return;
      const turn: Turn = { id: randomUUID(), user: text, assistant: reply.text, truncated: reply.truncated };
      this.state.turns.push(turn);
      let count = this.state.turns.reduce((n, t) => n + characterCount(t.user) + characterCount(t.assistant), 0);
      while (this.state.turns.length > 50 || count > 100_000) {
        const old = this.state.turns.shift()!; count -= characterCount(old.user) + characterCount(old.assistant); this.state.didTrim = true;
      }
      this.state.pending = undefined; this.state.pendingID = undefined; this.state.partial = ''; this.onReply(turn);
    } catch (e) { if (this.active === active) this.state.error = errorText(e); }
    finally { if (this.active === active) { this.active = undefined; this.state.busy = undefined; this.onChange(); } }
  }
  private context(): Turn[] {
    const turns = this.state.turns.slice(-10);
    let size = turns.reduce((n, t) => n + characterCount(t.user) + characterCount(t.assistant), 0);
    while (size > 12_000 && turns.length) { const turn = turns.shift()!; size -= characterCount(turn.user) + characterCount(turn.assistant); }
    return turns;
  }
  cancel(): void {
    const old = this.active; this.active = undefined; this.state.busy = undefined;
    old?.controller.abort();
    if (old?.kind === 'chat') this.state.error = '已取消，可手动重试。';
    if (old?.kind === 'test') this.state.testStatus = undefined;
    this.onChange();
  }
  clear(): void {
    this.cancel(); this.state.turns = []; this.state.didTrim = false; this.state.pending = undefined; this.state.pendingID = undefined;
    this.state.partial = ''; this.state.error = undefined; this.state.input = ''; this.state.testStatus = undefined;
    this.onCleared(); this.onChange();
  }
  beginSettings(): void {
    this.endSettings();
    this.state.draft = { baseURL: this.settings.baseURL, model: this.settings.model, key: '', prompt: this.prompt };
    this.state.settingsNotice = undefined;
    try { this.config.load(); this.preferences.load(); this.state.settingsError = undefined; } catch (e) { this.state.settingsError = errorText(e); }
    this.loadDraftKey(); this.onChange();
  }
  missingSettingsField(): SettingsField | undefined {
    try { normalizeService(this.state.draft.baseURL); } catch { return 'baseURL'; }
    if (!this.state.draft.model.trim()) return 'model';
    if (!this.state.draft.key.trim()) return 'key';
    return undefined;
  }
  endSettings(): void { if (this.active?.kind === 'test') this.cancel(); this.state.testStatus = undefined; }
  setDraft(field: keyof ConversationState['draft'], text: string): void {
    if (this.state.draft[field] === text) return;
    this.state.draft[field] = text;
    if (field !== 'prompt') {
      this.endSettings(); this.state.settingsError = undefined; this.state.settingsNotice = undefined;
      if (field === 'baseURL') { this.state.draft.key = ''; this.loadDraftKey(); }
    }
    this.onChange();
  }
  private loadDraftKey(): void {
    try { this.state.draft.key = this.config.key(this.state.draft.baseURL); }
    catch (e) { if (this.state.draft.baseURL.trim() && /未覆盖/.test(errorText(e))) this.state.settingsError = errorText(e); }
  }
  async testConnection(): Promise<void> {
    if (this.active) return;
    const draft = { ...this.state.draft };
    try { connection(draft.baseURL, draft.model); if (!draft.key.trim()) throw new Error('请填写 API Key。'); }
    catch (e) { this.state.settingsError = errorText(e); this.onChange(); this.onInvalidSettings(); return; }
    const active = { kind: 'test' as const, controller: new AbortController() };
    this.active = active; this.state.busy = 'test'; this.state.testStatus = undefined; this.state.settingsError = undefined; this.onChange();
    try {
      await requestReply({ baseURL: draft.baseURL, model: draft.model, key: draft.key, stream: false, messages: [{ role: 'user', content: '请回复：连接成功' }], signal: active.controller.signal }, () => {}, this.fetcher);
      if (this.active === active) this.state.testStatus = '当前填写配置测试成功。';
    } catch (e) { if (this.active === active) this.state.testStatus = '当前填写配置测试失败：' + errorText(e); }
    finally { if (this.active === active) { this.active = undefined; this.state.busy = undefined; this.onChange(); } }
  }
  saveService(): void {
    try {
      const draft = this.state.draft; connection(draft.baseURL, draft.model);
      if (!draft.key.trim()) throw new Error('请填写 API Key。');
      this.settings = this.config.saveService(draft.baseURL, draft.model, draft.key); this.clear();
      draft.baseURL = this.settings.baseURL; draft.model = this.settings.model;
      this.state.settingsError = undefined; this.state.settingsNotice = '服务配置已保存，会话已清空。';
    } catch (e) { this.state.settingsError = errorText(e); if (this.missingSettingsField()) this.onInvalidSettings(); }
    this.onChange();
  }
  deleteKey(): void {
    try {
      connection(this.settings.baseURL, this.settings.model);
      this.settings = this.config.deleteKey(this.settings.baseURL); this.clear();
      try { if (normalizeService(this.state.draft.baseURL) === this.settings.baseURL) this.state.draft.key = ''; } catch { /* Unrelated invalid draft is preserved. */ }
      this.state.settingsError = undefined; this.state.settingsNotice = '已删除当前已保存服务的密钥。';
    } catch (e) { this.state.settingsError = errorText(e); }
    this.onChange();
  }
  savePrompt(restore = false): boolean {
    try {
      const prompt = restore ? defaultPrompt : this.state.draft.prompt;
      this.preferences.save({ 'persona.prompt': prompt }); this.clear(); this.prompt = prompt; this.state.draft.prompt = prompt;
      this.state.settingsError = undefined; this.state.settingsNotice = '角色设定已保存，会话已清空。';
      this.onChange(); return true;
    } catch (e) { this.state.settingsError = errorText(e); this.state.settingsNotice = undefined; this.onChange(); return false; }
  }
  shutdown(): void { this.cancel(); this.state.draft.key = ''; }
}
