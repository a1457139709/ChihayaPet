# 专业图层软件：agent 主导制作的候选路线

调研日期：2026-09-30。研究票：[调研专业图层软件：哪条路径适合 agent 主导制作](https://github.com/a1457139709/ChihayaPet/issues/23)。范围是软件、可复用流程与验证计划；不安装软件，不购买授权，不制作成品。下文的能力来自官方文档或源码，候选均未在本机验证。

## 建议及适用边界

**建议先验证 GIMP 3 的 Python 批处理 + XCF 分层工程，直接在 GIMP 审阅；需要少量手工修边时，再评估 Krita。** 这是根据自动化接口作出的推论，尚非本机可用性结论。用户没有美术基础，首轮由 agent 管理坐标、蒙版和层序，用户只判断画面是否正确；不以学习画画为前置条件。

需要分清三种能力：图层编辑管理已有像素与遮挡；分割/matting 估计已有图像的轮廓和半透明边缘；补画创造原图没有的像素。GIMP 蒙版是额外的 alpha 通道，因此只能控制已有像素的可见性。缺失发束要从合适原素材复用，或在独立层补画/生成后审阅，不能靠换专业软件保证恢复。[GIMP 蒙版 API](https://developer.gimp.org/api/3.0/libgimp/method.Layer.add_mask.html)

## 官方能力比较

| 候选 | 图层、蒙版、路径与精确位置 | 自动化与保存 | 适合的位置 |
| --- | --- | --- | --- |
| GIMP 3 | [可编辑蒙版](https://developer.gimp.org/api/3.0/libgimp/method.Layer.add_mask.html)、[Bézier 路径](https://developer.gimp.org/api/3.0/libgimp/class.Path.html)、[整数绝对偏移](https://developer.gimp.org/api/3.0/libgimp/method.Layer.set_offsets.html)、[分组及从顶部起的层序](https://developer.gimp.org/api/3.0/libgimp/method.Image.insert_layer.html)均有正式 API | [Python 3 bindings](https://developer.gimp.org/resource/writing-a-plug-in/tutorial-python/)覆盖几乎全部 libgimp；[CLI](https://docs.gimp.org/3.0/en/gimp-fire-up.html)支持无界面批处理。[XCF 保存工程](https://docs.gimp.org/3.0/en/gimp-images-out.html)，[PNG 支持 RGBA 与无损压缩](https://docs.gimp.org/3.0/en/file-png-export.html) | agent 主路径候选；GUI 检查和修蒙版也可在同一工程完成 |
| Krita | [透明蒙版、分组](https://api.kde.org/legacy/krita/html/classDocument.html)和[整数位置/层序/像素写入](https://api.kde.org/legacy/krita/html/classNode.html)有 API；[SVG 向量层](https://api.kde.org/legacy/krita/html/classVectorLayer.html)可保存可编辑轮廓，不能直接等同于 GIMP 路径蒙版 | [应用内 Python 插件/Scripter](https://docs.krita.org/en/user_manual/python_scripting/introduction_to_python_scripting.html)可执行多文件处理；[macOS CLI](https://docs.krita.org/en/reference_manual/linux_command_line.html)支持导出，所查 CLI 文档没有任意 Python 文件执行入口。[KRA](https://docs.krita.org/en/general_concepts/file_formats/file_kra.html)保存其支持的工程功能，[PNG](https://docs.krita.org/en/general_concepts/file_formats/file_png.html)支持完整 alpha 与无损编码 | 审阅和少量画笔修边后备；不能因支持 CLI 导出就宣称整个制作可无界面运行 |
| Photoshop | [层组、移动和层序](https://developer.adobe.com/photoshop/uxp/ps_reference/classes/layer/)、[可编辑路径](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/classes/pathitem)、[灰度像素蒙版](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/imaging)有 UXP API；移动接受像素值，应限制为整数 | [本地 .psjs](https://developer.adobe.com/photoshop/uxp/2022/scripting/getting-started/)可从菜单或 Dock 启动；[PSD/PNG 保存](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/classes/document)有 API，[PSD 选项](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/objects/saveoptions/photoshopsaveoptions)可保留层和 alpha。所查桌面文档不是 headless CLI 承诺 | 后续已有可用安装与授权，或明确需要专门分层插件时再试；无需为当前研究购买 |

本轮不扩大到 Affinity/CSP：上述候选已覆盖决策所需能力；这是缩小验证范围，不是断言其他软件缺少 API。

## 可复用流程与可靠性限制

1. 原始 PNG 独立保存并记录源文件哈希；制作清单记录画布、色深/色域、每层源区域、整数 x/y、层序、蒙版版本和保护区域。原脸不缩放、不旋转；修补像素单独分层。
2. agent 用 GIMP 3 脚本建立身体、后发、原脸、前发、手/杯等有名称的层；用路径或独立灰度蒙版控制遮挡。GIMP 要求蒙版与所属层同尺寸，导入后须检查尺寸与位置。[蒙版约束](https://developer.gimp.org/api/3.0/libgimp/method.Layer.add_mask.html)
3. 保存 XCF 和固定整幅 RGBA PNG，重开工程后复查蒙版与坐标。XCF 保存图像状态但不保存 undo；工程与生成清单一起版本化。[XCF 说明](https://docs.gimp.org/3.0/en/gimp-images-out.html)
4. 保留现行保护区全部原始 RGBA 的要求。GIMP 官方指出，多层合成 PNG 不能保存完全透明像素下的原 RGB；若触及保护区，须在最终导出阶段按整数坐标确定性回填原 RGBA，再逐像素验收。回填与遮挡冲突时交后续决策票裁定，不能静默改成“只看可见像素”。PNG 的 oFFs/layer offset 也有兼容问题，应关闭，坐标留在清单。[PNG 导出限制](https://docs.gimp.org/3.0/en/file-png-export.html)

建议每次从只读源文件与清单重建新的工程副本，用明确层名、父组和位置执行操作，避免依赖上次界面的选中状态。修蒙版后回存蒙版资产及版本；脚本检查返回值，再确认实际输出文件和像素。这样“人工审阅过的边界”成为可复用输入，而不是无法复现的一串鼠标动作。保护区回填是待验证的独立导出步骤，不是专业软件原生提供的保证；其程序、保护区定义和检查结果都应随工程保留。

使用 Krita 时还要防两类偏移：向量坐标单位是 points，须按分辨率换算；`Node.save` 的空 `exportRect` 会按内容边界裁切，应导出整个 Document 或显式给定画布矩形。整数 RGBA 像素接口的通道顺序是 BGRA，写入时不能误当 RGBA。[向量单位](https://api.kde.org/legacy/krita/html/classVectorLayer.html)、[节点导出和通道约定](https://api.kde.org/legacy/krita/html/classNode.html)

## 首个实际验证

后续获得可用 GIMP 安装时，先做小型接口验证，再碰喝茶素材。记录真实版本与可执行文件路径；用一个 Python 3 脚本创建两层、小尺寸灰度蒙版和已知整数偏移，保存 XCF/PNG，重开再导出。正式批处理入口由 `--no-interface`、`--batch-interpreter python-fu-eval`、`--batch -`、`--quit` 组成；Python 解释器与标准输入行为可在[官方源码](https://github.com/GNOME/gimp/blob/master/plug-ins/python/python-eval.py)核查，不能照搬 GIMP 2 的 `pdb` 示例。在线 API 当前显示 library 3.2.6，必须与实际版本核对。

通过条件：脚本无交互完成；层序/蒙版/坐标重开不变；导出尺寸、alpha 正确；两次解码像素一致；保护区四通道与源像素零差异。文件压缩和元数据可能变化，PNG 文件哈希不替代像素比较。然后才用喝茶的头发—脸—杯遮挡交界做一次分层原型，在放大图和桌宠实际显示尺寸上审核；缺失、涂层和错位任何一项未过就停在原型，不批量制作。

## 专门插件后备

Live2D 的 Material Separation Photoshop Plugin 提供半自动 Cut Out、Color Fill/Transparency Fill。官方列出 Photoshop 2024/2025、macOS Apple M，以及 Cubism PRO 激活或试用条件。[运行要求](https://docs.live2d.com/en/cubism-editor-manual/material-separation-ps-plugin-download/)其[使用手册](https://docs.live2d.com/en/cubism-editor-manual/material-separation-ps-plugin-manual/)以选择区域和插件面板操作为入口；这两页未提供 headless/API 接口，不能把 Photoshop UXP 能力自动外推到该插件。可作为分层失败后的单例试验后备，仍须审阅补出的发束和透明边缘；本轮不进入 Cubism 建模/动画。
