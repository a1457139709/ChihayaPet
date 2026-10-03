# 游戏原站姿 · 近景头顶补全版

[逐图审核页](review.html) · [完整清单](inventory.csv) · [来源与坐标](manifest.json) · [像素验证](qa/verification.json) · [正式审核进度](progress.json)

14 个取景、148 张透明 PNG，人工批准已登记 148/148。全景 74 张保持先前已审核版本的文件字节，补全后的近景 74 张已获用户最终确认。

7 张近景身体层复用项目已有的头顶补全素材，固定为 454×670（正面）或 508×670（侧身）。原游戏身体的 606 行完整 RGBA 保留在 (0,64)，只使用新增顶部 64 行的已有头发。来源、历史补全过程、原件与副本哈希均保存。身体补全没有重新生成或修改表情。

全部原脸仍按服装、朝向、取景和编号配对，逐字节复制到独立脸层。正面脸坐标为 (120,149)，侧身为 (163,130)。固定身体一次后，脚本自动合成全部 74 张近景表情；正式 PNG 使用确定性 alpha 合成，不缩放原脸。

独立检查覆盖每张保存后的整图、脸区外身体、原脸像素、透明通道、原 606 行和全部表情切换定位。`qa/` 提供原尺寸头顶及接缝的浅深底预览、全部 256 高表情及 240／256／480 对照。网页支持自动切换和独立身体／原脸检查；显示高度按当前 606／670 画布等比计算。

全景批准来自用户明确原话“全景全部通过”，与具体 SHA-256 绑定；补全近景批准来自用户对统一审核页的最终确认“OK，没问题。放入项目资源中，开启新的issue来接入应用”，没有将旧近景的修改意见转作批准。原话、范围、登记时间与各 PNG 哈希保存在正式进度和 `qa/human-review.json`。网页可导出新增的本机逐图意见。

14 张身体层、148 张配对原脸及 148 张合成图已逐字节复制到[项目资源目录](../../../../ChihayaPet/Resources/OriginalStandingSprites/README.md)，共 310 张 PNG、50,325,247 字节，全部复制哈希通过。应用加载、工程打包与运行验收由[接入 issue #31](https://github.com/a1457139709/ChihayaPet/issues/31)实施。

复验：`python3 scripts/compose_original_standing.py --verify ArtSources/CharacterExpansion/original-standing/v2`。

重新自动生产到另一新版本：`python3 scripts/compose_original_standing.py --complete-close --carry-from ArtSources/CharacterExpansion/original-standing/v1 --output ArtSources/CharacterExpansion/original-standing/新版本`。现存图片禁止覆盖。

## 统一审核端口

[8129 统一审核页](http://127.0.0.1:8129/review.html)现已合并全景与补全近景，共 148 张；入口自动打开当前 `v2/review.html`，图片、清单与独立层均从 `/v2/` 加载，避免原 8129 旧图片缓存。当前正式批准为 148/148。8130 临时服务已停止，v1 历史文件保留。

启动 8129 时，服务目录使用 `ArtSources/CharacterExpansion/original-standing`，参见[统一入口说明](../README.md)。合并时页面截图为 `qa/review-port-8129.jpg`，最终批准后的页面截图为 `qa/review-approved-resources.jpg`。
