'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { MusicLibrary } = require('../src/core/music.cjs');
const { Storage } = require('../src/core/storage.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const MAIN_PATH = path.join(PROJECT_ROOT, 'windows/src/main.cjs');
const SPRITES_PATH = path.join(PROJECT_ROOT, 'ChihayaPet/Resources/CharacterSprites');

class FakeWebContents extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this.mainFrame = {};
    this.messages = [];
  }

  setWindowOpenHandler(handler) {
    this.openHandler = handler;
  }

  send(channel, value) {
    this.messages.push({ channel, value });
  }
}

function fakeElectron(root) {
  const state = {
    windows: [],
    ipc: new Map(),
    menus: [],
    quitCount: 0,
    applicationMenu: undefined,
  };
  const appPaths = {
    appData: path.join(root, 'AppData'),
    userData: path.join(root, 'AppData', 'ChihayaPet'),
  };
  const app = new EventEmitter();
  app.setName = (name) => { state.appName = name; };
  app.setPath = (name, value) => { appPaths[name] = value; };
  app.getPath = (name) => appPaths[name];
  app.getAppPath = () => path.join(root, 'fixture-app');
  app.requestSingleInstanceLock = () => true;
  app.quit = () => { state.quitCount += 1; };
  // Loading main.cjs defines the class without asynchronously starting an app.
  app.whenReady = () => ({ then: () => ({ catch: () => {} }) });

  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.visible = Boolean(options.show);
      this.destroyed = false;
      this.bounds = {
        x: Number.isFinite(options.x) ? options.x : 0,
        y: Number.isFinite(options.y) ? options.y : 0,
        width: options.width,
        height: options.height,
      };
      this.webContents = new FakeWebContents(state.windows.length + 1);
      state.windows.push(this);
    }

    async loadFile(file) { this.loadedFile = file; }
    showInactive() { this.visible = true; this.showInactiveCount = (this.showInactiveCount || 0) + 1; }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    focus() { this.focused = true; }
    isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; }
    getBounds() { return { ...this.bounds }; }
    setBounds(bounds) { this.bounds = { ...bounds }; }
    setPosition(x, y) { this.bounds = { ...this.bounds, x, y }; }
    setAlwaysOnTop(value, level) { this.alwaysOnTop = { value, level }; }
    setIgnoreMouseEvents(value, options) { this.ignoredMouse = { value, options }; }
  }

  class Tray extends EventEmitter {
    constructor(icon) { super(); this.icon = icon; }
    setToolTip(value) { this.tooltip = value; }
    setContextMenu(value) { this.menu = value; }
    popUpContextMenu() { this.popupCount = (this.popupCount || 0) + 1; }
    destroy() { this.destroyed = true; }
  }

  const permission = {};
  const webRequest = {};
  const powerMonitor = new EventEmitter();
  const screen = Object.assign(new EventEmitter(), {
    getPrimaryDisplay: () => ({ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }),
    getAllDisplays: () => [{ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
    getDisplayMatching: () => ({ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }),
  });
  const electron = {
    app,
    BrowserWindow,
    Menu: {
      setApplicationMenu: (menu) => { state.applicationMenu = menu; },
      buildFromTemplate: (template) => { state.menus.push(template); return template; },
    },
    Tray,
    nativeImage: {
      createFromPath: (file) => ({ file, resize: (size) => ({ file, size }) }),
    },
    ipcMain: {
      handle: (channel, handler) => { state.ipc.set(channel, handler); },
    },
    screen,
    powerMonitor,
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showErrorBox: (title, message) => { state.errorBox = { title, message }; },
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: (handler) => { permission.request = handler; },
        setPermissionCheckHandler: (handler) => { permission.check = handler; },
        webRequest: {
          onBeforeRequest: (filter, handler) => { webRequest.filter = filter; webRequest.handler = handler; },
        },
      },
    },
  };
  return { electron, state, permission, webRequest, appPaths };
}

