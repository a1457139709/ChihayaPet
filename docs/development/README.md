# 开发指南

应用使用 Electron + TypeScript，活动代码位于 `app/`，平台适配位于 `app/platform/`。使用发行版请见[项目 README](../../README.md)。

## 本地运行

准备 Node.js 24+ 和 npm。macOS 平台适配器编译还需要 Xcode 26+ 与 Node 安装前缀下的 `include/node/node_api.h` 开发头文件。

```sh
npm ci
npm run dev
```

开发版将配置和曲库写入项目目录；调试前确认使用的是开发数据。默认角色设定来自根目录 `chihaya_prompt.md`，构建时嵌入应用；运行时自定义设定保存在数据目录的 `persona.md`。

## 验证与打包

按改动选择验证入口，脚本定义以 [package.json](../../package.json) 为准：

```sh
npm run typecheck
npm test
npm run test:prompt
npm run build
npm run test:runtime
```

原生菜单验证、Windows 实机步骤和发行验收分别见[验收记录](../VALIDATION.md)、[Windows 自测清单](../windows-acceptance.md)与[分支及发行流程](../BRANCHES.md)。逻辑测试或源码校验通过不代表安装包已通过实机验收。

打包前读取[资源指南](../agents/artwork.md)。音乐来自独立 `bgm` 分支，按 `scripts/bgm-catalog.json` 的固定内容哈希提取；浅克隆或单分支克隆也需要取得该分支：

```sh
git fetch origin bgm
npm run package
npm run verify
```

macOS 上默认生成两端产物；针对已编译代码可用 `node scripts/package-electron.mjs mac` 或 `win` 单独打包。DMG 必须在 macOS 构建。产物位于 `release/`，检查实际安装包及其校验结果后再进入发行流程。

## 修改前的参考入口

- 修改聊天、存储、窗口或播放行为：阅读[实现说明](IMPLEMENTATION.md)，结合对应源码与测试核对当前行为。
- 修改资源、加载或打包：阅读[资源指南](../agents/artwork.md)，确认新检出能用已跟踪文件完成构建。
- 修改 UI 或安排人工验收：阅读[UI 验收清单](../issue-63-acceptance.md)。

实现细节与数值以源码和测试为准；开发文档记录模块职责、跨模块约束和验证方法。
