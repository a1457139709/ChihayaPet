# 应用验收记录

2026-10-03，Issue #62 的共享 Electron + TypeScript 实现。基线是实施开始时的 `b6a2f10f759de40665b7d7ab664c33a0004ea244`，正式资源仍为 13 组造型、26 个取景、292 张完整 RGBA PNG。旧 Swift/Xcode 应用主体退役，可选美术工具的历史原生渲染夹具按固定提交临时导出。

## 自动化与发行包

- TypeScript 类型检查和 Release 构建通过。
- Node 集成测试 14 项通过，覆盖原配置读取／损坏保护、多服务密钥、请求互斥与迟到结果、SSE 跨块 UTF-8／CRLF、JSON 回退／长度／总超时、独立历史限额、292 张资源批准／哈希／解码与加载失败、六种音乐格式、暂停恢复、便携目录移动、屏幕坐标和中文 IME。
- 原美术和数据迁移 Python 集成测试 15 项通过。偏好迁移测试使用独立 QA 域；需要正常的 macOS CFPreferences 访问权限。
- 源码资源与包资源均通过批准、SHA-256 和文件白名单校验；PNG、清单和原 Shift-JIS 素材说明未重绘、未重新批准或修改字节。
- macOS arm64 DMG 通过磁盘映像校验，`.app` 通过 deep／strict ad-hoc 签名校验。未使用 Developer ID 或公证。
- Windows x64 ZIP 解压文件包含完整 Electron 运行时、正式资源和 FFmpeg，7-Zip 完整性检查通过。实际最终文件与生成清单逐项一致，asar 标记为 unpacked 的文件均实际存在。
- 两端中文 FILES.txt 从最终发行文件生成，并通过清单检查；应用运行时另写实际数据路径。

检查入口：`./scripts/test.sh`、`npm run build`、`npm run package`、`npm run verify`。测试只使用隔离偏好、临时配置、虚构网络和静音音频，不读取个人密钥或曲库。

独立导出的提交文件不含 artwork／assets／work、本机 Music 或 config.json，完成全新 npm ci、Release 构建和 14 项共用 Node 测试。npm 11 的安装脚本策略只明确允许锁定版本的 Electron、esbuild 和 FFmpeg 安装器。

`npm audit` 当前报告 8 个 high 条目，均沿 electron-builder 的下载缓存开发依赖传播，生产依赖不受这些条目影响。根因 [http-cache-semantics 的公告](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) 尚无修复版本；没有执行破坏性的强制降级。这些构建依赖不进入发行 app.asar，构建只下载公开发行资源，Windows 解码器还核对固定 SHA-256。

## macOS 发行版运行检查

`scripts/check-runtime.mjs` 通过 Playwright 启动已签名 Release 二进制，使用独立临时数据和偏好。检查正式立绘实际渲染、人物不可获得焦点、alpha／穿透模式发出的系统命令、设置保存与编号切换、中文 composition Enter／Escape、Shift+Enter、多次面板销毁、闲话气泡收起、实际 FILES.txt 路径、运行目录、原索引六种格式的实际音频播放，以及模拟休眠后手动暂停保持。截图保存在 `build/QA/runtime/`。

alpha 检查直接注入转发的鼠标坐标并观察 setIgnoreMouseEvents；不把 CDP 注入当作真实桌面后方窗口点击的证明。Mac 窗口检查在实际显示后读取 NSWindow 原生 collectionBehavior，确认人物／闲话 CanJoinAllSpaces／FullScreenNone、聊天／设置 MoveToActiveSpace／FullScreenNone，重建聊天窗口后再次确认。设置的当前 Space 策略与聊天统一，原设置窗口未显式指定 MoveToActiveSpace。前台焦点恢复、真实桌面鼠标转发、实际跨 Spaces／全屏切换、真实睡眠及多屏热拔插还需人工实机观察。

代码审查发现并修复四项行为问题：穿透／草稿／在途请求期间抑制回复气泡，长回复跟随底部但保留用户回看位置，历史裁剪后继续逐字播放且保留流式前缀，以及换装／取景后将不支持的编号同时归零并保存。运行检查分别覆盖这些转换，并覆盖快响应合并 pending 状态后的逐字展示；共用音乐测试也确认打开已显示的面板不会重启播放。

## 原生与 Electron Release 对比

`scripts/build-native-baseline.py` 从上述固定提交构建原生 Release，加入独立数据／偏好和命令入口；合成回复与合成静音音频与 Electron 相同。`scripts/compare-release.mjs` 启动两个 Release，在相同 Mac、正式 PNG、人物高度 256 点和屏幕缩放下，测量启动、默认可见闲置、静止、拖动／编号切换、反复开关面板、流式回复、音乐、隐藏和模拟睡眠恢复，再观察 30 分钟静止驻留。

完整原始数据将保存在 `docs/release-comparison.json`。采样器要求主进程持续存在，应用提前退出或中断会标记失败，拒绝将空进程表的零值作为有效结果。

内存口径为进程树各进程 RSS 相加，共享页可能重复计算；不是物理内存总占用。CPU 是 ps 的瞬时百分比，多个进程求和，不是能耗。冷启动指本轮第一次启动，未清空操作系统磁盘缓存；Electron 使用调试传输控制，无 DevTools 窗口，传输本身仍可能带来开销。隐藏／睡眠场景通过系统事件模拟，不能证明真实机器睡眠行为。

GPU／系统能耗未测量：本机 powermetrics 明确要求 superuser，当前会话无管理员采样权限。未用 RSS 倍数推断功耗或耗电，未设未经用户确认的数值预算。

## Windows 验收边界

开发端完成共享逻辑、路径契约和最终 ZIP 结构校验。Windows 11 实机运行由用户完成；[自测清单](windows-acceptance.md) 没有填入任何未经运行的通过结果。真实系统输入、焦点、虚拟桌面、多屏缩放、音频、只读目录和整目录移动必须在用户机器上确认。
