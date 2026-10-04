import { app, Menu, Tray, nativeImage } from 'electron';
import { PNG } from 'pngjs';
import type { DesktopApplication } from './desktop';
import { desktopMenu } from '../shared/menu';
import type { Action } from '../shared/contracts';

// Outline leaf and vein, rasterized from cubic vector curves for the Windows tray.
function windowsLeaf(): Electron.NativeImage {
  type Point = [number, number];
  const curves: [Point, Point, Point, Point][] = [
    [[5, 24], [1, 14], [14, 4], [28, 4]], [[28, 4], [29, 19], [23, 29], [12, 26]],
    [[12, 26], [10, 24], [7, 25], [5, 24]], [[4, 28], [11, 23], [19, 17], [24, 9]],
  ];
  const segments = curves.flatMap(curve => {
    const points = Array.from({ length: 33 }, (_, i): Point => {
      const t = i / 32, u = 1 - t;
      return [0, 1].map(axis => u ** 3 * curve[0][axis]! + 3 * u * u * t * curve[1][axis]! + 3 * u * t * t * curve[2][axis]! + t ** 3 * curve[3][axis]!) as Point;
    });
    return points.slice(1).map((point, i) => [points[i]!, point] as const);
  });
  const image = new PNG({ width: 32, height: 32 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let covered = 0;
    for (const dx of [.125, .375, .625, .875]) for (const dy of [.125, .375, .625, .875]) {
      if (segments.some(([a, b]) => {
        const vx = b[0] - a[0], vy = b[1] - a[1];
        const t = Math.min(1, Math.max(0, ((x + dx - a[0]) * vx + (y + dy - a[1]) * vy) / (vx * vx + vy * vy || 1)));
        return Math.hypot(x + dx - a[0] - t * vx, y + dy - a[1] - t * vy) < 1;
      })) covered++;
    }
    const offset = (y * 32 + x) * 4;
    image.data[offset] = 102; image.data[offset + 1] = 119; image.data[offset + 2] = 109; image.data[offset + 3] = Math.round(covered / 16 * 255);
  }
  return nativeImage.createFromBuffer(PNG.sync.write(image));
}
export function installMenu(controller: DesktopApplication): { destroy(): void } {
  const act = (action: Action) => { void controller.act(action).catch(() => {}); };
  let handle: { destroy(): void };
  if (process.platform === 'darwin') {
    const menu = controller.platform.installMenu(JSON.stringify(desktopMenu(controller.snapshot())), json => act(JSON.parse(json) as Action));
    let signature = '';
    controller.onMenuChanged = () => { const next = JSON.stringify(desktopMenu(controller.snapshot())); if (signature !== next) { signature = next; menu.update(next); } };
    controller.onContextMenu = () => menu.popup(); handle = menu;
  } else {
    const tray = new Tray(windowsLeaf()); tray.setToolTip('千早桌宠');
    tray.on('click', () => controller.openMenu()); tray.on('right-click', () => controller.openMenu());
    tray.on('double-click', () => controller.open('chat'));
    controller.onContextMenu = () => controller.openMenu(); handle = tray;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: '千早桌宠', submenu: [
      { label: '设置…', accelerator: 'Command+,', click: () => act({ type: 'settings' }) },
      { type: 'separator' as const }, { label: '退出千早桌宠', role: 'quit' as const, accelerator: 'Command+Q' },
    ] }] : []),
    { label: '编辑', submenu: [
      { label: '撤销', role: 'undo', accelerator: 'CmdOrCtrl+Z' }, { label: '重做', role: 'redo', accelerator: 'CmdOrCtrl+Shift+Z' }, { type: 'separator' },
      { label: '剪切', role: 'cut', accelerator: 'CmdOrCtrl+X' }, { label: '复制', role: 'copy', accelerator: 'CmdOrCtrl+C' },
      { label: '粘贴', role: 'paste', accelerator: 'CmdOrCtrl+V' }, { label: '全选', role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
    ] },
  ]));
  return handle;
}
