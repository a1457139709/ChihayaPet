import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { DataPaths } from './paths';
export function runtimeGuide(paths: DataPaths, application: string, platform: NodeJS.Platform, inventoryFile: string, preferenceDomain = 'local.ChihayaPet'): void {
  let inventory = '随包 FILES.txt 列出该版本实际发行文件。';
  try { inventory = readFileSync(inventoryFile, 'utf8'); } catch {}
  const preferenceFile = platform === 'darwin' ? path.join(os.homedir(), 'Library/Preferences', preferenceDomain + '.plist') : paths.preferences;
  const text = `妃宫千早桌宠 · 安装后的文件说明\n\n实际程序位置：${application}\n实际数据目录：${paths.root}\n\n${inventory}\n\n本机实际路径（随运行创建）\n\n${paths.config}\n模型配置：baseURL、model、apiKeys。用户保存服务时创建；全部服务密钥为明文，Mac 权限 0600。升级必须保留。\n\n${paths.prompt}\n自定义角色设定。默认长版由源码 chihaya_prompt.md 在构建时完整嵌入。每次启动读取本文件；菜单保存或恢复默认写回此文件并立即生效。运行中直接编辑文件，在下次启动后加载。文件缺失时使用内置默认设定，保存时创建；升级须保留。\n\n${preferenceFile}\ndesktop.*、idle.*、music.* 偏好；用户修改时写入。Mac 通过 CFPreferences 实际读写原域，由 cfprefsd 管理文件。升级必须保留。\n\n${paths.music}\n原名音频文件，直接扫描目录并按文件名排序，无需索引。发行版首次启动导入随包的 43 首 BGM，保留同名及已移除曲目；.bundled-bgm-installed.json 记录已完成导入，须随曲库保留。不读取旧索引或执行迁移。移除后文件保留在 Music/已移除/，移回即可恢复。\n\n${paths.session}\nChromium 会话存储（含浏览器缓存、GPUCache 等），启动时创建；不存聊天。退出后可删除，将重新生成。\n${paths.cache}\n音频转换缓存，切歌后清理旧解码音轨。启动或播放时创建，可在退出后删除。\n${paths.logs}\n应用日志目录，启动时创建。\n${paths.crashes}\n崩溃数据目录，启动时创建；系统另行产生的运行记录由操作系统管理。\n${paths.temp}\n应用及子进程临时文件目录，启动时创建。\n\n聊天记录只存在内存中，退出即清空，不写聊天或密钥日志。\n\n升级：先退出千早桌宠。${platform === 'win32' ? '保留完整 Data/，替换发行文件。移动时搬移整个解压目录。不能只搬 EXE。' : '替换完整 .app；原数据与 macOS 偏好保持原位。可以安装在用户选择的位置。'}\n删除应用：${platform === 'win32' ? '退出后删除整个解压目录，同时删除其中 Data/。需保留数据时先另存 Data/。' : '删除整个 .app 不删除用户数据。若要清除数据，退出后另行删除上列数据目录和 local.ChihayaPet 偏好域。'}\n`;
  writeFileSync(paths.files, text, { mode: 0o600 });
}
