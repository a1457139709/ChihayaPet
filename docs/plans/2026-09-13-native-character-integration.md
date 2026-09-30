# 千早动态立绘原生接入

实施用户已确认的接入方案：七套造型、全景/近景、自动或四种固定表情；身体和脸部原生组合、呼吸/轻摆/眨眼/对白嘴型；透明窗口与现有聊天保持。

1. 素材和渲染：复制 326 张运行 PNG 与自包含清单，保存原始哈希及坐标，构建严格校验。只缓存当前造型/取景，预加载后原子切换；失败回退静态立绘。12 点动画留白，4 秒/0.3% 呼吸、±0.25° 轻摆、3–6 秒/220ms 眨眼、90–160ms 嘴型，隐藏/休眠/禁用动效/减少动态效果取消调度。
2. 窗口和菜单：独立保存造型、取景、表情；迁移旧冬夏服；默认全景/自动/256 点，高度 240–480。切换保持底部中心并夹紧屏幕。嘴部和头发边界源坐标用于闲话气泡。
3. 对白：明确播放状态通知，InteractionWindows 统一转发且按对象身份隔离。手动表情 > 可见逐字对白微笑 > 聊天等待认真 > 日常；连接测试不参与。翻页、停止、显示全文、关闭、替换、取消等即时闭嘴。
4. 验收：资源覆盖、原生动画与取消、迁移和几何、模拟聊天和闲话，全量 XCTest、Release 构建、签名、资源校验。原生渲染检查全部 14 变体 × 240/256/480 点及浅深背景和屏幕边缘。交付 build/ChihayaPet.app，更新 README 和 docs/VALIDATION.md。无语音同步/转头/独立头发物理。

实施接口：CharacterStyle（winterFront=a, summerFront=a_, winterSide=b, summerSide=b_, casual=c, pink=d, gym=e）、CharacterFraming（full, close）、CharacterExpression（neutral, serious, smile, surprised）、CharacterExpressionMode（automatic及上述四值），均 CaseIterable/String rawValue，title 属性。CharacterSpeechAttachment 含 mouth: CGPoint、hairLeft: CGFloat、hairRight: CGFloat，translated(by:)。

PNGRenderer: init(style:framing:imageHeight:animationsEnabled:expressionMode:)，后两参数 expressionMode 默认 automatic；setCharacter(style:framing:)，setExpressionMode，setActivity(waitingForReply:speaking:)，setReducedMotion，setHeight/setAnimationsEnabled/setPresented/setAwake/animateClick/shutdown，view/contentSize/imageFrame/speechAttachment（本地坐标）。保留旧 init(outfit:...) 和 setOutfit 兼容入口。测试可读取 expression/eye/mouth/isScheduling/usesFallback。

DesktopController: style/framing/expressionMode 和对应 setter，speechAttachment（屏幕坐标），effectiveAnimationsEnabled；setActivity(waitingForReply:speaking:) 转发；onAnimationPolicyChanged 回调供 InteractionWindows 立即处理动效政策变更。保留 outfit/setOutfit 迁移兼容。
