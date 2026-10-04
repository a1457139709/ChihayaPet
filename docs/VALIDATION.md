# 应用验收记录

2026-10-04，记录 Issue #62 的共享 Electron + TypeScript 实现及验证结果。基线是实施开始时的 `b6a2f10f759de40665b7d7ab664c33a0004ea244`，最终应用提交为 `95c7b0b21f0a791c0a6e3019b53a694f77a27688`。正式资源仍为 13 组造型、26 个取景、292 张完整 RGBA PNG。旧 Swift/Xcode 应用主体退役，可选美术工具的历史原生渲染夹具按固定提交临时导出。性能评测已按用户要求停止，不作为本次交付内容。

## 自动化与发行包

- TypeScript 类型检查和 Release 构建通过。
- Node 集成测试 15 项通过，覆盖原配置读取／损坏保护、多服务密钥、缺少配置时保留草稿并定位其首个未完成字段、请求互斥与迟到结果、SSE 跨块 UTF-8／CRLF、JSON 回退／长度／总超时、独立历史限额、292 张资源批准／哈希／解码与加载失败、六种音乐格式、暂停恢复、便携目录移动、屏幕坐标和中文 IME。
- 原美术和数据迁移 Python 集成测试 15 项通过。偏好迁移测试使用独立 QA 域；需要正常的 macOS CFPreferences 访问权限。
- 源码资源与包资源均通过批准、SHA-256 和文件白名单校验；PNG、清单和原 Shift-JIS 素材说明未重绘、未重新批准或修改字节。
- macOS arm64 DMG 通过磁盘映像校验，`.app` 通过 deep／strict ad-hoc 签名校验。未使用 Developer ID 或公证。
- Windows x64 ZIP 解压文件包含完整 Electron 运行时、正式资源和 FFmpeg，7-Zip 完整性检查通过。实际最终文件与生成清单逐项一致，asar 标记为 unpacked 的文件均实际存在。
- 两端中文 FILES.txt 从最终发行文件生成，并通过清单检查；应用运行时另写实际数据路径。

检查入口：`./scripts/test.sh`、`npm run build`、`npm run package`、`npm run verify`。测试只使用隔离偏好、临时配置、虚构网络和静音音频，不读取个人密钥或曲库。

独立导出的提交文件不含 artwork／assets／work、本机 Music 或 config.json，完成全新 npm ci；最终应用提交在该独立依赖目录完成 Release 构建和 15 项共用 Node 测试。npm 11 的安装脚本策略只明确允许锁定版本的 Electron、esbuild 和 FFmpeg 安装器。

`npm audit` 当前报告 8 个 high 条目，均沿 electron-builder 的下载缓存开发依赖传播，生产依赖不受这些条目影响。根因 [http-cache-semantics 的公告](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) 尚无修复版本；没有执行破坏性的强制降级。这些构建依赖不进入发行 app.asar，构建只下载公开发行资源，Windows 解码器还核对固定 SHA-256。

## macOS 发行版运行检查

`scripts/check-runtime.mjs` 通过 Playwright 启动源码和最终已签名 Release 二进制，使用独立临时数据和偏好。立绘就绪检查核对快照尺寸并读取 canvas 的非透明像素，确认正式立绘已实际绘制。还检查人物不可获得焦点、alpha／穿透模式发出的系统命令、缺少配置时已有及新建设置面板的服务页／字段焦点／草稿保留、设置保存与编号切换、中文 composition Enter／Escape、Shift+Enter、多次面板收起与复用、闲话气泡收起、实际 FILES.txt 路径、运行目录、原索引六种格式的实际音频播放，以及模拟休眠后手动暂停保持。截图保存在 `build/QA/runtime/`。

alpha 检查直接注入转发的鼠标坐标并观察 setIgnoreMouseEvents；不把 CDP 注入当作真实桌面后方窗口点击的证明。Mac 窗口检查读取 NSWindow 原生 collectionBehavior，确认人物／闲话 CanJoinAllSpaces／FullScreenNone、聊天／设置 MoveToActiveSpace／FullScreenNone，重建聊天窗口、修改动效／取景、重复相同置顶值与切换置顶后再次确认。相同置顶调用会重设 Chromium 的 collectionBehavior 而不发出 always-on-top-changed，现只在置顶操作时调用并显式恢复原生策略。设置的当前 Space 策略与聊天统一，原设置窗口未显式指定 MoveToActiveSpace。前台焦点恢复、真实桌面鼠标转发、实际跨 Spaces／全屏切换、真实睡眠及多屏热拔插还需人工实机观察。

代码审查及最终跟进修复六项行为问题：穿透／草稿／在途请求期间抑制回复气泡，长回复跟随底部但保留用户回看位置，历史裁剪后继续逐字播放且保留流式前缀，换装／取景后将不支持的编号同时归零并保存，Mac Spaces／全屏原生策略，以及缺少配置时路由到服务页并按当前草稿定位字段。运行检查分别覆盖这些转换，并覆盖快响应合并 pending 状态后的逐字展示；共用音乐测试也确认打开已显示的面板不会重启播放。Standards 与 Spec 两条独立审查及修复后跟进均无剩余发现（各 0 项），Fowler 基线无可执行维护性发现。

## Windows 验收边界

开发端完成共享逻辑、路径契约和最终 ZIP 结构校验。Windows 11 实机运行由用户完成；[自测清单](windows-acceptance.md) 没有填入任何未经运行的通过结果。真实系统输入、焦点、虚拟桌面、多屏缩放、音频、只读目录和整目录移动必须在用户机器上确认。

## Issue #63 验证与交接

2026-10-04，按 #65 resolution 恢复旧 UI 后，`./scripts/test.sh` 的 28 项 Node 逻辑测试与 15 项 Python 测试全部通过，TypeScript 类型检查和 `npm run build` 通过。构建校验 13 组造型、26 个取景、292 张已批准 RGBA PNG 的白名单和 SHA-256，并编译 macOS 原生菜单／窗口适配器。测试覆盖约定的聊天发送、气泡摘录／布局、偏好／IPC 和音乐状态边界；窗口与音频回归使用外部 API 模拟，不启动 UI。

Standards 与 Spec 独立源码审查及修复后复核均无剩余发现。已修复立绘控件同步、Windows 菜单焦点／键盘导航、气泡悬停与键盘保持，以及淡出旧曲的迟到事件错误归属。

后续用户反馈原生菜单无法操作。无窗口菜单事件复现捕获 `TypeError: Cannot convert undefined or null to object`：`napi_make_callback` 的接收对象使用了 undefined，菜单项与滑条事件在进入 JS 前失败。改为全局对象后原复现通过。新增 `npm run test:menu` 使用隔离临时应用、独立 QA 偏好域和静音曲目，经真实 AppKit target/action 进入生产应用，再检查公开快照和 renderer 控件。聊天／设置／音乐页、服装／取景／表情、大小预设与连续滑条、开关／闲话／频率、播放／前后曲、隐藏／显示及正常退出均通过。测试专用事件驱动仅存在于夹具 addon，发行适配器不导出这些方法。

#63 未运行 `test:runtime` 或任何截图／视觉 UI 测试；前文运行记录属于 #62。菜单功能回归会启动应用并检查功能状态，视觉、辅助技术和实际声音验收仍由用户按 [交接矩阵](issue-63-acceptance.md)记录。
