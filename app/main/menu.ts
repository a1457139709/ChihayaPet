import { app, Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron';
import { PNG } from 'pngjs';
import type { DesktopApplication } from './desktop';
import type { Action } from '../shared/contracts';
export function installMenu(controller: DesktopApplication): Tray {
  const image = new PNG({ width: 32, height: 32 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x - 16, dy = y - 16, inside = ((dx + dy) ** 2 / 500 + (dx - dy) ** 2 / 90) < 1;
    const offset = (y * 32 + x) * 4;
    image.data[offset] = process.platform === 'darwin' ? 0 : 135; image.data[offset + 1] = process.platform === 'darwin' ? 0 : 150; image.data[offset + 2] = process.platform === 'darwin' ? 0 : 142; image.data[offset + 3] = inside ? 255 : 0;
  }
  const icon = nativeImage.createFromBuffer(PNG.sync.write(image)); icon.setTemplateImage(process.platform === 'darwin');
  const tray = new Tray(icon); tray.setToolTip('妃宫千早桌宠');
  const act = (a: Action) => () => { void controller.act(a); };
  const template = (): MenuItemConstructorOptions[] => {
    const s = controller.snapshot(), music = s.music;
    return [
      { label: '打开聊天', click: act({ type: 'chat' }) }, { label: '设置…', click: act({ type: 'settings' }) },
      { label: '打开文件说明', click: act({ type: 'files' }) }, { type: 'separator' },
      { label: '造型', submenu: s.outfits.map(o => ({ label: o.name, type: 'radio' as const, checked: o.id === s.desktop.outfit, click: act({ type: 'desktop', field: 'outfit', value: o.id }) })) },
      { label: '取景', submenu: ['full', 'close'].map(f => ({ label: f === 'full' ? '全景' : '近景', type: 'radio' as const, checked: f === s.desktop.framing, click: act({ type: 'desktop', field: 'framing', value: f }) })) },
      { label: '表情', submenu: ['automatic', ...s.expressions].map(id => ({ label: id === 'automatic' ? '自动' : id, type: 'radio' as const, checked: id === s.desktop.expression, click: act({ type: 'desktop', field: 'expression', value: id }) })) },
      { label: '图片高度', submenu: [240, 256, 320, 400, 480].map(value => ({ label: `${value} 点`, type: 'radio' as const, checked: value === s.desktop.height, click: act({ type: 'desktop', field: 'height', value }) })) },
      { label: '置顶', type: 'checkbox', checked: s.desktop.onTop, click: act({ type: 'desktop', field: 'onTop', value: !s.desktop.onTop }) },
      { label: '呼吸与轻摆', type: 'checkbox', checked: s.desktop.animations, click: act({ type: 'desktop', field: 'animations', value: !s.desktop.animations }) },
      { label: '鼠标穿透', type: 'checkbox', checked: s.clickThrough, click: act({ type: 'click-through', value: !s.clickThrough }) },
      { label: s.visible ? '隐藏人物' : '恢复人物', click: act({ type: 'visible', value: !s.visible }) }, { type: 'separator' },
      { label: '说一句', enabled: s.visible && s.awake && !s.clickThrough && !s.chatVisible && !s.settingsVisible && !s.input && !s.busy && !s.bubble, click: act({ type: 'say' }) },
      { label: '主动闲话', type: 'checkbox', checked: s.idleEnabled, click: act({ type: 'idle-enabled', value: !s.idleEnabled }) },
      { label: '闲话频率', submenu: ['经常 · 1–3 分钟', '适中 · 3–7 分钟', '安静 · 10–15 分钟'].map((label, i) => ({ label, type: 'radio' as const, checked: s.idleFrequency === i + 1, click: act({ type: 'idle-frequency', value: i + 1 }) })) },
      { label: '背景音乐', submenu: [
        { label: music.tracks.find(t => t.id === music.selected)?.title ?? '尚未导入音乐', enabled: false },
        { label: music.wantsPlayback ? '暂停' : '播放', enabled: music.tracks.length > 0, click: act({ type: 'music-toggle' }) },
        { label: '上一首', enabled: music.tracks.length > 0, click: act({ type: 'music-previous' }) }, { label: '下一首', enabled: music.tracks.length > 0, click: act({ type: 'music-next' }) },
      ] }, { type: 'separator' }, { label: '退出千早桌宠', click: () => app.quit() },
    ];
  };
  let signature = '';
  const update = () => {
    const s = controller.snapshot(); const next = JSON.stringify([s.desktop, s.clickThrough, s.visible, s.awake, s.idleEnabled, s.idleFrequency, s.chatVisible, s.settingsVisible, Boolean(s.busy), Boolean(s.input), Boolean(s.bubble), s.music.selected, s.music.wantsPlayback, s.music.tracks]);
    if (next !== signature) { signature = next; tray.setContextMenu(Menu.buildFromTemplate(template())); }
  };
  controller.onMenuChanged = update; controller.onContextMenu = () => Menu.buildFromTemplate(template()).popup(); update();
  tray.on('double-click', () => controller.open('chat'));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'ChihayaPet', submenu: [{ label: '设置…', click: act({ type: 'settings' }) }, { label: '打开文件说明', click: act({ type: 'files' }) }, { type: 'separator' as const }, { role: 'quit' as const }] }] : []),
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  ]));
  return tray;
}
