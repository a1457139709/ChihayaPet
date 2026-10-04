import { readdirSync, lstatSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
export function fileList(root) {
  const files = [];
  const walk = dir => {
    for (const name of readdirSync(dir).sort()) {
      const target = path.join(dir, name), stat = lstatSync(target);
      if (stat.isDirectory()) walk(target); else files.push(path.relative(root, target).split(path.sep).join('/'));
    }
  };
  walk(root); return files.sort();
}
export function writeInventory(root, platform, resources) {
  const inventory = path.join(resources, 'PACKAGE-FILES.json');
  const guide = platform === 'darwin' ? path.join(resources, 'FILES.txt') : path.join(root, 'FILES.txt');
  writeFileSync(inventory, '{}'); writeFileSync(guide, '');
  if (platform === 'win32') writeFileSync(path.join(resources, 'FILES.txt'), '');
  const files = fileList(root);
  if (files.some(f => /(^|\/)(config\.json|Music|artwork|assets|work|Data|ElectronRuntime|\.env)(\/|$)/i.test(f))) throw new Error('Personal or development data in release.');
  writeFileSync(inventory, JSON.stringify({ version: 1, platform, arch: platform === 'darwin' ? 'arm64' : 'x64', files }, null, 2));
  const text = `妃宫千早桌宠 · ${platform === 'darwin' ? 'macOS 26+ / Apple Silicon arm64' : 'Windows 11 / x64'} · 发行文件说明\n\n完整程序${platform === 'darwin' ? '为 ChihayaPet.app，默认拖入 /Applications，也可选择其他位置。' : '为整个解压目录。双击 ChihayaPet.exe 即运行，不需要安装 Node/npm。'}\n\n以下清单从本次最终应用包自动生成。所有发行文件必须一起保留；app.asar 内含共享业务、UI 和预加载脚本。app.asar.unpacked 保存平台适配与音频解码器；RuntimeResources 保存 13 组造型、26 个取景、292 张已批准图片、清单及原素材说明。Electron Framework 或 DLL、pak、locales、V8 与 Chromium 资源由本版本运行时提供，不可单独删除。FILE(S) 与 PACKAGE-FILES.json 用于查看和验证该版本。\n\n程序文件（相对于${platform === 'darwin' ? '.app' : '解压目录'}；安装前随包提供）\n${files.map(f => '  ' + f).join('\n')}\n\n运行数据（不随安装包提供）\n${platform === 'darwin' ? '~/Library/Application Support/ChihayaPet/config.json：模型及所有按地址保存的密钥。\n~/Library/Preferences/local.ChihayaPet.plist：角色和应用偏好，由 CFPreferences 读写。\n~/Library/Application Support/ChihayaPet/Music/：原格式 UUID 音频及 library.json。\n~/Library/Application Support/ChihayaPet/ElectronRuntime/：Session、Cache、Logs、Crashes、Temp。\n~/Library/Application Support/ChihayaPet/FILES.txt：首次运行生成实际绝对路径。' : 'Data/config.json：模型及按服务地址保存的明文密钥。\nData/preferences.json：角色和应用偏好。\nData/Music/：UUID 音频副本及 library.json。\nData/ElectronRuntime/：Session、Cache、Logs、Crashes、Temp。\nFILES.txt：启动后补充实际程序与数据绝对路径。'}\n\n配置在用户保存时创建；音乐在首次导入时创建；运行目录在启动时创建。升级须保留配置、偏好和完整 Music/，不需要重新设置或重新导入。缓存、日志和临时文件可在退出应用后删除，会按需重新创建。聊天只在内存中，退出即清空。\n\n升级：先退出应用，${platform === 'darwin' ? '替换完整 .app，保留原用户数据与偏好。删除 .app 只删除程序；删除数据需要另行删除以上数据位置。' : '保留 Data/ 并替换全部发行文件。移动时搬移整个目录，包括 Data/。解压目录不可写时请搬移整个文件夹。删除整个解压目录会同时删除程序和数据；需要保留数据时先另存 Data/。系统自己产生的运行记录由 Windows 管理。'}\n\n文件说明为独立文件；应用界面不提供入口。Mac 静态说明保留在 .app 内；无需保留 DMG 安装卷。\n`;
  writeFileSync(guide, text);
  if (platform === 'win32') writeFileSync(path.join(resources, 'FILES.txt'), text);
}
