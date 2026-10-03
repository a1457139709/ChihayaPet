# 游戏原站姿统一审核入口

[统一审核页](review.html)目前指向 [v2 补全近景版](v2/review.html)：74 张全景与 74 张补全头顶的近景，共 148 张，已全部获得用户批准。[v1 原始裁切版](v1/review.html)留作历史。

本机统一地址：[8129 审核页](http://127.0.0.1:8129/review.html)。全景、近景、独立身体／原脸、清单与审核记录均从版本目录加载，避免旧 8129 素材缓存混入新版。两页迁移前导出的本机新增审核记录均为空；合并后用户明确确认“OK，没问题。放入项目资源中，开启新的issue来接入应用”，当前正式批准为 148/148。

14 张身体层、148 张配对原脸及 148 张合成图已逐字节复制到[项目资源目录](../../../ChihayaPet/Resources/OriginalStandingSprites/README.md)，310 张 PNG 的 SHA-256 全部一致。应用加载、工程打包与运行验收由[接入 issue #31](https://github.com/a1457139709/ChihayaPet/issues/31)实施。

在项目根启动：

```sh
python3 -m http.server 8129 --bind 127.0.0.1 --directory ArtSources/CharacterExpansion/original-standing
```

8130 是此前临时入口，已合并到 8129。原游戏素材与 v1／v2 正式 PNG 保持原文件字节；新版审核记录已登记用户最终批准。
