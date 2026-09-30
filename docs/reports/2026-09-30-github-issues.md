# 2026-09-30 公共仓库与喝茶任务初始化

这是 GitHub 初始化后的状态快照；后续任务状态以 GitHub 和逐取景美术进度数据为准。

公共原创仓库：[a1457139709/ChihayaPet](https://github.com/a1457139709/ChihayaPet)，默认分支 `main`。公开历史从当前工作区的初始快照开始，保留原有本地历史分支。本地发布分支 `codex/public-main` 跟踪 `origin/main`。

总任务：[[总任务] 各服装喝茶姿势：原尺寸母图与人工审核 #1](https://github.com/a1457139709/ChihayaPet/issues/1)。20 个子 issue 已使用 GitHub 原生父子关系关联；8 个已完成并通过人工审核的母图子任务以 `completed` 关闭，12 个保持开放，总任务保持开放。

## 服装与取景

| 服装／朝向 | 全景子 issue | 近景子 issue |
| --- | --- | --- |
| 01 冬服正面 | [#2](https://github.com/a1457139709/ChihayaPet/issues/2) · 已关闭 | [#3](https://github.com/a1457139709/ChihayaPet/issues/3) · 已关闭 |
| 02 夏服正面 | [#4](https://github.com/a1457139709/ChihayaPet/issues/4) · 已关闭 | [#5](https://github.com/a1457139709/ChihayaPet/issues/5) · 已关闭 |
| 03 冬服侧身 | [#6](https://github.com/a1457139709/ChihayaPet/issues/6) · 已关闭 | [#7](https://github.com/a1457139709/ChihayaPet/issues/7) · 已关闭 |
| 04 夏服侧身 | [#8](https://github.com/a1457139709/ChihayaPet/issues/8) · 已关闭 | [#9](https://github.com/a1457139709/ChihayaPet/issues/9) · 已关闭 |
| 05 米色便服 | [#10](https://github.com/a1457139709/ChihayaPet/issues/10) · 开放 | [#11](https://github.com/a1457139709/ChihayaPet/issues/11) · 开放 |
| 06 粉色裙装 | [#12](https://github.com/a1457139709/ChihayaPet/issues/12) · 开放 | [#13](https://github.com/a1457139709/ChihayaPet/issues/13) · 开放 |
| 07 体操服 | [#14](https://github.com/a1457139709/ChihayaPet/issues/14) · 开放 | [#15](https://github.com/a1457139709/ChihayaPet/issues/15) · 开放 |
| 08 蓝白玫瑰礼装 | [#16](https://github.com/a1457139709/ChihayaPet/issues/16) · 开放 | [#17](https://github.com/a1457139709/ChihayaPet/issues/17) · 开放 |
| 09 白衬衫红裙 | [#18](https://github.com/a1457139709/ChihayaPet/issues/18) · 开放 | [#19](https://github.com/a1457139709/ChihayaPet/issues/19) · 开放 |
| 10 宽松长衬衫 | [#20](https://github.com/a1457139709/ChihayaPet/issues/20) · 开放 | [#21](https://github.com/a1457139709/ChihayaPet/issues/21) · 开放 |

## 关闭依据与后续事项

关闭范围为独立喝茶母图的制作与人工审核。每个关闭评论都记录母图路径、尺寸、SHA-256、生产证据和已登记的用户批准原话；已核对 HTML 内的逐取景状态、进度 JSON 及本地图片哈希。

- [当前制作计划](../plans/2026-09-30-native-tea-and-original-faces.md)
- [HTML 图片清单](chihaya-character-progress.html)
- [逐取景进度数据](../../ArtSources/CharacterExpansion/native-tea/progress.json)

正式原脸合成已覆盖 6 个取景。夏服正面全景和冬服侧身近景尚未登记正式合成 PNG；冬服侧身近景的原脸适配人工审核仍标记为 `pending-user-review`；夏服侧身近景的批准范围为母图，原脸适配标记为 `pixel-checked`。这些后续状态保留在总任务中。新的喝茶图片尚未接入原生应用。

08–10 三套新服装的头部／原脸绑定尚未验证，全景 268×606、近景 454×606 为暂定基准。

## 工程技能配置

用户已确认 GitHub Issues、五个默认 triage 标签，以及 `AGENTS.md` 入口；域文档采用单一上下文。

- [AGENTS.md](../../AGENTS.md)
- [Issue tracker](../agents/issue-tracker.md)
- [Triage labels](../agents/triage-labels.md)
- [Domain docs](../agents/domain.md)

`to-tickets`、`triage`、`to-spec` 等工程技能读取上述配置，域术语与决策读取规则供 `domain-modeling` 等技能使用。以后可直接修改 `docs/agents/*.md`。

## 初始化检查

- GitHub 回读确认：20 个原生 sub-issues，8 个 `closed/completed`，12 个 `open`，父 issue 为 `open`；五个默认标签均存在。
- 源资源校验通过：14 个运行变体、504 个眼嘴组合和 326 张运行 PNG。
- HTML 重新生成并核对：10 组服装、235 个图片引用；原图与证据文件全部纳入上传。
- 实际服务配置、密钥、本地音乐、依赖与构建产物保持在 Git 忽略范围；当前配置密钥及常见凭据前缀检查无命中。
