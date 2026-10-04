import type { Action, Bridge, Snapshot } from '../shared/contracts';
import { inputCommand } from '../shared/text';
import { mountChat } from './chat';
import { mountSettings } from './settings';
import { mountBubble } from './bubble';
import { mountMenu } from './menu';
import { MusicPlayer } from './audio';
declare global { interface Window { chihaya: Bridge } }
const bridge = window.chihaya;
const root = document.getElementById('app')!;
const kind = new URLSearchParams(location.search).get('window') ?? 'pet';
document.body.className = kind;
let state: Snapshot;
const act = (action: Action) => { void bridge.act(action).catch(() => {}); };
const node = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const chat = kind === 'chat' ? mountChat(root, act) : undefined;
const settings = kind === 'settings' ? mountSettings(root, act) : undefined;
const bubble = kind === 'bubble' ? mountBubble(root, act) : undefined;
const menu = kind === 'menu' ? mountMenu(root, act) : undefined;
const animated = () => state.desktop.animations && !state.reducedMotion && state.visible && state.awake;
let spriteURL = '', pixels: Uint8ClampedArray | undefined, width = 0, height = 0, dragging = false;
let pointerStart: { x: number; y: number } | undefined, pointerMoved = false;
let hit = false, lastPointer: { x: number; y: number } | undefined;
let resampleHit = () => {}, lastClickThrough = false;
const player = kind === 'pet' ? new MusicPlayer(act) : undefined;
if (kind === 'pet') {
  root.innerHTML = '<div id="pet-root"><div id="pet-reaction"><div id="pet-sway"><div id="pet-body"><canvas id="pet-canvas" aria-label="妃宫千早立绘"></canvas></div></div></div></div>';
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
    event.preventDefault(); pointerStart = { x: event.screenX, y: event.screenY }; pointerMoved = false; dragging = true; canvas.setPointerCapture(event.pointerId); act({ type: 'drag', phase: 'start' });
  });
  canvas.addEventListener('pointermove', event => { if (dragging) { if (pointerStart) pointerMoved ||= Math.hypot(event.screenX - pointerStart.x, event.screenY - pointerStart.y) > 4; act({ type: 'drag', phase: 'move' }); } });
  canvas.addEventListener('pointerup', event => { if (dragging) { if (pointerStart) pointerMoved ||= Math.hypot(event.screenX - pointerStart.x, event.screenY - pointerStart.y) > 4; dragging = false; act({ type: 'drag', phase: 'end' }); if (!pointerMoved) { node('pet-reaction').classList.remove('clicked'); void node('pet-reaction').offsetWidth; node('pet-reaction').classList.add('clicked'); } updateHit(); } });
  canvas.addEventListener('pointercancel', () => { if (dragging) { dragging = false; act({ type: 'drag', phase: 'end' }); } });
  canvas.addEventListener('contextmenu', event => { event.preventDefault(); if (hit) act({ type: 'context-menu' }); });
}

function render(next: Snapshot): void {
  state = next;
  chat?.render(state); settings?.render(state); bubble?.render(state); menu?.render(state);
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
    player?.sync(state.music);
  }
}
if (kind === 'chat' || kind === 'settings') document.addEventListener('keydown', event => {
  if (inputCommand(event, Boolean(chat?.composing() || settings?.composing())) === 'close') { event.preventDefault(); act({ type: 'close', window: kind }); }
});
bridge.onState(render); void bridge.snapshot().then(render);
window.addEventListener('beforeunload', () => { chat?.stop(); bubble?.stop(); player?.stop(); });
