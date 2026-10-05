# 妃宫千早桌宠

一套 Electron + TypeScript 应用，支持 macOS 26+ / Apple Silicon arm64 和 Windows 11 / x64。透明立绘、菜单栏／托盘、聊天、设置、音乐和主动闲话共用实现。迁移基线与完成条件为 [Issue #62](https://github.com/a1457139709/ChihayaPet/issues/62)，运行证据见 [验收记录](docs/VALIDATION.md)。

## 使用

人物平时不抢键盘焦点。点击打开聊天，拖动超过 4 点只移动人物。菜单栏／托盘可换装、切换全景／近景、选择编号表情、调整 240–480 点大小、置顶、穿透、动效、隐藏／恢复，以及控制闲话和音乐。穿透每次启动关闭，仍可从菜单恢复交互。

聊天 Enter 发送、Shift+Enter 换行；中文候选确认不发送或关闭。关闭聊天和设置会释放对应窗口，人物与音乐继续驻留；会话、请求和音乐状态独立于面板生命周期。打开聊天或设置时记住之前的前台应用，所有面板收起后尝试恢复其焦点。

模型设置接受 HTTPS 基础地址、模型名称和 API Key，保留服务的版本路径，只追加 `/chat/completions`。按规范化地址分别保存密钥。测试连接只用当前草稿，不保存；可能产生一次请求费用。聊天支持 SSE 文本流和完整 JSON，聊天与测试共用一个请求名额，取消或配置／会话／测试草稿失效后拒绝迟到结果。60 秒总超时，不跟随重定向，不自动重试。

聊天只保存在内存。输入最多 2,000 个 Unicode 字素，回复最多 20,000 个；模型上下文最多 10 个完整轮次／12,000 字素，界面最多 50 轮／100,000 字素。取消或失败的片段标为未完成，不进入后续上下文，可手动重试。每次启动从五句问候中选择一句。清空会话、保存服务或角色提示词会使在途请求失效并清空会话。

角色默认设定唯一来源是根目录 `chihaya_prompt.md`，构建时完整嵌入各平台应用。自定义角色设定使用各版本数据目录的 `persona.md`；菜单保存或恢复默认写回该文件并立即生效，重启读取外部编辑。不读取旧角色偏好或旧提示词文件，不绑定开发机路径。源 Markdown 不会被应用改写。

最新回复逐字显示；聊天收起后出现最多 60 字／四行的摘录气泡，“查看全文”打开原回复。点击气泡文字补全，全文展示完约 12 秒收起；悬停保留，离开重新计时。主动闲话默认每 3–7 分钟一句，可选 1–3 或 10–15 分钟；最近 8 句不重复。聊天、设置、草稿、请求、已有气泡、隐藏、穿透和睡眠时避让，恢复后重新计时，不补发积压台词。

macOS 和 Windows 发行包都附带 bgm 分支清单中的 43 首原名 WAV。首次启动将随包音乐导入实际 Music/；同名用户文件及已移除曲目保持不变。Music/.bundled-bgm-installed.json 是一次性导入标记，升级时应与曲库一同保留，避免重新加入已移除的曲目。

背景音乐支持 WAV、AIFF/AIF、MP3、M4A/AAC。直接扫描 `Music/` 顶层音频，以原文件名显示并排序，不使用索引。不读取旧索引或迁移 UUID 曲库。播放前用随包 FFmpeg 在运行缓存中转成 WAV，再交给人物窗口的音频元素；音乐不依赖聊天或设置窗口。支持播放／暂停、上一首／下一首、音量、单曲／列表循环、启动播放、淡入淡出。隐藏与睡眠自动暂停，恢复尊重手动暂停。导入保留原名，同名加数字后缀；移除曲目会移至 `Music/已移除/`，移回即可恢复。外部增删或改名后重启应用刷新曲库。

## 安装和数据

macOS 产物为 `release/ChihayaPet-macOS-arm64.dmg`，将完整 `ChihayaPet.app` 拖入 Applications 或用户选择的位置。采用个人使用的 ad-hoc 签名，未做 Developer ID 公证。首次运行原位读取：

- `~/Library/Application Support/ChihayaPet/config.json`，保留 `baseURL`、`model`、所有按地址保存的 `apiKeys`。
- 同一数据目录的 `persona.md` 保存自定义角色设定；缺省使用随包内置的长版设定。
- UserDefaults 域 `local.ChihayaPet` 中的 `desktop.*`、`idle.*`、`music.*`；通过 CFPreferences 实际读写。
- 同一数据目录的 `Music/` 原名音频；按文件名排序。
- 新运行文件集中在 `ElectronRuntime/Session`、`Cache`、`Logs`、`Crashes`、`Temp`。

启动直接使用当前数据格式，不执行旧版迁移。损坏配置报错并保护原文件。API Key 为本机明文，Mac 配置文件权限 0600；不写聊天或密钥日志。已安装的 Mac 应用约 3 秒后尝试推出带本项目安装标记的 DMG，不强制推出占用的卷。

Windows 产物为 `release/ChihayaPet-Windows-x64.zip`。完整解压后运行 `ChihayaPet.exe`，无需另装 Node/npm；EXE、运行库、locales 和 resources 必须一起保留。配置在 `Data/config.json`，角色提示词在 `Data/persona.md`，偏好在 `Data/preferences.json`，音乐在 `Data/Music/`，浏览器、缓存、日志、崩溃及临时文件在 `Data/ElectronRuntime/`。路径在 Electron 会话初始化前设置，目录不可写时提示移动整个文件夹。移动整个解压目录后数据继续可用。Windows 系统自己的运行记录由操作系统管理。

文件说明以独立文件交付。Mac 静态中文 `FILES.txt` 留在 `.app/Contents/Resources/`，首次运行在数据目录生成实际路径说明；Windows 静态说明在解压目录，启动后补充绝对路径。发行文件清单从最终应用自动生成。说明包括用途、创建时机、升级需保留的内容，以及删除程序与删除数据的方法。

## 开发、验证与打包

开发需要 Node.js 24+ 和 npm；Mac 平台适配器编译需要 Xcode 26+，以及 Node 安装前缀下的 `include/node/node_api.h` 开发头文件（官方 Node 安装与 Homebrew Node 均包含）。Electron、TypeScript、构建工具及解码器版本记录在 `package-lock.json`。发行包包含运行时，用户不需要开发工具。

```sh
npm ci
npm run dev
npm run typecheck
./scripts/test.sh
npm run test:prompt
npm run test:runtime
git fetch origin bgm
npm run package
npm run verify
```

`npm run build` 编译共用代码并验证正式资源；`npm run dev` 编译后启动。开发配置和 `Music/` 使用 `package.json` 所在项目目录，不依赖终端工作目录或旧 Xcode 工程。`scripts/build.sh`、`test.sh`、`package.sh` 是同一工作流的 shell 入口。Mac 上 `npm run package` 生成两端产物；可用 `node scripts/package-electron.mjs mac` 或 `win` 单独打包已编译代码，DMG 必须在 Mac 构建。打包从 scripts/bgm-catalog.json 固定的 Git 内容哈希提取 BGM 并逐首校验，不复制开发目录 Music/；浅克隆或单分支克隆需先执行 git fetch origin bgm。43 首原始音频约 1.24 GB，安装包和首次导入后的用户曲库各保留一份。

测试使用临时文件、独立偏好域、模拟网络和静音音频，不访问个人服务或曲库。实机检查和资源统计的口径见 [验收记录](docs/VALIDATION.md)，Windows 操作步骤见 [自测清单](docs/windows-acceptance.md)。

## 正式资源和本机档案

`ChihayaPet/Resources/Characters/Standing` 保留 13 组造型、26 个取景、292 张批准完整 RGBA PNG 及原清单，字节、哈希、审批和编号契约保持不变。图片按需校验与解码；只保留当前 renderer 图片，不预加载全部造型。缺失、损坏或未批准的指定图片返回空画面并停止动作；菜单和聊天仍可使用。

自动编号只使用清单中明确映射，否则保持当前有效编号或 `00`；不生成眨眼或口型帧。身体呼吸 4 秒／0.3%，轻摆 ±0.25°，点击缩放反馈；隐藏、睡眠、动效关闭和减少动态效果时停止。气泡按每取景的嘴部与发丝锚点定位，拖动、缩放、换装同步更新。Mac 人物与闲话跟随普通 Spaces，避开全屏空间；聊天、设置在当前空间打开。Windows 跟随当前虚拟桌面，相关实机行为按清单验收。

素材说明保留原始 Shift-JIS 字节与版权文字。原说明限制个人使用；未做公开分发授权。资源规范见 [资源导航](docs/agents/artwork.md)。`artwork/`、`assets/`、`work/`、个人配置、音乐和构建输出由 Git 忽略，检出构建不依赖本机美术档案。素材生成／校验工具保留；历史 AppKit 渲染验收按固定提交导出临时夹具，独立于当前应用构建。旧 Swift/Xcode 应用主体和旧 Windows 应用不再作为活动实现维护。

## 免责声明与侵权反馈

本项目是使用《少女爱上姐姐2》（乙女はお姉さまに恋してる 2人のエルダー）人物制作的非官方同人桌宠，与原制作公司不存在隶属、合作或官方背书关系。

项目涉及的角色、立绘、图标及背景音乐等第三方内容，其权利归キャラメルBOX / Caramel Box及相关权利人所有，不属于本项目 MIT 许可证的授权范围。本项目未获得上述素材的官方授权，相关内容仅用于交流学习和个人测试；此用途说明不构成使用或再分发授权，请遵守原权利人的使用限制。

如版权方或相关权利人认为本项目中的内容侵犯了您的合法权益，请通过 [GitHub Issues](https://github.com/a1457139709/ChihayaPet/issues) 联系开发者并说明涉及的内容，我们将在收到通知后及时核查，并移除相关内容。

## 开源协议

本项目原创代码及开发者有权授权的文档采用 [MIT 许可证](LICENSE)。软件按现状提供，不作任何担保；具体许可条件及责任限制以 LICENSE 为准。

MIT 许可证不涵盖角色、立绘、图标、背景音乐等第三方内容，也不授予原作相关权利。第三方资源及依赖仍遵循各自的许可与权利声明；原始素材说明保留于 [fansitekit-notice-original.txt](ChihayaPet/Resources/fansitekit-notice-original.txt)。
