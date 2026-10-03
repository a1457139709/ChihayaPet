import { _electron as electron } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'build/QA/release-comparison.json'); mkdirSync(path.dirname(output), { recursive: true });
const soakSeconds = Number(process.env.CHIHAYA_QA_SOAK_SECONDS ?? 1800);
const abort = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => abort.abort(new Error(`Comparison interrupted: ${signal}`)));
const sleep = ms => delay(ms, undefined, { signal: abort.signal }).catch(() => { throw abort.signal.reason; });
const bytes = dir => readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? bytes(path.join(dir, e.name)) : e.isFile() ? statSync(path.join(dir, e.name)).size : 0), 0);
const report = { date: new Date().toISOString(), electronCommit: execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), nativeCommit: 'b6a2f10f759de40665b7d7ab664c33a0004ea244', hardware: { architecture: os.arch(), memoryBytes: os.totalmem(), cpu: os.cpus()[0].model, macOS: execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim() }, method: 'Same Mac and approved PNGs. Sum of RSS across the process tree (shared pages counted more than once), instantaneous ps CPU percentages, release apps with isolated data, no DevTools UI, synthetic streaming reply and silent synthetic audio. This is not physical memory or energy consumption.', unknown: ['GPU/energy counters were not collected; no battery/power claim.', 'Sleep notifications are simulated; physical sleep and multi-monitor hotplug remain manual.', 'Cold launch is the first launch in this run, not a cleared OS disk cache. Debugger transport adds some process/runtime overhead to the Electron measurement.'], results: {} };
const sessions = [];
try {
  for (const kind of ['native', 'electron']) {
    const data = mkdtempSync(path.join(os.tmpdir(), `chihaya-bench-${kind}-`));
    const domain = `local.ChihayaPet.QA.${path.basename(data).replace(/[^a-zA-Z\d]/g, '')}`;
    mkdirSync(path.join(data, 'Music'));
    const id = '00000000-0000-4000-8000-000000000001', fileName = id + '.wav';
    execFileSync(path.join(root, 'node_modules/ffmpeg-static/ffmpeg'), ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', path.join(data, 'Music', fileName)]);
    writeFileSync(path.join(data, 'Music/library.json'), JSON.stringify([{ id, title: '虚构验证音频', fileName }]));
    writeFileSync(path.join(data, 'config.json'), JSON.stringify({ baseURL: 'https://example.invalid/v1', model: 'synthetic', apiKeys: { 'https://example.invalid/v1': 'synthetic' } }));
    for (const [key, type, value] of [['music.autoplayEnabled', '-bool', 'false'], ['music.volume', '-float', '0'], ['idle.enabled', '-bool', 'false']]) execFileSync('/usr/bin/defaults', ['write', domain, key, type, value]);
    const started = performance.now(); let command, close, pid, closing = false, appMetrics = [];
    const session = { kind, data, domain }; sessions.push(session);
    const exited = (code, signal) => {
      if (closing) return;
      session.exit = { at: new Date().toISOString(), code, signal };
      console.error(`${kind} exited unexpectedly: ${JSON.stringify(session.exit)}`);
      abort.abort(new Error(`${kind} exited during comparison`));
    };
    if (kind === 'native') {
      const child = spawn(path.join(root, 'build/benchmark-native/ChihayaPet.app/Contents/MacOS/ChihayaPet'), [], { env: { ...process.env, CHIHAYA_QA_DATA: data, CHIHAYA_QA_DOMAIN: domain }, stdio: ['pipe', 'pipe', 'inherit'] });
      pid = child.pid;
      const lines = createInterface({ input: child.stdout }); let readyResolve, ackResolve;
      session.close = async () => { closing = true; child.kill(); lines.close(); };
      const ready = new Promise(r => { readyResolve = r; });
      lines.on('line', line => { try { const value = JSON.parse(line); if (value.ready) readyResolve(); if (value.ack) ackResolve?.(value); } catch {} });
      child.on('exit', exited);
      await Promise.race([ready, sleep(30_000).then(() => { throw new Error('Native baseline launch failed'); })]);
      command = async action => { const ack = new Promise(r => { ackResolve = r; }); child.stdin.write(JSON.stringify(action) + '\n'); await Promise.race([ack, sleep(10_000).then(() => { throw new Error('Native command timed out'); })]); };
      close = session.close;
    } else {
      const app = await electron.launch({ executablePath: path.join(root, 'release/mac-arm64/ChihayaPet.app/Contents/MacOS/ChihayaPet'), args: [], env: { ...process.env, CHIHAYA_QA: '1', CHIHAYA_QA_DATA: data, CHIHAYA_QA_REPLY: '1' }, timeout: 30_000 });
      session.close = () => { closing = true; return app.close(); };
      app.process().on('exit', exited);
      const pet = await app.firstWindow(); await pet.waitForFunction(() => document.querySelector('canvas')?.height === 606);
      pid = app.process().pid;
      session.observe = async phase => {
        const main = await app.evaluate(({ app }) => ({ processes: app.getAppMetrics().map(p => ({ pid: p.pid, type: p.type, memory: p.memory })), js: process.memoryUsage() }));
        appMetrics = main.processes;
        const renderer = await pet.evaluate(() => { const c = document.querySelector('canvas'); return { jsHeapBytes: performance.memory?.usedJSHeapSize, canvasRGBABytes: c.width * c.height * 4 }; });
        session.result.diagnostics ??= [];
        session.result.diagnostics.push({ phase, main, renderer, note: 'Node main-process heap/external buffers and Chromium approximate renderer JS heap. canvasRGBABytes estimates one raw image buffer; alpha hit data is another buffer of this size. These are not RSS and do not measure GPU allocations.' });
      };
      command = async a => {
        if (['animations', 'expression', 'outfit', 'framing'].includes(a.type)) return pet.evaluate(action => window.chihaya.act(action), { type: 'desktop', field: a.type, value: a.value });
        if (a.type === 'close') { for (const p of app.windows()) { if (p.url().includes('window=chat')) await p.evaluate(() => window.chihaya.act({ type: 'close', window: 'chat' })); if (p.url().includes('window=settings')) await p.evaluate(() => window.chihaya.act({ type: 'close', window: 'settings' })); } return; }
        if (a.type === 'move') return app.evaluate(({ BrowserWindow, screen }, point) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('window=pet')); w.setPosition(point.x, screen.getPrimaryDisplay().bounds.height - point.y - w.getBounds().height); }, { x: a.x, y: a.y });
        if (a.type === 'request') { const chat = app.windows().find(p => p.url().includes('window=chat')); await chat.evaluate(() => { void window.chihaya.act({ type: 'input', text: '虚构验证消息' }).then(() => window.chihaya.act({ type: 'send' })); }); return; }
        if (a.type === 'hide' || a.type === 'show') return pet.evaluate(value => window.chihaya.act({ type: 'visible', value }), a.type === 'show');
        if (a.type === 'sleep' || a.type === 'wake') return app.evaluate(({ powerMonitor }, event) => powerMonitor.emit(event), a.type === 'sleep' ? 'suspend' : 'resume');
        if (a.type === 'music') return pet.evaluate(() => window.chihaya.act({ type: 'music-toggle' }));
        if (a.type === 'clear') { const chat = app.windows().find(p => p.url().includes('window=chat')); if (chat) await chat.evaluate(() => window.chihaya.act({ type: 'clear' })); return; }
        return pet.evaluate(action => window.chihaya.act(action), a);
      };
      close = session.close;
      report.displays = await app.evaluate(({ screen }) => screen.getAllDisplays().map(d => ({ bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor })));
    }
    const result = { pid, startupMS: Math.round(performance.now() - started), bundleBytes: bytes(path.join(root, kind === 'native' ? 'build/benchmark-native/ChihayaPet.app' : 'release/mac-arm64/ChihayaPet.app')), samples: [] };
    report.results[kind] = result; Object.assign(session, { pid, command, close, result });
    await session.observe?.('startup');
    const sample = scenario => {
      const lines = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,%cpu=,rss='], { encoding: 'utf8' }).trim().split('\n').map(l => l.trim().split(/\s+/).map(Number));
      const pids = new Set([pid]); let count = -1;
      while (pids.size !== count) { count = pids.size; for (const [p, parent] of lines) if (pids.has(parent)) pids.add(p); }
      const members = lines.filter(([p]) => pids.has(p));
      if (!members.some(([p]) => p === pid)) throw new Error(`${kind} main process ${pid} disappeared; zero-process samples are invalid.`);
      result.samples.push({ scenario, seconds: Math.round((performance.now() - started) / 1000), processes: members.length, cpuPercent: Math.round(members.reduce((n, p) => n + p[2], 0) * 10) / 10, rssMiB: Math.round(members.reduce((n, p) => n + p[3], 0) / 1024 * 10) / 10, runtimeBytes: existsRuntime(data), members: members.map(([pid, ppid, cpu, rss]) => ({ pid, ppid, type: kind === 'native' ? 'native' : appMetrics.find(p => p.pid === pid)?.type ?? 'platform-helper/child', cpuPercent: cpu, rssKiB: rss })) });
      writeFileSync(output, JSON.stringify(report, null, 2));
    };
    session.sample = sample;
    for (let i = 0; i < 5; i++) { await sleep(1000); sample('visible-idle'); }
    await command({ type: 'animations', value: false }); for (let i = 0; i < 5; i++) { await sleep(1000); sample('static'); }
    await command({ type: 'animations', value: true });
    for (let i = 0; i < 20; i++) { await command({ type: 'expression', value: String(i % 12).padStart(2, '0') }); await command({ type: 'move', x: 1000 + i * 2, y: 30 }); await sleep(100); if (i % 4 === 0) sample('move-expression'); }
    await command({ type: 'expression', value: 'automatic' });
    for (let i = 0; i < 5; i++) { await command({ type: 'chat' }); await sleep(200); await command({ type: 'settings' }); await sleep(200); await command({ type: 'close' }); sample('panels-repeated'); }
    await command({ type: 'chat' }); await sleep(500); await command({ type: 'request' }); for (let i = 0; i < 8; i++) { await sleep(1000); sample('streamed-reply'); }
    await command({ type: 'clear' }); await command({ type: 'close' });
    await command({ type: 'music' }); for (let i = 0; i < 5; i++) { await sleep(1000); sample('music'); }
    await command({ type: 'hide' }); await sleep(1500); sample('hidden'); await command({ type: 'show' });
    await command({ type: 'sleep' }); await sleep(1000); await command({ type: 'wake' }); await sleep(1000); sample('simulated-wake');
    await command({ type: 'music' }); await command({ type: 'animations', value: false });
    await session.observe?.('after-scenarios');
    console.log(`${kind}: scenarios measured; starting residence observation.`);
  }
  const soakStart = performance.now();
  while (performance.now() - soakStart < soakSeconds * 1000) {
    for (const s of sessions) s.sample('residence');
    await sleep(Math.min(60_000, soakSeconds * 1000 - (performance.now() - soakStart)));
  }
  for (const s of sessions) { await s.observe?.('residence-final'); s.sample('residence-final'); }
  report.residenceSeconds = Math.round((performance.now() - soakStart) / 1000); report.completed = true; writeFileSync(output, JSON.stringify(report, null, 2));
  console.log('Release comparison completed:', output);
} catch (error) {
  report.failure = error.message; report.completed = false;
  report.exits = sessions.filter(s => s.exit).map(s => ({ kind: s.kind, ...s.exit }));
  writeFileSync(output, JSON.stringify(report, null, 2)); throw error;
} finally {
  for (const s of sessions) { try { await s.close?.(); } catch {} try { execFileSync('/usr/bin/defaults', ['delete', s.domain], { stdio: 'ignore' }); } catch {} rmSync(s.data, { recursive: true, force: true }); }
}
function existsRuntime(data) { try { return bytes(path.join(data, 'ElectronRuntime')); } catch { return 0; } }
