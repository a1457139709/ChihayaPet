# 游戏原站姿统一审核入口

[宽松长衬衫近景 #45／#46](http://127.0.0.1:8129/review.html?outfit=loose-long-shirt&view=close)已导入固定透明母图及全部 12 个 454×670 游戏原脸合成 PNG。母图与默认 00／绑定已接受并按原话、关闭事件和实际哈希登记，#45 已关闭；12 张实际磁盘像素核查及原尺寸、浅深背景、240／256／480 逐图检查通过。用户对 01–11 明确回复“ok”，全部 12 张已获人工批准，00 的首次同哈希记录保留，#46 已关闭。[完整表情展示](http://127.0.0.1:8129/showcase/loose-long-shirt/close/v1/review.html)；制作、图层与独立审核记录在 `long-shirt-game-style/close/v1/`。

[宽松长衬衫全景 #43／#44](http://127.0.0.1:8129/review.html?outfit=loose-long-shirt&view=full)已导入固定透明母图及全部 12 个 268×606 游戏原脸合成 PNG。母图与默认 00／绑定已明确批准，#43 已关闭；12 张实际磁盘像素核查及原尺寸、浅深背景、240／256／480 逐图检查通过，12/12 已获人工批准，#44 已完成并关闭。[完整表情展示](http://127.0.0.1:8129/showcase/loose-long-shirt/full/v1/review.html)；制作、图层与独立审核记录在 `long-shirt-game-style/full/v1/`。

[红白日式动漫女仆服全景](http://127.0.0.1:8129/review.html?outfit=red-white-anime-maid&view=full)已加入统一展示。用户确认“确认，导入到展示html页面中”，母图与默认 00／原脸绑定按实际 PNG 哈希登记已批准；用户随后明确“01–11 全部通过”，#40 完整 12 表情已全部登记人工批准。展示副本位于 `showcase/red-white-anime-maid/full/v1/`，与 `red-skirt-game-style/full/v1/` 制作文件逐字节一致。

近景完整 12 原表情 [#38 已导出并导入](../rose-game-style/close/v1/README.md)。[逐张展示页](http://127.0.0.1:8129/showcase/blue-white-rose/close/v1/review.html)提供全部编号、原尺寸与浅深背景；00 沿用 #37 的同哈希批准，01–11 待人工审核。统一展示中的母图单独审核，表情审核关联 #38。

礼装近景 [#37 已制作并导入](../rose-game-style/close/v1/README.md)。在统一页选择“蓝白玫瑰礼装／近景”，或[直接打开近景](http://127.0.0.1:8129/review.html?outfit=blue-white-rose&view=close)：包含 454×670 固定透明去脸母图，以及完整 204×154 游戏原脸于 (120,149) 的 00／04／10 样片。用户明确确认“母图与默认 00 均通过”，已按各张 PNG 哈希分别登记；04／10 留待 #38 逐图审核。母图独立卡片、独立审核按钮与哈希记录可避免将母图批准混记为表情批准；查看“身体／去脸母图”时会选中对应母图记录。

近景展示副本在 `showcase/blue-white-rose/close/v1/`，与制作目录文件逐字节一致。各取景的来源清单由 [showcase/manifest.json](showcase/manifest.json) 统一索引，运行 `python3 scripts/build_standing_showcase.py` 同步展示页。

[统一审核页](review.html)目前指向 [v2 补全近景版](v2/review.html)：74 张全景与 74 张补全头顶的近景，共 148 张，已全部获得用户批准。[v1 原始裁切版](v1/review.html)留作历史。

本机统一地址：[8129 审核页](http://127.0.0.1:8129/review.html)。全景、近景、独立身体／原脸、清单与审核记录均从版本目录加载，避免旧 8129 素材缓存混入新版。两页迁移前导出的本机新增审核记录均为空；合并后用户明确确认“OK，没问题。放入项目资源中，开启新的issue来接入应用”，当前正式批准为 148/148。

蓝白玫瑰礼装全景已加入同一展示页，选择服装“蓝白玫瑰礼装”，或[直接查看礼装](http://127.0.0.1:8129/review.html?outfit=blue-white-rose&view=full)。包含固定去脸母图与 00／04／10 三张原脸样片，支持原尺寸、浅深底、透明网格、240／256／480 高度、独立层和同表情游戏便服对照。母图与 00 已确认；04／10 待逐图审核。原站姿批准仍为 148/148，礼装样片另计为 1/3，完整 12 表情由 issue #36 实施。

展示副本位于 `showcase/blue-white-rose/full/v1/`，与 `rose-game-style/full/v1/` 原件逐字节一致；[展示清单](showcase/blue-white-rose/full/v1/manifest.json)保存来源与哈希。刷新展示页及副本运行 `python3 scripts/build_standing_showcase.py`，不会修改原站姿图片、正式清单、审核进度或已确认的礼装原件。服务端口和目录保持上述设置。

14 张身体层、148 张配对原脸及 148 张合成图已逐字节复制到[项目资源目录](../../../ChihayaPet/Resources/OriginalStandingSprites/README.md)，310 张 PNG 的 SHA-256 全部一致。应用加载、工程打包与运行验收由[接入 issue #31](https://github.com/a1457139709/ChihayaPet/issues/31)实施。

在项目根启动：

```sh
python3 -m http.server 8129 --bind 127.0.0.1 --directory ArtSources/CharacterExpansion/original-standing
```

8130 是此前临时入口，已合并到 8129。原游戏素材与 v1／v2 正式 PNG 保持原文件字节；新版审核记录已登记用户最终批准。

2026-10-01，[#40 女仆服全景完整表情](../../../docs/reports/2026-10-01-maid-full-expressions.md)已保存并导入 12 张 PNG，完整原脸按 (79,76) 直接复用，磁盘逐图像素核查和代理目视检查通过。母图、原 00／04／10 样片字节不变。当前母图及全部 12 原表情已获人工批准，统一展示页可逐图切换、查看独立层和同编号游戏便服对照。
