import type { Action, Snapshot } from '../shared/contracts';
import { canSend, characterCount, inputCommand } from '../shared/text';
import { headerFlowers, iconButton, panelChrome } from './chrome';
import { Writer } from './writer';

export function mountChat(root: HTMLElement, act: (action: Action) => void): { render(state: Snapshot): void; stop(): void; composing(): boolean } {
  root.innerHTML = `<div class="chat panel">${panelChrome}
    <header class="toolbar">${headerFlowers}<div class="heading"><h1 class="name">妃宫千早</h1><p class="muted">片刻相伴</p></div>${iconButton('settings', 'settings', '设置')}${iconButton('close', 'close', '收起聊天', '收起聊天 · Escape')}</header>
    <hr class="divider"><div id="history"></div><hr class="divider">
    <div class="composer"><textarea id="input" aria-label="消息" placeholder="想和我聊些什么？"></textarea>
      <div class="row"><button id="clear" class="plain">清空</button><span class="spacer"></span><span id="counter" class="muted"></span><button id="cancel" hidden>取消</button><button id="send" class="primary" disabled>发送</button></div>
      <p class="quiet save-scope">仅本次运行保留 · Shift+Enter 换行</p>
    </div></div>`;
  const node = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const input = node<HTMLTextAreaElement>('input'), history = node('history');
  let state: Snapshot | undefined, composing = false, initialized = false;
  let signature = '', writer: Writer | undefined, replyText: HTMLElement | undefined;
  let pendingID: string | undefined, lastTurnID: string | undefined, focusID: string | undefined;
  let followsBottom = true;
  history.addEventListener('scroll', () => { followsBottom = history.scrollHeight - history.scrollTop - history.clientHeight <= 24; });
  const draw = (text: string) => {
    if (replyText) replyText.textContent = text;
    if (followsBottom) history.scrollTop = history.scrollHeight;
  };
  const updateComposer = () => {
    const count = characterCount(input.value);
    node('counter').textContent = `${count}/2000`;
    node('counter').classList.toggle('over-limit', count > 2000);
    node<HTMLButtonElement>('send').disabled = composing || !canSend(input.value, Boolean(state?.busy));
  };
  const send = () => {
    if (composing || !canSend(input.value, Boolean(state?.busy))) return;
    act({ type: 'input', text: input.value }); act({ type: 'send' });
  };
  input.addEventListener('compositionstart', () => { composing = true; updateComposer(); });
  input.addEventListener('compositionend', () => { composing = false; act({ type: 'input', text: input.value }); updateComposer(); });
  input.addEventListener('input', () => { updateComposer(); if (!composing) act({ type: 'input', text: input.value }); });
  input.addEventListener('keydown', event => { if (inputCommand(event, composing) === 'send') { event.preventDefault(); send(); } });
  node('send').onclick = send;
  for (const type of ['settings', 'clear', 'cancel'] as const) node(type).onclick = () => act({ type });
  node('close').onclick = () => act({ type: 'close', window: 'chat' });
  const message = (text: string, author: string, user = false): { box: HTMLElement; text: HTMLElement } => {
    const box = document.createElement('article'); box.className = 'message' + (user ? ' user' : '');
    const label = document.createElement('div'); label.className = 'author'; label.textContent = author;
    const content = document.createElement('div'); content.className = 'text'; content.textContent = text;
    box.append(label, content); return { box, text: content };
  };
  const feedback = document.createElement('div'); feedback.className = 'history-feedback';
  const thinking = document.createElement('div'); thinking.className = 'row thinking muted'; thinking.innerHTML = '<span class="spinner" aria-hidden="true"></span><span role="status">思考ing…</span>';
  const error = document.createElement('p'); error.className = 'notice error'; error.setAttribute('role', 'alert');
  const retry = document.createElement('button'); retry.textContent = '重试'; retry.onclick = () => act({ type: 'retry' });
  const resourceError = document.createElement('p'); resourceError.className = 'notice error';
  feedback.append(thinking, error, retry, resourceError);
  return {
    composing: () => composing,
    stop: () => writer?.stop(),
    render(next) {
      state = next;
      if (!initialized) { input.value = state.input; initialized = true; input.focus(); }
      else if (!composing && (document.activeElement !== input || (state.busy === 'chat' && !state.input))) input.value = state.input;
      updateComposer(); node('cancel').hidden = !state.busy;
      const nextSignature = JSON.stringify([state.turns.map(t => t.id), state.pendingID, state.didTrim]);
      const freshPending = Boolean(state.pendingID && state.pendingID !== pendingID);
      const freshReply = Boolean(signature && !state.pending && state.turns.at(-1)?.id !== lastTurnID);
      if (signature !== nextSignature) {
        const initial = freshReply && pendingID ? writer?.displayed() ?? '' : '';
        const oldScroll = history.scrollTop;
        writer?.stop(); history.replaceChildren(); replyText = undefined;
        const greeting = document.createElement('p'); greeting.className = 'greeting'; greeting.textContent = state.greeting; history.append(greeting);
        if (state.didTrim) { const hint = document.createElement('p'); hint.className = 'muted history-feedback'; hint.textContent = '较早消息已从本次内存记录中移除'; history.append(hint); }
        for (const [i, turn] of state.turns.entries()) {
          history.append(message(turn.user, '你', true).box);
          const reply = message(turn.assistant, '千早'); reply.box.id = 'turn-' + turn.id; history.append(reply.box);
          if (turn.truncated) { const hint = document.createElement('p'); hint.className = 'muted history-feedback'; hint.textContent = '回复因服务长度限制而截断'; history.append(hint); }
          if (i === state.turns.length - 1) replyText = reply.text;
        }
        if (state.pending) {
          history.append(message(state.pending, '你 · 待完成', true).box);
          const reply = message('', state.busy === 'chat' ? '千早' : '千早 · 未完成');
          reply.box.id = 'pending-reply'; reply.box.classList.add('incomplete'); history.append(reply.box); replyText = reply.text;
        }
        history.append(feedback);
        if (replyText) writer = new Writer(draw, () => {}, 'chat', initial); else writer = undefined;
        if (!state.pending && state.turns.length) writer?.set(state.turns.at(-1)!.assistant, freshReply && state.desktop.animations && !state.reducedMotion);
        if (!signature || freshPending) followsBottom = true;
        history.scrollTop = followsBottom ? history.scrollHeight : oldScroll;
        signature = nextSignature; pendingID = state.pendingID; lastTurnID = state.turns.at(-1)?.id;
      }
      const pendingBox = root.querySelector<HTMLElement>('#pending-reply');
      if (pendingBox) {
        pendingBox.hidden = !state.partial;
        pendingBox.querySelector('.author')!.textContent = state.busy === 'chat' ? '千早' : '千早 · 未完成';
        writer?.set(state.partial, state.busy === 'chat' && state.desktop.animations && !state.reducedMotion);
      }
      thinking.hidden = state.busy !== 'chat' || Boolean(state.partial);
      error.textContent = state.error ?? ''; error.hidden = !state.error;
      retry.textContent = state.cancelled ? '再回答一次' : '重试';
      retry.hidden = !state.pending || (!state.error && !state.cancelled); retry.disabled = Boolean(state.busy);
      resourceError.textContent = state.resourceError ?? ''; resourceError.hidden = !state.resourceError;
      if (state.cancelled) {
        error.textContent = '嗯，那就先停在这里。'; error.hidden = false;
      }
      error.classList.toggle('error', !state.cancelled);
      error.setAttribute('role', state.cancelled ? 'status' : 'alert');
      if (freshPending || followsBottom) history.scrollTop = history.scrollHeight;
      if (state.chatFocus && state.chatFocus.id !== focusID) {
        const target = document.getElementById('turn-' + state.chatFocus.turnID);
        if (target) {
          focusID = state.chatFocus.id; followsBottom = false;
          history.querySelector('.highlight')?.classList.remove('highlight');
          target.scrollIntoView({ block: 'start' }); target.classList.add('highlight');
          act({ type: 'chat-focus-consumed', id: focusID });
        }
      }
    },
  };
}