function loadDesktopClass(electron) {
  const source = `${fs.readFileSync(MAIN_PATH, 'utf8')}\nmodule.exports = { DesktopApp };\n`;
  const loaded = new Module(MAIN_PATH, module);
  loaded.filename = MAIN_PATH;
  loaded.paths = Module._nodeModulePaths(path.dirname(MAIN_PATH));
  loaded.require = function requireFromMain(identifier) {
    if (identifier === 'electron') return electron;
    return Module.prototype.require.call(this, identifier);
  };
  loaded._compile(source, MAIN_PATH);
  return loaded.exports.DesktopApp;
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chihaya-main-'));
  const appRoot = path.join(root, 'fixture-app');
  fs.mkdirSync(path.join(appRoot, 'resources'), { recursive: true });
  fs.symlinkSync(SPRITES_PATH, path.join(appRoot, 'resources', 'CharacterSprites'), 'dir');
  const fake = fakeElectron(root);
  const DesktopApp = loadDesktopClass(fake.electron);
  const desktops = [];
  t.after(() => {
    for (const desktop of desktops) desktop.shutdown();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    ...fake,
    root,
    userData: fake.appPaths.userData,
    createDesktop() {
      const desktop = new DesktopApp();
      desktops.push(desktop);
      return desktop;
    },
  };
}

function rendererEvent(window) {
  return { sender: window.webContents, senderFrame: window.webContents.mainFrame };
}

async function invokeAction(harness, window, action, payload) {
  return harness.state.ipc.get('pet:action')(rendererEvent(window), action, payload);
}

test('bootstrap confines renderer capabilities to its role and blocks renderer network', async (t) => {
  const harness = fixture(t);
  const desktop = harness.createDesktop();
  await desktop.start();

  assert.equal(harness.state.windows.length, 3);
  for (const window of harness.state.windows) {
    assert.deepEqual(window.webContents.openHandler({ url: 'https://example.test' }), { action: 'deny' });
    assert.equal(window.options.webPreferences.contextIsolation, true);
    assert.equal(window.options.webPreferences.sandbox, true);
    assert.equal(window.options.webPreferences.nodeIntegration, false);
    assert.equal(window.options.webPreferences.webSecurity, true);
  }
  let navigationPrevented = false;
  desktop.panel.webContents.emit('will-navigate', {
    preventDefault() { navigationPrevented = true; },
  });
  assert.equal(navigationPrevented, true);

  let permissionAllowed;
  harness.permission.request(null, 'camera', (value) => { permissionAllowed = value; });
  assert.equal(permissionAllowed, false);
  assert.equal(harness.permission.check(), false);
  let networkDecision;
  harness.webRequest.handler({ url: 'https://example.test' }, (value) => { networkDecision = value; });
  assert.deepEqual(networkDecision, { cancel: true });

  assert.deepEqual(await invokeAction(harness, desktop.panel, 'dragStart', { x: 1, y: 2 }), {
    ok: false,
    error: '此窗口不允许该操作。',
  });
  assert.deepEqual(await invokeAction(harness, desktop.pet, 'savePersona', 'forged'), {
    ok: false,
    error: '此窗口不允许该操作。',
  });
  const forged = {
    sender: desktop.panel.webContents,
    senderFrame: {},
  };
  assert.deepEqual(await harness.state.ipc.get('pet:action')(forged, 'openPanel', 'chat'), {
    ok: false,
    error: '无效的界面请求。',
  });
});

test('preference and service actions persist while every emitted state omits the API key', async (t) => {
  const harness = fixture(t);
  const desktop = harness.createDesktop();
  await desktop.start();

  desktop.showBubble('稍候片刻。', 'idle');
  const preferenceResult = await invokeAction(harness, desktop.panel, 'preferences', {
    height: 320,
    clickThrough: true,
    musicVolume: 0.6,
  });
  assert.equal(preferenceResult.ok, true);
  assert.equal(desktop.bubble, null);
  assert.equal(desktop.pet.ignoredMouse.value, true);
  assert.equal(desktop.pet.getBounds().height, 344);

  const serviceResult = await invokeAction(harness, desktop.panel, 'saveService', {
    baseURL: 'https://EXAMPLE.com/v1/',
    model: ' fixture-model ',
    apiKey: 'fixture-secret',
  });
  assert.equal(serviceResult.ok, true);
  assert.deepEqual(serviceResult.value, {
    baseURL: 'https://example.com/v1',
    model: 'fixture-model',
    prompt: desktop.store.getSettings().prompt,
    hasKey: true,
  });

  const restarted = new Storage(harness.userData);
  assert.deepEqual(restarted.getPrefs(), {
    height: 320,
    clickThrough: true,
    musicVolume: 0.6,
    position: desktop.pet.getBounds(),
  });
  assert.equal(restarted.getService().apiKey, 'fixture-secret');

  for (const window of desktop.readyWindows) window.webContents.messages = [];
  desktop.broadcast();
  desktop.broadcast();
  for (const window of desktop.readyWindows) {
    assert.equal(window.webContents.messages.length, 2);
    for (const message of window.webContents.messages) {
      assert.equal(message.channel, 'pet:state');
      assert.equal(JSON.stringify(message.value).includes('fixture-secret'), false);
      assert.equal(message.value.settings.hasKey, true);
    }
  }

  const invalid = await invokeAction(harness, desktop.panel, 'preferences', { height: 900 });
  assert.equal(invalid.ok, false);
  assert.equal(new Storage(harness.userData).getPrefs().height, 320);
});

test('closing and hiding preserve an in-flight chat until explicit cancel or clear', async (t) => {
  const harness = fixture(t);
  const desktop = harness.createDesktop();
  await desktop.start();
  await invokeAction(harness, desktop.panel, 'saveService', {
    baseURL: 'https://example.com/v1',
    model: 'fixture-model',
    apiKey: 'fixture-secret',
  });

  const requests = [];
  desktop.chat.request = (request) => new Promise((resolve, reject) => {
    requests.push({ ...request, resolve, reject });
  });
  desktop.openPanel('chat');
  const sending = invokeAction(harness, desktop.panel, 'send', '尚未完成');
  assert.equal(requests.length, 1);
  requests[0].onDelta('片段');

  let closePrevented = false;
  desktop.panel.emit('close', { preventDefault() { closePrevented = true; } });
  assert.equal(closePrevented, true);
  assert.equal(desktop.panel.isVisible(), false);
  assert.equal(desktop.chat.snapshot().busy, true);
  assert.equal(desktop.chat.snapshot().pending.assistant, '片段');

  await invokeAction(harness, desktop.panel, 'toggleVisible');
  assert.equal(desktop.visible, false);
  assert.equal(desktop.pet.isVisible(), false);
  assert.equal(desktop.chat.snapshot().busy, true);
  assert.equal(desktop.snapshot().music.suspended, true);

  assert.equal((await invokeAction(harness, desktop.panel, 'cancel')).ok, true);
  const cancelledSend = await sending;
  assert.equal(cancelledSend.ok, false);
  assert.match(cancelledSend.error, /取消/);
  assert.equal(desktop.chat.snapshot().busy, false);
  assert.equal(desktop.chat.snapshot().pending.assistant, '片段');

  assert.equal((await invokeAction(harness, desktop.panel, 'clear')).ok, true);
  assert.deepEqual(desktop.chat.snapshot(), {
    turns: [], pending: null, busy: false, error: '',
  });
  requests[0].onDelta('迟到片段');
  requests[0].resolve({ text: '迟到回复', truncated: false });
  await Promise.resolve();
  assert.equal(desktop.chat.snapshot().turns.length, 0);
});

test('music ended advances list mode, persists selection, and repeats single mode', async (t) => {
  const harness = fixture(t);
  fs.mkdirSync(path.dirname(harness.userData), { recursive: true });
  const firstFile = path.join(harness.root, 'first.mp3');
  const secondFile = path.join(harness.root, 'second.mp3');
  fs.writeFileSync(firstFile, 'first');
  fs.writeFileSync(secondFile, 'second');
  const imported = new MusicLibrary(harness.userData).import([firstFile, secondFile]);

  const desktop = harness.createDesktop();
  await desktop.start();
  assert.equal(desktop.selectedId, imported[0].id);
  assert.equal(desktop.playing, true);

  assert.equal((await invokeAction(harness, desktop.panel, 'musicEnded')).ok, true);
  assert.equal(desktop.selectedId, imported[1].id);
  assert.equal(desktop.playing, true);
  assert.equal(new Storage(harness.userData).getPrefs().musicTrackId, imported[1].id);

  await invokeAction(harness, desktop.panel, 'preferences', { musicLoop: 'single' });
  await invokeAction(harness, desktop.panel, 'musicEnded');
  assert.equal(desktop.selectedId, imported[1].id);
  assert.equal(desktop.playing, true);
});

test('bursts of state changes coalesce to one broadcast per ready window', async (t) => {
  const harness = fixture(t);
  const desktop = harness.createDesktop();
  await desktop.start();
  for (const window of desktop.readyWindows) window.webContents.messages = [];

  desktop.queueBroadcast();
  desktop.queueBroadcast();
  desktop.queueBroadcast();
  await new Promise((resolve) => setTimeout(resolve, 60));

  for (const window of desktop.readyWindows) {
    assert.equal(window.webContents.messages.length, 1);
    assert.equal(window.webContents.messages[0].channel, 'pet:state');
  }

  desktop.pet.destroyed = true;
  desktop.broadcast();
  assert.equal(desktop.pet.webContents.messages.length, 1);
  assert.equal(desktop.panel.webContents.messages.length, 2);
  assert.equal(desktop.bubbleWindow.webContents.messages.length, 2);
});
