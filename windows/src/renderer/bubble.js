'use strict';

(function () {
  function typingDelay(character) {
    if ('，、,；;'.includes(character)) return 130;
    if ('。！？…\n'.includes(character)) return 240;
    return 42;
  }

  function shouldType(prefs, reducedMotion) {
    return Boolean(prefs && prefs.animations && !reducedMotion);
  }

  function typingTransition(previousToken, nextToken, isSpeaking, animate) {
    if (previousToken !== nextToken) return 'start';
    if (isSpeaking && !animate) return 'finish';
    return 'none';
  }

  const publicApi = {typingDelay, shouldType, typingTransition};
  if (typeof module !== 'undefined' && module.exports) module.exports = publicApi;
  if (typeof window === 'undefined' || !window.pet || typeof document === 'undefined') return;

  const root = document.getElementById('bubble-root');
  const text = document.getElementById('bubble-text');
  const close = document.getElementById('bubble-close');
  const full = document.getElementById('bubble-full');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let snapshot = null;
  let currentToken = null;
  let generation = 0;
  let speaking = false;

  function invoke(action, payload) {
    return window.pet.invoke(action, payload).catch(() => ({ok: false}));
  }

  function setSpeaking(value) {
    if (speaking === value) return;
    speaking = value;
    invoke('bubbleSpeaking', value);
  }

  async function typeBubble(bubble, animated) {
    const localGeneration = ++generation;
    const characters = Array.from(bubble.text || '');
    if (!animated) {
      text.textContent = characters.join('');
      setSpeaking(false);
      return;
    }
    text.textContent = '';
    setSpeaking(characters.length > 0);
    for (const character of characters) {
      if (generation !== localGeneration) return;
      text.textContent += character;
      await new Promise(resolve => setTimeout(resolve, typingDelay(character)));
    }
    if (generation === localGeneration) setSpeaking(false);
  }

  function applySnapshot(next) {
    snapshot = next;
    const bubble = next.bubble;
    if (!bubble) {
      ++generation;
      currentToken = null;
      setSpeaking(false);
      root.hidden = true;
      return;
    }
    root.hidden = false;
    root.dataset.side = bubble.side === 'left' ? 'left' : 'right';
    full.hidden = bubble.kind !== 'reply';
    root.dataset.kind = bubble.kind;
    const animated = shouldType(next.prefs, reduceMotion.matches);
    const transition = typingTransition(currentToken, bubble.token, speaking, animated);
    if (transition === 'finish') {
      ++generation;
      text.textContent = bubble.text || '';
      setSpeaking(false);
      return;
    }
    if (transition === 'none') return;
    currentToken = bubble.token;
    typeBubble(bubble, animated);
  }

  root.addEventListener('pointerenter', () => invoke('bubbleHover', true));
  root.addEventListener('pointerleave', () => invoke('bubbleHover', false));
  text.addEventListener('click', () => {
    if (!snapshot || !snapshot.bubble || !speaking) return;
    ++generation;
    text.textContent = snapshot.bubble.text || '';
    setSpeaking(false);
  });
  close.addEventListener('click', () => {
    ++generation;
    setSpeaking(false);
    invoke('bubbleDismiss');
  });
  full.addEventListener('click', () => invoke('bubbleFull'));
  document.addEventListener('contextmenu', event => {
    event.preventDefault();
    invoke('menu');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close.click();
  });
  reduceMotion.addEventListener('change', () => {
    if (snapshot && snapshot.bubble) {
      ++generation;
      text.textContent = snapshot.bubble.text || '';
      setSpeaking(false);
    }
  });

  window.pet.onState(applySnapshot);
  window.pet.snapshot().then(applySnapshot).catch(() => { root.hidden = true; });
}());
