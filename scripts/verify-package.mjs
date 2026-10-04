import { existsSync, readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileList } from './package-inventory.mjs';
import { verifyBundledBGM } from './bundled-bgm.mjs';
const require = createRequire(import.meta.url), asar = require('@electron/asar');
const specified = process.argv[2];
const roots = specified ? [specified] : ['release/mac-arm64/ChihayaPet.app', 'release/win-unpacked'].filter(existsSync);
if (!roots.length) { console.log('No release directories yet; source resources verified separately.'); process.exit(0); }
for (const root of roots) {
  const mac = root.endsWith('.app'), resources = path.join(root, mac ? 'Contents/Resources' : 'resources');
  assert.ok(existsSync(path.join(resources, 'BundledBGM/catalog.json')), 'Release is missing bundled BGM');
  verifyBundledBGM(path.join(resources, 'BundledBGM'));
  if (!mac) assert.ok(lstatSync(path.join(root, 'Data/Music'), { throwIfNoEntry: false })?.isDirectory(), 'Windows package is missing Data/Music');
  const icons = path.resolve(import.meta.dirname, '../app/platform/icons');
  if (mac) {
    const plist = readFileSync(path.join(root, 'Contents/Info.plist'), 'utf8');
    const iconName = plist.match(/<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
    assert.ok(iconName, 'Missing macOS application icon declaration');
    const iconFile = iconName.endsWith('.icns') ? iconName : iconName + '.icns';
    assert.deepEqual(readFileSync(path.join(resources, iconFile)), readFileSync(path.join(icons, 'chihaya.icns')), 'macOS application icon differs from approved artwork');
  } else {
    // Use the same PE reader that electron-builder uses to write EXE resources.
    const { NtExecutable, NtExecutableResource, Resource, Data } = createRequire(require.resolve('app-builder-lib'))('resedit');
    const executable = NtExecutable.from(readFileSync(path.join(root, 'ChihayaPet.exe')));
    const { entries } = NtExecutableResource.from(executable);
    const group = Resource.IconGroupEntry.fromEntries(entries).find(icon => icon.id === 1);
    assert.ok(group, 'Missing Windows application icon group');
    const expectedIcons = Data.IconFile.from(readFileSync(path.join(icons, 'chihaya.ico'))).icons.map(icon => icon.data);
    const actualIcons = group.getIconItemsFromEntries(entries);
    // ICO group dimensions use a zero byte to represent 256 pixels.
    const fingerprint = icon => ({ width: icon.width || 256, height: icon.height || 256, sha256: createHash('sha256').update(Buffer.from(icon.isRaw() ? icon.bin : icon.generate())).digest('hex') });
    assert.deepEqual(actualIcons.map(fingerprint), expectedIcons.map(fingerprint), 'Windows EXE icon differs from approved artwork');
  }
  const inventory = JSON.parse(readFileSync(path.join(resources, 'PACKAGE-FILES.json'), 'utf8'));
  assert.deepEqual(fileList(root), inventory.files, 'Final distribution inventory mismatch');
  const archive = path.join(resources, 'app.asar'), entries = asar.listPackage(archive);
  assert.ok(entries.includes('/dist/main.cjs') && entries.includes('/dist/preload.cjs') && entries.includes('/dist/renderer.js'));
  for (const entry of entries) {
    const info = asar.statFile(archive, entry.slice(1));
    if (info.unpacked && info.size !== undefined) assert.ok(existsSync(path.join(resources, 'app.asar.unpacked', entry.slice(1))), `Missing unpacked file: ${entry}`);
  }
  assert.ok(!entries.some(f => /ChihayaPetTests|\.swift$|config\.json|Music\/|artwork\//.test(f)), 'Development or personal files in app.asar');
  const standing = path.join(resources, 'RuntimeResources/Characters/Standing');
  const manifest = JSON.parse(readFileSync(path.join(standing, 'manifest.json')));
  const expected = ['manifest.json']; let count = 0;
  for (const variant of Object.values(manifest.variants)) for (const image of variant.results) {
    expected.push(image.path); const hash = createHash('sha256').update(readFileSync(path.join(standing, image.path))).digest('hex');
    assert.equal(hash, image.sha256); assert.equal(image.review.status, 'approved'); assert.equal(image.review.sha256, hash); count++;
  }
  assert.equal(count, 292); assert.deepEqual(fileList(standing), expected.sort());
  assert.equal(createHash('sha256').update(readFileSync(path.join(resources, 'RuntimeResources/fansitekit-notice-original.txt'))).digest('hex'), '42f7ebd87ff6689b50a92ece48039bf191267964e82f5b635b25bf6dfd28021c');
  assert.deepEqual(fileList(path.join(resources, 'RuntimeResources')).filter(f => !f.startsWith('Characters/Standing/')), ['fansitekit-notice-original.txt']);
  const binary = path.join(resources, 'app.asar.unpacked/dist/media', mac ? 'ffmpeg' : 'ffmpeg.exe');
  assert.ok(existsSync(binary)); assert.ok(existsSync(binary.replace(/ffmpeg(\.exe)?$/, 'FFmpeg.LICENSE')));
  assert.equal(entries.includes('/dist/platform/MacWindow.node'), mac, 'macOS window adapter must only be in the Mac package');
  assert.ok(!entries.includes('/dist/platform/WindowsFocus.ps1'), 'Legacy PowerShell focus bridge must not ship');
  const bridge = 'dist/platform/WindowsFFI/build/koffi/win32_x64/koffi.node';
  assert.equal(entries.includes('/' + bridge), !mac, 'Windows native focus bridge must only ship on Windows');
  if (!mac) assert.ok(existsSync(path.join(resources, 'app.asar.unpacked', bridge)), 'Windows bridge must be unpacked');
  assert.ok(!entries.some(entry => entry.startsWith('/node_modules/koffi/')), 'Do not ship the complete development bridge package');
  const files = readFileSync(path.join(root, mac ? 'Contents/Resources/FILES.txt' : 'FILES.txt'), 'utf8');
  for (const file of inventory.files) assert.ok(files.includes(file), file);
  if (!mac) { assert.ok(existsSync(path.join(root, 'ChihayaPet.exe'))); for (const file of ['ffmpeg.dll', 'icudtl.dat', 'resources.pak']) assert.ok(existsSync(path.join(root, file))); assert.ok(inventory.files.some(f => f.startsWith('locales/'))); }
  console.log(`Verified ${root}: approved application icon, complete ${inventory.platform}/${inventory.arch} runtime, 292 approved PNGs, 43 catalogued BGM tracks, inventory and Chinese file guide.`);
}
