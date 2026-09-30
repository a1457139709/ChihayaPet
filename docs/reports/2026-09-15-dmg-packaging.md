# DMG 打包验证（2026-09-15）

## 交付

- `./scripts/package.sh` 构建 Release 应用，生成 `build/ChihayaPet.dmg`。
- 镜像包含 `ChihayaPet.app` 和指向 `/Applications` 的快捷方式。
- 不包含任何 `config.json`（含示例同名文件）、根目录开发素材 `assets/`、本地曲库或原图备份。运行资源使用 `ChihayaPet/Resources/` 中的独立副本。
- 独立安装版使用 `~/Library/Application Support/ChihayaPet/` 保存配置和音乐；开发构建及带 `.chihaya-root` 的旧便携目录保留原路径规则。

## 实际验证

- 新路径测试在修改前失败：返回 `/Applications`、磁盘映像目录或应用所在目录；修改后 4 项存储测试通过。
- 完整 Xcode 测试：132 项通过，0 失败。因沙盒无法连接 `testmanagerd`，经用户授权在沙盒外运行。
- Release 构建、应用签名、14 套造型取景组合及 326 张运行 PNG 校验通过。
- DMG 创建、镜像校验、只读挂载后再次检查配置排除规则和资源白名单均通过，验证后已卸载镜像并清理临时目录。
- `bash -n scripts/build.sh scripts/package.sh` 和 `git diff --check` 通过。
- 日志：`build/dmg-storage-red.log`、`build/dmg-storage-green.log`、`build/dmg-tests.log`、`build/dmg-package.log`。

## 验证边界

- 目标保持 Apple Silicon、macOS 26.0+，使用 ad-hoc 签名，未进行 Developer ID 签名或 Apple 公证；未验证下载到其他 Mac 后的 Gatekeeper 放行。
- 未覆盖用户现有的 `/Applications` 安装；Finder 拖拽安装后的人工交互验收尚未执行。
- 构建仍有既存的 `NativeMusicAudio` / `AVAudioPlayerDelegate` Swift 6 隔离警告，当前工程使用 Swift 5 模式，构建与测试通过。
