# 素材来源与完整性记录

整理日期：2026-09-05；修订日期：2026-09-07。角色由用户确认为妃宫千早。两张主立绘用于静态首版，Live2D 为后续阶段，参考目录中的图片不自动作为运行或模型制作资源。

## 来源与命名

以下“来源相对路径”以原游戏目录根部为基准，仅作来源记录，不是运行依赖。路径中的乱码名称沿用用户本地实际文件名，不擅自修复或重命名原文件。

| 本包文件 | 用途 | 原文件名 |
| --- | --- | --- |
| [chihaya-summer.png](chihaya-summer.png) | 夏服立绘，白色服装 | `斳媨愮憗_壞暈a.png` |
| [chihaya-winter.png](chihaya-winter.png) | 冬服立绘，深色服装 | `斳媨愮憗_搤暈a.png` |
| [fansitekit-notice-original.txt](fansitekit-notice-original.txt) | 素材包附带使用说明原件 | `僼傽儞僒僀僩僉僢僩巊梡忋偺拲堄.txt` |

夏服来源相对路径：

```text
otbk2_fansitekit/偍偲儃僋俀僼傽儞僒僀僩僉僢僩/僉儍儔僋僞乕徯夘夋憸/僒僀僘戝/斳媨愮憗_壞暈a.png
```

冬服来源相对路径：

```text
otbk2_fansitekit/偍偲儃僋俀僼傽儞僒僀僩僉僢僩/僉儍儔僋僞乕徯夘夋憸/僒僀僘戝/斳媨愮憗_搤暈a.png
```

使用说明来源相对路径：

```text
otbk2_fansitekit/偍偲儃僋俀僼傽儞僒僀僩僉僢僩/僼傽儞僒僀僩僉僢僩巊梡忋偺拲堄.txt
```

## 图片技术信息

| 属性 | 夏服 | 冬服 |
| --- | --- | --- |
| 尺寸 | 441×516 像素 | 441×516 像素 |
| 图像格式 | PNG，32 位 ARGB 解码 | PNG，32 位 ARGB 解码 |
| 完全透明像素（alpha = 0） | 150,227 | 155,463 |
| 半透明像素（0 < alpha < 255） | 55,034 | 51,441 |
| 左上角像素 | A=0、R=255、G=0、B=255 | A=0、R=255、G=0、B=255 |

洋红色存在于完全透明像素的 RGB 中，正常合成时不可见，不需要重新抠图。保留半透明头发边缘，避免覆盖成纯色或误删边缘像素。

两张图片的人物下半身被裁切，右侧包含版权文字。它们是两个服装／姿势的静态素材，不是连续动画帧，没有独立闭眼或嘴型图层。复制过程不压缩、不转码、不裁切，也不修改 alpha。

静态首版默认显示高度 256 点，缩放范围 240–480 点；在 2× Retina 下分别约需 512–960 像素（默认值至最大值），放大档允许柔化。布局额外保留四周各 8 点动画留白，不修改这些源文件。后续 Live2D 需要独立选材、拆分补画、制作并验证模型，不能由本记录推定现有 PNG 已具备模型或分层源稿。

## 参考图片清单（不进入首版应用资源）

以下路径相对于 `assets/`，共 28 个文件：`pixiv/` 17 个、`baozhen/` 11 个。仅登记为角色外观与后续选材参考；不加入 Asset Catalog、Target Membership 或 Copy Bundle Resources，不随首版应用打包。

目录名和文件名均沿用当前本地名称，不能据此确认作者、实际下载网站、原始作品页面或许可。当前未提供可核验的来源凭证，下表对应信息逐项标为“未核实”；不沿用主立绘的 fansitekit 使用说明作为这些图片的授权。后续如选作制作素材，先补充可核验的原始来源、作者及用途许可。

