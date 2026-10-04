# 分支与发行流程

长期保留 `main`、`dev` 和 `bgm`。开发工作先进入 `dev`，完成发行验收后再合入 `main`，从 main 的确切提交创建版本标签和 GitHub Release。

## 分支职责

| 分支 | 职责 |
| --- | --- |
| `main` | 稳定发行主线；不直接接收未验收功能。当前保留既有公开主线，分支整理本身不表示发布了新版。 |
| `dev` | Electron 共用实现的集成分支，允许尚未达到发行标准的工作。 |
| `bgm` | 独立音乐来源。保持独立历史，不整体合并到 main 或 dev，发行时按 scripts/bgm-catalog.json 固定的 43 首 WAV 打包，不读取开发者 Music/。 |
| `codex/<topic>` | 从 dev 建立的短期工作分支，通过 PR 合回 dev 后删除。 |

暂不设长期 `release` 分支。`release/` 目录是构建产物目录，不是 Git 分支。若以后需要同时维护多个已发布版本，再按实际维护需求引入版本维护分支。

## 合并与发行

1. 从最新 dev 建立短期分支；提交范围内的改动，通过 PR 合回 dev。既有个人配置、曲库及未完成改动不自动纳入提交。
2. 在准备发行的干净检出中，运行 `npm ci`、`npm test`、`npm run build`；构建只依赖已跟踪资源。再执行 `npm run test:runtime`，macOS 执行 `npm run test:menu`，记录测试平台与结果。
3. 执行 `npm run package`、`npm run verify`，确认目标平台产物确实生成，并完成 macOS 安装运行与 Windows 解压运行验收。仅源码检查通过或没有产物时 verify 返回成功，都不能作为发行包验收证据。
4. 为 dev → main 创建发行 PR，列明变化、测试证据和已知限制；先处理冲突并重新验证。main 只接收通过验收的提交，不因分支清理而提前升级。
5. 合并后在 main 对应提交标记 `vX.Y.Z`，版本与 package.json 一致；发布从该提交构建并验证的安装包。main 的修复应及时合回 dev。

以上为仓库工作约定；本次未配置 GitHub 分支保护或自动发布工作流。

## 2026 年 10 月 4 日整理记录

公开历史以 `376aab1` 为独立根提交；旧本地 main 与它没有共同祖先，不使用允许无共同祖先的合并来拼接两套代码。

- `codex/issue-62-electron` 已改名为 dev；包含运行资源整理、Electron 共用实现、原生交互修复和角色提示词整理。
- `codex/issue-31-all-outfits`、`codex/issue-60-artwork-audit`、`codex/public-main` 已被公开 main 包含；`codex/artwork-layout` 已被 dev 包含，其分支引用已清理。
- 三个 `research/art-*-20260930` 分支的原始报告通过保留历史的合并进入 dev，见[研究目录](research/README.md)。
- 旧实现以以下本地标签归档，替代长期分支。标签未推送到公开远程；新克隆不包含这些本地归档。归档保留完整提交历史，不代表功能已移植。

| 原分支 | 本地归档标签 | 提交 |
| --- | --- | --- |
| 旧 main | `archive/legacy-main-2026-10-04` | `1e1d42e` |
| `codex/windows-port` | `archive/windows-port-2026-10-04` | `8376206` |
| `codex/separate-development-and-release` | `archive/swift-development-release-2026-10-04` | `db4df5d` |

可用 `git show <标签>:<路径>` 查看旧文件；需要继续旧实现时用 `git branch codex/<新主题> <标签>` 恢复工作分支，不覆盖 main 或 dev。

## 旧 Swift 功能迁移清单

核对基线为 Electron 的 `d77f691` 与旧 Swift 的 `db4df5d`。本次只归档和记录差异，不新增以下功能；当前工作区尚未提交的提示词、表情及 BGM 改动也不视为已发布能力。

| 旧分支工作 | 当前对应情况与后续处理 |
| --- | --- |
| 开发与安装数据目录隔离、资源工具拆分 | Electron 已有平台路径与打包实现；沿用新实现，继续通过平台测试核对。 |
| 三小时自动换装，手动切换重置，睡眠暂停 | 当前共用实现未找到对应的定时调度；若继续需要，从旧 `OutfitSchedule.swift` 及测试提取行为要求后重写。 |
| 八项提供商预设、每提供商模型列表、刷新 /models | 当前是基础地址、手动模型和按地址保存密钥；提供商档案及模型发现仍属迁移候选。 |
| persona.md 的迁移、外部修改冲突保护、刷新草稿 | 当前提示词相关工作仍在变化；迁移时核对文件路径、草稿、保存失败及外部修改语义，不直接复制旧 Swift 实现。 |
| 旧配置格式与旧项目数据迁移保护 | 当前 ConfigStore 检查 baseURL、model、apiKeys；旧格式兼容与路径迁移需要专项核对，归档不等于兼容完成。 |
| 随包附带原曲并首次导入 | 按 #72 的发行要求，从独立 bgm 分支的固定清单打包 43 首 WAV；两平台首次启动导入用户曲库，保留已有文件与移除记录。 |

旧 Windows 分支的独立应用已由共用 Electron 结构取代；仅在需要追溯平台行为与历史验收时查阅归档，不整体合并旧目录。
