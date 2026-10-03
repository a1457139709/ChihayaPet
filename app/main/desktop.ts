import { BrowserWindow, screen, nativeTheme, systemPreferences, dialog, shell, app, type Rectangle } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Action, Bubble, DesktopSettings, Manifest, Snapshot, Turn, Preferences } from '../shared/contracts';
import { excerpt } from '../shared/text';
import { IdleCatalog, idleAllowed, idleDelay } from '../shared/idle';
import { bubbleFrame, clamped, fromMacOrigin, toMacOrigin, initialFrame, nearbyPanel } from '../shared/geometry';
import { Companion } from './companion';
import { StandingLibrary } from './resources';
import { Platform } from '../platform/native';
import { MusicController } from './music';
import type { DataPaths } from './paths';

export class DesktopApplication {
  readonly pet: BrowserWindow;
  private chat?: BrowserWindow;
  private settings?: BrowserWindow;
  private speech?: BrowserWindow;
  private manifest?: Manifest;
  private desktop: DesktopSettings;
  private visible = true;
  private awake = true;
  private clickThrough = false;
  private reducedMotion = false;
  private idleEnabled: boolean;
  private idleFrequency: number;
  private bubble?: Bubble;
  private candidate?: Turn;
  private hover = false;
  private bubbleFinished = false;
  private idleTimer?: NodeJS.Timeout;
  private expiryTimer?: NodeJS.Timeout;
  private publishTimer?: NodeJS.Timeout;
  private library?: StandingLibrary;
  private sprite?: Snapshot['sprite'];
  private spriteData?: Buffer;
  private resourceError?: string;
  private focusTurnID?: string;
  private settingsFocus?: Snapshot['settingsFocus'];
  private drag?: { cursor: { x: number; y: number }; frame: Rectangle; moved: boolean };
  private catalog = new IdleCatalog();
  private shutdownFlag = false;
  onMenuChanged: () => void = () => {};
  onContextMenu: () => void = () => {};
  constructor(readonly companion: Companion, readonly music: MusicController, readonly platform: Platform, readonly paths: DataPaths, readonly applicationDir: string, resources: string) {
    let prefs: Preferences = {}; try { prefs = platform.load(); } catch (e) { this.resourceError = (e as Error).message; }
    try { this.library = new StandingLibrary(path.join(resources, 'Characters/Standing')); this.manifest = this.library.manifest; } catch { this.resourceError = '立绘清单不可用。可以通过菜单打开聊天或设置。'; }
    const legacy = ({ blue_rose: 'blue-white-rose', red_skirt: 'red-white-anime-maid', long_shirt: 'loose-long-shirt-experiment-v1' } as Record<string, string>)[String(prefs['desktop.expandedStyle'])];
    let outfit = String(prefs['desktop.standingOutfit'] ?? legacy ?? prefs['desktop.expandedStyle'] ?? prefs['desktop.style'] ?? (prefs['desktop.outfit'] === 'summer' ? 'a_' : 'a'));
    const invalidOutfit = !this.manifest?.outfits.some(o => o.id === outfit); if (invalidOutfit) outfit = 'a';
    const framing = prefs['desktop.framing'] === 'close' ? 'close' : 'full';
    const invalidFraming = prefs['desktop.framing'] !== undefined && !['full', 'close'].includes(String(prefs['desktop.framing']));
    const savedHeight = Number(prefs['desktop.imageHeight'] ?? 256);
    this.desktop = { outfit, framing, expression: invalidOutfit || invalidFraming ? '00' : String(prefs['desktop.numberedExpression'] ?? 'automatic'), height: Number.isFinite(savedHeight) ? Math.min(480, Math.max(240, savedHeight)) : 256, onTop: prefs['desktop.isOnTop'] !== false, animations: prefs['desktop.animationsEnabled'] !== false };
    this.desktop.expression = this.library?.mode(`${outfit}/${framing}`, this.desktop.expression) ?? '00';
    this.idleEnabled = prefs['idle.enabled'] !== false; this.idleFrequency = [1, 2, 3].includes(Number(prefs['idle.frequency'])) ? Number(prefs['idle.frequency']) : 2;
    this.pet = this.createWindow('pet', false);
    this.pet.setBounds(this.restoreFrame(prefs));
    this.pet.setIgnoreMouseEvents(true, { forward: true });
    this.pet.once('ready-to-show', () => this.pet.showInactive());
    this.pet.on('closed', () => { if (!this.shutdownFlag) app.quit(); });
    this.companion.onChange = () => this.refresh(); this.companion.onNeedsSettings = () => {
      this.open('settings');
      this.settingsFocus = { id: randomUUID(), field: this.companion.missingSettingsField() }; this.refresh();
    };
    this.companion.onReply = turn => { this.candidate = turn; if (!this.chat?.isVisible()) this.presentReply(); };
    this.companion.onCleared = () => { this.candidate = undefined; this.dismissBubble(false); };
    this.music.onChange = () => this.refresh();
    this.platform.watchReducedMotion(value => { this.reducedMotion = value; this.refresh(); });
    nativeTheme.on('updated', () => { this.readWindowsMotion(); this.refresh(); }); this.readWindowsMotion();
    const displaysChanged = () => { this.resize(); this.savePosition(); };
    screen.on('display-added', displaysChanged); screen.on('display-removed', displaysChanged); screen.on('display-metrics-changed', displaysChanged);
    this.updateSprite(); this.refresh();
  }
  private readWindowsMotion(): void { if (process.platform === 'win32') this.reducedMotion = systemPreferences.getAnimationSettings().prefersReducedMotion; }
  private createWindow(kind: 'pet' | 'bubble' | 'chat' | 'settings', focusable: boolean): BrowserWindow {
    const window = new BrowserWindow({
      width: kind === 'settings' ? 580 : kind === 'chat' ? 500 : 300, height: kind === 'settings' ? 650 : kind === 'chat' ? 590 : 180,
      minWidth: focusable ? 360 : undefined, minHeight: focusable ? 300 : undefined,
      show: false, frame: focusable, transparent: !focusable, backgroundColor: focusable ? '#f7f7f0' : '#00000000',
      focusable, resizable: focusable, skipTaskbar: !focusable, hasShadow: focusable,
      fullscreenable: false, title: kind === 'settings' ? '千早 · 设置' : '妃宫千早',
      type: process.platform === 'darwin' && !focusable ? 'panel' : undefined,
      webPreferences: { preload: path.join(this.applicationDir, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
    });
    window.setMenuBarVisibility(false);
    if (process.platform === 'darwin' && (kind === 'pet' || kind === 'bubble')) window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false, skipTransformProcessType: true });
    if (!focusable) window.setAlwaysOnTop(kind === 'pet' ? this.desktop?.onTop ?? true : true, 'floating');
    const configureSpaces = () => this.platform.configureWindow(window.getNativeWindowHandle(), !focusable);
    configureSpaces();
    // Chromium updates its collection flags while showing a window. Restore
    // the native policy after that update, without a timer or polling loop.
    window.on('show', () => setImmediate(() => { if (!window.isDestroyed()) configureSpaces(); }));
    window.on('always-on-top-changed', configureSpaces);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    void window.loadFile(path.join(this.applicationDir, 'index.html'), { query: { window: kind } });
    return window;
  }
  private size(): { width: number; height: number } {
    const canvas = this.manifest?.variants[`${this.desktop.outfit}/${this.desktop.framing}`]?.canvas ?? [606, 606];
    return { width: Math.round(canvas[0]! / canvas[1]! * this.desktop.height + 24), height: Math.round(this.desktop.height + 24) };
  }
  private restoreFrame(prefs: Preferences): Rectangle {
    const primary = screen.getPrimaryDisplay(), size = this.size();
    if (typeof prefs['desktop.frameX'] !== 'number' || typeof prefs['desktop.frameY'] !== 'number' || !Number.isFinite(prefs['desktop.frameX']) || !Number.isFinite(prefs['desktop.frameY'])) return initialFrame(size.width, size.height, primary.workArea);
    const origin = { x: prefs['desktop.frameX'], y: prefs['desktop.frameY'] };
    const frame = process.platform === 'darwin' ? fromMacOrigin(origin, size, primary.bounds.height) : { ...origin, ...size };
    const uuids = this.platform.displayUUIDs();
    const display = screen.getAllDisplays().find(d => (uuids.find(u => u.id === d.id)?.uuid ?? String(d.id)) === prefs['desktop.displayUUID']);
    return clamped(frame, display?.workArea ?? primary.workArea);
  }
  private resize(): void {
    const old = this.pet.getBounds(), size = this.size();
    const frame = { x: old.x + (old.width - size.width) / 2, y: old.y + old.height - size.height, ...size };
    this.pet.setBounds(clamped(frame, screen.getDisplayMatching(old).workArea)); this.positionBubble(); this.refresh();
  }
  private savePosition(): void {
    const frame = this.pet.getBounds(), display = screen.getDisplayMatching(frame);
    const origin = process.platform === 'darwin' ? toMacOrigin(frame, screen.getPrimaryDisplay().bounds.height) : frame;
    const id = this.platform.displayUUIDs().find(d => d.id === display.id)?.uuid ?? String(display.id);
    this.savePreferences({ 'desktop.frameX': origin.x, 'desktop.frameY': origin.y, 'desktop.displayUUID': id });
  }
  private savePreferences(changes: Preferences): boolean {
    try { this.platform.save(changes); return true; } catch { void dialog.showMessageBox({ type: 'error', message: '偏好保存失败，请检查本机数据目录。' }); return false; }
  }
  private updateSprite(): void {
    const key = `${this.desktop.outfit}/${this.desktop.framing}`;
    const expression = this.companion.snapshot().busy === 'chat' ? 'serious' : this.bubble ? 'smile' : 'neutral';
    const faceID = this.library?.number(key, this.desktop.expression, expression, this.sprite?.key === key ? this.sprite.faceID : undefined) ?? '00';
    if (this.sprite?.key === key && this.sprite.faceID === faceID) return;
    const frame = this.library?.resolve(key, faceID);
    this.sprite = undefined; this.spriteData = undefined;
    if (frame) {
      this.sprite = { url: `chihaya://sprite/${key}/${faceID}`, canvas: frame.canvas, key, faceID, speech: frame.variant.speech }; this.spriteData = frame.data; this.resourceError = undefined;
    } else this.resourceError = '指定立绘缺失、损坏或未批准，画面已清空。请通过菜单更换造型或打开聊天。';
  }
  spriteResponse(url: string): Response {
    if (!this.sprite || !this.spriteData || url !== this.sprite.url) return new Response('', { status: 404 });
    return new Response(new Uint8Array(this.spriteData), { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
  }
  snapshot(includeKey = false): Snapshot {
    const conversation = this.companion.snapshot(); if (!includeKey) conversation.draft.key = '';
    return { ...conversation, desktop: { ...this.desktop }, clickThrough: this.clickThrough, visible: this.visible, awake: this.awake, reducedMotion: this.reducedMotion, sprite: this.sprite, resourceError: this.resourceError, outfits: this.manifest?.outfits ?? [], expressions: this.manifest?.variants[`${this.desktop.outfit}/${this.desktop.framing}`]?.results.map(r => r.id) ?? [], idleEnabled: this.idleEnabled, idleFrequency: this.idleFrequency, bubble: this.bubble, chatVisible: Boolean(this.chat?.isVisible()), settingsVisible: Boolean(this.settings?.isVisible()), focusTurnID: this.focusTurnID, settingsFocus: this.settingsFocus, music: this.music.snapshot() };
  }
  private allowed(): boolean {
    const state = this.companion.snapshot();
    return idleAllowed({ visible: this.visible, awake: this.awake, clickThrough: this.clickThrough, chat: Boolean(this.chat), settings: Boolean(this.settings), input: state.input, busy: Boolean(state.busy), bubble: Boolean(this.bubble) || Boolean(this.candidate) });
  }
  private canShowReply(): boolean {
    if (!this.visible || !this.awake || this.clickThrough || this.chat || this.settings) return false;
    const state = this.companion.snapshot();
    return !state.busy && state.pending === undefined && !state.input;
  }
  private refresh(): void {
    if (this.shutdownFlag) return;
    if (!this.allowed()) { clearTimeout(this.idleTimer); this.idleTimer = undefined; }
    else if (this.idleEnabled && !this.idleTimer) this.idleTimer = setTimeout(() => { this.idleTimer = undefined; this.say(); }, idleDelay(this.idleFrequency));
    if (this.bubble?.kind === 'idle') {
      const state = this.companion.snapshot();
      if (!this.visible || !this.awake || this.clickThrough || this.chat?.isVisible() || this.settings?.isVisible() || state.busy || state.input) this.dismissBubble(false);
    }
    if (this.bubble?.kind === 'reply' && !this.canShowReply()) this.dismissBubble(false);
    if (this.candidate && !this.bubble && this.canShowReply()) this.presentReply();
    this.updateSprite();
    if (this.publishTimer) return;
    this.publishTimer = setTimeout(() => {
      this.publishTimer = undefined;
      for (const window of [this.pet, this.chat, this.settings, this.speech]) if (window && !window.isDestroyed()) window.webContents.send('chihaya:state', this.snapshot(window === this.settings));
      this.onMenuChanged();
    }, 40);
  }
  open(kind: 'chat' | 'settings'): void {
    if (!this.chat?.isVisible() && !this.settings?.isVisible()) this.platform.rememberFocus();
    this.visible = true; this.pet.showInactive(); void this.music.resume('hidden');
    this.dismissBubble(false);
    let window = kind === 'chat' ? this.chat : this.settings;
    if (!window) {
      if (kind === 'settings') this.companion.beginSettings();
      window = this.createWindow(kind, true);
      if (kind === 'chat') this.chat = window; else this.settings = window;
      window.setBounds(nearbyPanel(this.pet.getBounds(), screen.getDisplayMatching(this.pet.getBounds()).workArea, window.getBounds()));
      window.on('closed', () => {
        if (kind === 'chat') this.chat = undefined; else { this.settings = undefined; this.settingsFocus = undefined; this.companion.endSettings(); }
        if (!this.chat && !this.settings) this.platform.restoreFocus();
        this.presentReply(); this.refresh();
      });
      window.once('ready-to-show', () => { window!.show(); window!.focus(); this.refresh(); });
    } else { window.show(); window.focus(); }
    this.refresh();
  }
  private presentReply(): void {
    if (!this.candidate || !this.canShowReply()) return;
    this.present({ id: randomUUID(), kind: 'reply', text: excerpt(this.candidate.assistant), fullText: this.candidate.assistant, turnID: this.candidate.id });
  }
  private say(): void { if (this.allowed()) { const text = this.catalog.next(new Date().getHours()); this.present({ id: randomUUID(), kind: 'idle', text, fullText: text }); } }
  private present(bubble: Bubble): void {
    this.dismissBubble(false); this.bubble = bubble; this.bubbleFinished = false; this.hover = false;
    this.speech = this.createWindow('bubble', false); this.positionBubble();
    this.speech.once('ready-to-show', () => this.speech?.showInactive()); this.refresh();
  }
  private positionBubble(): void {
    if (!this.speech || !this.sprite || !this.bubble) return;
    const frame = bubbleFrame(this.pet.getBounds(), screen.getDisplayMatching(this.pet.getBounds()).workArea, this.sprite.speech, this.sprite.canvas[1]!, this.desktop.height, this.speech.getBounds());
    this.bubble.side = frame.side; this.speech.setBounds(frame);
  }
  private dismissBubble(consumed = true): void {
    if (consumed && this.bubble?.kind === 'reply') this.candidate = undefined;
    clearTimeout(this.expiryTimer); this.expiryTimer = undefined;
    this.bubble = undefined; this.speech?.destroy(); this.speech = undefined; this.bubbleFinished = false;
  }
  private expiry(): void {
    clearTimeout(this.expiryTimer); this.expiryTimer = undefined;
    if (this.bubble && this.bubbleFinished && !this.hover) this.expiryTimer = setTimeout(() => { this.dismissBubble(); this.refresh(); }, 12_000);
  }
  setAwake(value: boolean): void {
    this.awake = value;
    if (value) { void this.music.resume('sleep'); this.presentReply(); } else { this.music.suspend('sleep'); this.dismissBubble(false); }
    clearTimeout(this.idleTimer); this.idleTimer = undefined; this.refresh();
  }
  async act(action: Action): Promise<void> {
    switch (action.type) {
      case 'input': this.companion.setInput(action.text); break;
      case 'send': await this.companion.send(); break;
      case 'retry': await this.companion.send(true); break;
      case 'cancel': this.companion.cancel(); break;
      case 'clear': this.companion.clear(); break;
      case 'draft': this.companion.setDraft(action.field, action.text); break;
      case 'test': await this.companion.testConnection(); break;
      case 'save-service': this.companion.saveService(); break;
      case 'delete-key': this.companion.deleteKey(); break;
      case 'save-prompt': this.companion.savePrompt(); break;
      case 'restore-prompt': this.companion.savePrompt(true); break;
      case 'chat': this.open('chat'); break;
      case 'settings': this.open('settings'); break;
      case 'close': (action.window === 'chat' ? this.chat : this.settings)?.close(); break;
      case 'files': await shell.openPath(this.paths.files); break;
      case 'quit': app.quit(); break;
      case 'visible':
        this.visible = action.value;
        if (action.value) { this.pet.showInactive(); void this.music.resume('hidden'); this.presentReply(); }
        else { this.pet.hide(); this.chat?.close(); this.settings?.close(); this.dismissBubble(false); this.music.suspend('hidden'); }
        break;
      case 'click-through': this.clickThrough = action.value; this.pet.setIgnoreMouseEvents(true, { forward: true }); break;
      case 'hit': if (!this.drag) this.pet.setIgnoreMouseEvents(this.clickThrough || !action.opaque, { forward: true }); return;
      case 'context-menu': this.onContextMenu(); break;
      case 'desktop': {
        const changes: Preferences = {}, field = action.field;
        let value = action.value;
        if (field === 'outfit') { if (!this.manifest?.outfits.some(o => o.id === value)) return; changes['desktop.standingOutfit'] = value; }
        if (field === 'framing') { if (!['full', 'close'].includes(String(value))) return; changes['desktop.framing'] = value; }
        if (field === 'expression') { if (value !== 'automatic' && !this.snapshot().expressions.includes(String(value))) return; changes['desktop.numberedExpression'] = value; }
        if (field === 'height') { value = Math.min(480, Math.max(240, Number(value))); if (!Number.isFinite(value)) return; changes['desktop.imageHeight'] = value; }
        if (field === 'onTop') changes['desktop.isOnTop'] = value;
        if (field === 'animations') changes['desktop.animationsEnabled'] = value;
        const next = { ...this.desktop, [field]: value };
        next.expression = this.library?.mode(`${next.outfit}/${next.framing}`, next.expression) ?? '00';
        if (next.expression !== this.desktop.expression) changes['desktop.numberedExpression'] = next.expression;
        if (!this.savePreferences(changes)) return;
        this.desktop = next; this.updateSprite(); this.resize();
        if (field === 'onTop') {
          this.pet.setAlwaysOnTop(this.desktop.onTop, 'floating');
          // Setting the same level resets Chromium's collection behavior without
          // emitting always-on-top-changed; restore the policy after every call.
          this.platform.configureWindow(this.pet.getNativeWindowHandle(), true);
        }
        this.savePosition(); break;
      }
      case 'drag': {
        const cursor = screen.getCursorScreenPoint();
        if (action.phase === 'start' && !this.clickThrough) this.drag = { cursor, frame: this.pet.getBounds(), moved: false };
        if (this.drag && action.phase !== 'start') {
          const dx = cursor.x - this.drag.cursor.x, dy = cursor.y - this.drag.cursor.y;
          this.drag.moved ||= Math.hypot(dx, dy) > 4;
          if (this.drag.moved) { this.pet.setBounds(clamped({ ...this.drag.frame, x: this.drag.frame.x + dx, y: this.drag.frame.y + dy }, screen.getDisplayNearestPoint(cursor).workArea)); this.positionBubble(); }
          if (action.phase === 'end') { const moved = this.drag.moved; this.drag = undefined; if (moved) this.savePosition(); else this.open('chat'); }
        }
        break;
      }
      case 'idle-enabled': this.idleEnabled = action.value; this.savePreferences({ 'idle.enabled': action.value }); clearTimeout(this.idleTimer); this.idleTimer = undefined; if (!action.value && this.bubble?.kind === 'idle') this.dismissBubble(false); break;
      case 'idle-frequency': this.idleFrequency = action.value; this.savePreferences({ 'idle.frequency': action.value }); clearTimeout(this.idleTimer); this.idleTimer = undefined; break;
      case 'say': this.say(); break;
      case 'bubble-dismiss': this.dismissBubble(); break;
      case 'bubble-complete': this.bubbleFinished = true; this.expiry(); break;
      case 'bubble-hover': this.hover = action.value; this.expiry(); break;
      case 'bubble-size': if (this.speech) { const area = screen.getDisplayMatching(this.pet.getBounds()).workArea; this.speech.setSize(Math.min(area.width, Math.ceil(action.width)), Math.min(area.height, Math.ceil(action.height))); this.positionBubble(); } break;
      case 'read-more': this.focusTurnID = this.bubble?.turnID; this.open('chat'); break;
      case 'music-import': { const result = await dialog.showOpenDialog({ title: '导入背景音乐', properties: ['openFile', 'multiSelections'], filters: [{ name: '音频', extensions: ['wav', 'aiff', 'aif', 'mp3', 'm4a', 'aac'] }] }); if (!result.canceled) await this.music.importFiles(result.filePaths); break; }
      case 'music-remove': await this.music.remove(); break;
      case 'music-toggle': await this.music.toggle(); break;
      case 'music-next': await this.music.next(); break;
      case 'music-previous': await this.music.next(-1); break;
      case 'music-select': await this.music.select(action.id); break;
      case 'music-volume': this.music.setVolume(action.value); break;
      case 'music-loop': this.music.setLoop(action.value); break;
      case 'music-autoplay': this.music.setAutoplay(action.value); break;
      case 'music-status': this.music.status(action.revision, action.playing, action.ended, action.error); return;
    }
    this.refresh();
  }
  windowKind(id: number): string | undefined { return this.settings?.webContents.id === id ? 'settings' : this.chat?.webContents.id === id ? 'chat' : this.pet.webContents.id === id ? 'pet' : this.speech?.webContents.id === id ? 'bubble' : undefined; }
  shutdown(): void {
    this.shutdownFlag = true; for (const timer of [this.idleTimer, this.expiryTimer, this.publishTimer]) clearTimeout(timer);
    this.companion.shutdown(); this.music.shutdown(); this.platform.shutdown();
    for (const window of [this.speech, this.chat, this.settings, this.pet]) if (window && !window.isDestroyed()) window.destroy();
  }
}
