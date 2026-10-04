import type { Action, SettingsTab, Snapshot } from '../shared/contracts';
import { headerFlowers, icon, iconButton, panelChrome } from './chrome';

export function mountSettings(root: HTMLElement, act: (action: Action) => void): { render(state: Snapshot): void; composing(): boolean } {
  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'service', label: '模型服务', icon: 'service' }, { id: 'persona', label: '角色设定', icon: 'persona' },
    { id: 'music', label: '背景音乐', icon: 'music' }, { id: 'portrait', label: '立绘', icon: 'portrait' },
  ];
  root.innerHTML = `<div class="settings panel">${panelChrome}
    <header class="toolbar">${headerFlowers}<div class="heading"><h1 class="name">千早桌宠</h1><p class="muted">在熟悉的桌面，留一点陪伴。</p></div>${iconButton('close', 'close', '关闭设置')}</header>
    <nav class="tabs" role="tablist" aria-label="设置">${tabs.map(t => `<button id="tab-${t.id}" data-tab="${t.id}" role="tab" aria-controls="section-${t.id}">${icon(t.icon)}${t.label}</button>`).join('')}</nav>
    <div class="settings-content">
    <section id="section-service" data-section="service" role="tabpanel" aria-labelledby="tab-service">
      <h2>连接模型服务</h2>
      <label><span class="field-label">HTTPS API 基础地址</span><input id="baseURL" autocomplete="off" placeholder="https://example.com/v1" aria-describedby="address-help"></label>
      <p id="address-help" class="help">填写服务提供的基础地址，保留地址中的版本路径。</p>
      <label><span class="field-label">模型名称</span><input id="model" autocomplete="off" placeholder="填写服务提供的模型名"></label>
      <label><span class="field-label">API Key</span><input id="key" type="password" autocomplete="off" placeholder="填写服务密钥" aria-describedby="key-help"></label>
      <p id="key-help" class="help">密钥以明文保存在本机。</p>
      <div class="row"><button id="test">测试连接</button><span id="test-progress" class="spinner" aria-label="正在测试连接" role="status" hidden></span><button id="cancel" hidden>取消</button><span class="spacer"></span><button id="save-service" class="primary">保存服务</button></div>
      <p id="test-status" class="notice" role="status"></p>
      <p class="help">测试当前填写的配置，可能产生一次请求费用；测试不会保存设置。</p>
      <hr class="divider"><p class="help">消息将发送给你配置的服务，其数据保留政策由服务方决定。本应用不在磁盘保存聊天。</p>
      <div class="danger-zone"><p id="saved-service" class="help"></p><button id="delete-key" class="plain danger">删除当前已保存服务的密钥</button></div>
    </section>
    <section id="section-persona" data-section="persona" role="tabpanel" aria-labelledby="tab-persona" hidden>
      <h2>角色设定</h2><p class="help">调整千早说话的方式与性格。保存成功后，将结束当前对话并开始新的对话。</p>
      <textarea id="prompt" aria-label="角色设定提示词"></textarea>
      <div class="row"><button id="restore-prompt">恢复默认并保存</button><span class="spacer"></span><button id="save-prompt" class="primary">保存角色设定</button></div>
    </section>
    <section id="section-music" data-section="music" role="tabpanel" aria-labelledby="tab-music" hidden>
      <div class="row"><h2>夜奏 · 背景音乐</h2><span class="spacer"></span><button id="music-import">导入音乐…</button></div>
      <p class="help">导入喜欢的音乐，在相伴时播放。</p>
      <label class="check-label"><input id="autoplay" type="checkbox">启动时播放背景音乐</label>
      <div id="music-empty" class="music-empty">${icon('music')}<p>曲库还是空的</p><p class="help">点击「导入音乐…」添加曲目<br>支持 WAV、AIFF/AIF、MP3、M4A、AAC</p></div>
      <div id="tracks" role="listbox" aria-label="音乐曲库" hidden></div>
      <div class="row"><button id="music-previous">上一首</button><button id="music-toggle">播放</button><button id="music-next">下一首</button><span class="spacer"></span><select id="loop" aria-label="循环"><option value="single">单曲循环</option><option value="playlist">列表循环</option></select></div>
      <div class="row volume-row">${icon('volume')}<input id="volume" aria-label="背景音乐音量" type="range" min="0" max="1" step="0.01"><output id="volume-value" for="volume"></output></div>
      <p id="music-suspended" class="notice"></p><div id="music-progress" class="row muted" role="status" hidden><span class="spinner" aria-hidden="true"></span><span id="music-operation"></span></div>
      <p id="music-notice" class="notice" role="status"></p><p id="music-error" class="notice error" role="alert"></p>
      <div class="danger-zone"><button id="music-remove" class="plain danger">从曲库移除所选曲目</button><p class="help">移除索引不会删除原文件及导入副本。</p></div>
      <p class="quiet">隐藏桌宠或电脑休眠时，音乐会暂停。</p>
    </section>
    <section id="section-portrait" data-section="portrait" role="tabpanel" aria-labelledby="tab-portrait" hidden>
      <h2>立绘</h2>
      <label><span class="field-label">服装／姿态</span><select id="outfit"></select></label>
      <label><span class="field-label">取景</span><select id="framing"><option value="full">全景</option><option value="close">近景</option></select></label>
      <label><span class="field-label">表情编号</span><select id="expression"></select></label>
      <label><span class="field-label">角色大小 · <output id="height-value" for="height"></output></span><input id="height" aria-label="角色显示高度" type="range" min="240" max="480" step="1"></label>
      <p class="help">240–480 点 · 默认 256 点</p>
      <div class="portrait-toggles"><label class="check-label"><input id="onTop" type="checkbox">置顶</label><label class="check-label"><input id="clickThrough" type="checkbox">鼠标穿透</label><label class="check-label"><input id="animations" type="checkbox">启用动效</label><label class="check-label"><input id="headPetting" type="checkbox">摸头互动</label></div>
      <p class="help">当前编号立绘没有摸头表情映射。</p>
      <label class="check-label"><input id="idle" type="checkbox">主动闲话</label>
      <label><span class="field-label">闲话频率</span><select id="frequency"><option value="1">经常 · 1–3 分钟</option><option value="2">适中 · 3–7 分钟</option><option value="3">安静 · 10–15 分钟</option></select></label>
      <p id="resource-error" class="notice error" role="alert"></p>
    </section></div>
    <footer><p id="settings-error" class="notice error" role="alert"></p><p id="settings-notice" class="notice" role="status"></p></footer>
  </div>`;
  const node = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  let composing = false, initialized = false, focusID: string | undefined, trackSignature = '', expressionSignature = '', outfitSignature = '';
  const adjustingRanges = new Set<HTMLInputElement>();
  root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(field => {
    field.addEventListener('pointerdown', () => adjustingRanges.add(field));
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) field.addEventListener(event, () => adjustingRanges.delete(field));
  });
  let state: Snapshot;
  const setValue = (id: string, value: string) => {
    const field = node<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
    const textDraft = ['baseURL', 'model', 'key', 'prompt'].includes(id);
    if (textDraft && (composing || initialized && document.activeElement === field)) return;
    if (field instanceof HTMLInputElement && adjustingRanges.has(field)) return;
    if (field.value !== value) field.value = value;
  };
  const chooseTab = (tab: SettingsTab) => {
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => {
      const selected = button.dataset.tab === tab; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    root.querySelectorAll<HTMLElement>('[data-section]').forEach(section => { section.hidden = section.dataset.section !== tab; });
  };
  node('close').onclick = () => act({ type: 'close', window: 'settings' });
  for (const [i, tab] of tabs.entries()) {
    const button = node<HTMLButtonElement>('tab-' + tab.id);
    button.onclick = () => { chooseTab(tab.id); act({ type: 'settings-tab', tab: tab.id }); };
    button.onkeydown = event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault(); const next = tabs[(i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]!;
      node('tab-' + next.id).focus(); chooseTab(next.id); act({ type: 'settings-tab', tab: next.id });
    };
  }
  for (const field of ['baseURL', 'model', 'key', 'prompt'] as const) {
    const input = node<HTMLInputElement | HTMLTextAreaElement>(field);
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; act({ type: 'draft', field, text: input.value }); });
    input.addEventListener('input', () => { if (!composing) act({ type: 'draft', field, text: input.value }); });
  }
  for (const type of ['test', 'cancel', 'save-service', 'delete-key', 'save-prompt', 'restore-prompt', 'music-import', 'music-remove', 'music-toggle', 'music-next', 'music-previous'] as const) node(type).onclick = () => { if (!composing) act({ type }); };
  node<HTMLInputElement>('volume').oninput = () => { const value = Number(node<HTMLInputElement>('volume').value); node('volume-value').textContent = Math.round(value * 100) + '%'; act({ type: 'music-volume', value }); };
  node<HTMLSelectElement>('loop').onchange = () => act({ type: 'music-loop', value: node<HTMLSelectElement>('loop').value as 'single' | 'playlist' });
  node<HTMLInputElement>('autoplay').onchange = () => act({ type: 'music-autoplay', value: node<HTMLInputElement>('autoplay').checked });
  for (const field of ['outfit', 'framing', 'expression', 'onTop', 'animations', 'headPetting'] as const) node<HTMLInputElement | HTMLSelectElement>(field).onchange = () => {
    const element = node<HTMLInputElement>(field); act({ type: 'desktop', field, value: ['onTop', 'animations', 'headPetting'].includes(field) ? element.checked : element.value });
  };
  node<HTMLInputElement>('height').oninput = () => { const value = Number(node<HTMLInputElement>('height').value); node('height-value').textContent = `${value} 点`; act({ type: 'desktop', field: 'height', value }); };
  node<HTMLInputElement>('clickThrough').onchange = () => act({ type: 'click-through', value: node<HTMLInputElement>('clickThrough').checked });
  node<HTMLInputElement>('idle').onchange = () => act({ type: 'idle-enabled', value: node<HTMLInputElement>('idle').checked });
  node<HTMLSelectElement>('frequency').onchange = () => act({ type: 'idle-frequency', value: Number(node<HTMLSelectElement>('frequency').value) });
  node('tracks').onkeydown = event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || state.music.operation === 'remove') return;
    event.preventDefault(); const tracks = state.music.tracks; if (!tracks.length) return;
    const current = tracks.findIndex(t => t.id === state.music.selected);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tracks.length - 1 : Math.min(tracks.length - 1, Math.max(0, current + (event.key === 'ArrowDown' ? 1 : -1)));
    const track = tracks[index]!; act({ type: 'music-select', id: track.id });
    root.querySelector<HTMLButtonElement>(`[data-track="${track.id}"]`)?.focus();
  };
  return {
    composing: () => composing,
    render(next) {
      state = next;
      for (const field of ['baseURL', 'model', 'key', 'prompt'] as const) setValue(field, state.draft[field]);
      chooseTab(state.settingsTab);
      if (!composing && state.settingsFocus && focusID !== state.settingsFocus.id) {
        focusID = state.settingsFocus.id; chooseTab('service');
        if (state.settingsFocus.field) { const field = node<HTMLInputElement>(state.settingsFocus.field); field.focus(); field.scrollIntoView({ block: 'nearest' }); }
      }
      node('settings-error').textContent = state.settingsError ?? ''; node('settings-error').hidden = !state.settingsError;
      node('settings-notice').textContent = state.settingsNotice ?? ''; node('settings-notice').hidden = !state.settingsNotice;
      node('test-status').textContent = state.testStatus ?? ''; node('test-status').hidden = !state.testStatus;
      node<HTMLButtonElement>('test').disabled = Boolean(state.busy);
      node('cancel').hidden = state.busy !== 'test'; node('test-progress').hidden = state.busy !== 'test';
      node<HTMLButtonElement>('delete-key').disabled = !state.savedService;
      node('saved-service').textContent = state.savedService ? `已保存服务：${state.savedService.baseURL} · ${state.savedService.model}` : '尚未保存模型服务。';
      const music = state.music, tracks = node('tracks');
      const nextTracks = JSON.stringify(music.tracks);
      if (trackSignature !== nextTracks) {
        trackSignature = nextTracks;
        tracks.replaceChildren(...music.tracks.map(track => {
          const button = document.createElement('button'); button.className = 'track'; button.dataset.track = track.id; button.setAttribute('role', 'option'); button.title = track.title;
          const marker = document.createElement('span'); marker.className = 'track-marker'; marker.setAttribute('aria-hidden', 'true');
          const title = document.createElement('span'); title.className = 'track-title'; title.textContent = track.title;
          button.append(marker, title); button.onclick = () => act({ type: 'music-select', id: track.id }); return button;
        }));
      }
      tracks.hidden = !music.tracks.length; node('music-empty').hidden = Boolean(music.tracks.length);
      tracks.querySelectorAll<HTMLButtonElement>('[data-track]').forEach(button => {
        const selected = button.dataset.track === music.selected;
        button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; button.disabled = music.operation === 'remove';
        button.querySelector('.track-marker')!.textContent = selected ? '♪' : '○';
      });
      setValue('volume', String(music.volume)); node('volume-value').textContent = Math.round(music.volume * 100) + '%'; setValue('loop', music.loop); node<HTMLInputElement>('autoplay').checked = music.autoplay;
      node('music-toggle').textContent = music.wantsPlayback ? '暂停' : '播放';
      node<HTMLButtonElement>('music-toggle').disabled = !music.selected || music.operation === 'remove';
      for (const id of ['music-next', 'music-previous']) node<HTMLButtonElement>(id).disabled = !music.tracks.length || music.operation === 'remove';
      node<HTMLButtonElement>('music-import').disabled = music.busy;
      node<HTMLButtonElement>('music-remove').disabled = music.busy || !music.selected;
      node('music-progress').hidden = !music.busy; node('music-operation').textContent = music.operation === 'remove' ? '正在移除所选曲目…' : '正在导入音乐…';
      const reasons = music.suspensionReasons.map(reason => reason === 'hidden' ? '桌宠隐藏' : '电脑休眠');
      node('music-suspended').textContent = music.wantsPlayback && music.suspended ? `${reasons.join('、')}中，音乐已自动暂停。` : '';
      node('music-suspended').hidden = !(music.wantsPlayback && music.suspended);
      for (const field of ['notice', 'error'] as const) { node('music-' + field).textContent = music[field] ?? ''; node('music-' + field).hidden = !music[field]; }
      const outfits = JSON.stringify(state.outfits);
      if (outfits !== outfitSignature) { outfitSignature = outfits; node<HTMLSelectElement>('outfit').replaceChildren(...state.outfits.map(o => new Option(o.name, o.id))); }
      const expressions = JSON.stringify(state.expressions);
      if (expressions !== expressionSignature) {
        expressionSignature = expressions;
        node<HTMLSelectElement>('expression').replaceChildren(new Option('自动', 'automatic'), ...state.expressions.map(e => { const option = new Option(e.id + (e.approved ? '' : ' · 待审核'), e.id); option.disabled = !e.approved; return option; }));
      }
      setValue('outfit', state.desktop.outfit); setValue('framing', state.desktop.framing); setValue('expression', state.desktop.expression); setValue('height', String(state.desktop.height)); node('height-value').textContent = `${Math.round(state.desktop.height)} 点`;
      for (const field of ['onTop', 'animations', 'headPetting'] as const) node<HTMLInputElement>(field).checked = state.desktop[field];
      node<HTMLInputElement>('clickThrough').checked = state.clickThrough; node<HTMLInputElement>('idle').checked = state.idleEnabled; setValue('frequency', String(state.idleFrequency));
      node('resource-error').textContent = state.resourceError ?? ''; node('resource-error').hidden = !state.resourceError;
      initialized = true;
    },
  };
}
