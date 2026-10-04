import type { Action, Snapshot } from '../shared/contracts';
import { replyExcerpt } from '../shared/text';
import { cornerLoops, gardenia, iris } from './chrome';
import { Writer } from './writer';

// SpeechOutline from IdleBubbleView.swift, in top-left window coordinates.
function outline(height: number, tailY: number, inset = 0): string {
  const x = 12 + inset, y = 16 + inset, width = 254 - inset * 2;
  const w = width - 18, h = height - 40 - inset * 2, r = 27 - inset;
  const t = Math.min(h - 20, Math.max(20, tailY - y));
  return `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + t - 10} Q${x + w + 5} ${y + t - 1} ${x + width} ${y + t} Q${x + w + 8} ${y + t + 8} ${x + w} ${y + t + 7} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
}
export function mountBubble(root: HTMLElement, act: (action: Action) => void): { render(state: Snapshot): void; stop(): void } {
  root.innerHTML = `<article id="bubble"><svg class="speech-outline" aria-hidden="true"><g id="outline-paths"><path class="outline-fill"></path><path class="outline-outer"></path><path class="outline-inner"></path></g></svg>${cornerLoops}<div class="name">妃宫千早</div><button class="bubble-text plain" aria-label="显示完整摘录"><span aria-hidden="true" class="text"></span></button>${iris('bubble-iris')}${gardenia()}<button id="read-more" class="plain" hidden>查看全文</button><button class="bubble-close plain" aria-label="关闭气泡" title="关闭气泡">×</button></article><div class="bubble-measure" aria-hidden="true"></div>`;
  const box = root.querySelector<HTMLElement>('#bubble')!, text = root.querySelector<HTMLElement>('.text')!, body = root.querySelector<HTMLButtonElement>('.bubble-text')!;
  const measure = root.querySelector<HTMLElement>('.bubble-measure')!, more = root.querySelector<HTMLButtonElement>('#read-more')!;
  let writer: Writer | undefined, bubbleID: string | undefined, state: Snapshot | undefined, measuredSource = '', targetText = '', textHeight = 23, needsReadMore = false;
  let lastSize = 0;
  const heightOf = (source: string) => { measure.textContent = source; const end = document.createElement('span'); end.textContent = '\u200b'; measure.append(end); return Math.max(23, measure.getBoundingClientRect().height); };
  body.onclick = () => writer?.complete(); more.onclick = () => act({ type: 'read-more' });
  root.querySelector<HTMLButtonElement>('.bubble-close')!.onclick = () => act({ type: 'bubble-dismiss' });
  let hovering = false;
  // Pointer and keyboard focus independently hold expiry. Leaving with the
  // pointer must not release a button that is still being used by keyboard.
  const holdExpiry = () => act({ type: 'bubble-hover', value: hovering || document.hasFocus() && box.contains(document.activeElement) });
  box.onmouseenter = () => { hovering = true; holdExpiry(); }; box.onmouseleave = () => { hovering = false; holdExpiry(); };
  box.addEventListener('focusin', holdExpiry);
  box.addEventListener('focusout', () => queueMicrotask(holdExpiry));
  window.addEventListener('focus', holdExpiry);
  window.addEventListener('blur', holdExpiry);
  const render = (next: Snapshot) => {
    state = next; const bubble = state.bubble; if (!bubble) return;
    const source = bubble.fullText;
    if (measuredSource !== source || bubbleID !== bubble.id) {
      measuredSource = source;
      const excerpt = bubble.kind === 'reply' ? replyExcerpt(source, value => heightOf(value) <= 92.5, bubble.truncated) : { text: source, needsReadMore: false };
      targetText = excerpt.text; textHeight = heightOf(targetText); needsReadMore = excerpt.needsReadMore;
      if (bubbleID !== bubble.id) {
        writer?.stop(); bubbleID = bubble.id;
        writer = new Writer(value => { text.textContent = value; }, () => act({ type: 'bubble-complete' }), 'bubble');
      }
      // Accessible text is stable throughout the animation.
      body.setAttribute('aria-label', excerpt.text + '，显示完整摘录');
    }
    writer?.pause(document.hidden || !state.visible || !state.awake || state.clickThrough || state.chatVisible || state.settingsVisible);
    writer?.set(targetText, state.desktop.animations && !state.reducedMotion);
    const height = Math.ceil(textHeight + 110 + (needsReadMore ? 24 : 0));
    box.style.height = height + 'px'; body.style.height = textHeight + 'px';
    more.hidden = !needsReadMore; more.style.top = (64 + textHeight) + 'px';
    document.body.className = `bubble ${bubble.side ?? 'left'}`;
    const outer = outline(height, bubble.tailY ?? height * .35), inner = outline(height, bubble.tailY ?? height * .35, 5);
    root.querySelector('.outline-fill')!.setAttribute('d', outer); root.querySelector('.outline-outer')!.setAttribute('d', outer); root.querySelector('.outline-inner')!.setAttribute('d', inner);
    root.querySelector('#outline-paths')!.setAttribute('transform', bubble.side === 'right' ? 'translate(278 0) scale(-1 1)' : '');
    if (lastSize !== height) { lastSize = height; act({ type: 'bubble-size', width: 278, height }); }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { hovering = false; writer?.pause(true); holdExpiry(); } else if (state) render(state); });
  void document.fonts.ready.then(() => { measuredSource = ''; if (state) render(state); });
  return { render, stop: () => writer?.stop() };
}
