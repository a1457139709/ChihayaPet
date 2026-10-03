import { app, dialog, protocol, ipcMain, powerMonitor, session } from 'electron';
import { statSync, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { resolvePaths, initializePaths } from './paths';
import { Platform } from '../platform/native';
import { ConfigStore } from './storage';
import { Companion } from './companion';
import { MusicLibrary, AudioDecoder, MusicController } from './music';
import { DesktopApplication } from './desktop';
import { installMenu } from './menu';
import { validAction } from './ipc';
import { runtimeGuide } from './files-guide';
import { qaFetch } from './qa-network';

app.setName('ChihayaPet');
const qa = process.env.CHIHAYA_QA === '1' && Boolean(process.env.CHIHAYA_QA_DATA);
const paths = resolvePaths({ platform: process.platform, packaged: app.isPackaged, executable: process.execPath, appPath: app.getAppPath(), qaRoot: qa ? process.env.CHIHAYA_QA_DATA : undefined });
let startupError: unknown;
try {
  initializePaths(paths);
  app.setPath('appData', paths.root); app.setPath('userData', paths.runtime); app.setPath('sessionData', paths.session);
  app.setPath('temp', paths.temp); app.setPath('crashDumps', paths.crashes); app.setAppLogsPath(paths.logs);
  // Child processes inherit the portable temporary directory, including on Windows.
  process.env.TMP = paths.temp; process.env.TEMP = paths.temp; process.env.TMPDIR = paths.temp;
  app.commandLine.appendSwitch('disk-cache-dir', path.join(paths.session, 'Cache'));
  app.commandLine.appendSwitch('log-file', path.join(paths.logs, 'chromium.log'));
} catch (e) { startupError = e; }
protocol.registerSchemesAsPrivileged([{ scheme: 'chihaya', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
let controller: DesktopApplication | undefined;
let tray: ReturnType<typeof installMenu> | undefined;
if (!startupError && !app.requestSingleInstanceLock()) app.quit();
else void app.whenReady().then(async () => {
  if (startupError) throw startupError;
  if (!['darwin', 'win32'].includes(process.platform)) throw new Error('首版支持 macOS 26+ arm64 和 Windows 11 x64。');
  if (process.platform === 'darwin') app.dock?.hide();
  const directory = __dirname;
  const resources = app.isPackaged ? path.join(process.resourcesPath, 'RuntimeResources') : path.join(app.getAppPath(), 'ChihayaPet/Resources');
  const binaries = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist') : directory;
  const platform = new Platform(process.platform, path.join(binaries, 'platform'), paths.preferences, qa ? `local.ChihayaPet.QA.${path.basename(paths.root).replace(/[^a-zA-Z\d]/g, '')}` : 'local.ChihayaPet');
  const music = new MusicController(new MusicLibrary(paths.music), new AudioDecoder(path.join(binaries, 'media', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'), paths.cache), platform);
  const companion = new Companion(new ConfigStore(paths.config), platform, qa && process.env.CHIHAYA_QA_REPLY === '1' ? qaFetch : fetch);
  controller = new DesktopApplication(companion, music, platform, paths, directory, resources);
  tray = installMenu(controller);
  runtimeGuide(paths, app.isPackaged ? (process.platform === 'darwin' ? path.resolve(process.execPath, '../../..') : path.dirname(process.execPath)) : app.getAppPath(), process.platform, path.join(process.resourcesPath, 'FILES.txt'), platform.domain);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  protocol.handle('chihaya', request => {
    const url = new URL(request.url);
    if (url.hostname === 'sprite') return controller!.spriteResponse(request.url);
    if (url.hostname === 'audio' && url.pathname === '/current') {
      const state = music.snapshot(); if (!state.source) return new Response('', { status: 404 });
      if (url.searchParams.get('source') !== path.basename(state.source)) return new Response('', { status: 404 });
      const size = statSync(state.source).size;
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') ?? '');
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      if (start > end || start >= size) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      const body = Readable.toWeb(createReadStream(state.source, { start, end })) as ReadableStream<Uint8Array>;
      return new Response(body, { status: range ? 206 : 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'audio/wav', 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}), 'Cache-Control': 'no-store' } });
    }
    return new Response('', { status: 404 });
  });
  ipcMain.handle('chihaya:snapshot', event => {
    const kind = controller!.windowKind(event.sender.id); if (!kind) throw new Error('未知窗口。');
    return controller!.snapshot(kind === 'settings');
  });
  ipcMain.handle('chihaya:action', async (event, value: unknown) => {
    const kind = controller!.windowKind(event.sender.id);
    if (!kind || !validAction(value, kind) || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) throw new Error('操作无效。');
    await controller!.act(value);
  });
  const asleep = new Set<string>();
  const wake = (reason: string, awake: boolean) => { if (awake) asleep.delete(reason); else asleep.add(reason); controller!.setAwake(asleep.size === 0); };
  powerMonitor.on('suspend', () => wake('sleep', false)); powerMonitor.on('resume', () => wake('sleep', true));
  powerMonitor.on('lock-screen', () => wake('lock', false)); powerMonitor.on('unlock-screen', () => wake('lock', true));
  if (!qa && app.isPackaged && process.platform === 'darwin') platform.cleanupInstaller(path.resolve(process.execPath, '../../..'));
}).catch(error => {
  dialog.showErrorBox('千早桌宠启动失败', error instanceof Error ? error.message : '无法初始化应用。'); app.quit();
});
app.on('second-instance', () => controller?.open('chat'));
app.on('activate', () => controller?.open('chat'));
app.on('window-all-closed', () => {});
app.on('before-quit', () => { controller?.shutdown(); controller = undefined; tray?.destroy(); tray = undefined; });
