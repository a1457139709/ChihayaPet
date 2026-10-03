# 实现说明

2026-10-03，应用使用 13 组立绘、26 个取景和 292 张已批准完整 PNG；旧分层动画、静态备用图片和 Windows 实现已移除。运行条件：arm64、macOS 26.0+。无第三方运行时；Swift 5 语言模式使用显式 MainActor 隔离。

## 模块与数据流

- `AppDelegate` 组装依赖、设置 accessory 应用模式、菜单栏和文本编辑菜单；退出时释放窗口、动画及内存会话。XCTest 宿主启动跳过产品 UI 与用户设置访问。
- `Desktop` 负责非激活透明 NSPanel、拖动阈值、屏幕 UUID、恢复和夹紧。`StandingCharacterLibrary` 校验清单、批准状态、PNG 哈希与尺寸，缓存当前取景；请求图片失败返回 `nil`。`PNGRenderer` 在禁用隐式动画的事务内显示或清空完整 PNG，加载失败时不会保留上一张图片。根视图透传鼠标命中；嵌套图层分开处理底部中心的轻摆、点击与呼吸变换。`CharacterAppearance` 保存旧偏好迁移仍使用的类型，不加载旧分层图片。
- `UI` 使用 SwiftUI 面板、气泡、设置，`MessageInput` 包装 NSTextView 并检查 marked text。`InteractionWindows` 管理布局、激活与原操作应用的焦点恢复。
- `ConversationHistory` 只保存完整成功轮次，按 Swift Character 分别裁剪界面和请求副本；本地问候、淘汰提示、失败或取消不加入模型上下文。
- `RequestCoordinator` 在 MainActor 上管理共享名额。请求 ID 与配置／会话／草稿代次必须全部匹配，旧完成或清理回调没有修改新请求的机会。取消先失效，再取消 Task。
- `AppStore` 管理编辑输入、待重试输入、会话、回复气泡和设置草稿；保存配置先失效，只有本地配置文件成功写入后才更新已保存配置。
- `Services` 的 `ModelClient` 接收不可变 `RequestSnapshot` 和 `ChatMessage`，返回 `ModelReply` 或分类错误。URLSession 使用 ephemeral 配置、无缓存／cookie 存储、拒绝重定向，取消和 60 秒总超时由独立竞态门控制。
- `FileCredentialStore` 将服务地址、模型及按地址隔离的密钥原子保存到本机 `config.json`，权限为 0600；`LocalPreferencesStore` 从该文件读取服务配置，角色提示词保存在 UserDefaults。桌宠和音乐偏好采用独立前缀。

## 约束落实

输入上限 2,000 Character，回复上限 20,000；请求历史最多 10 轮／12,000 Character，界面历史最多 50 轮／100,000 Character。网络另外设置 2,000,000 字节响应体保护，避免不兼容服务无限返回内容；触及任一响应上限均拒绝整条回复。

默认图片高度 256 点，范围 240–480 点，布局四周各留 12 点。动画使用渲染层变换，不改变窗口保存的位置。穿透每次启动关闭；隐藏和面板收起不清空会话，也不自动取消已由用户发起的请求。

Bundle 打包 `Characters/Standing/manifest.json`、292 张运行 PNG 和原始素材说明。`verify_resources.py --source-only` 是 Xcode 构建前置步骤；Release 脚本还验证最终包的哈希和白名单。制作图层、原件、审核页及旧分层库留在 `artwork/`。本机制作工具集中在 `artwork/tools/` 并由 Git 忽略；源码检出后的构建、测试和资源校验不依赖这些目录。

## 动画与对白联动

运行中按编号切换完整立绘，不生成额外眨眼、视线或嘴型帧。自动表情只采用清单中的明确编号映射，缺少映射时保持当前有效编号或初始 `00`。身体呼吸 4 秒／0.3%，轻摆 ±0.25°；隐藏、休眠、关闭动效或减少动态效果时清除 CA 动画。图片为空时停止身体动作。

`DialoguePresentation.isPlaying/onPlaybackChanged` 通知页末、补全、停止及翻页状态；每页保留已读进度。`InteractionWindows` 按持有对象身份过滤回调，并聚合可见回复／闲话的播放状态。请求只在 `.chat` 时设为等待，使用 Combine sink 的新值避免 `@Published` 的 willSet 时序问题。

独立扩展模型、脸层缓存和测试夹具继续用于开发验证。当前未安装 CharacterExpansion 运行包；若后续接入，运行图片必须自包含，不能引用开发档案中的旧分层图片。
每变体的清单包含源画布上嘴部点和该行头发左右边界。统一由左上像素坐标换算为渲染视图左下坐标，再加窗口原点得到屏幕坐标。切换、拖动、缩放会重排气泡；微小身体动画不会使气泡持续跳动。

## 工程维护

`ChihayaPet.xcodeproj` 是可直接打开的原生工程。`scripts/generate_project.py` 根据两个源码目录生成确定性的文件引用和共享 Scheme；新增文件后重新生成。`scripts/build.sh` 构建 Release 并复制到 `build/ChihayaPet.app`；`scripts/test.sh` 运行 XCTest。构建产物放在 `build/`，测试原生预览暂存 `/tmp/`；原始素材保持不变。

Git 只跟踪源码、测试、工程、构建工具、正式运行资源与程序文档。构建产物、个人配置、曲库、美术制作与工作记录保留在本机。实际验证状态见 `docs/VALIDATION.md`。
