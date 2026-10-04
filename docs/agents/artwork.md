# 运行资源与本地美术档案

Git 仓库保留应用源码、工程、测试、构建工具、运行资源和程序文档。`artwork/`、`assets/`、`work/` 与制图报告是本机开发资料，由 `.gitignore` 排除。构建、测试和打包使用仓库内的运行资源；新检出仓库无需这些本机目录。

## 运行资源

| 入口 | 用途 |
| --- | --- |
| [Characters/Standing](../../ChihayaPet/Resources/Characters/Standing/) | 13 组造型、26 个取景、292 张完整 RGBA PNG。 |
| [manifest.json](../../ChihayaPet/Resources/Characters/Standing/manifest.json) | 记录编号、画布、嘴部与发丝锚点、批准状态和 PNG SHA-256。 |
| [原始素材说明](../../ChihayaPet/Resources/fansitekit-notice-original.txt) | 保留原始 Shift-JIS 编码与字节，随应用打包。 |

运行库仅保存清单和正式 PNG。共享 Electron 应用从这里读取，发行包复制到 `resources/RuntimeResources/`（Mac 为 `.app/Contents/Resources/RuntimeResources/`）。加载指定图片失败时返回空帧，清空画面并停止动效。旧分层 Animation、Assets.xcassets 和独立 Windows 实现已移除。

资源变更后执行：

```sh
python3 scripts/verify_resources.py --source-only --require-approved-standing
./scripts/test.sh
./scripts/build.sh
```

[运行资源校验器](../../scripts/standing_character_resources.py)只读取运行库；[构建校验入口](../../scripts/verify_resources.py)检查清单、图片、原始说明和应用包白名单。可选 CharacterExpansion 包也必须自包含；原件核验通过验证器的 `--project-root` 显式执行。

## 本机开发资料

以下链接用于已有美术工作区，在新检出的 Git 仓库中可缺省：

- [美术档案入口](../../artwork/README.md)：来源、参考、制作、审核与历史。
- [完整制作导航](../../artwork/docs/resource-guide.md)：服装版本、来源记录与逐图交接。
- [制图工具](../../artwork/tools/)：生产、审核、路径解析和历史核验脚本；不参与程序构建。

需要改图时，从本地制作版本生成候选结果，完成审核后将批准的完整 PNG 和更新后的清单放入运行库。提交前确认运行库白名单通过，制作图层、母图、审核副本和报告仍留在本地目录。

`output/` 是旧验收输出，已删除。开发版使用项目根目录 `Music/` 保存导入曲库，安装版使用 `~/Library/Application Support/ChihayaPet/Music/`；曲库是用户数据，由 Git 忽略。

本机游戏 BGM 的名称以远程 `bgm` 分支为准。[曲目来源清单](../../scripts/bgm-catalog.json)记录 43 个 WAV 文件名和 Git 内容哈希；两个 OGG 不在清单内，`20.wav`、`21.wav` 沿用来源名称。

所有版本直接扫描 `Music/` 顶层音频并按文件名排序，无索引，不保留旧 UUID 曲库迁移或修复脚本。移除曲目保留在 `已移除/` 子目录。
