# 喝茶立绘：独立质量基准与单张验证门槛

日期：2026-09-30，Asia/Shanghai。研究票：[调研美术验收：怎样发现缺发、涂层错误与合成偏移](https://github.com/a1457139709/ChihayaPet/issues/25)。本报告只提出下一轮验证计划；未制作图片、执行试制、安装软件或修改生产数据。用户零美术基础，由 agent 制作和整理证据，用户审核成图。

本机素材链接需在 `/Users/red/Project/ChihayaPet` 工作区打开；研究分支只发布报告，不包含尚未提交的粉色图片与制作脚本。运行代码的一手依据取自研究基线 `376aab144bcf712c97cb4b2937de791883b7350a`。

建议保留软件原生工程作为可编辑主稿，交付确定性导出的 PNG 与清单；验收分别回答“源像素是否守住”和“画面是否正确”。软件品牌及像素检查通过都不能替代后者。

## 已证实的缺口

粉色近景用发束行坐标、银色阈值和前景多边形选取原发，再回填生成局部，见[制作脚本](/Users/red/Project/ChihayaPet/ArtSources/CharacterExpansion/native-tea/d/close/v1/assemble.cjs:71)。检查器仅对同一脚本产出的头发 mask 核对相等，见[验证器](/Users/red/Project/ChihayaPet/ArtSources/CharacterExpansion/native-tea/d/close/v1/verify.cjs:20)：漏选整段头发、误保留旧袖口也可能零差异。这是自证覆盖缺口。

已查看[粉色近景母图／原脸对照](/Users/red/Project/ChihayaPet/ArtSources/CharacterExpansion/native-tea/d/close/v1/qa-native-layers-light-dark.png)和[细节](/Users/red/Project/ChihayaPet/ArtSources/CharacterExpansion/native-tea/d/close/v1/qa-torso-detail-dark.png)：颈根发束截边与头发／袖口碎边在母图已存在，具体漏选或遮挡误判仍待局部归因。原件 [chi_d@.png](/Users/red/Project/ChihayaPet/assets/chihaya_character/chi_d@.png)本身裁切头顶。当前仓库有身体与表情两层；身体内的头发、旧手臂仍为扁平像素。原游戏是否提供更细图层未证实。

## 工程与交换格式边界

| 格式 | mask／混合／位置能保存什么 | 交付边界 |
| --- | --- | --- |
| XCF | 独立层 mask、混合与合成空间、signed x/y `PROP_OFFSETS` | GIMP 原生；官方声明不以跨软件交换为目标。[XCF 规范](https://developer.gimp.org/core/standards/xcf/) |
| KRA | 保存透明／变换 mask、blend ID、层及 mask 的 x/y | Krita 原生；源码明确分别写入。[KRA 保存代码](https://raw.githubusercontent.com/KDE/krita/master/plugins/impex/libkra/kis_kra_savexml_visitor.cpp) |
| PSD | 层矩形位置、blend key、用户 mask 数据 | Adobe 规范有明确记录；第三方兼容按功能核对，Krita 文档明确不保存 transform masks。[Adobe 规范](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/)、[Krita 边界](https://docs.krita.org/en/user_manual/working_with_images.html) |
| ORA | 层 PNG、顺序、整数 x/y、opacity、基础 composite-op／组隔离 | 基线无通用可编辑 mask 节点；Krita 导出保存 layer projection、按 exactBounds 裁切并写 x/y，复杂结果可能烘焙或使用扩展，不能承诺蒙版完整往返。[基线规范](https://www.openraster.org/baseline/layer-stack-spec.html)、[导出源码](https://raw.githubusercontent.com/KDE/krita/master/plugins/impex/ora/kis_open_raster_stack_save_visitor.cpp) |

主稿选所用软件的原生格式。导出清单记录软件版本、画布／取景、原件哈希、层角色、整数位置、顺序／组隔离、mask、混合空间、色彩配置和输出哈希。优先导出统一画布 Normal 层；若裁切，必须登记 x/y。重开原生工程验证蒙版仍可编辑；交换格式另作一次回读对照。

## 透明边缘与独立基准

PNG 存储 straight alpha，alpha 不作 gamma 变换；合成需将颜色乘 alpha 后计算贡献，输出 PNG 再转换回 straight 表示。[PNG 规范](https://www.w3.org/TR/png-3/#6AlphaRepresentation)、[W3C source-over](https://www.w3.org/TR/compositing-1/#simplealphacompositing)。原件完全透明像素下 RGB 也属于现有 RGBA 零差异承诺：保留源 PNG，软件导出若改变这些数值，由确定性步骤从原件回填**事先冻结的保护区**，再逐通道核对；不能静默放宽为只比较可见像素。

运行缓冲另验：mac 已用 `premultipliedLast` 在原尺寸预合成，见[实际代码](/Users/red/Project/ChihayaPet/ChihayaPet/Desktop/CharacterSprites.swift:119)。它与 straight PNG 不能直接裸 RGBA 等值；在明确色彩配置与 alpha 表示下比较显示结果，并登记量化误差。GIMP 可分别设置混合与合成空间，故“都是 sRGB”仍不足以保证相同输出。[GIMP 设置](https://www.gimp.org/man/gimprc.html)、[Apple alpha 定义](https://developer.apple.com/documentation/coregraphics/cgimagealphainfo)。这些是待验证风险，尚未证明当前缺发由 alpha 引起。

生产前由 agent 从未改原件另行描记基准，不读取制作 mask：每束可见头发的根、走向、末端，原轮廓与半透明边缘，旧手遮住而需补画的未知段；登记允许被新手／杯碟遮住的区域及谁在前。保留原像素区、补画区、合法遮挡区分开标注。发束通路、多阈值 alpha 差图自动找疑点；关键交界输出逐层显隐图与贡献色图，让用户直接判断发束是否接续、遮挡是否自然。自动算法不替用户决定新姿态的美感。

## 下一轮单张试制门槛（尚未执行）

先用已有问题的粉色近景验证一次完整闭环；全景随后按自身原件另建锚点与图层，不由近景缩小。原脸坐标各取自[配对清单](/Users/red/Project/ChihayaPet/ArtSources/CharacterExpansion/native-tea/originals.json:676)。

| 关口 | 自动证据／失败条件 | 用户看什么 |
| --- | --- | --- |
| 原件与工程 | 源哈希不变；重开层、mask、位置、blend；缺层或回读丢失即退回 | 单层显隐及前后顺序图 |
| 保护区 | 独立冻结区域原 RGBA 差异为 0，包含 alpha=0 下 RGB；意外改动即退回 | 原件与母图差图 |
| 发束与轮廓 | 非许可缺口、断段、陌生碎片自动标疑；未解释疑点阻止通过 | 头发完整、旧袖口是否残留、遮挡自然 |
| 配准与表情 | 原头脸整数位置／缩放 1／旋转 0；颈根、领口、腰部按已登记锚点核对；12 张原脸不透明像素等值，半透明重叠按公式复算，脸矩形外母图差异 0 | 00／04 并排和全部原脸切换，无跳动／错位 |
| alpha 与色彩 | 单层与合成 PNG，白／深灰／彩色底；记录 profile、空间及边缘差异 | 无白边、暗边、脏色和接缝；画风一致 |
| 实际显示 | 隔离单样本走原生渲染，在 240／256／480 点记录屏幕倍率及截图；HTML 预览不代替运行结果 | 默认尺寸自然，480 放大无明显拼接 |

近景另设初步坐标适配检查：本轮制作是 606 高，现用运行副本为 670 高，原件下移 `(0,64)`；若沿用，新增上方 64 行与下方 606 行分别验证，脸／嘴锚点同步加 64，防止遗漏或重复移位，见[现有校验](/Users/red/Project/ChihayaPet/scripts/verify_resources.py:69)。先锁定适配选择再截图；全景不应用这项移位。未接入应用时仅记渲染预览通过。

全部自动门槛通过，且用户明确确认本张头发、遮挡、接缝与画风后，才固定母图。证据包保存主稿、源／层／mask 清单、独立基准、差图、层显隐、原脸切换与尺寸截图、审核原话。失败从“单层→组→PNG→运行截图”定位：单层已坏修选区／补画，单层好而组坏查层序／空间，组好而 PNG 坏查导出，PNG 好而运行坏查坐标／alpha／缩放；回退到最近批准版本，不推进下一张。

未验证边界：没有实测软件往返及新流程试制，尚无通用发束自动识别阈值；未知遮挡后内容需要补画，原游戏细粒度素材仍待查证。本轮保留主 checkout 中所有未提交图片和进度。
