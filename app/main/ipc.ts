import type { Action } from '../shared/contracts';
const commands = new Set(['send', 'retry', 'cancel', 'clear', 'chat', 'quit', 'say', 'bubble-dismiss', 'bubble-complete', 'read-more', 'music-import', 'music-remove', 'music-toggle', 'music-next', 'music-previous', 'test', 'save-service', 'delete-key', 'save-prompt', 'restore-prompt', 'context-menu']);
export function validAction(value: unknown, kind: string): value is Action {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>; if (typeof a.type !== 'string') return false;
  const settingsActions = ['draft', 'test', 'save-service', 'delete-key', 'save-prompt', 'restore-prompt'];
  if (settingsActions.includes(a.type) && kind !== 'settings') return false;
  if (['input', 'send', 'retry', 'clear'].includes(a.type) && kind !== 'chat') return false;
  if (['hit', 'drag', 'music-status'].includes(a.type) && kind !== 'pet') return false;
  if (['bubble-size', 'bubble-complete', 'bubble-hover', 'bubble-dismiss', 'read-more'].includes(a.type) && kind !== 'bubble') return false;
  if (commands.has(a.type)) return true;
  switch (a.type) {
    case 'input': return typeof a.text === 'string' && a.text.length <= 100_000;
    case 'settings': return a.tab === undefined || ['service', 'persona', 'music', 'portrait'].includes(String(a.tab));
    case 'settings-tab': return kind === 'settings' && ['service', 'persona', 'music', 'portrait'].includes(String(a.tab));
    case 'chat-focus-consumed': return kind === 'chat' && typeof a.id === 'string';
    case 'draft': return ['baseURL', 'model', 'key', 'prompt'].includes(String(a.field)) && typeof a.text === 'string' && a.text.length <= 200_000;
    case 'visible': case 'click-through': case 'idle-enabled': case 'bubble-hover': case 'music-autoplay': return typeof a.value === 'boolean';
    case 'idle-frequency': return [1, 2, 3].includes(Number(a.value));
    case 'music-volume': return typeof a.value === 'number' && Number.isFinite(a.value);
    case 'music-loop': return a.value === 'single' || a.value === 'playlist';
    case 'music-select': return typeof a.id === 'string';
    case 'music-status': return typeof a.revision === 'number' && typeof a.playing === 'boolean' && (a.ended === undefined || typeof a.ended === 'boolean') && (a.error === undefined || typeof a.error === 'boolean');
    case 'hit': return typeof a.opaque === 'boolean';
    case 'drag': return ['start', 'move', 'end'].includes(String(a.phase));
    case 'bubble-size': return typeof a.width === 'number' && typeof a.height === 'number' && Number.isFinite(a.width + a.height) && a.width >= 100 && a.width <= 1000 && a.height >= 60 && a.height <= 2000;
    case 'menu-size': return kind === 'menu' && typeof a.height === 'number' && Number.isFinite(a.height) && a.height >= 60 && a.height <= 2000;
    case 'close': return a.window === kind && ['chat', 'settings', 'menu'].includes(kind);
    case 'desktop': return ['outfit', 'framing', 'expression'].includes(String(a.field)) ? typeof a.value === 'string' : ['onTop', 'animations', 'headPetting'].includes(String(a.field)) ? typeof a.value === 'boolean' : a.field === 'height' && typeof a.value === 'number' && Number.isFinite(a.value);
    default: return false;
  }
}
