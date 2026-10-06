# 千早展示站

Issue #85 的静态实现位于 `site/`，沿用已确认的「银蓝书笺」设计。`prototype/` 是此前本地视觉实验，不进入构建或部署。站点不调用 LLM、不读取桌宠数据，也不需要 API Key。

## 本地预览与验证

```sh
npm run preview:showcase
# 浏览 http://127.0.0.1:4186/
npm run typecheck
node --import tsx --test tests/showcase.test.ts
npm test
```

`npm run build:showcase` 仅复制 `showcase/site/` 到 `dist/showcase/`，无需下载 npm 依赖、编译 Electron 或获取 bgm 分支。资源全部使用相对路径，可用于 GitHub Pages 的 `/ChihayaPet/` 子路径。三个页面通过 `?page=home|conversation|wardrobe` 访问，支持刷新和浏览器前进／后退。

## 素材状态

- 首页 `site/assets/hero.jpg` 使用用户确认的 `artwork/ev100a.jpg`（1024×576），原样复制为站点资源，按 16:9 比例显示；构建不依赖本机 artwork 目录。
- 2026-10-06 已录制并接入待机（6 秒）、点击打开聊天（8 秒）、自然触发的主动闲话（10 秒）三段真实 macOS 桌宠视频。独立演示配置、夏服正面、纯色背景；未连接模型或使用模拟回复。素材为 `site/assets/demos/` 下的 960×600 / 24fps VP9 WebM，无音轨，并附 JPEG 封面。拖拽仍待录制，保留占位。原生控件支持单个暂停，顶部按钮支持全部暂停，减少动态效果偏好下不自动播放。
- 对话页已录入用户提供的两段回答，保留原文和分段，分别对应忙碌一天与独自吃饭的提问。模型名称及是否使用默认人设尚未提供，不作推断；本页不会在线请求模型。
- 衣橱从已跟踪运行资源复制 15 张 PNG，路径记录见 `selection.json`。随机种子 85 在制作时选出表情 `01/03/05/09/11`，三套服装共用；访问时不重新随机。已逐张视觉检查，仍待用户最终确认公开选图。
- 2026-10-06 已核对 README 和 GitHub 最新发行版 v0.2.2：macOS arm64 DMG、Windows x64 ZIP。展示说明与这些文件一致；未重新安装或实机验收发行包。
- 第三方美术不属于项目 MIT 授权，原始素材说明保留在 `site/assets/fansitekit-notice-original.txt`。

## 托管到 GitHub Pages

已提供 `.github/workflows/showcase-pages.yml`。它只支持手动发布，避免素材尚未补齐时推送即上线。

1. 将本次提交合并／推送到仓库默认分支，让 GitHub 能发现工作流。
2. 打开仓库 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
3. 打开 **Actions → Publish showcase to GitHub Pages → Run workflow**，选择包含展示站的分支运行。首次使用时，核对 `github-pages` environment 允许该分支部署。
4. 工作流完成后，使用 deployment 输出的地址验收三页、15 张立绘、手机布局和媒体控制。

未配置独立域名时，预计地址为 `https://a1457139709.github.io/ChihayaPet/`；以 GitHub 实际部署输出为准。目前仅准备配置，尚未推送或部署，也未验证公开地址。

若以后使用独立域名，在 Settings → Pages 中配置 Custom domain，并按 GitHub 指引设置 DNS 和 HTTPS。站点采用相对路径，无需改写资源路径。

参考：[发布源配置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)、[自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
