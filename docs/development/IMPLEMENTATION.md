# 实现说明

2026-10-03，Issue #62 将应用迁移到共用 Electron + TypeScript。支持 macOS 26+ arm64 与 Windows 11 x64，正式资源不变。活动应用只有 `app/`；平台差异集中在 `app/platform/`。

## 模块

- `main/companion.ts` 持有内存会话、设置草稿、请求名额和请求身份。取消先移除当前身份，再终止 AbortController；所有增量、完成和清理回调检查对象身份。服务、会话和连接测试草稿失效会取消相关请求。只有成功完整轮次加入历史。
- `main/network.ts` 在主进程执行 HTTPS Chat Completions，拒绝重定向；SSE 按行处理跨块 UTF-8、CRLF 和多行 data，兼容 JSON 回复。总超时独立竞争网络操作，响应体最多 2,000,000 字节，回复最多 20,000 字素。密钥只在主进程和设置草稿窗口出现，不传给人物、气泡或聊天。
- `main/storage.ts` 保留 config.json 三字段和全部服务密钥，使用同目录 0600 临时文件、fsync 与 rename 原子保存。读取不改文件；损坏文件禁止保存覆盖。地址保留显式端口和版本路径，只去除尾部斜线，不添加 v1。
- `main/paths.ts` 在启动时定位开发、Mac 安装数据或 Windows EXE 同级 Data。`index.ts` 在 ready／会话前设置 appData、userData、sessionData、temp、crashDumps、logs 及子进程临时目录。
- `platform/MacBridge.swift` 是 CFPreferences、前台焦点、显示器 UUID 和减少动态效果的独立适配器。偏好读写原 local.ChihayaPet 域，首次运行不写入迁移副本。Windows 通过 JSON 保存偏好，PowerShell/User32 适配前台窗口恢复。焦点恢复由系统决定，失效目标跳过。
- `platform/MacWindow.mm` 是进程内 Node-API 小适配器，仅操作主进程取得的 NSView／NSWindow。人物和闲话设置 CanJoinAllSpaces／FullScreenNone，聊天设置 MoveToActiveSpace／FullScreenNone；设置面板也采用聊天的当前 Space 规则（原设置窗口没有显式 MoveToActiveSpace）。ElectronNSPanel 自己强制添加 FullScreenAuxiliary，因此调用公开 NSWindow setter 实现原生排除全屏的规则；显示后恢复策略，不轮询，不向 renderer 暴露原生句柄。Windows 包排除该模块。依据：[Electron 原生句柄](https://www.electronjs.org/docs/latest/api/browser-window#wingetnativewindowhandle)、[Electron 44.5.1 面板实现](https://github.com/electron/electron/blob/v44.5.1/shell/browser/ui/cocoa/electron_ns_panel.mm)。
- `main/desktop.ts` 持有人物、按需聊天／设置／气泡窗口、尺寸与多屏布局、显示隐藏、闲话与气泡生命周期。人物与气泡不可获得焦点，聊天和设置可正常输入。关闭面板销毁 renderer，业务状态保留。Mac 人物／气泡／聊天的普通 Spaces／全屏规则与 native 基线一致；Windows 虚拟桌面使用系统默认窗口规则。
- `main/resources.ts` 验证清单、审批、路径、哈希、完整 RGBA 解码和尺寸。每次切换只持有当前 PNG；renderer canvas 和 alpha 命中数据也只有当前帧。透明命中使用当前 CSS 变换的逆矩阵，鼠标移动事件决定整个窗口是否透传；穿透模式通过菜单恢复。
- `main/music.ts` 保留原音乐 UUID 和索引格式。FFmpeg 对所有既有格式执行实际解码，WAV 输出只在运行缓存，切歌释放旧缓存。播放意图与 hidden／sleep 原因分开；手动暂停和隐藏期间切歌不会在恢复时自行播放。异步解码和 renderer 音频事件携带版本，迟到结果不接管新曲目。
- `renderer/` 共用浅色“紫苑夜奏”主题，字体回退、矢量花饰、中文编辑器、逐字回复和摘录气泡。人物使用 CSS 呼吸、轻摆与点击变换，无永久 JS 动画循环。音频只在人物 renderer 中，后台节流保留默认值。输入在 composition／229 键码期间拒绝发送和关闭。
- `preload.ts` 只暴露结构化快照和操作。渲染器禁用 Node，开启隔离与 sandbox，阻止导航／新窗口及权限请求，CSP 限制加载。主进程按来源窗口验证操作。自定义本地协议只服务当前已验证图片和当前音频，支持 Range。

## 工具与产物

`build-electron.mjs` 类型检查后打包 main、preload、renderer，编译 Mac 小适配器并复制 FFmpeg。`package-electron.mjs` 从相同 dist 生成 Mac arm64 与 Windows x64。Windows 解码器固定 b6.1.1 并检查发行方 SHA-256。Mac 包写入实际文件清单和中文说明后再次签署外层应用，校验整包签名，再生成带安装标记的 DMG；Windows ZIP 包含完整运行时。`verify-package.mjs` 校验实际发行清单、asar／unpacked 完整性、正式资源与中文说明，拒绝个人和美术开发资料。

`scripts/native-resources/` 只保留可选扩展包验证器需要的资源类型，不是应用。`character_expansion_native_qa.py` 从 b6a2f10 固定提交导出历史 AppKit/XCTest 渲染夹具到 build/，继续支持制作工具验收。`build-native-baseline.py` 同样导出独立 Release 比较夹具，增加临时偏好、数据和命令入口，不使用个人数据。共用应用构建不依赖历史 Xcode 工程。

运行证据及未知项见 [VALIDATION.md](../VALIDATION.md)。
