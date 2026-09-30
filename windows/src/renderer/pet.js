'use strict';

(function () {
  const DRAG_THRESHOLD = 4;

  function resolveExpression(mode, waiting, speaking) {
    return mode === 'automatic' ? (speaking ? 'smile' : (waiting ? 'serious' : 'neutral')) : mode;
  }

  function frameSpec(variant, expression, eye, mouth) {
    return {
      width: variant.width,
      height: variant.height,
      body: variant.body,
      face: variant.frames[expression][eye][mouth],
      faceX: variant.faceOffset[0],
      faceY: variant.faceOffset[1],
      faceWidth: variant.faceSize[0],
      faceHeight: variant.faceSize[1],
    };
  }

  function canvasGeometry(variant, height, deviceScale) {
    const displayHeight = Math.round(height);
    const displayWidth = Math.ceil(variant.width / variant.height * displayHeight);
    const pixelRatio = Math.max(1, Number(deviceScale) || 1);
    return {
      displayWidth,
      displayHeight,
      backingWidth: Math.ceil(displayWidth * pixelRatio),
      backingHeight: Math.ceil(displayHeight * pixelRatio),
      imageScale: displayHeight / variant.height,
      pixelRatio,
    };
  }

  function createEffectQueue(runEffect) {
    let chain = Promise.resolve();
    return function enqueue(effects) {
      const batch = chain.then(async () => {
        for (const effect of effects) await runEffect(effect);
      });
      chain = batch.catch(() => {});
      return batch;
    };
  }

  function dragTransition(state, event) {
    if (event.type === 'down') {
      return {state: {startX: event.x, startY: event.y, dragging: false}, effects: []};
    }
    if (!state) return {state: null, effects: []};
    if (event.type === 'move') {
      const distance = Math.hypot(event.x - state.startX, event.y - state.startY);
      if (!state.dragging && distance < DRAG_THRESHOLD) return {state, effects: []};
      const effects = [];
      if (!state.dragging) effects.push({action: 'dragStart', payload: {x: state.startX, y: state.startY}});
      effects.push({action: 'dragMove', payload: {x: event.x, y: event.y}});
      return {state: {...state, dragging: true}, effects};
    }
    if (event.type === 'up') {
      if (state.dragging) {
        return {state: null, effects: [
          {action: 'dragMove', payload: {x: event.x, y: event.y}},
          {action: 'dragEnd'},
        ]};
      }
      return {state: null, effects: [{action: 'petClick'}]};
    }
    if (event.type === 'cancel') {
      return {state: null, effects: state.dragging ? [{action: 'dragEnd'}] : []};
    }
    return {state, effects: []};
  }

  const publicApi = {resolveExpression, frameSpec, canvasGeometry, createEffectQueue, dragTransition};
  if (typeof module !== 'undefined' && module.exports) module.exports = publicApi;
  if (typeof window === 'undefined' || !window.pet || typeof document === 'undefined') return;

  const canvas = document.getElementById('pet-canvas');
  const stage = document.getElementById('pet-stage');
  const context = canvas.getContext('2d', {alpha: true, willReadFrequently: true});
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const imageCache = new Map();
  let snapshot = null;
  let variant = null;
  let eye = 'open';
  let mouth = 'closed';
  let dragState = null;
  let blinkTimer = null;
  let mouthTimer = null;
  let animationSignature = '';
  let renderGeneration = 0;
  let lastHit = null;

  function invoke(action, payload) {
    return window.pet.invoke(action, payload).catch(() => ({ok: false}));
  }

  const enqueueEffects = createEffectQueue(effect => invoke(effect.action, effect.payload));

  function safeAssetURL(path) {
    if (!snapshot || typeof snapshot.resourceBaseURL !== 'string' ||
        typeof path !== 'string' || !path.startsWith('assets/') ||
        path.includes('..') || path.includes('\\')) return null;
    try { return new URL(path, snapshot.resourceBaseURL).href; } catch (_) { return null; }
  }

  function loadImage(path) {
    const url = safeAssetURL(path);
    if (!url) return Promise.reject(new Error('无效的角色资源路径'));
    if (!imageCache.has(url)) {
      imageCache.set(url, new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('角色资源读取失败'));
        image.src = url;
      }));
    }
    return imageCache.get(url);
  }

  function currentFrame() {
    if (!snapshot || !variant) return null;
    const expression = resolveExpression(
      snapshot.prefs.expression,
      Boolean(snapshot.chat && snapshot.chat.busy),
      Boolean(snapshot.speaking),
    );
    try { return frameSpec(variant, expression, eye, mouth); } catch (_) { return null; }
  }

  async function draw() {
    const spec = currentFrame();
    if (!spec) return;
    const generation = ++renderGeneration;
    try {
      const [body, face] = await Promise.all([loadImage(spec.body), loadImage(spec.face)]);
      if (generation !== renderGeneration) return;
      const geometry = canvasGeometry(spec, Number(snapshot.prefs.height) || 256, window.devicePixelRatio);
      if (canvas.width !== geometry.backingWidth || canvas.height !== geometry.backingHeight) {
        canvas.width = geometry.backingWidth;
        canvas.height = geometry.backingHeight;
      }
      context.setTransform(
        geometry.backingWidth / geometry.displayWidth, 0,
        0, geometry.backingHeight / geometry.displayHeight, 0, 0,
      );
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.clearRect(0, 0, geometry.displayWidth, geometry.displayHeight);
      context.drawImage(body, 0, 0, geometry.displayWidth, geometry.displayHeight);
      context.drawImage(
        face,
        spec.faceX * geometry.imageScale,
        spec.faceY * geometry.imageScale,
        spec.faceWidth * geometry.imageScale,
        spec.faceHeight * geometry.imageScale,
      );
      stage.classList.remove('resource-error');
    } catch (_) {
      stage.classList.add('resource-error');
    }
  }

  function clearAnimations() {
    clearTimeout(blinkTimer);
    clearTimeout(mouthTimer);
    blinkTimer = null;
    mouthTimer = null;
  }

  function scheduleBlink() {
    const sequence = [['half', 55], ['closed', 80], ['half', 85], ['open', 3000 + Math.random() * 3000]];
    function advance(index) {
      eye = sequence[index][0];
      draw();
      blinkTimer = setTimeout(() => advance((index + 1) % sequence.length), sequence[index][1]);
    }
    blinkTimer = setTimeout(() => advance(0), 3000 + Math.random() * 3000);
  }

  function scheduleMouth() {
    const frames = ['small', 'medium', 'small', 'closed'];
    let index = 0;
    mouth = frames[0];
    draw();
    function advance() {
      index = (index + 1) % frames.length;
      mouth = frames[index];
      draw();
      mouthTimer = setTimeout(advance, 90 + Math.random() * 70);
    }
    mouthTimer = setTimeout(advance, 90 + Math.random() * 70);
  }

  function updateAnimations() {
    if (!snapshot) return;
    const active = Boolean(snapshot.prefs.animations && snapshot.visible && !snapshot.suspended && !reduceMotion.matches);
    const speaking = Boolean(active && snapshot.speaking);
    const signature = `${active}:${speaking}`;
    stage.classList.toggle('motion', active);
    if (signature === animationSignature) return;
    animationSignature = signature;
    clearAnimations();
    eye = 'open';
    mouth = 'closed';
    if (active) scheduleBlink();
    if (speaking) scheduleMouth();
    draw();
  }

  function applySnapshot(next) {
    snapshot = next;
    const key = `${next.prefs.style}/${next.prefs.framing}`;
    variant = next.manifest && next.manifest.variants ? next.manifest.variants[key] : null;
    document.documentElement.classList.toggle('hidden', next.visible === false);
    updateAnimations();
    draw();
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / Math.max(rect.width, 1),
      y: (event.clientY - rect.top) * canvas.height / Math.max(rect.height, 1),
    };
  }

  function opaqueAt(event) {
    const point = canvasPoint(event);
    if (point.x < 0 || point.y < 0 || point.x >= canvas.width || point.y >= canvas.height) return false;
    try { return context.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data[3] > 8; }
    catch (_) { return true; }
  }

  function reportHit(event) {
    if (dragState) return;
    const hit = opaqueAt(event);
    if (hit !== lastHit) {
      lastHit = hit;
      invoke('petHit', hit);
    }
  }

  canvas.addEventListener('pointermove', event => {
    reportHit(event);
    if (!dragState) return;
    const result = dragTransition(dragState, {type: 'move', x: event.screenX, y: event.screenY});
    dragState = result.state;
    enqueueEffects(result.effects);
  });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !opaqueAt(event)) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    dragState = dragTransition(null, {type: 'down', x: event.screenX, y: event.screenY}).state;
  });
  canvas.addEventListener('pointerup', event => {
    if (!dragState) return;
    const wasDragging = dragState.dragging;
    const result = dragTransition(dragState, {type: 'up', x: event.screenX, y: event.screenY});
    dragState = result.state;
    stage.classList.toggle('pet-click', !wasDragging && snapshot && snapshot.prefs.animations && !reduceMotion.matches);
    if (!wasDragging) setTimeout(() => stage.classList.remove('pet-click'), 160);
    enqueueEffects(result.effects);
  });
  canvas.addEventListener('pointercancel', () => {
    const result = dragTransition(dragState, {type: 'cancel'});
    dragState = result.state;
    enqueueEffects(result.effects);
  });
  document.addEventListener('contextmenu', event => {
    event.preventDefault();
    invoke('menu');
  });
  reduceMotion.addEventListener('change', updateAnimations);
  window.addEventListener('resize', draw);

  window.pet.onState(applySnapshot);
  window.pet.snapshot().then(applySnapshot).catch(() => stage.classList.add('resource-error'));
}());
