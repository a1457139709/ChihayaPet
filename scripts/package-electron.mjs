import { build, Platform, Arch } from 'electron-builder';
import { mkdirSync, existsSync, copyFileSync, rmSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { cp, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { writeInventory } from './package-inventory.mjs';
import { stageBundledBGM } from './bundled-bgm.mjs';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..');
const selected = process.argv[2] ?? 'all';
const bundledBGM = path.join(root, 'build/BundledBGM');
stageBundledBGM(root, bundledBGM);
const ffmpegVersion = 'b6.1.1';
const winDecoder = path.join(root, 'build/tools/ffmpeg-win32-x64.exe');
mkdirSync(path.dirname(winDecoder), { recursive: true }); mkdirSync('release', { recursive: true });
if (selected !== 'mac' && !existsSync(winDecoder)) {
  const base = `https://github.com/eugeneware/ffmpeg-static/releases/download/${ffmpegVersion}`;
  const response = await fetch(base + '/ffmpeg-win32-x64.gz'); if (!response.ok) throw new Error('Windows decoder download failed.');
  const bytes = gunzipSync(Buffer.from(await response.arrayBuffer()));
  if (createHash('sha256').update(bytes).digest('hex') !== '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00') throw new Error('Windows decoder checksum mismatch.');
  writeFileSync(winDecoder, bytes);
  for (const suffix of ['LICENSE', 'README']) { const r = await fetch(`${base}/win32-x64.${suffix}`); if (!r.ok) throw new Error('Missing decoder provenance.'); writeFileSync(winDecoder + '.' + suffix, await r.text()); }
}
if (selected !== 'mac' && createHash('sha256').update(readFileSync(winDecoder)).digest('hex') !== '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00') throw new Error('Windows decoder checksum mismatch.');
const config = {
  appId: 'local.ChihayaPet', productName: 'ChihayaPet', asar: true, asarUnpack: ['dist/platform/**', 'dist/media/**'],
  directories: { output: 'release', buildResources: 'app/platform' },
  files: ['dist/**', 'package.json', '!dist/media/ffmpeg.exe'],
  extraResources: [{ from: 'ChihayaPet/Resources', to: 'RuntimeResources' }, { from: bundledBGM, to: 'BundledBGM' }],
  mac: { target: 'dir', identity: '-', minimumSystemVersion: '26.0.0', category: 'public.app-category.entertainment', extendInfo: { LSUIElement: true }, entitlements: 'app/platform/entitlements.mac.plist', entitlementsInherit: 'app/platform/entitlements.mac.plist' },
  win: { target: 'dir', signAndEditExecutable: false },
  afterPack: async context => {
    const platform = context.electronPlatformName;
    const appRoot = platform === 'darwin' ? path.join(context.appOutDir, 'ChihayaPet.app') : context.appOutDir;
    const resources = platform === 'darwin' ? path.join(appRoot, 'Contents/Resources') : path.join(appRoot, 'resources');
    if (platform === 'win32') {
      // Ship the import location, but never copy the developer's personal library.
      mkdirSync(path.join(appRoot, 'Data/Music'), { recursive: true });
      const media = path.join(resources, 'app.asar.unpacked/dist/media');
      rmSync(path.join(media, 'ffmpeg'), { force: true }); copyFileSync(winDecoder, path.join(media, 'ffmpeg.exe'));
      for (const suffix of ['LICENSE', 'README']) copyFileSync(winDecoder + '.' + suffix, path.join(media, 'FFmpeg.' + suffix));
      rmSync(path.join(resources, 'app.asar.unpacked/dist/platform/MacBridge'), { force: true });
      rmSync(path.join(resources, 'app.asar.unpacked/dist/platform/MacWindow.node'), { force: true });
      writeInventory(appRoot, platform, resources);
    } else { writeFileSync(path.join(resources, 'FILES.txt'), ''); writeFileSync(path.join(resources, 'PACKAGE-FILES.json'), '{}'); }
  },
  afterSign: async context => {
    if (context.electronPlatformName !== 'darwin') return;
    const appRoot = path.join(context.appOutDir, 'ChihayaPet.app');
    writeInventory(appRoot, 'darwin', path.join(appRoot, 'Contents/Resources'));
    // The inventory records final signing-file paths. Re-sign only the enclosing app after writing its guide.
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', '--entitlements', 'app/platform/entitlements.mac.plist', appRoot], { stdio: 'inherit' });
  },
};
const { afterPack, afterSign, ...options } = config;
const freshConfig = platform => {
  const values = structuredClone(options);
  if (platform === 'win32') values.files.push('!dist/media/ffmpeg', '!dist/platform/MacBridge', '!dist/platform/MacWindow.node');
  return { ...values, afterPack, afterSign };
};
if (selected !== 'win' && process.platform === 'darwin') {
  await build({ targets: Platform.MAC.createTarget('dir', Arch.arm64), config: freshConfig('darwin') });
  const source = 'release/mac-arm64/ChihayaPet.app';
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', source], { stdio: 'inherit' });
  const staging = await mkdtemp(path.join(root, 'build/dmg-electron-'));
  try {
    await cp(source, path.join(staging, 'ChihayaPet.app'), { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
    const { symlinkSync } = await import('node:fs'); symlinkSync('/Applications', path.join(staging, 'Applications'));
    writeFileSync(path.join(staging, '.chihaya-installer'), 'local.ChihayaPet.installer.v1\n');
    const dmg = path.join(root, 'release/ChihayaPet-macOS-arm64.dmg'); rmSync(dmg, { force: true });
    execFileSync('/usr/bin/hdiutil', ['create', '-volname', 'ChihayaPet', '-srcfolder', staging, '-format', 'UDZO', dmg], { stdio: 'inherit' });
    execFileSync('/usr/bin/hdiutil', ['verify', dmg], { stdio: 'inherit' });
  } finally { rmSync(staging, { recursive: true, force: true }); }
}
if (selected !== 'mac') {
  await build({ targets: Platform.WINDOWS.createTarget('dir', Arch.x64), config: freshConfig('win32') });
  const sevenZip = require('7zip-bin').path7za; chmodSync(sevenZip, 0o755);
  const zip = path.join(root, 'release/ChihayaPet-Windows-x64.zip'); rmSync(zip, { force: true });
  execFileSync(sevenZip, ['a', '-tzip', zip, '.'], { cwd: path.join(root, 'release/win-unpacked'), stdio: 'inherit' });
  execFileSync(sevenZip, ['t', zip], { stdio: 'inherit' });
}
execFileSync(process.execPath, ['scripts/verify-package.mjs'], { stdio: 'inherit' });
console.log('Packaged requested platforms in release/.');
