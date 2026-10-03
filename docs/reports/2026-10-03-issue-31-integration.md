# #31 全部服装接入与交付

当前 8129 审核页的 13 组服装／朝向／姿态、26 个取景和 292 张编号表情已接入桌宠。正式资源保存在 `ChihayaPet/Resources/StandingCharacterSprites/`：292 张原样复制的 RGBA PNG，共 87,124,123 字节，另有独立运行清单。原版 148 张与新增 144 张均已批准；没有改变原图像素或借用其他服装的表情。

用户在本次会话明确回复“23 张全部通过”，覆盖蓝白玫瑰礼装近景 01–11，以及体检服-里 v13 母图对应的 v7 表情 00–11。`2026-10-03-issue-31-human-review.json` 保留问题、原话、时间、范围及 23 个当前 SHA-256；仅对哈希匹配的当前 PNG 登记批准。其他 269 张保留原批准。运行清单、素材交接和当前展示页已经同步到 292 张批准、0 张待审。

| 运行交付阶段 | 结果与证据 |
| --- | --- |
| 素材来源与归档 | `issue-31-resource-handoff.json` 保存 26 个取景的当前源版本、绑定方法、原图／图层路径、变换和哈希；实际运行只需要新资源目录中的完整合成 PNG。母图、隐藏历史和独立动作图分别保留在美术档案，不计入 292 张。 |
| 独立像素核查 | `issue-31-pixel-verification.json`：292 张源／交付字节一致，RGBA 尺寸和透明边缘通过；每组表情在原生或登记的仿射脸区以外的固定身体像素差异为 0。 |
| 加载、选择与回退 | 新的编号 PNG 契约与旧情绪／眼睛／口型契约独立。支持 13 个显示名及来源 ID、全景／近景、全部有效编号和自动模式；侧身只有 00–06，其余 00–11。保存选择、迁移旧服装偏好、校验无效编号并回退到 00。 |
| 自动模式 | 当前没有明确的编号映射，保留本取景有效表情，初始使用 00；没有合成眨眼、口型、视线或旧 AI 表情。原有身体呼吸和点击显示动效继续可用。 |
| 资源回退 | 优先本取景已批准 00，其次同服装全景 00、冬服正面全景 00，最后原游戏静态图。待审、损坏、缺失、不支持的清单、非法路径和旧偏好均有针对性测试。 |
| 几何与气泡 | 直接采用 606／670 高度和现行坐标。派生姿态的嘴部定位来自各自登记变换，发丝边界独立读取当前 00 PNG 嘴部行的 alpha 轮廓，避免沿用其他服装的发丝位置。26 个取景的 AppKit 独立解码校验全部通过。 |
| 原生渲染验收 | `StandingCharacterVisualAcceptanceTests` 实际运行 PNGRenderer 的 AppKit／CALayer 树，并渲染真实 SwiftUI 气泡。Retina 2 倍下输出 688 张角色图与 312 张气泡场景，覆盖 240／256／480 点、浅深背景及左右屏幕边缘。26 组全部表情板与 26 组尺寸／气泡板均实际查看。 |
| 正式应用操作 | 在 Release 包实际逐项选择全部 13 组的全景与近景；核对新批准的近景 11、側身 11→00、仅 7 个侧身编号、派生姿态 240／480 点和重启恢复。操作后恢复冬服正面、近景、256 点和自动模式。 |
| 项目外运行 | 将完整 Release 应用复制到 `/private/tmp/chihaya-issue31.oTiL3W/ChihayaPet.app` 后启动，核对进程路径、显示及偏好恢复。运行资源从 bundle 读取，不依赖 8129、ArtSources 或 assets 工作区路径。 |
| 构建与安装包 | 全套 188 项测试，3 项按需截图测试跳过、0 失败；本票原生截图测试另行执行成功。Release 构建、源／bundle 精确白名单和哈希、严格代码签名、DMG 校验及挂载资源检查全部通过。两个旧扩展截图测试属于原有按需流程，本票没有恢复已取消动作包。 |

完整验收记录见 `issue-31-visual-inspection.json`；可查看的验收图和索引保存在 `issue-31-visual-acceptance/`。原始 1000 张截图在 `work/issue-31/native-qa-final/`，其逐张来源哈希、截图哈希、尺寸和背景已永久登记在 `issue-31-visual-acceptance/native-report.json`。已观察过的 584 张 256 点角色图与最终重跑文件逐字节相同，批准更新及气泡锚点修订没有改变角色图像。

最终运行清单 SHA-256：`035a0e557645117daafd88235cc1fcda8326eba0681694b8f26607c182a949da`。本地安装包为 `build/ChihayaPet.dmg`，106,509,360 字节，SHA-256 为 `a4e4dd5d160579267979a775f601ab17378b8178f60660604cea2e90e67afe23`。完整产物、日志哈希与 xcresult 路径见 `issue-31-delivery.json`。QA 网页、截图、历史修复和生成中间文件均未进入运行资源目录或应用 bundle。

构建与资源校验只读取已归档运行资源，可直接执行 `./scripts/build.sh`、`./scripts/package.sh` 和 `python3 scripts/verify_resources.py --require-approved-standing`。需要重新从美术工作区归档时执行 `python3 scripts/standing_character_build.py --archive`；它核对当前页面目录、源 PNG 哈希及当前批准账本，不能对修改后的图片转移批准。当前美术生产工作区与隐藏历史的完整整理继续由 #60 跟踪，本票的独立提交仅交付应用代码、正式运行 PNG 和对应验收证据。

重跑原生验收时设置 `CHIHAYA_STANDING_QA_OUTPUT` 与 `TEST_RUNNER_CHIHAYA_STANDING_QA_OUTPUT` 指向输出目录，使用项目的 Xcode 执行 `-only-testing:ChihayaPetTests/StandingCharacterVisualAcceptanceTests`。独立像素检查与验收板生成分别由 `scripts/verify_standing_pixels.py`、`scripts/build_standing_review_boards.py` 提供；这两个离线 QA 工具需要 Pillow／numpy，不是运行或打包依赖。
