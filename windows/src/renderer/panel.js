'use strict';

(function () {
  const CHAT_LIMIT = 2000;
  const segmenter = new Intl.Segmenter('zh-CN', {granularity: 'grapheme'});
  const GREETINGS = Object.freeze([
    '贵安。今天想聊些什么？',
    '今天也辛苦了。要稍微休息一下吗？',
    '我会在这里陪着你，请慢慢说。',
    '有什么烦恼的话，可以告诉我。',
    '如果只是想安静地待一会儿，也很好。',
  ]);

  function servicePayload(draft, keyTouched) {
    const payload = {baseURL: draft.baseURL, model: draft.model};
    if (keyTouched) payload.apiKey = draft.apiKey;
    return payload;
  }

  function playbackTransition(previous, next, ended = false) {
    const effects = [];
    const sourceChanged = !previous || previous.selectedId !== next.selectedId || previous.url !== next.url;
    if (sourceChanged) effects.push('source');
    if (next.shouldPlay && next.url && (sourceChanged || !previous || !previous.shouldPlay || ended)) effects.push('play');
    else if (previous && previous.shouldPlay && !next.shouldPlay) effects.push('pause');
    return effects;
  }

  function hasPanelDraft(text) {
    return typeof text === 'string' && text.trim().length > 0;
  }

  function graphemeCount(text) {
    if (typeof text !== 'string' || text.length === 0) return 0;
    let count = 0;
    for (const _part of segmenter.segment(text)) count += 1;
    return count;
  }

  function canSendText(text) {
    return typeof text === 'string' && text.trim().length > 0 && graphemeCount(text) <= CHAT_LIMIT;
  }

  function shouldSubmitKey(event) {
    return event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
  }

  function chooseGreeting(random = Math.random) {
    const index = Math.max(0, Math.min(GREETINGS.length - 1, Math.floor(random() * GREETINGS.length)));
    return GREETINGS[index];
  }

  function createAudioCoordinator(audio, options = {}) {
    const onError = typeof options.onError === 'function' ? options.onError : () => {};
    const schedule = options.schedule || (callback => setTimeout(callback, 16));
    const cancelSchedule = options.cancelSchedule || clearTimeout;
    const clock = options.clock || (() => (typeof performance === 'undefined' ? Date.now() : performance.now()));
    let previous = null;
    let generation = 0;
    let timer = null;
    let playPending = false;
    let desiredVolume = 0;

    function invalidate() {
      generation += 1;
      if (timer !== null) cancelSchedule(timer);
      timer = null;
      return generation;
    }

    function fadeTo(target, duration, token) {
      const from = Number.isFinite(audio.volume) ? audio.volume : 0;
      const started = clock();
      function step() {
        if (token !== generation) return;
        const progress = Math.min(1, (clock() - started) / Math.max(duration, 1));
        audio.volume = Math.max(0, Math.min(1, from + (target - from) * progress));
        if (progress < 1) timer = schedule(step);
        else timer = null;
      }
      timer = schedule(step);
    }

    function startPlay() {
      const token = invalidate();
      playPending = true;
      audio.volume = 0;
      let promise;
      try { promise = audio.play(); }
      catch (error) { promise = Promise.reject(error); }
      Promise.resolve(promise).then(() => {
        if (token !== generation) {
          if (!previous || !previous.shouldPlay) audio.pause();
          return;
        }
        playPending = false;
        if (!previous || !previous.shouldPlay) {
          audio.pause();
          return;
        }
        fadeTo(desiredVolume, 180, token);
      }, () => {
        if (token !== generation || !previous || !previous.shouldPlay) return;
        playPending = false;
        onError('音乐无法播放，请检查文件格式或系统媒体组件。');
      });
    }

    function reconcile(next, volume, loop) {
      desiredVolume = Math.max(0, Math.min(1, Number(volume)));
      const effects = playbackTransition(previous, next, Boolean(audio.ended && !playPending));
      audio.loop = Boolean(loop);
      if (effects.includes('source')) {
        invalidate();
        playPending = false;
        audio.pause();
        if (next.url) audio.src = next.url;
        else audio.removeAttribute('src');
        audio.load();
      }
      previous = {...next};
      if (effects.includes('play')) {
        startPlay();
      } else if (effects.includes('pause')) {
        invalidate();
        playPending = false;
        // Suspension must pause synchronously; a hidden renderer cannot be
        // trusted to run a fade timer before the machine sleeps.
        audio.pause();
        audio.volume = desiredVolume;
      } else if (next.shouldPlay && !playPending && Math.abs(audio.volume - desiredVolume) > 0.005) {
        const token = invalidate();
        fadeTo(desiredVolume, 100, token);
      } else if (!next.shouldPlay) {
        audio.volume = desiredVolume;
      }
      return effects;
    }

    return {reconcile};
  }

  const startupGreeting = chooseGreeting();
  const publicApi = {
    servicePayload, playbackTransition, hasPanelDraft, graphemeCount, canSendText,
    shouldSubmitKey, chooseGreeting, createAudioCoordinator,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = publicApi;
  if (typeof window === 'undefined' || !window.pet || typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const all = selector => Array.from(document.querySelectorAll(selector));
  const audio = $('music-audio');
  let state = null;
  let serviceInitialized = false;
  let serviceDirty = false;
  let keyTouched = false;
  let personaInitialized = false;
  let personaDirty = false;
  let lastChatSignature = '';
  let lastDraftPresence = null;
  let testingService = false;
  let lastFocusToken = null;

  function setMessage(text, isError = false) {
    const element = $('action-message');
    element.textContent = text || '';
    element.classList.toggle('error', Boolean(text && isError));
  }

  async function invoke(action, payload, successText) {
    try {
      const result = await window.pet.invoke(action, payload);
      if (!result || !result.ok) {
        setMessage(result && result.error ? result.error : '操作失败，请稍后重试。', true);
        return result || {ok: false};
      }
      if (successText) setMessage(successText);
      return result;
    } catch (_) {
      setMessage('操作失败，请稍后重试。', true);
      return {ok: false};
    }
  }

  const audioCoordinator = createAudioCoordinator(audio, {
    onError(message) {
      setMessage(message, true);
      invoke('musicError', message);
    },
  });

  function reportPanelDraft() {
    const present = hasPanelDraft($('chat-input').value);
    if (present === lastDraftPresence) return;
    lastDraftPresence = present;
    invoke('panelDraft', present);
  }

  function setTab(tab) {
    all('[data-tab]').forEach(button => {
      const selected = button.dataset.tab === tab;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    all('[data-page]').forEach(page => {
      const selected = page.dataset.page === tab;
      page.hidden = !selected;
      page.classList.toggle('selected', selected);
    });
  }

  function messageCard(author, text, kind, turnId) {
    const article = document.createElement('article');
    article.className = `message-card ${kind}`;
    const heading = document.createElement('div');
    heading.className = 'message-author';
    heading.textContent = author;
    const body = document.createElement('div');
    body.className = 'message-body';
    body.textContent = text;
    if (turnId) article.dataset.turnId = String(turnId);
    article.append(heading, body);
    return article;
  }

  function renderChat() {
    if (!state) {
      $('chat-count').textContent = `${graphemeCount($('chat-input').value)}/${CHAT_LIMIT}`;
      $('send-button').disabled = true;
      return;
    }
    const chat = state.chat || {turns: [], pending: null, busy: false, error: ''};
    const list = $('chat-messages');
    const signature = JSON.stringify([chat.turns, chat.pending, chat.busy, chat.error, testingService]);
    if (signature !== lastChatSignature) {
      const wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 72;
      list.replaceChildren();
      const greeting = messageCard('妃宫千早', startupGreeting, 'assistant');
      greeting.classList.add('greeting');
      list.append(greeting);
      for (const turn of chat.turns || []) {
        list.append(messageCard('你', turn.user || '', 'user'));
        list.append(messageCard('千早', turn.assistant || '', 'assistant', turn.id));
      }
      if (chat.pending) {
        list.append(messageCard('你 · 待完成', chat.pending.user || '', 'user'));
        const response = chat.pending.assistant || (chat.busy ? '思考ing…' : '尚未完成');
        list.append(messageCard(chat.busy ? '千早' : '千早 · 未完成', response, 'assistant pending'));
      } else if (chat.busy && !testingService) {
        list.append(messageCard('千早', '思考ing…', 'assistant pending'));
      }
      if (chat.error) {
        const error = document.createElement('p');
        error.className = 'inline-error';
        error.textContent = chat.error;
        list.append(error);
      }
      if (wasNearBottom || chat.pending) list.scrollTop = list.scrollHeight;
      lastChatSignature = signature;
    }
    const count = graphemeCount($('chat-input').value);
    $('send-button').disabled = chat.busy || !canSendText($('chat-input').value);
    $('cancel-button').hidden = !chat.busy;
    $('retry-button').hidden = !(!chat.busy && chat.pending && chat.error);
    $('clear-button').disabled = !(chat.turns || []).length && !chat.pending && !chat.busy;
    $('chat-count').textContent = `${count}/${CHAT_LIMIT}`;
    $('chat-count').classList.toggle('error', count > CHAT_LIMIT);
  }

  function syncDrafts() {
    if (!serviceInitialized || !serviceDirty) {
      $('service-url').value = state.settings.baseURL || '';
      $('service-model').value = state.settings.model || '';
      if (!serviceInitialized) $('service-key').value = '';
      serviceInitialized = true;
    }
    $('saved-key-status').textContent = state.settings.hasKey ? '当前地址已保存密钥；留空会继续使用。' : '当前地址尚未保存密钥。';
    $('service-test').disabled = Boolean(state.chat && state.chat.busy);
    $('service-cancel').hidden = !(state.chat && state.chat.busy);
    if (!personaInitialized || !personaDirty) {
      $('persona-prompt').value = state.settings.prompt || '';
      personaInitialized = true;
    }
  }

  function syncPreferences() {
    for (const element of all('[data-pref]')) {
      const value = state.prefs[element.dataset.pref];
      if (element.type === 'checkbox') element.checked = Boolean(value);
      else if (value !== undefined && document.activeElement !== element) element.value = String(value);
    }
    $('height-value').textContent = `${state.prefs.height} DIP`;
    $('volume-value').textContent = `${Math.round(Number(state.prefs.musicVolume) * 100)}%`;
  }

  function renderTracks() {
    const list = $('track-list');
    list.replaceChildren();
    const tracks = state.music.tracks || [];
    if (!tracks.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-library';
      empty.textContent = '曲库还是空的。可导入 WAV、MP3、M4A、AAC、OGG 或 FLAC。';
      list.append(empty);
    } else {
      for (const track of tracks) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'track';
        button.classList.toggle('selected', track.id === state.music.selectedId);
        button.dataset.trackId = track.id;
        button.textContent = track.name;
        list.append(button);
      }
    }
    const hasSelection = Boolean(state.music.selectedId);
    $('music-toggle').disabled = !hasSelection;
    $('music-remove').disabled = !hasSelection;
    $('music-previous').disabled = !tracks.length;
    $('music-next').disabled = !tracks.length;
    $('music-toggle').textContent = state.music.playing ? '暂停' : '播放';
    $('music-suspended').hidden = !(state.music.playing && state.music.suspended);
  }

  function reconcileAudio() {
    const track = (state.music.tracks || []).find(item => item.id === state.music.selectedId) || null;
    const next = {
      selectedId: track ? track.id : null,
      url: track ? track.url : '',
      shouldPlay: Boolean(track && state.music.playing && !state.music.suspended),
    };
    const volume = Math.max(0, Math.min(1, Number(state.prefs.musicVolume)));
    audioCoordinator.reconcile(next, volume, state.prefs.musicLoop === 'single');
  }

  function focusRequestedReply(next) {
    if (next.focusToken === undefined || next.focusToken === null || next.focusToken === lastFocusToken) return;
    lastFocusToken = next.focusToken;
    if (!next.focusTurnId) return;
    const target = all('#chat-messages [data-turn-id]').find(element => element.dataset.turnId === String(next.focusTurnId));
    if (target) target.scrollIntoView({block: 'center'});
  }

  function applySnapshot(next) {
    state = next;
    setTab(next.panelTab || 'chat');
    syncDrafts();
    syncPreferences();
    renderChat();
    renderTracks();
    reconcileAudio();
    focusRequestedReply(next);
    reportPanelDraft();
    if (next.error) setMessage(next.error, true);
  }

  function currentServiceDraft() {
    return {baseURL: $('service-url').value, model: $('service-model').value, apiKey: $('service-key').value};
  }

  all('[data-tab]').forEach(button => button.addEventListener('click', () => invoke('openPanel', button.dataset.tab)));
  $('close-panel').addEventListener('click', () => invoke('closePanel'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') invoke('closePanel');
  });

  $('chat-input').addEventListener('input', () => { renderChat(); reportPanelDraft(); });
  $('chat-input').addEventListener('keydown', event => {
    if (shouldSubmitKey(event)) {
      event.preventDefault();
      $('send-button').click();
    }
  });
  $('send-button').addEventListener('click', async () => {
    const text = $('chat-input').value;
    if (!canSendText(text) || (state.chat && state.chat.busy)) return;
    $('chat-input').value = '';
    renderChat();
    reportPanelDraft();
    await invoke('send', text);
  });
  $('cancel-button').addEventListener('click', () => invoke('cancel'));
  $('retry-button').addEventListener('click', () => invoke('retry'));
  $('clear-button').addEventListener('click', () => invoke('clear', undefined, '本次对话已清空。'));

  for (const id of ['service-url', 'service-model']) {
    $(id).addEventListener('input', () => { serviceDirty = true; });
  }
  $('service-key').addEventListener('input', () => { serviceDirty = true; keyTouched = true; });
  $('service-save').addEventListener('click', async () => {
    const result = await invoke('saveService', servicePayload(currentServiceDraft(), keyTouched), '服务设置已保存，对话已重新开始。');
    if (result.ok) {
      serviceDirty = false;
      keyTouched = false;
      $('service-key').value = '';
    }
  });
  $('service-test').addEventListener('click', async () => {
    testingService = true;
    renderChat();
    await invoke('testService', servicePayload(currentServiceDraft(), keyTouched), '连接测试成功。');
    testingService = false;
    lastChatSignature = '';
    renderChat();
  });
  $('service-delete-key').addEventListener('click', async () => {
    keyTouched = true;
    $('service-key').value = '';
    const result = await invoke('saveService', servicePayload(currentServiceDraft(), true), '当前地址保存的密钥已删除。');
    if (result.ok) { keyTouched = false; serviceDirty = false; }
  });
  $('service-cancel').addEventListener('click', () => invoke('cancel'));

  $('persona-prompt').addEventListener('input', () => { personaDirty = true; });
  $('persona-save').addEventListener('click', async () => {
    const result = await invoke('savePersona', $('persona-prompt').value, '角色设定已保存，对话已重新开始。');
    if (result.ok) personaDirty = false;
  });

  all('[data-pref]').forEach(element => {
    const eventName = element.type === 'range' ? 'change' : 'change';
    element.addEventListener(eventName, () => {
      let value;
      if (element.type === 'checkbox') value = element.checked;
      else if (element.type === 'range') value = Number(element.value);
      else value = element.value;
      invoke('preferences', {[element.dataset.pref]: value});
      if (element.dataset.pref === 'height') $('height-value').textContent = `${value} DIP`;
      if (element.dataset.pref === 'musicVolume') $('volume-value').textContent = `${Math.round(value * 100)}%`;
    });
  });
  $('pet-reset-position').addEventListener('click', () => invoke('resetPosition', undefined, '桌宠位置已重置。'));
  $('pet-toggle-visible').addEventListener('click', () => invoke('toggleVisible'));

  $('music-import').addEventListener('click', () => invoke('musicImport'));
  $('track-list').addEventListener('click', event => {
    const track = event.target.closest('[data-track-id]');
    if (track) invoke('musicSelect', track.dataset.trackId);
  });
  $('music-toggle').addEventListener('click', () => invoke('musicToggle'));
  $('music-previous').addEventListener('click', () => invoke('musicPrevious'));
  $('music-next').addEventListener('click', () => invoke('musicNext'));
  $('music-remove').addEventListener('click', () => invoke('musicRemove', state.music.selectedId));
  audio.addEventListener('ended', () => invoke('musicEnded'));
  audio.addEventListener('error', () => {
    const message = '音乐文件无法读取或格式不受系统支持。';
    setMessage(message, true);
    invoke('musicError', message);
  });

  window.pet.onState(applySnapshot);
  window.pet.snapshot().then(applySnapshot).catch(() => setMessage('无法读取应用状态。', true));
}());
