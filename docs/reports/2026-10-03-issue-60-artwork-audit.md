# #60 当前角色素材、历史档案与应用交接

截至 2026-10-03（Asia/Shanghai），8129 当前显示 **13 组、26 个取景、292 张编号表情**，当前 SHA-256 对应的明确批准为 **292/292，待审 0 张**。另外 **12 张去脸母图、2 张完整叠手动作参考图**均有各自批准，合计 306 个审核对象；不把母图或动作参考计入编号表情。

本票整理并交接当前制作档案，修正展示、生产副本与 issue 的旧状态。没有制作或修改图片，没有新增人工批准。#31 的应用加载、选择、工程打包和实际运行验收按原阶段证据记录，不把本次目录核对当成重新运行全部验收。

## 可复核清单

| 文件 | 内容 |
| --- | --- |
| [current-inventory.json](issue-60/current-inventory.json) | 26 个取景的版本、游戏来源、身体层、实际绑定参数、全部图层与证据哈希；逐项保存 292 张表情及独立的 14 张美术对象。 |
| [current-inventory.csv](issue-60/current-inventory.csv) | 306 行，逐项对应生产 PNG、展示 PNG、正式运行 PNG、尺寸、SHA-256、批准时间及应用阶段。 |
| [history-index.json](issue-60/history-index.json) | 156 个生产／审核记录目录、隐藏版本、旧选择快照、取消喝茶的依据及批准历史。 |
| [art-files.csv](issue-60/art-files.csv) | 12118 个美术档案文件、2597713303 字节；每个文件含 SHA-256、用途、主题、当前版本关联和本地 Git 状态。 |
| [workspace-changes.csv](issue-60/workspace-changes.csv) | 开始整理时全部 15,440 个变更文件的真实 Git 状态、工作文件哈希、暂存 blob、主题和归档建议。 |
| [workspace-snapshot.json](issue-60/workspace-snapshot.json) | 开始整理的分支、HEAD、上游及 14 个主题的数量／大小／状态。 |
| [submission-plan.json](issue-60/submission-plan.json) | 本票的精确提交范围，以及各主题尚未提交的逐文件候选清单与保留在本机的证据。 |
| [stage-evidence.json](issue-60/stage-evidence.json) | 制作、技术核查、人工审核、资源归档、工程打包、应用加载与实际运行验收的独立记录。 |
| [issues-snapshot.json](issue-60/issues-snapshot.json) | 整理前 GitHub 工单正文及评论快照；其中旧的当前状态属于该快照，更新后的状态以在线工单为准。 |
| [verification.json](issue-60/verification.json) | 本次文件、哈希、展示范围、正式资源和既有暂存内容的核对结果。 |

## 当前 26 个取景

以下每行表情均已批准；侧身仅 00–06，其余为 00–11。路径相对仓库根目录。每张输出的完整 64 位 SHA-256 见逐图 CSV；绑定参数、脸层、眉线、遮罩及技术／目视记录的实际路径见 JSON。

