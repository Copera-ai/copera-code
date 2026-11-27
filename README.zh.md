# Copera Code

[English](README.md) | 中文

Copera Code 是由 [Copera](https://app.copera.ai) 提供的 AI 编程智能体。它基于 DeepSeek AI 开发的开源 agent harness [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 构建，并通过你的 Copera 账号运行 Copera 的 Shikai 模型。

Copera Code 是由 Copera 维护的独立产品，不是 DeepSeek Harness 的官方发行版，DeepSeek 不为其背书、赞助或运营。参见[品牌规范](BRAND_GUIDELINES.zh.md)。

Copera 开发者文档：[https://developer.copera.ai](https://developer.copera.ai)

## 预览版

Copera Code 处于预览阶段，版本之间可能出现破坏兼容性的变更。

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

## 运行

### 通过 `npm` 运行（即将推出）

npm 包尚未发布。发布后，安装 `Node.js`，然后运行：

```sh
npx @copera.ai/code
```

<a id="run-from-source"></a>

### 从源码运行

安装 `Node.js` 和启用 Corepack 的 `pnpm`（版本固定在 `package.json` 中），然后在仓库源码中运行：

```sh
git clone https://github.com/Copera-ai/copera-code.git
cd copera-code
pnpm install
pnpm run build
pnpm copera-code
```

`pnpm run build` 会准备仓库产物。`pnpm copera-code` 会直接使用这些已构建产物，不会重新构建。

## 登录

选择 **Sign in with Copera**。浏览器会打开 Copera 页面请求授权，完成后返回 Copera Code。

在无浏览器的无头或远程环境中，请创建一个具有 Shikai API 权限的 Copera 个人访问令牌，并在启动 Copera Code 前将其导出为 `COPERA_CODE_TOKEN`。请像对待密码一样对待该令牌：不要提交到仓库，也不要写入项目的 `.env` 文件。

## 数据与隐私

Copera Code 将设置、登录凭证和会话保存在 `~/.copera-code` 中。设置 `COPERA_CODE_HOME` 可改用其他目录；桌面应用只在从终端启动时读取它，因为从程序坞、访达或开始菜单打开的应用会在读取 shell 配置文件之前确定数据目录。在 shell 配置文件中导出的 `COPERA_CODE_TOKEN` 与 `COPERA_CODE_API_ORIGIN` 对每种启动方式都生效。Copera Code 不会读取或修改 DeepSeek Harness 安装的数据目录。

此版本不发送任何遥测数据。

## 语言

界面提供英语和葡萄牙语（巴西）。

## 与 DeepSeek Harness 的关系

本仓库是 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的分叉。Copera 会定期合并上游变更；具体方式见[上游同步流程](copera/docs/upstream-sync.md)和[上游文件修改清单](copera/docs/upstream-edits.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。参与贡献请遵循 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)。Copera Code 保留上游许可证及其版权声明：Copyright (c) 2026 DeepSeek。

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
