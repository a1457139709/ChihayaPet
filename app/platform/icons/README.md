# 应用图标

来源：[issue #76](https://github.com/a1457139709/ChihayaPet/issues/76) 中报告者指定的
[300×300 原图](https://github.com/user-attachments/assets/868bff83-1d36-4420-b6c1-473644104f58)。

`chihaya.png` 是已批准的 184×184 头肩裁剪：原图坐标 `(62, 0, 246, 184)`，右下边界不包含在内。
保留橙色背景及底角少量配角边缘，不做 AI 修复。用户于 2026-10-04 审查放大图和
128/64/32/16 px 预览后确认：“可以，就这样吧”。大尺寸的柔和效果已接受。
审查原型保存在 `prototype/issue-76-icon` 分支，正式构建不依赖该分支。

- `chihaya.ico`：Windows EXE，16、24、32、48、64、128、256 px。
- `chihaya.icns`：macOS 应用包，包含最高 1024 px 的图像。
- Windows 托盘及 macOS 菜单栏继续使用叶片图标。

以上文件均纳入版本控制；构建直接使用 ICO/ICNS，无需下载原图或安装 Pillow。
如需重现转换，可在安装 Pillow 的制作环境中执行：

```python
from PIL import Image
from pathlib import Path
p = Path('app/platform/icons')
im = Image.open(p / 'chihaya.png').convert('RGBA')
im.resize((256, 256), Image.Resampling.LANCZOS).save(
    p / 'chihaya.ico', sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
im.resize((1024, 1024), Image.Resampling.LANCZOS).save(p / 'chihaya.icns')
```
