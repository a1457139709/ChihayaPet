# 实现说明

2026-09-13，已在静态首版基础上接入用户确认的七套动态立绘方案。运行条件：arm64、macOS 26.0+。无第三方运行时；Swift 5 语言模式使用显式 MainActor 隔离。

## 模块与数据流

- `AppDelegate` 组装依赖、设置 accessory 应用模式、菜单栏和文本编辑菜单；退出时释放窗口、动画及内存会话。XCTest 宿主启动跳过产品 UI 与用户设置访问。
- `Desktop` 负责非激活透明 NSPanel、拖动阈值、屏幕 UUID、恢复和夹紧。`PNGRenderer` 加载 `CharacterSprites` 运行清单，加载时按原始像素坐标将身体与每张去重脸部帧合成，随后只保留当前造型／取景的合成纹理；避免两张互补透明蒙版独立缩放产生细缝。下一变体完整解码并合成后，在禁用隐式动画的事务内切换。根视图透传鼠标命中；嵌套图层将底部中心的轻摆、点击与呼吸变换分开。
- `UI` 使用 SwiftUI 面板、气泡、设置，`MessageInput` 包装 NSTextView 并检查 marked text。`InteractionWindows` 管理布局、激活与原操作应用的焦点恢复。
- `ConversationHistory` 只保存完整成功轮次，按 Swift Character 分别裁剪界面和请求副本；本地问候、淘汰提示、失败或取消不加入模型上下文。
- `RequestCoordinator` 在 MainActor 上管理共享名额。请求 ID 与配置／会话／草稿代次必须全部匹配，旧完成或清理回调没有修改新请求的机会。取消先失效，再取消 Task。
- `AppStore` 管理编辑输入、待重试输入、会话、回复气泡和设置草稿；保存配置先失效，只有钥匙串成功后才更新已保存配置。
- `Services` 的 `ModelClient` 接收不可变 `RequestSnapshot` 和 `ChatMessage`，返回 `ModelReply` 或分类错误。URLSession 使用 ephemeral 配置、无缓存／cookie 存储、拒绝重定向，取消和 60 秒总超时由独立竞态门控制。
- `CredentialStore` 使用非同步、仅本机且解锁时可访问的 generic password 条目；`PreferencesStore` 只保存基础地址、模型、角色提示词。桌宠偏好采用独立前缀。

## 约束落实

输入上限 2,000 Character，回复上限 20,000；请求历史最多 10 轮／12,000 Character，界面历史最多 50 轮／100,000 Character。网络另外设置 2,000,000 字节响应体保护，避免不兼容服务无限返回内容；触及任一响应上限均拒绝整条回复。

默认图片高度 256 点，范围 240–480 点，布局四周各留 12 点。动画使用渲染层变换，不改变窗口保存的位置。穿透每次启动关闭；隐藏和面板收起不清空会话，也不自动取消已由用户发起的请求。

Bundle 打包 `CharacterSprites/manifest.json` 和 326 张运行 PNG，两张旧立绘（Asset Catalog）作为失败回退，并保留原始说明。`verify_resources.py --source-only` 是 Xcode 构建前置步骤；Release 脚本还验证最终包的哈希和白名单。预览目录不参与正常构建；`package_character_sprites.py --preview /absolute/reviewed-preview` 仅用于重新导入明确指定的已审核素材，导入时需要 Pillow。2026-09-30 已将旧预览移至项目外临时备份，该导入器不再默认读取临时 `output/` 路径。

2026-09-14，七套近景替换为补全头顶的运行副本：画布高度 606→670，原图在新图中偏移 `(0,64)`，脸部和嘴部的 Y 坐标增加 64。原始像素、全景和表情帧保持不变，渲染器继续按清单尺寸计算缩放与坐标。`OriginalCharacterSprites/` 保存修复前的近景和清单，不加入 Xcode 资源引用。运行清单中的 `provenance.hairRepair` 保存原图哈希、修复来源、原坐标及偏移；校验器检查备份和位移，`--preview` 对照修复前来源，`--repair` 可对照修复交付目录。旧预览导入器会拒绝覆盖已经修复的运行素材。

## 动画与对白联动

播放期间只切换已缓存合成纹理，不逐帧重绘整个人物。`CharacterAnimationTimeline` 用可测试的单调时间调度离散眼嘴状态，渲染器只安排最近一个一次性 Timer。调度代次隔离已取消事件；隐藏、休眠、关闭动效或减少动态效果时取消 Timer、清除 CA 动画并复位眼嘴，恢复时重新取眨眼间隔。身体呼吸 4 秒／0.3%，轻摆 ±0.25°；眨眼间隔 3–6 秒、阶段总计 220ms；嘴型间隔 90–160ms。

`DialoguePresentation.isPlaying/onPlaybackChanged` 与“全文读完”分开，立即通知页末、补全、停止及翻页状态；每页保留已读进度。`InteractionWindows` 按持有对象身份过滤回调，并聚合可见回复／闲话的播放状态。请求只在 `.chat` 时设为等待，使用 Combine sink 的新值避免 `@Published` 的 willSet 时序问题。固定表情仅覆盖表情层，不屏蔽嘴型。

每变体的清单包含源画布上嘴部点和该行头发左右边界。统一由左上像素坐标换算为渲染视图左下坐标，再加窗口原点得到屏幕坐标。切换、拖动、缩放会重排气泡；微小身体动画不会使气泡持续跳动。

## 工程维护

`ChihayaPet.xcodeproj` 是可直接打开的原生工程。`scripts/generate_project.py` 根据两个源码目录生成确定性的文件引用和共享 Scheme；新增文件后重新生成。`scripts/build.sh` 构建 Release 并复制到 `build/ChihayaPet.app`；`scripts/test.sh` 运行 XCTest。构建产物放在 `build/`，测试原生预览暂存 `/tmp/`；原始素材保持不变。

初始目录没有 Git 仓库，未创建远程、分支或提交。原始设计文件作为需求依据；实际验收状态以 `docs/VALIDATION.md` 为准。已做一次独立代码审查，设置导航问题的修复同时通过自动化与实机回归。