| 本地参考文件 | 作者 | 原始来源地址 | 许可 |
| --- | --- | --- | --- |
| `baozhen/1a4ff7dc61f9c9bc19118a6d0d34362dce59409de3c72156b9c36b819f17c2e8.0.WEBP` | 未核实 | 未核实 | 未核实 |
| `baozhen/2c1ff1e4ab02cf52ff126d8977c954b65f22636e5e06c73cc9d6849de63d4231.0.JPG` | 未核实 | 未核实 | 未核实 |
| `baozhen/36191d709fe5b2298cb647aa7c89c63d4b821410db959527bf3beaf20a12e6e7.0.JPG` | 未核实 | 未核实 | 未核实 |
| `baozhen/3a9f6ed57b1671a96adc650fb3ba7fea5c5d0400cdbea904c4cad381fce44779.0.JPG` | 未核实 | 未核实 | 未核实 |
| `baozhen/5e7a1eb48c4f679a2e6638046c4dc29a1bb5fabb66ee53af094926a65bf4e4b9.0.JPG` | 未核实 | 未核实 | 未核实 |
| `baozhen/628fbe8ae9775ade515cfbeaa76c9f7f005fda2001d7a18e702fde15e153422a.0.JPG` | 未核实 | 未核实 | 未核实 |
| `baozhen/9132b65e5e0ec3a9718715f20638f724287f6389f6f0c26dda36d028bad6b9b8.0.JPG` | 未核实 | 未核实 | 未核实 |
| `baozhen/96d1eb9292dee0a63c32205bdabd4b32fbee8546fd9da5c18f85a7f2048011ba.0.JPG` | 未核实 | 未核实 | 未核实 |
| `baozhen/a10b2b9d8dcca8f92b9db52acc885b5a9e734b8cab6ab95b596c4dc713478819.0.JPG` | 未核实 | 未核实 | 未核实 |
| `baozhen/ec69a9118358b345574c2a62713161e6c9437a674ea3ddff87228752e281f50d.0.JPEG` | 未核实 | 未核实 | 未核实 |
| `baozhen/f77704a93afed21f978f50d69f09989262a876afed6b26913a3450e65406aed4.0.JPG` | 未核实 | 未核实 | 未核实 |
| `pixiv/1275494685.jpg` | 未核实 | 未核实 | 未核实 |
| `pixiv/23580937_p1_master1200.jpg` | 未核实 | 未核实 | 未核实 |
| `pixiv/23580937_p2.jpg` | 未核实 | 未核实 | 未核实 |
| `pixiv/23580937_p3_master1200.jpg` | 未核实 | 未核实 | 未核实 |
| `pixiv/23580937_p4_master1200.jpg` | 未核实 | 未核实 | 未核实 |
| `pixiv/23580937_p5_master1200.jpg` | 未核实 | 未核实 | 未核实 |
| `pixiv/23580937_p6_master1200.jpg` | 未核实 | 未核实 | 未核实 |
| `pixiv/502737.jpg` | 未核实 | 未核实 | 未核实 |
| `pixiv/ANIME-PICTURES.NET_-_255151-2399x7141-otome+wa+boku+ni+koishiteru-otome+wa+boku+ni+koishiteru+futari+no+elder-kisakinomiya+chihaya-single-long+hair-tall+image.png` | 未核实 | 未核实 | 未核实 |
| `pixiv/D3td9LSUYAACriA.jfif` | 未核实 | 未核实 | 未核实 |
| `pixiv/DaF9NjyVwAAprF9.jfif` | 未核实 | 未核实 | 未核实 |
| `pixiv/DaGCAS4VAAA1Fhq.jfif` | 未核实 | 未核实 | 未核实 |
| `pixiv/EA9UxkcUYAEhyqT.jfif` | 未核实 | 未核实 | 未核实 |
| `pixiv/Kisakinomiya.Chihaya.full.443697.jpg` | 未核实 | 未核实 | 未核实 |
| `pixiv/Otome.wa.Boku.ni.Koishiteru.~Futari.no.Elder~.1024.1924395.webp` | 未核实 | 未核实 | 未核实 |
| `pixiv/Otome.wa.Boku.ni.Koishiteru.~Futari.no.Elder~.full.883840.jpg` | 未核实 | 未核实 | 未核实 |
| `pixiv/peakpx.jpg` | 未核实 | 未核实 | 未核实 |

## SHA-256

以下值为原始文件的 SHA-256；交付副本必须逐一一致。大小写不影响十六进制数值。

```text
56A1F650616EB45380C8317CAC274C29AE4F276B417250DB8C203A60FEB4028F  chihaya-summer.png
AD3E8465FC3D25FB7DCFC3ECCA2006D3578EAB795A3CE406985CA5DAAEB805D0  chihaya-winter.png
42F7EBD87FF6689B50A92ECE48039BF191267964E82F5B635B25BF6DFD28021C  fansitekit-notice-original.txt
```

## 原始说明与编码

[fansitekit-notice-original.txt](fansitekit-notice-original.txt) 按原字节保留，原文为日文 Shift-JIS（以 Windows code page 932 解码核读）。不因重命名转换编码或换行。

原始说明标题为《処女はお姉さまに恋してる ２人のエルダー》ファンサイトキット 使用上の注意。以下只作阅读提示，具体以原文为准：

- 素材包限个人使用，要求避免企业及商业使用。
- 禁止未经许可的转载或将素材包置于可下载状态。
- 使用素材制作网站时，原文要求首页链接到发行方网站；对加工为网站按钮的用途另有个人使用和来源标注要求。

本资料包用于用户本机开发，不构成对公开发布或其他用途的新授权；图片版权文字和完整原始说明随素材保留。

在 Mac 上如需查看原始日文，可使用支持 Shift-JIS 的编辑器，或在资料包根目录执行只读转换输出：

```sh
iconv -f CP932 -t UTF-8 assets/fansitekit-notice-original.txt
```

其他新建的 Markdown 文档使用 UTF-8。项目总体约定见 [设计方案](../docs/DESIGN.md)，开发入口见 [README](../README.md)。
