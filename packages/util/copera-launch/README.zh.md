---
description: "copera-code 命令的启动器，面向 Copera Code npm 包与桌面主进程的维护者。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-copera-launch`

[English](README.md) | 中文

## 概述

`copera-code` 命令背后的启动器。它始终启动 `copera` profile，拒绝其他上游模式，把真实进程环境中的用户变量 `COPERA_CODE_HOME`、`COPERA_CODE_TOKEN` 与 `COPERA_CODE_API_ORIGIN` 映射为 `DSH_HOME`、`DSH_COPERA_TOKEN` 与 `DSH_COPERA_API_ORIGIN`，关闭遥测，并以 `copera-code` 名称运行 dsh CLI。`resolveLaunch` 与 `resolveProductEnv` 是纯函数，桌面主进程可以复用。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 运行命令

```ts
import { runCoperaCode } from '@deepseek-ai/dsh-copera-launch'

await runCoperaCode()
```

发布的 `@copera.ai/code` 包从其 `copera-code` bin 以自身包版本调用 `runCoperaCode({ productVersion })`。在仓库中，`pnpm copera-code --no-open` 以 `scripts/copera/npm-package.template.json` 的版本从源码运行同一个启动器。`copera-code --version` 打印该版本，后接 harness 版本，例如 `0.1.0 (harness 0.2.3-alpha.2)`。`copera-code` 与 `copera-code web` 启动 Web 应用；`--port`、`--host`、`--no-open`、`--help` 与 `--version` 原样传递。`headless`、`acp`、`sdk`、`sdk-minimal`、`desktop`、`plugin`、任何其他位置参数、`--profile`、`--patch`、`--from-default-profile` 以及配置转储会打印错误并以退出码 1 结束。未给出 `--port` 且 3080 端口被占用时，启动器追加 `--port 0`。

### 解析环境

```ts
import { homedir } from 'node:os'
import { resolveProductEnv } from '@deepseek-ai/dsh-copera-launch'

const overlay = resolveProductEnv(process.env, homedir())
// { DSH_HOME, DSH_TELEMETRY_DISABLED: '1', DSH_COPERA_TOKEN, DSH_COPERA_API_ORIGIN }; undefined means delete
```

| 设置的变量 | 来源 |
|---|---|
| `DSH_HOME` | `COPERA_CODE_HOME`，否则为 `~/.copera-code`；忽略继承的 `DSH_HOME` |
| `DSH_TELEMETRY_DISABLED` | 始终为 `1` |
| `DSH_COPERA_TOKEN` | `COPERA_CODE_TOKEN`，否则删除 |
| `DSH_COPERA_API_ORIGIN` | `COPERA_CODE_API_ORIGIN` 为 `https:` URL 时取其值，否则删除；其他取值报错 |

在 harness 加载任何 `.env` 文件之前应用该覆盖：harness 只保护 `DSH_*` 名称不被项目的 `.env` 覆盖，因此克隆来的仓库无法通过设置 `COPERA_CODE_*` 或在继承环境中留下 `DSH_COPERA_*` 值来转移 token。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

| 文件 | 内容 |
|---|---|
| [`src/resolve-launch.ts`](src/resolve-launch.ts) | `resolveLaunch` 与 `resolveProductEnv`：参数检查与环境映射 |
| [`src/run.ts`](src/run.ts) | `runCoperaCode`：把启动结果应用到 `process.argv` 与 `process.env`，探测 3080 端口，并调用 `runCli({ binName: 'copera-code' })` |
| [`src/index.ts`](src/index.ts) | 公开导出 |

参数检查会跳过 Web 选项 `--host`、`--port`、`--public-url`、`--tls-cert`、`--tls-key` 以及可变参数 `--trusted-host` 的取值，因此选项值不会被当作位置参数。使用 `binName: 'copera-code'` 时，dsh CLI 对 `-h` 与 `--help` 打印 Copera Code 帮助，而不是 Web 应用的帮助。npm 包在打包时由 `scripts/copera/pack-npm.ts` 生成并由 `scripts/copera/verify-pack.ts` 检查；它不在工作区中。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Copera Code 产品层](../../bundle/copera-app/README.zh.md)
- [Harness 主目录路径](../home-paths/README.zh.md)
- [工具分组说明](../README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

### 启动环境

#### 模型看到什么

不直接看到任何内容。启动器选择 `copera` profile，其模型体验由 [`dsh-copera-app`](../../bundle/copera-app/README.zh.md#model-experience) 组合包说明。

#### Token 影响

无；启动器不添加提示词文本、工具或消息。

#### KV Cache 影响

无；启动器在任何模型请求之前运行。

## 已知限制与待办事项

<a id="known-limitations-and-deferred-work"></a>

- **端口回退只探测 3080** — 配置了其他端口的 profile 不会被探测；被占用的已配置端口由 Web 应用自行报告。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
