import { execFileSync, execFile, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Preferences } from '../shared/contracts';
import { JSONPreferences, type PreferenceStore } from '../main/storage';

export class Platform implements PreferenceStore {
  private json: JSONPreferences;
  private watcher?: ChildProcess;
  private previousFocus?: string;
  private macWindows?: { configure(handle: Buffer, allSpaces: boolean): void };
  constructor(readonly kind: NodeJS.Platform, readonly directory: string, preferenceFile: string, readonly domain = 'local.ChihayaPet') { this.json = new JSONPreferences(preferenceFile); }
  private mac(command: string, input?: string): string { return execFileSync(path.join(this.directory, 'MacBridge'), [command, this.domain], { encoding: 'utf8', input, timeout: 10_000, maxBuffer: 2_000_000 }).trim(); }
  load(): Preferences { return this.kind === 'darwin' ? JSON.parse(this.mac('preferences-read')) as Preferences : this.json.load(); }
  save(changes: Preferences): void { if (this.kind === 'darwin') this.mac('preferences-write', JSON.stringify(changes)); else this.json.save(changes); }
  displayUUIDs(): { id: number; uuid: string }[] { if (this.kind !== 'darwin') return []; try { return JSON.parse(this.mac('displays')); } catch { return []; } }
  configureWindow(handle: Buffer, allSpaces: boolean): void {
    if (this.kind !== 'darwin') return;
    this.macWindows ??= require(path.join(this.directory, 'MacWindow.node'));
    this.macWindows!.configure(handle, allSpaces);
  }
  watchReducedMotion(listener: (value: boolean) => void): void {
    if (this.kind !== 'darwin') return;
    this.watcher = spawn(path.join(this.directory, 'MacBridge'), ['watch'], { stdio: ['pipe', 'pipe', 'ignore'] });
    let buffer = '';
    this.watcher.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n'), line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        try { listener(Boolean(JSON.parse(line).reducedMotion)); } catch {}
      }
    });
    this.watcher.on('error', () => {});
  }
  rememberFocus(): void {
    try {
      const value = this.kind === 'darwin' ? this.mac('focus-read') : execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(this.directory, 'WindowsFocus.ps1'), 'read'], { encoding: 'utf8', timeout: 10_000, windowsHide: true }).trim();
      if (/^\d+$/.test(value) && Number(value) > 0 && (this.kind !== 'darwin' || Number(value) !== process.pid)) this.previousFocus = value;
    } catch { this.previousFocus = undefined; }
  }
  restoreFocus(): void {
    const value = this.previousFocus; this.previousFocus = undefined;
    if (!value) return;
    if (this.kind === 'darwin') execFile(path.join(this.directory, 'MacBridge'), ['focus-restore', value], { timeout: 10_000 }, () => {});
    else execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(this.directory, 'WindowsFocus.ps1'), 'restore', value], { windowsHide: true, timeout: 10_000 }, () => {});
  }
  cleanupInstaller(application: string): void {
    if (this.kind !== 'darwin') return;
    let resolved: string; try { resolved = realpathSync(application); } catch { return; }
    if (!['/Applications', path.join(os.homedir(), 'Applications')].includes(path.dirname(resolved))) return;
    const timer = setTimeout(() => {
      execFile('/usr/bin/hdiutil', ['info', '-plist'], { timeout: 15_000 }, (error, text) => {
        if (error) return;
        try {
          const info = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { input: text, encoding: 'utf8' }));
          for (const image of info.images ?? []) for (const entity of image['system-entities'] ?? []) { try {
            const mount: unknown = entity['mount-point'];
            if (typeof mount !== 'string' || path.dirname(mount) !== '/Volumes') continue;
            if (readFileSync(path.join(mount, '.chihaya-installer'), 'utf8') !== 'local.ChihayaPet.installer.v1\n') continue;
            const plist = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(mount, 'ChihayaPet.app/Contents/Info.plist')], { encoding: 'utf8' }));
            if (plist.CFBundleIdentifier === 'local.ChihayaPet') execFile('/usr/bin/hdiutil', ['detach', mount], { timeout: 15_000 }, () => {});
          } catch { /* Skip each unrelated or inaccessible volume independently. */ } }
        } catch { /* An occupied or unrelated volume stays mounted. */ }
      });
    }, 3_000); timer.unref();
  }
  shutdown(): void { this.watcher?.kill(); }
}
