import type { Action, Snapshot } from './contracts';
import { expressionLabel } from './expressions';

export type DesktopMenuItem = { label?: string; type?: 'separator' | 'checkbox' | 'radio' | 'slider'; enabled?: boolean; checked?: boolean; value?: number; action?: Action; submenu?: DesktopMenuItem[] };
export function desktopMenu(s: Snapshot): DesktopMenuItem[] {
  const outfit = s.outfits.find(o => o.id === s.desktop.outfit)?.name ?? s.desktop.outfit;
  const desktop = (field: keyof Snapshot['desktop'], value: string | number | boolean): Action => ({ type: 'desktop', field, value });
  const toggle = (label: string, field: 'onTop' | 'animations' | 'headPetting'): DesktopMenuItem => ({ label, type: 'checkbox', checked: s.desktop[field], action: desktop(field, !s.desktop[field]) });
  const separator: DesktopMenuItem = { type: 'separator' };
  const musicAvailable = s.music.operation !== 'remove';
  return [
    { label: '打开聊天', action: { type: 'chat' } }, separator,
    { label: `服装／姿态 · ${outfit}`, submenu: s.outfits.map(o => ({ label: o.name, type: 'radio', checked: o.id === s.desktop.outfit, action: desktop('outfit', o.id) })) },
    { label: `取景 · ${s.desktop.framing === 'full' ? '全景' : '近景'}`, submenu: ['full', 'close'].map(f => ({ label: f === 'full' ? '全景' : '近景', type: 'radio', checked: f === s.desktop.framing, action: desktop('framing', f) })) },
    { label: `表情 · ${expressionLabel(s.desktop.outfit, s.desktop.expression)}`, submenu: [
      { label: '自动', type: 'radio', checked: s.desktop.expression === 'automatic', action: desktop('expression', 'automatic') }, separator,
      ...s.expressions.map(e => ({ label: expressionLabel(s.desktop.outfit, e.id) + (e.approved ? '' : ' · 待审核'), type: 'radio' as const, enabled: e.approved, checked: e.id === s.desktop.expression, action: desktop('expression', e.id) })),
    ] },
    ...(s.resourceError ? [{ label: '当前取景／表情图片加载失败', enabled: false }] : []),
    { label: `角色大小 · ${Math.round(s.desktop.height)} 点`, submenu: [
      ...[240, 256, 320, 400, 480].map(value => ({ label: `${value} 点` + (value === 256 ? '（默认）' : ''), type: 'radio' as const, checked: value === s.desktop.height, action: desktop('height', value) })),
      { label: '角色显示高度', type: 'slider', value: s.desktop.height, action: desktop('height', s.desktop.height) },
    ] },
    toggle('置顶', 'onTop'), { label: '鼠标穿透', type: 'checkbox', checked: s.clickThrough, action: { type: 'click-through', value: !s.clickThrough } },
    toggle('启用动效', 'animations'), toggle('摸头互动', 'headPetting'), separator,
    { label: '主动闲话', type: 'checkbox', checked: s.idleEnabled, action: { type: 'idle-enabled', value: !s.idleEnabled } },
    { label: '说一句', enabled: s.canSay, action: { type: 'say' } },
    { label: '闲话频率', submenu: ['经常 · 1–3 分钟', '适中 · 3–7 分钟', '安静 · 10–15 分钟'].map((label, i) => ({ label, type: 'radio', checked: s.idleFrequency === i + 1, action: { type: 'idle-frequency', value: i + 1 } })) }, separator,
    { label: s.music.wantsPlayback ? '暂停背景音乐' : '播放背景音乐', enabled: musicAvailable && Boolean(s.music.selected), action: { type: 'music-toggle' } },
    { label: '上一首', enabled: musicAvailable && Boolean(s.music.tracks.length), action: { type: 'music-previous' } },
    { label: '下一首', enabled: musicAvailable && Boolean(s.music.tracks.length), action: { type: 'music-next' } },
    { label: '背景音乐…', action: { type: 'settings', tab: 'music' } }, separator,
    { label: s.visible ? '隐藏桌宠' : '显示桌宠', action: { type: 'visible', value: !s.visible } },
    { label: '设置…', action: { type: 'settings' } }, separator,
    { label: '退出千早桌宠', action: { type: 'quit' } },
  ];
}