| Group / View | Mother production version | Expression production version | Binding | Approved |
| --- | --- | --- | --- | --- |
| 冬服正面 / full | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/a/full` | native-original | 12/12 |
| 冬服正面 / close | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/a/close` | native-original | 12/12 |
| 夏服正面 / full | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/a_/full` | native-original | 12/12 |
| 夏服正面 / close | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/a_/close` | native-original | 12/12 |
| 冬服侧身 / full | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/b/full` | native-original | 7/7 |
| 冬服侧身 / close | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/b/close` | native-original | 7/7 |
| 夏服侧身 / full | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/b_/full` | native-original | 7/7 |
| 夏服侧身 / close | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/b_/close` | native-original | 7/7 |
| 米色便服 / full | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/c/full` | native-original | 12/12 |
| 米色便服 / close | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/c/close` | native-original | 12/12 |
| 粉色裙装 / full | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/d/full` | native-original | 12/12 |
| 粉色裙装 / close | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/d/close` | native-original | 12/12 |
| 体操服 / full | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/e/full` | native-original | 12/12 |
| 体操服 / close | `ArtSources/CharacterExpansion/original-standing/v2` | `ArtSources/CharacterExpansion/original-standing/v2/variants/e/close` | native-original | 12/12 |
| 蓝白玫瑰礼装 / full | `ArtSources/CharacterExpansion/rose-game-style/full/v1` | `ArtSources/CharacterExpansion/rose-game-style/full/v1` | native-original | 12/12 |
| 蓝白玫瑰礼装 / close | `ArtSources/CharacterExpansion/rose-game-style/close/v1` | `ArtSources/CharacterExpansion/rose-game-style/close/v1` | native-original | 12/12 |
| 日式动漫女仆服 / full | `ArtSources/CharacterExpansion/red-skirt-game-style/full/v1` | `ArtSources/CharacterExpansion/red-skirt-game-style/full/v1` | native-original | 12/12 |
| 日式动漫女仆服 / close | `ArtSources/CharacterExpansion/red-skirt-game-style/close/v1` | `ArtSources/CharacterExpansion/red-skirt-game-style/close/v1` | native-original | 12/12 |
| 体检服-里 / full | `ArtSources/CharacterExpansion/long-shirt-pose-experiment/v4/full/v3` | `ArtSources/CharacterExpansion/long-shirt-pose-experiment/v4/full/v3` | native-original | 12/12 |
| 体检服 / full | `ArtSources/CharacterExpansion/long-shirt-pose-expressions/v1/full-expressions-v4` | `ArtSources/CharacterExpansion/long-shirt-pose-expressions/v1/full-expressions-v4` | derived-game-features | 12/12 |
| 体检服 / close | `ArtSources/CharacterExpansion/exam-v1-rebuild/close/v1` | `ArtSources/CharacterExpansion/exam-v1-rebuild/close/v1` | native-original | 12/12 |
| 体检服-里 / close | `ArtSources/CharacterExpansion/long-shirt-pose-experiment/v4/close/v13` | `ArtSources/CharacterExpansion/long-shirt-pose-expressions/v4/close/v7` | native-original | 12/12 |
| 女仆装-工 / full | `ArtSources/CharacterExpansion/maid-service-expressions/full/v1` | `ArtSources/CharacterExpansion/maid-service-expressions/full/v1` | derived-game-features | 12/12 |
| 女仆装-工 / close | `ArtSources/CharacterExpansion/maid-service-expressions/close/v2` | `ArtSources/CharacterExpansion/maid-service-expressions/close/v2` | derived-game-features | 12/12 |
| 蓝白礼装·叠手 / full | `ArtSources/CharacterExpansion/rose-princess-actions/v3/full` | `ArtSources/CharacterExpansion/rose-princess-actions/v3/full` | native-original | 12/12 |
| 蓝白礼装·叠手 / close | `ArtSources/CharacterExpansion/rose-princess-actions/v2/close-expressions/v1` | `ArtSources/CharacterExpansion/rose-princess-actions/v2/close-expressions/v1` | native-original | 12/12 |

完整游戏原脸使用每个取景自己的尺寸与坐标。派生五官适配只涉及体检服全景及女仆装-工的两个取景，保存它们各自的矩阵、平移、支持范围和图层；没有把所有姿态统一套成 c/full 或 c/close 的两层参数。正式运行消费已经批准的完整合成 PNG，运行时不依赖这些制作图层。

## 审核差异与本机反馈

“23 张全部通过”的原话、范围、时间与逐张 SHA-256 来自 [#31 明确批准账本](2026-10-03-issue-31-human-review.json)。其范围仅为礼装近景 01–11 与体检服-里 v13 母图对应的 expressions-v7 近景 00–11；其余 269 张仍使用原批准。

本次发现展示页与运行资源已登记上述批准，而生产目录 `rose-game-style/close/v1/expressions-review.json` 和 `long-shirt-pose-expressions/v4/close/v7/review.json` 仍分别写着 11 张、12 张待审。已核对实际生产／展示／运行 PNG 哈希相同，并同步生产审核、表情清单及相应展示副本。v13 中同哈希的默认 00 绑定记录也以这次已有反馈同步。更新前的记录逐字节保存在 `original-standing/history/approval-records/`；没有修改旧版本的图片或给其他版本转移批准。

#38 正文原有“尚无母图”的状态，以及 #54／#55 原有“重新开放、近景未完成”的状态，均已用当前版本、实际批准及 #31 交付补充更新；旧正文折叠保留。v13 母图原先的“ok”仅覆盖母图及红框衔接，12 张表情使用后来的明确批准，范围分别记录。

[本机导出记录](issue-60/browser-local-review.json)由可访问的 Codex In-app Browser 在 8129 页面点击“导出逐图审核记录”后读取，新增反馈为 0 张。该检查只覆盖此浏览器的同源存储；未连接的其他浏览器存储不可访问，没有把空导出扩大解释为所有浏览器均无反馈。浏览器核对见 [browser-inspection.json](issue-60/browser-inspection.json)。

## 当前、隐藏与取消历史

当前展示范围取自 `v2/review.html` 的 visibleOutfits 及实际嵌入目录，不能由总目录中的 7 套新增服装直接推断。页面 306 个卡片均有批准；正式编号表情的应用收据只对当前 292 个匹配哈希成立。母图和动作参考分别显示为美术对象。

`review-selection.json` 原为 2026-10-02 的 19 取景／213 图快照，现已同步到当前 26 取景／306 图，旧文件逐字节保存在 `history/review-selection-2026-10-02.json`。较早 README 的来源与原话分别保存在 `history/README-2026-10-01.md`、`history/v2-README-2026-10-01.md`。

普通宽松长衬衫 `showcase/loose-long-shirt/full/v1` 与 `close/v1` 共 24 张编号表情目前隐藏，保留 24/24 的原批准，另有各自母图；不计入当前 26 个取景。原版 v1、体检服远近景旧版、体检服-里 close/v1–v12 与 expressions-v1–v6、退回的 skill 分支、女仆装-工近景修复前版、礼装叠手的早期适配版均保留。具体文件和 SHA-256 在 art-files.csv，制作／审核记录按目录在 history-index.json，work 中的定位与复验文件在 workspace-changes.csv。

喝茶动作已由用户“是取消喝茶的动作就可以了，但是朝向服装保留”取消。#1–#21 与 #27 共 22 个相关工单按原状态和评论索引；部分母图在取消前已有批准，其历史批准继续保留。取消不等于剩余图制作完成，也不把已有喝茶图纳入当前站姿或运行资源。

## 分阶段交接

| 阶段 | 当前结论与依据 |
| --- | --- |
| 制作 | 当前 292 张编号合成、12 母图、2 动作参考均在磁盘；保存来源、独立图层、版本制作记录和复现脚本。完整索引不等于所有本地源文件都已 Git 提交。 |
| 技术核查 | 本次读取当前 PNG、检查 PNG 编码／画布与所有来源、展示、运行文件哈希；逐像素和接缝证据复用相同图像哈希的版本记录及 #31 的 292 张像素报告。 |
| 人工审核 | 当前表情 292/292、母图 12/12、动作参考 2/2，绑定各自实际 PNG；不把技术通过或旧母图接受作为新表情批准。 |
| 原版基础归档 | OriginalStandingSprites 保存 14 个取景、148 张表情及身体／脸层，共 310 张 PNG、50,325,247 字节；仍按真实本地暂存状态保留。 |
| 正式运行归档 | StandingCharacterSprites 的 292 张 PNG、87,124,123 字节及运行清单已在 #31 提交 `20ba84a` 推送。清单 SHA-256 为 `035a0e557645117daafd88235cc1fcda8326eba0681694b8f26607c182a949da`；不含母图、历史、QA 或生成中间文件。 |
| 工程打包 | #31 的 188 项测试、0 失败、3 项按需跳过、Release、资源白名单、签名与 DMG 校验记录保留。本次核对 12 项交付产物／日志哈希全部一致，包括应用可执行文件与 DMG，没有声称重新执行旧测试。 |
| 应用加载 | #31 记录 13 组全景／近景选择、有效编号、回退、偏好恢复及独立 bundle 加载。本次资源校验仍通过。 |
| 实际运行 | #31 原生渲染 1000 张截图、26 组观察、正式包操作及项目外启动有独立证据。PR #61 已合并；本票没有重新授予运行接受或删减验收目标。 |

## 本地归档与提交清单

art-files.csv 的 Git 状态是索引生成时、本票独立提交前的快照；其中本票交付的元数据随后按 scoped-paths.json 单独提交。#31 的 PR #61 已于 2026-10-03 14:38:10（Asia/Shanghai）合并，合并提交为 `c9217dc86f81da70f17de7ea34d65eca2347371e`，详见 [integration-pr.json](issue-60/integration-pr.json)。#60 的独立分支以该 main 提交为基准，其他美术资料继续按逐文件清单保留待提交状态。

开始整理时 HEAD 为 `20ba84add07db9efd4492e1eab3bd96706ae2833`，分支 `codex/issue-31-all-outfits` 与上游相同，ahead/behind 为 0/0。已有变更 15,440 文件、3,340,984,572 字节，其中已暂存 1,411、未跟踪 14,028、仅工作文件修改 1；19 个文件同时有暂存与工作文件差异。这里记录的是整理前快照，不混写本票新增文件与最终提交状态。

| Topic | Files | Bytes | Staged | Untracked |
| --- | ---: | ---: | ---: | ---: |
| application-31 | 914 | 231319913 | 0 | 914 |
| cancelled-tea | 164 | 36724965 | 164 | 0 |
| exam | 2556 | 476347127 | 0 | 2556 |
| exam-inner | 4726 | 963260351 | 0 | 4726 |
| hidden-shirt | 834 | 194482980 | 0 | 834 |
| maid | 879 | 219397846 | 0 | 879 |
| maid-service | 2121 | 443731045 | 0 | 2121 |
| original-gallery | 824 | 157756335 | 818 | 6 |
| original-project-archive | 317 | 51161990 | 317 | 0 |
| other-art-evidence | 25 | 2791489 | 2 | 23 |
| plans-reports | 26 | 289890 | 8 | 18 |
| rose | 860 | 257631616 | 99 | 761 |
| rose-hands | 1183 | 305985376 | 0 | 1183 |
| tooling-domain | 11 | 103649 | 3 | 7 |

本票单独提交审计清单、状态同步脚本、页面／选择／审核元数据和更新前的元数据历史副本。精确范围见 scoped-paths.json。范围内的既有元数据用于记录本次核对的最终当前目录；原暂存及工作文件哈希保留在快照和历史副本。范围外的既有暂存 blob、PNG、生产素材、复现脚本和 work 证据均保持原样，不批量加入本票提交。

其余文件的归档候选按 submission-plan.json 的 14 个主题展开：先审原版基础资源，再审各当前服装的生产来源／图层／复现／批准，历史与取消动作另成提交，工具／领域文档与计划／报告分别审阅；work 内重复检查板及临时页面继续保留本机。每项候选可由 workspace-changes.csv 的主题、用途、SHA-256 与 indexBlob 复核。列表中的未提交／未推送文件没有被宣称已发布。

## 本次验证与复核方式

本次 6 项审核页范围测试全部通过：检查现行服装及远近景保留、292 个应用收据成立、母图／动作参考不取得表情应用状态、修改 PNG 哈希后旧收据不再成立。正式资源的 26 取景／292 张批准 PNG 与应用 bundle 的白名单及 SHA-256 通过核对。

在本机完整美术工作区复核：

```sh
python3 scripts/audit_artwork_archive.py
node --test scripts/test_standing_review_scope.cjs
python3 scripts/verify_resources.py --require-approved-standing
```

审计校验需要清单指向的本地美术／历史工作文件；这些文件的待提交状态已单独记录。应用构建与运行只使用已提交的正式运行资源。

当前元数据同步使用 `scripts/sync_artwork_review_status.py`，先校验 #31 资源及来源／绑定，再按已有 23 张哈希批准同步生产副本，保留旧记录。重新建立快照使用 `scripts/audit_artwork_archive.py --build`，需要 work/issue-60/before 的开始快照；不能对改变过的 PNG 复用旧批准。早期 build_standing_showcase.py 只覆盖早期目录，不能用它直接覆盖现行六套新增服装总清单。
