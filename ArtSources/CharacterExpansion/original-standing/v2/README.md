# 当前角色素材与逐图审核

截至 2026-10-03（Asia/Shanghai），[8129 统一审核页](http://127.0.0.1:8129/review.html)显示 **13 组、26 个取景、292 张编号表情**，逐张批准 **292/292**。另有 **12 张去脸母图、2 张历史完整叠手动作图**，分别计数和登记批准。

原版 7 组／14 取景／148 张表情来自 v2；新增 6 组／12 取景／144 张表情来自 showcase 的当前版本。体检服与体检服-里沿用原来源 ID；普通宽松长衬衫的全景／近景 24 张已批准表情目前隐藏，保留历史。

当前可见范围由 v2/review.html 的 visibleOutfits 及嵌入目录确定；review-selection.json 已同步。较早的 213 张选择快照、旧页面说明、退回版本和既有批准保存在 history 及原生产目录，不能作为当前范围或新文件的批准。

身体层与绑定按各取景分别固定。体检服全景和女仆装-工远近景使用各自派生脸层、遮罩与变换；其他当前取景使用完整游戏原脸原生绑定。体检服-里近景使用 v13 母图与 expressions-v7 表情，母图与表情批准分开记录。

292 张已批准合成 PNG 已由 [#31](https://github.com/a1457139709/ChihayaPet/issues/31)放入 `ChihayaPet/Resources/StandingCharacterSprites/`，完成应用加载、工程打包及实际运行验收。逐图哈希收据为 application-delivery.json；OriginalStandingSprites 仍是原版 310 张 PNG 的基础图层档案。母图、历史动作、生成中间文件及 QA 留在美术档案。

[当前逐图清单与历史／提交索引](../../../../docs/reports/2026-10-03-issue-60-artwork-audit.md)记录每张当前文件的生产版本、来源、实际绑定、图层、SHA-256、批准及分阶段交接。此整理没有新增图像批准，也没有修改 PNG。

在项目根复核：

```sh
python3 scripts/audit_artwork_archive.py
python3 scripts/verify_resources.py --require-approved-standing
```

只同步当前元数据与 #31 收据：`python3 scripts/sync_artwork_review_status.py`。更新后应重新生成审计快照；不会生成图片或授予批准。早期 build_standing_showcase.py 只覆盖早期服装目录，当前全部服装应使用各版本登记脚本，不能直接用早期生成器覆盖总清单。

启动统一入口：

```sh
python3 -m http.server 8129 --bind 127.0.0.1 --directory ArtSources/CharacterExpansion/original-standing
```
