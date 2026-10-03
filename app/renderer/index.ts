import type { Action, Bridge, Snapshot } from '../shared/contracts';
import { characters, characterCount, inputCommand } from '../shared/text';
declare global { interface Window { chihaya: Bridge } }
const bridge = window.chihaya;
const root = document.getElementById('app')!;
const kind = new URLSearchParams(location.search).get('window') ?? 'pet';
document.body.className = kind;
let state: Snapshot;
const act = (action: Action) => { void bridge.act(action).catch(() => {}); };
const node = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const flower = `<svg class="flower" viewBox="0 0 60 60" aria-hidden="true"><path d="M12 48Q24 31 38 9M15 42Q3 32 6 22Q19 27 20 36M24 28Q36 32 44 22Q31 17 24 28" fill="#a7b7a4" stroke="#89968e" stroke-width="1"/><path d="M29 17Q18 2 26 2Q36 3 35 14Q46 1 49 9Q52 18 38 22Q48 35 39 35Q30 34 29 17" fill="#b7a5c6" stroke="#9981a6" stroke-width="1"/><path d="M11 42Q-2 31 7 29Q15 23 19 34Q29 28 30 39Q32 48 20 45Q16 55 11 42" fill="#fffef0" stroke="#a2ac91"/><circle cx="17" cy="40" r="3" fill="#d5c89d"/></svg>`;
function ornament(parent: HTMLElement): void {
  const top = document.createElement('span'); top.innerHTML = flower; top.firstElementChild!.classList.add('top'); parent.append(top);
  const bottom = document.createElement('span'); bottom.innerHTML = flower; bottom.firstElementChild!.classList.add('bottom'); parent.append(bottom);
}
function dialogue(text = ''): { box: HTMLElement; text: HTMLElement } {
  const box = document.createElement('article'); box.className = 'dialogue';
  const name = document.createElement('div'); name.className = 'name'; name.textContent = '妃宫千早';
  const content = document.createElement('div'); content.className = 'text'; content.textContent = text;
  box.append(name, content); ornament(box); return { box, text: content };
}
class Writer {
  private timer?: ReturnType<typeof setTimeout>;
  private target: string[] = [];
  private shown = '';
  private completed = false;
  constructor(private element: HTMLElement, private onComplete = () => {}, initial = '', private scrollContainer?: HTMLElement) { this.shown = initial; this.element.textContent = initial; }
  private draw(): void {
    const c = this.scrollContainer, follow = c && c.scrollHeight - c.scrollTop - c.clientHeight <= 24;
    this.element.textContent = this.shown;
    if (c && follow) c.scrollTop = c.scrollHeight;
  }
  displayed(): string { return this.shown; }
  set(text: string, animate: boolean): void {
    if (!text.startsWith(this.shown)) this.shown = '';
    if (this.target.join('') !== text) { this.target = characters(text); this.completed = false; }
    if (!animate) { this.complete(); return; }
    if (!this.timer && this.shown !== text) this.tick();
  }
  private tick(): void {
    const count = characterCount(this.shown), remaining = this.target.length - count;
    this.shown = this.target.slice(0, count + Math.max(1, Math.ceil(remaining / 80))).join(''); this.draw();
    if (this.shown === this.target.join('')) { this.timer = undefined; this.finish(); }
    else this.timer = setTimeout(() => this.tick(), 25);
  }
  complete(): void { clearTimeout(this.timer); this.timer = undefined; this.shown = this.target.join(''); this.draw(); this.finish(); }
  private finish(): void { if (!this.completed && this.target.length) { this.completed = true; this.onComplete(); } }
  stop(): void { clearTimeout(this.timer); this.timer = undefined; }
}
const animated = () => state.desktop.animations && !state.reducedMotion && state.visible && state.awake;
let composing = false;
if (kind === 'chat') {
  root.innerHTML = `<div class="chat"><header class="toolbar"><h1 class="name">妃宫千早</h1><button id="settings">设置</button><button id="files">文件说明</button><button id="close">收起</button></header><div id="history" aria-live="polite"></div><div class="composer"><textarea id="input" aria-label="消息" placeholder="想说些什么？"></textarea><div class="row spread"><span class="muted" id="counter"></span><div class="row"><button id="clear">清空会话</button><button id="cancel">取消请求</button><button id="send" class="primary">发送</button></div></div><div id="chat-error" class="notice error"></div><button id="retry" hidden>重试上一条</button><div id="resource-error" class="notice error"></div></div></div>`;
  const input = node<HTMLTextAreaElement>('input');
  input.addEventListener('compositionstart', () => { composing = true; }); input.addEventListener('compositionend', () => { composing = false; act({ type: 'input', text: input.value }); });
  input.addEventListener('input', () => { node('counter').textContent = `${characterCount(input.value)}/2,000 · Enter 发送，Shift+Enter 换行`; if (!composing) act({ type: 'input', text: input.value }); });
  input.addEventListener('keydown', event => { if (inputCommand(event, composing) === 'send') { event.preventDefault(); act({ type: 'input', text: input.value }); act({ type: 'send' }); } });
  for (const type of ['settings', 'files', 'clear', 'cancel', 'retry'] as const) node(type).onclick = () => act({ type });
  node('close').onclick = () => act({ type: 'close', window: 'chat' }); node('send').onclick = () => { if (!composing) { act({ type: 'input', text: input.value }); act({ type: 'send' }); } };
  input.focus();
}
if (kind === 'settings') {
  root.innerHTML = `<div class="settings"><header class="toolbar"><h1 class="name">千早 · 设置</h1><button id="files">文件说明</button><button id="close">关闭</button></header><nav class="tabs"><button data-tab="service" aria-selected="true">模型服务</button><button data-tab="persona">角色设定</button><button data-tab="music">背景音乐</button><button data-tab="desktop">桌宠</button></nav><section data-section="service"><h2>Chat Completions 服务</h2><label>HTTPS 基础地址<input id="baseURL" autocomplete="off" placeholder="https://example.com/v1"></label><label>模型名称<input id="model" autocomplete="off"></label><label>API Key<input id="key" type="password" autocomplete="off"></label><p class="help">保留服务的版本路径，应用追加 /chat/completions。各地址的密钥分别保存为本机明文。测试仅使用当前草稿，可能产生一次请求费用。</p><div class="row"><button id="test">测试连接</button><button id="cancel">取消测试</button><button id="save-service" class="primary">保存服务</button><button id="delete-key">删除已保存密钥</button></div><p id="test-status" class="notice"></p></section><section data-section="persona" hidden><h2>角色提示词</h2><label><textarea id="prompt" aria-label="角色提示词"></textarea></label><div class="row"><button id="save-prompt" class="primary">保存角色设定</button><button id="restore-prompt">恢复默认并保存</button></div><p class="help">保存后会清空当前会话。主动闲话使用独立的本地台词库。</p></section><section data-section="music" hidden><h2>背景音乐</h2><select id="tracks" size="6" aria-label="音乐曲库"></select><div class="row"><button id="music-import">导入音乐…</button><button id="music-remove">从曲库移除</button></div><div class="row"><button id="music-previous">上一首</button><button id="music-toggle">播放</button><button id="music-next">下一首</button></div><label>音量 <output id="volume-value"></output><input id="volume" type="range" min="0" max="1" step="0.01"></label><label>循环 <select id="loop"><option value="single">单曲循环</option><option value="playlist">列表循环</option></select></label><label><input id="autoplay" type="checkbox">启动时播放背景音乐</label><p class="help">支持 WAV、AIFF/AIF、MP3、M4A/AAC。隐藏与睡眠自动暂停，恢复时尊重手动暂停。移除索引不删除原文件及导入副本。</p><p id="music-notice" class="notice"></p><p id="music-error" class="notice error"></p></section><section data-section="desktop" hidden><h2>桌宠</h2><label>造型<select id="outfit"></select></label><label>取景<select id="framing"><option value="full">全景</option><option value="close">近景</option></select></label><label>表情<select id="expression"></select></label><label>图片高度 <output id="height-value"></output><input id="height" type="range" min="240" max="480" step="1"></label><label><input id="onTop" type="checkbox">置顶</label><label><input id="animations" type="checkbox">呼吸与轻摆</label><label><input id="idle" type="checkbox">主动闲话</label><label>闲话频率<select id="frequency"><option value="1">经常 · 1–3 分钟</option><option value="2">适中 · 3–7 分钟</option><option value="3">安静 · 10–15 分钟</option></select></label></section><footer><p id="settings-error" class="notice error"></p><p id="settings-notice" class="notice"></p></footer></div>`;
  node('files').onclick = () => act({ type: 'files' }); node('close').onclick = () => act({ type: 'close', window: 'settings' });
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => { button.onclick = () => { document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b === button))); document.querySelectorAll<HTMLElement>('[data-section]').forEach(s => { s.hidden = s.dataset.section !== button.dataset.tab; }); }; });
  for (const field of ['baseURL', 'model', 'key', 'prompt'] as const) {
    const input = node<HTMLInputElement | HTMLTextAreaElement>(field);
    input.addEventListener('compositionstart', () => { composing = true; }); input.addEventListener('compositionend', () => { composing = false; act({ type: 'draft', field, text: input.value }); });
    input.addEventListener('input', () => { if (!composing) act({ type: 'draft', field, text: input.value }); });
  }
  for (const type of ['test', 'cancel', 'save-service', 'delete-key', 'save-prompt', 'restore-prompt', 'music-import', 'music-remove', 'music-toggle', 'music-next', 'music-previous'] as const) node(type).onclick = () => act({ type });
  node<HTMLSelectElement>('tracks').onchange = () => act({ type: 'music-select', id: node<HTMLSelectElement>('tracks').value });
  node<HTMLInputElement>('volume').oninput = () => { node('volume-value').textContent = Math.round(Number(node<HTMLInputElement>('volume').value) * 100) + '%'; };
  node<HTMLInputElement>('volume').onchange = () => act({ type: 'music-volume', value: Number(node<HTMLInputElement>('volume').value) });
  node<HTMLSelectElement>('loop').onchange = () => act({ type: 'music-loop', value: node<HTMLSelectElement>('loop').value as 'single' | 'playlist' });
  node<HTMLInputElement>('autoplay').onchange = () => act({ type: 'music-autoplay', value: node<HTMLInputElement>('autoplay').checked });
  for (const field of ['outfit', 'framing', 'expression', 'height', 'onTop', 'animations'] as const) node<HTMLInputElement | HTMLSelectElement>(field).onchange = () => { const element = node<HTMLInputElement>(field); act({ type: 'desktop', field, value: field === 'onTop' || field === 'animations' ? element.checked : field === 'height' ? Number(element.value) : element.value }); };
  node<HTMLInputElement>('height').oninput = () => { node('height-value').textContent = `${node<HTMLInputElement>('height').value} 点`; };
  node<HTMLInputElement>('idle').onchange = () => act({ type: 'idle-enabled', value: node<HTMLInputElement>('idle').checked }); node<HTMLSelectElement>('frequency').onchange = () => act({ type: 'idle-frequency', value: Number(node<HTMLSelectElement>('frequency').value) });
}
let bubbleWriter: Writer | undefined, bubbleID = '';
if (kind === 'bubble') {
  const d = dialogue(); root.append(d.box); d.box.id = 'bubble';
  const close = document.createElement('button'); close.className = 'bubble-close'; close.textContent = '×'; close.ariaLabel = '关闭气泡'; close.onclick = () => act({ type: 'bubble-dismiss' }); d.box.append(close);
  const more = document.createElement('button'); more.id = 'read-more'; more.textContent = '查看全文'; more.onclick = () => act({ type: 'read-more' }); d.box.append(more);
  bubbleWriter = new Writer(d.text, () => act({ type: 'bubble-complete' })); d.text.onclick = () => bubbleWriter?.complete();
  d.box.onmouseenter = () => act({ type: 'bubble-hover', value: true }); d.box.onmouseleave = () => act({ type: 'bubble-hover', value: false });
  new ResizeObserver(() => { const bounds = d.box.getBoundingClientRect(); act({ type: 'bubble-size', width: Math.ceil(bounds.width + 36), height: Math.ceil(bounds.height + 36) }); }).observe(d.box);
}
let spriteURL = '', pixels: Uint8ClampedArray | undefined, width = 0, height = 0, dragging = false;
let hit = false, lastPointer: { x: number; y: number } | undefined;
let resampleHit = () => {}, lastClickThrough = false;
let audio: HTMLAudioElement | undefined, audioSource: string | undefined, revision = -1, audioSignature = '', pendingReset = false, fadeTimer: ReturnType<typeof setTimeout> | undefined;
if (kind === 'pet') {
  root.innerHTML = '<div id="pet-root"><div id="pet-reaction"><div id="pet-sway"><div id="pet-body"><canvas id="pet-canvas" aria-label="妃宫千早立绘"></canvas></div></div></div></div>';
  audio = new Audio(); audio.preload = 'auto';
  const canvas = node<HTMLCanvasElement>('pet-canvas');
  const alphaHit = (x: number, y: number): boolean => {
    if (!pixels || !state?.sprite) return false;
    const w = state.desktop.height * width / height, h = state.desktop.height;
    const around = (matrix: DOMMatrix) => new DOMMatrix().translate(w / 2, h).multiply(matrix).translate(-w / 2, -h);
    let matrix = new DOMMatrix(); for (const id of ['pet-reaction', 'pet-sway', 'pet-body']) matrix = matrix.multiply(around(new DOMMatrix(getComputedStyle(node(id)).transform === 'none' ? undefined : getComputedStyle(node(id)).transform)));
    const point = new DOMPoint(x - 12, y - 12).matrixTransform(matrix.inverse());
    const px = Math.floor(point.x / w * width), py = Math.floor(point.y / h * height);
    return px >= 0 && py >= 0 && px < width && py < height && pixels[(py * width + px) * 4 + 3]! > 12;
  };
  const updateHit = () => { if (!lastPointer) return; const next = alphaHit(lastPointer.x, lastPointer.y); if (next !== hit) { hit = next; act({ type: 'hit', opaque: hit }); } };
  resampleHit = () => { hit = false; updateHit(); };
  document.addEventListener('mousemove', event => { lastPointer = { x: event.clientX, y: event.clientY }; updateHit(); });
  document.addEventListener('mouseleave', () => { if (!dragging) { hit = false; act({ type: 'hit', opaque: false }); } });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || state.clickThrough || !alphaHit(event.clientX, event.clientY)) return;
    event.preventDefault(); dragging = true; canvas.setPointerCapture(event.pointerId); act({ type: 'drag', phase: 'start' });
    node('pet-reaction').classList.remove('clicked'); void node('pet-reaction').offsetWidth; node('pet-reaction').classList.add('clicked');
  });
  canvas.addEventListener('pointermove', () => { if (dragging) act({ type: 'drag', phase: 'move' }); });
  canvas.addEventListener('pointerup', () => { if (dragging) { dragging = false; act({ type: 'drag', phase: 'end' }); updateHit(); } });
  canvas.addEventListener('pointercancel', () => { if (dragging) { dragging = false; act({ type: 'drag', phase: 'end' }); } });
  canvas.addEventListener('contextmenu', event => { event.preventDefault(); if (hit) act({ type: 'context-menu' }); });
}
function fade(to: number, duration: number, generation: number, done = () => {}): void {
  clearTimeout(fadeTimer); const started = performance.now(), from = audio!.volume;
  const tick = () => { if (revision !== generation) return; const progress = Math.min(1, (performance.now() - started) / duration); audio!.volume = from + (to - from) * progress; if (progress < 1) fadeTimer = setTimeout(tick, 25); else { fadeTimer = undefined; done(); } }; tick();
}
function syncAudio(): void {
  if (!audio) return;
  const music = state.music;
  const signature = JSON.stringify([music.revision, music.source, music.wantsPlayback, music.suspended]);
  if (audioSignature === signature) { if (!audio.paused && Math.abs(audio.volume - music.volume) > .005 && !fadeTimer) audio.volume = music.volume; return; }
  audioSignature = signature;
  revision = music.revision; clearTimeout(fadeTimer); fadeTimer = undefined;
  const current = revision;
  if (!music.wantsPlayback || music.suspended) {
    if (audio.paused) { audio.volume = 0; act({ type: 'music-status', revision: current, playing: false }); }
    else fade(0, 350, current, () => { audio!.pause(); act({ type: 'music-status', revision: current, playing: false }); });
    return;
  }
  if (!music.source) { audio.pause(); pendingReset = true; return; }
  const changed = audioSource !== music.source;
  if (changed) {
    audioSource = music.source;
    audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load();
    audio = new Audio(); audio.preload = 'auto'; audio.src = `chihaya://audio/current?source=${encodeURIComponent(music.source.split(/[\\/]/).at(-1)!)}`; audio.load(); audio.volume = 0;
  }
  if (pendingReset && !changed) audio.currentTime = 0; pendingReset = false;
  audio.onended = () => { audio!.currentTime = 0; act({ type: 'music-status', revision: current, playing: false, ended: true }); };
  audio.onerror = () => act({ type: 'music-status', revision: current, playing: false, error: true });
  void audio.play().then(() => { if (current === revision) { act({ type: 'music-status', revision: current, playing: true }); fade(music.volume, 500, current); } }).catch(() => { if (current === revision) act({ type: 'music-status', revision: current, playing: false, error: true }); });
}
let conversationSignature = '', chatWriter: Writer | undefined, currentReply: HTMLElement | undefined, previousTurnID: string | undefined, previousPending: string | undefined;
function renderChat(): void {
  const input = node<HTMLTextAreaElement>('input'); if (!composing && document.activeElement !== input) input.value = state.input; else if (!composing && state.busy === 'chat' && !state.input && input.value) input.value = '';
  node('counter').textContent = `${characterCount(input.value)}/2,000 · Enter 发送，Shift+Enter 换行`;
  node<HTMLButtonElement>('send').disabled = Boolean(state.busy); node('cancel').hidden = !state.busy; node('retry').hidden = !state.pending || Boolean(state.busy) || !state.error;
  node('chat-error').textContent = state.error ?? ''; node('resource-error').textContent = state.resourceError ?? '';
  const signature = JSON.stringify([state.turns.map(t => t.id), state.pending, state.didTrim]);
  const history = node('history');
  if (conversationSignature !== signature) {
    const newReply = Boolean(conversationSignature) && state.pending === undefined && Boolean(state.turns.length) && state.turns.at(-1)!.id !== previousTurnID;
    const previousWriter = chatWriter, initial = newReply && previousPending !== undefined ? previousWriter?.displayed() ?? '' : '';
    const follow = !conversationSignature || history.scrollHeight - history.scrollTop - history.clientHeight <= 24, scrollTop = history.scrollTop;
    conversationSignature = signature; previousTurnID = state.turns.at(-1)?.id; previousPending = state.pending; history.replaceChildren(); currentReply = undefined;
    history.append(dialogue(state.greeting).box);
    if (state.didTrim) { const trimmed = document.createElement('p'); trimmed.className = 'muted'; trimmed.textContent = '较早的完整轮次已从界面移除。'; history.append(trimmed); }
    for (const [index, turn] of state.turns.entries()) {
      const user = document.createElement('div'); user.className = 'user'; user.textContent = turn.user; history.append(user);
      const d = dialogue(turn.assistant); d.box.id = 'turn-' + turn.id; if (turn.truncated) { const label = document.createElement('p'); label.className = 'muted'; label.textContent = '服务因长度结束回复。'; d.box.append(label); } history.append(d.box);
      if (index === state.turns.length - 1) currentReply = d.text;
    }
    if (state.pending) { const user = document.createElement('div'); user.className = 'user'; user.textContent = state.pending; history.append(user); const d = dialogue(); d.box.classList.add('incomplete'); const label = document.createElement('div'); label.className = 'muted'; label.textContent = state.busy ? '正在回复…' : '未完成 · 不加入后续上下文'; d.box.append(label); history.append(d.box); currentReply = d.text; }
    previousWriter?.stop(); chatWriter = currentReply ? new Writer(currentReply, () => {}, initial, history) : undefined;
    if (!state.pending && state.turns.length && currentReply) chatWriter?.set(state.turns.at(-1)!.assistant, newReply && animated());
    history.scrollTop = follow ? history.scrollHeight : scrollTop;
  }
  if (state.pending && currentReply) chatWriter?.set(state.partial, state.busy === 'chat' && animated());
  const incomplete = history.querySelector('.incomplete .muted');
  if (incomplete) incomplete.textContent = state.busy === 'chat' ? '正在回复…' : '未完成 · 不加入后续上下文';
  if (state.focusTurnID) { const reply = document.getElementById('turn-' + state.focusTurnID); reply?.scrollIntoView({ block: 'center' }); reply?.classList.add('highlight'); }
}
function setValue(id: string, value: string): void { const element = node<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id); if (!composing && document.activeElement !== element && element.value !== value) element.value = value; }
function options(id: string, values: { value: string; text: string }[]): void {
  const select = node<HTMLSelectElement>(id), signature = JSON.stringify(values); if (select.dataset.options === signature) return;
  select.dataset.options = signature; select.replaceChildren(...values.map(v => { const o = document.createElement('option'); o.value = v.value; o.textContent = v.text; return o; }));
}
function render(next: Snapshot): void {
  state = next;
  if (kind === 'chat') renderChat();
  if (kind === 'settings') {
    for (const field of ['baseURL', 'model', 'key', 'prompt'] as const) setValue(field, state.draft[field]);
    node('settings-error').textContent = state.settingsError ?? ''; node('settings-notice').textContent = state.settingsNotice ?? ''; node('test-status').textContent = state.testStatus ?? '';
    node<HTMLButtonElement>('test').disabled = Boolean(state.busy); node('cancel').hidden = state.busy !== 'test';
    options('tracks', state.music.tracks.map(t => ({ value: t.id, text: t.title }))); setValue('tracks', state.music.selected ?? '');
    setValue('volume', String(state.music.volume)); node('volume-value').textContent = Math.round(state.music.volume * 100) + '%'; setValue('loop', state.music.loop); node<HTMLInputElement>('autoplay').checked = state.music.autoplay;
    node('music-toggle').textContent = state.music.wantsPlayback ? '暂停' : '播放'; node('music-notice').textContent = state.music.notice ?? ''; node('music-error').textContent = state.music.error ?? '';
    for (const id of ['music-import', 'music-remove', 'music-toggle', 'music-next', 'music-previous']) node<HTMLButtonElement>(id).disabled = state.music.busy || (id !== 'music-import' && !state.music.tracks.length);
    options('outfit', state.outfits.map(o => ({ value: o.id, text: o.name }))); setValue('outfit', state.desktop.outfit); setValue('framing', state.desktop.framing); options('expression', ['automatic', ...state.expressions].map(id => ({ value: id, text: id === 'automatic' ? '自动' : id }))); setValue('expression', state.desktop.expression); setValue('height', String(state.desktop.height)); node('height-value').textContent = `${state.desktop.height} 点`;
    node<HTMLInputElement>('onTop').checked = state.desktop.onTop; node<HTMLInputElement>('animations').checked = state.desktop.animations; node<HTMLInputElement>('idle').checked = state.idleEnabled; setValue('frequency', String(state.idleFrequency));
  }
  if (kind === 'bubble' && state.bubble) {
    const bubble = state.bubble; document.body.className = `bubble ${bubble.side ?? 'left'}`; node('bubble').classList.toggle('reply', bubble.kind === 'reply'); node('read-more').hidden = bubble.kind !== 'reply';
    if (bubbleID !== bubble.id) bubbleID = bubble.id;
    bubbleWriter?.set(bubble.text, animated());
  }
  if (kind === 'pet') {
    if (lastClickThrough !== state.clickThrough) { lastClickThrough = state.clickThrough; resampleHit(); }
    document.body.classList.toggle('motion', Boolean(state.sprite) && animated());
    const canvas = node<HTMLCanvasElement>('pet-canvas');
    if (state.sprite) { node('pet-root').style.width = `${state.desktop.height * state.sprite.canvas[0]! / state.sprite.canvas[1]!}px`; node('pet-root').style.height = `${state.desktop.height}px`; }
    const url = state.sprite?.url ?? '';
    if (url !== spriteURL) {
      spriteURL = url; pixels = undefined; canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height); hit = false; act({ type: 'hit', opaque: false });
      if (url) void fetch(url).then(r => { if (!r.ok) throw new Error(); return r.blob(); }).then(createImageBitmap).then(bitmap => {
        if (spriteURL !== url) { bitmap.close(); return; }
        width = bitmap.width; height = bitmap.height; canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true })!; context.drawImage(bitmap, 0, 0); pixels = context.getImageData(0, 0, width, height).data; bitmap.close(); resampleHit();
      }).catch(() => { if (spriteURL === url) { pixels = undefined; canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height); document.body.classList.remove('motion'); } });
    }
    syncAudio();
  }
}
if (kind === 'chat' || kind === 'settings') document.addEventListener('keydown', event => { if (inputCommand(event, composing) === 'close') { event.preventDefault(); act({ type: 'close', window: kind }); } });
bridge.onState(render); void bridge.snapshot().then(render);
window.addEventListener('beforeunload', () => { chatWriter?.stop(); bubbleWriter?.stop(); clearTimeout(fadeTimer); audio?.pause(); });
