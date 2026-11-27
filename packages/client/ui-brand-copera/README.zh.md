---
description: "Web 与 Desktop 客户端的 Copera Code 品牌：Copera 标志与名称、蓝色与近黑色调色板层、内置 Inter 字体、深色启动画布，以及英文和葡萄牙语中的 Copera 产品名称文案。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-copera

[English](README.md) | 中文

## 概述

此包为 Copera Code 组合提供品牌标识。它用 Copera 标志和名称填充侧边栏品牌槽位和空白首页标志，在空白首页后方加入柔和的蓝色光晕，叠加一个令牌层，包含 `#3463F3` 主色、`#050505` 深色背景和内置 Inter 字体，在任何脚本运行前绘制深色启动画布，并在英文和葡萄牙语文案中替换上游产品名称。它不增加模型请求。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

`copera` 配置文件通过 `dsh-copera-app` 包挂载此插件，该包同时关闭 `ui-brand-official`。此行不接受配置；图稿、调色板和文案是固定的产品标识。

### 界面变化

- 侧边栏显示 Copera 标志和名称 "Copera Code"；折叠的导航栏和空白首页标题显示该标志。
- 空白首页在标题后方、所有 Conversation 内容下方显示淡蓝色光晕，取代像素鲸鱼。
- 两种调色板的填充按钮、开关、复选框、链接和键盘焦点环均使用蓝色主色；主色填充上的文字为白色。深色调色板使用 `#050505` 背景和匹配的侧边栏填充色。浅色调色板保留白色表面。
- 界面文字使用 Inter，位于内置系统字体栈之前。用户在设置中选择的字体仍排在最前。
- 已启用浏览器插件的英文和葡萄牙语文案以 Copera Code 代替上游产品名称，DeepSeek 账号文案改为 Copera 账号。

### 构建配置与浏览器标题

使用 `pnpm run build --profile copera`（或 `build:artifacts --profile copera`）构建客户端。该配置将标签页标题 `DSH_CLIENT_TITLE` 设为 "Copera Code"，并将 `DSH_CLIENT_BUILD_PROFILE` 设为 `copera`，后者也让插件加载前的启动页显示产品名称。其他构建配置保留各自的品牌。

### 重新生成字体样式表

`src/client/fonts/inter-face.ts` 以 data URL 内嵌 `Inter-latin-wght-normal.woff2`。替换字体文件后，在此目录运行 `node -e "process.stdout.write(require('fs').readFileSync('src/client/fonts/Inter-latin-wght-normal.woff2').toString('base64'))"`，用其输出替换 `INTER_WOFF2_BASE64` 字符串；两者不一致时 `tests/font.client.spec.ts` 会失败。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

浏览器端 [`src/client/index.ts`](src/client/index.ts) 在插件生命周期内运行其副作用。它注册 `brand.copera` 词典，通过 `ctx.locale.override` 为 `en` 和 `pt` 应用 [`locale-overrides.ts`](src/client/locale-overrides.ts)，以一个 `<style>` 元素添加 Inter `@font-face`，并将 [`theme.ts`](src/client/theme.ts) 作为 `ctx.theme.overrideTokens` 的 `copera` 层叠加。随后它通过 `ctx.slots.inject()` 把 `sidebar.brand.mark` 和 `sidebar.brand.name` 作为一个感知声明的集合填充，并填充 `conversation.hero.brand.mark`、登录屏幕的 `copera-account.gate.mark` 和 `conversation.hero.frame` 层，因此每个占位者都等待其声明并随 fiber 退出。标志是由 client-modules 资源路由提供的包资源。字体以 data URL 内嵌在包中，因为该路由只提供图片。Node 端 [`src/index.ts`](src/index.ts) 追加一行 `webserver/index-inject` 样式，把 `body[data-ds-dark-theme]` 改为 `#050505`；ui-theme 启动脚本在首次绘制前设置该属性，因此浅色偏好保留自己的画布。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [ui-sidebar](../ui-sidebar/README.zh.md) — 声明侧边栏品牌槽位及其回退。
- [ui-conversation](../ui-conversation/README.zh.md) — 声明空白首页标志槽位和 `conversation.hero.frame` 层。
- [ui-theme](../ui-theme/README.zh.md) — 负责调色板和 `overrideTokens`。
- [locale](../locale/README.zh.md) — 负责词典、部署语言目录和 `override`。

-----

<a id="model-experience"></a>
## 模型体验

### 品牌呈现

#### 模型看到什么

无。`brand.copera` 词典、`copera` 令牌层、内置字体和 `webserver/index-inject` 样式行都位于浏览器和索引页中，不会进入提示词、工具结果或 Session 日志。

#### Token 影响

无；不增加任何模型可见文本。

#### KV Cache 影响

无；此包既不组装也不发送提供方请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 内置 Inter 字体只覆盖拉丁子集；其他文字回退到系统字体栈。
- 文案覆盖只包括英文和葡萄牙语，即 `copera` 配置提供的两种语言。`tests/locale.client.spec.ts` 固定了每个提及上游产品名称的已启用词典的命名空间，因此新的上游字符串在获得覆盖前会在那里失败。
- 不覆盖包元数据的标题和描述（其他包的 `locale/*.json`）；按元数据列出插件的界面仍可能显示上游名称。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
