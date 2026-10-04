import { build } from 'esbuild';
import { mkdir, copyFile, cp, realpath, access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
execFileSync('python3', ['scripts/verify_resources.py', '--source-only', '--require-approved-standing'], { cwd: root, stdio: 'inherit' });
await mkdir('dist/platform', { recursive: true });
await mkdir('dist/media', { recursive: true });
await build({ entryPoints: ['app/main/index.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', outfile: 'dist/main.cjs', external: ['electron'], sourcemap: false, plugins: [{ name: 'embed-default-persona', setup(builder) { builder.onLoad({ filter: /[/\\]default-prompt\.ts$/ }, async () => ({ contents: 'export const defaultPrompt = ' + JSON.stringify(await readFile(path.join(root, 'chihaya_prompt.md'), 'utf8')) + ';', loader: 'ts' })); } }] });
await build({ entryPoints: ['app/preload.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', outfile: 'dist/preload.cjs', external: ['electron'] });
await build({ entryPoints: ['app/renderer/index.ts'], bundle: true, platform: 'browser', target: 'chrome144', outfile: 'dist/renderer.js' });
await copyFile('app/renderer/index.html', 'dist/index.html');
await copyFile('app/renderer/style.css', 'dist/style.css');
await cp('app/platform/WindowsFocus.ps1', 'dist/platform/WindowsFocus.ps1');
if (process.platform === 'darwin') {
  execFileSync('/usr/bin/xcrun', ['swiftc', '-O', '-target', 'arm64-apple-macos26.0', '-module-cache-path', path.join(root, 'build/SwiftModuleCache'), '-framework', 'AppKit', 'app/platform/MacBridge.swift', '-o', 'dist/platform/MacBridge'], { stdio: 'inherit', env: { ...process.env, DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer' } });
  const headers = path.resolve(path.dirname(await realpath(process.execPath)), '../include/node');
  await access(path.join(headers, 'node_api.h')).catch(() => { throw new Error('macOS build needs Node.js development headers beside the Node installation (include/node/node_api.h).'); });
  execFileSync('/usr/bin/xcrun', ['clang++', '-bundle', '-undefined', 'dynamic_lookup', '-fobjc-arc', '-O2', '-arch', 'arm64', '-mmacosx-version-min=26.0', '-framework', 'AppKit', '-I', headers, 'app/platform/MacWindow.mm', 'app/platform/MacMenu.mm', '-o', 'dist/platform/MacWindow.node'], { stdio: 'inherit', env: { ...process.env, DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer' } });
}
await copyFile(require('ffmpeg-static'), `dist/media/ffmpeg${process.platform === 'win32' ? '.exe' : ''}`);
for (const suffix of ['LICENSE', 'README']) await copyFile(require('ffmpeg-static') + '.' + suffix, 'dist/media/FFmpeg.' + suffix);
console.log('Built shared Electron app.');
