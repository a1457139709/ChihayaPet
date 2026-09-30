# DMG 安装卷自动推出

实现：安装到 /Applications 或当前用户 ~/Applications 后启动，后台延迟约 3 秒检查 hdiutil 磁盘映像清单，仅正常推出同时包含专用安装标记和 local.ChihayaPet 应用的 /Volumes 下挂载卷。直接从 DMG、开发目录或便携目录启动不执行清理。占用时保留挂载，不强制推出；不删除任何 DMG、用户配置或曲库。

拖拽复制本身无法触发应用代码，因此自动清理发生在从“应用程序”首次启动之后。旧版无安装标记的 DMG 不被后台清理器自动处理。

验证：
- 全量原生测试 135 项通过（包含初始 3 项安装清理测试）。随后补充标记及 bundle ID 双重匹配测试，安装清理专项 4 项全部通过。
- 使用独立的临时磁盘映像运行生产启动清理代码：挂载卷自动消失，源 DMG 仍存在且 SHA-256 不变。
- scripts/package.sh 完成 Release 构建、签名、资源及 DMG 挂载复验，安装标记验证通过。
- 新包 build/ChihayaPet-auto-eject.dmg；为保留用户已有文件，本次使用 CHIHAYA_DMG_OUTPUT 指定新名称，没有覆盖 build/ChihayaPet.dmg。默认不指定时仍输出原有标准文件名。

当前旧挂载处理：/Volumes/ChihayaPet 1 已正常推出，原 DMG SHA-256 保持不变。/Volumes/ChihayaPet 正常推出返回 Resource busy；lsof 确认 zsh（PID 39595）的工作目录位于该卷。未终止终端、未强制卸载。用户可在该终端执行 cd ~ 后通过 Finder 推出旧卷。

Xcode 许可最初阻止构建；用户本人接受协议后继续完成测试及打包。
