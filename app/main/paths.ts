import { existsSync, mkdirSync, accessSync, constants, realpathSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type DataPaths = { root: string; config: string; prompt: string; preferences: string; music: string; runtime: string; session: string; cache: string; logs: string; crashes: string; temp: string; files: string };
export function resolvePaths(options: { platform: NodeJS.Platform; packaged: boolean; executable: string; appPath: string; home?: string; qaRoot?: string; projectRoot?: string }): DataPaths {
  let root: string;
  if (options.qaRoot) root = path.resolve(options.qaRoot);
  else if (options.platform === 'win32' && options.packaged) root = path.join(path.dirname(options.executable), 'Data');
  else if (!options.packaged) {
    // package.json is the shared application's root; no retired Xcode dependency.
    let candidate = path.resolve(options.appPath);
    while (!existsSync(path.join(candidate, 'package.json')) && path.dirname(candidate) !== candidate) candidate = path.dirname(candidate);
    if (!existsSync(path.join(candidate, 'package.json'))) throw new Error('无法定位开发项目目录。');
    root = candidate;
  } else root = path.join(options.home ?? os.homedir(), 'Library', 'Application Support', 'ChihayaPet');
  // Packaged Mac builds keep the editable prompt bound to their source project.
  // QA always uses its temporary data directory; Windows data remains portable.
  const promptRoot = !options.qaRoot && options.platform === 'darwin' && options.packaged && options.projectRoot ? path.resolve(options.projectRoot) : root;
  const runtime = path.join(root, 'ElectronRuntime');
  return {
    root, config: path.join(root, 'config.json'), prompt: path.join(promptRoot, 'chihaya_prompt.md'), preferences: path.join(root, 'preferences.json'), music: path.join(root, 'Music'), runtime,
    session: path.join(runtime, 'Session'), cache: path.join(runtime, 'Cache'), logs: path.join(runtime, 'Logs'),
    crashes: path.join(runtime, 'Crashes'), temp: path.join(runtime, 'Temp'),
    files: options.platform === 'win32' && options.packaged ? path.join(path.dirname(options.executable), 'FILES.txt') : path.join(root, 'FILES.txt'),
  };
}
export function initializePaths(paths: DataPaths): void {
  try {
    for (const dir of [paths.root, paths.runtime, paths.session, paths.cache, paths.logs, paths.crashes, paths.temp]) mkdirSync(dir, { recursive: true });
    accessSync(paths.root, constants.W_OK);
    const probe = path.join(paths.temp, `.write-${process.pid}`);
    writeFileSync(probe, '', { flag: 'wx' }); unlinkSync(probe);
  } catch { throw new Error('数据目录不可写，请将整个应用文件夹移动到可写位置后再启动。不会改用其他数据目录。'); }
}
export function safeChild(root: string, relative: string): string {
  if (!relative || relative.includes('\\') || relative.includes('\0') || relative.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('资源路径无效。');
  const base = realpathSync(root);
  const target = realpathSync(path.join(base, relative));
  if (!target.startsWith(base + path.sep)) throw new Error('资源路径超出运行库。');
  return target;
}
