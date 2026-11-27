---
description: "copera profile 的 Copera Code 产品层，面向组合或定制该 profile 的维护者。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-copera-app`

[English](README.md) | 中文

## 概述

以 `dsh` profile 组合包形式提供的 Copera Code 产品层。内置的 `copera` profile 将它叠加在 [`dsh-base`](../base/README.zh.md) 与 [`dsh-web-app`](../web-app/README.zh.md) 之上。它关闭遥测、DeepSeek 账号、DeepSeek 模型路由、DeepSeek 网络提供方与仅限 DeepSeek 的浏览器页面，插入 Copera 账号服务与 `copera` 模型路由，并将默认模型、会话标题与压缩摘要路由到该路由。当后续 patch 层重新打开其中任何一项时，它的 `copera-product-lock` 守卫会阻止启动。

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

### 启动 profile

```text
dsh copera --no-open
```

[`dsh-official-bundles`](../../util/official-bundles/README.zh.md) 中的 `copera` 模板将本组合包列在最后，因此它的 patch 覆盖 base 与 Web 条目。本组合包与其他内置组合包一样从 dsh 安装中解析。

### 你将得到什么

不含以下条目的 Web 应用：OTel 会话遥测及其导出器、桌面产品遥测与分析、DeepSeek 会话日志与插件清单上报、DeepSeek LLM API 扩展、DeepSeek 账号与认证服务、DeepSeek 与 pi-ai 模型适配器、DeepSeek 网络搜索与 Web API 提供方、账号、通知、网络搜索与模型设置页面、官方品牌、harness 开发上下文、上游技能、插件管理器与插件页面、插件与个性化页面推荐及其操作卡片、消息与会话反馈、入口定制以及 Creator 预设。[`src/product-lock.ts`](src/product-lock.ts) 列出这些条目。默认模型为 `copera`/`shikai`；会话标题使用 `copera`/`shikai-ultra-fast`；Web 主题默认深色；agent 的网页抓取发送 `User-Agent: copera-code/<version> (+https://github.com/Copera-ai/copera-code)`；agent 预设没有 `plugin_manager` 工具，也没有 `dsh-doc` 技能。

本组合包新增两个条目：[`copera-account`](../../account/copera-account/README.zh.md) 负责 Copera 登录并提供 `coperaTokens`；[`llm-copera`](../../llm/llm-copera/README.zh.md) 注册带有 `shikai` 与 `shikai-ultra-fast` 模型的 `copera` 路由。没有已存登录也没有 `DSH_COPERA_TOKEN` 时，模型请求在发出任何网络请求之前以 `AUTH` 错误失败。两个条目都从启动进程读取 `DSH_COPERA_API_ORIGIN`（默认 `https://api.copera.ai`）。`deepseek-account` 保持关闭，因为两个账号服务都会监听 `/oauth/callback`。

### 产品锁

本组合包插入 `copera-product-lock` 守卫，并让必需的 `webserver` 条目注入它的 `coperaProductLock` 服务。在所有 patch 层（组合包、profile 的 `cordis.patch.yml`、数据目录的 `cordis.patch.yml` 与 `--patch` 覆盖层）组合出条目树之后，若有被锁定的条目被启用、被锁定的包以其他条目 id 挂载、注册了 `copera` 以外的模型路由，或 profile 的组合包列表不包含本组合包，守卫会以逐条列出违规项的消息使启动失败。禁用守卫的数据目录 patch 会让 Web 服务器一直等待该服务，因此启动同样失败。启动之后，新注册的模型路由或破坏锁的 profile 重载会撤回该服务，从而停止 Web 服务器，并请求以退出码 1 退出。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

| 文件 | 内容 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 对 base 与 Web 条目的 `disabled: true` patch 和整体 config 覆盖，以及 `copera-account` 与 `llm-copera` 的插入 |
| [`presets/standard.patch.yml`](presets/standard.patch.yml)、[`presets/ptc.patch.yml`](presets/ptc.patch.yml)、[`presets/minimal.patch.yml`](presets/minimal.patch.yml) | 重新声明的 agent 预设 |
| [`src/index.ts`](src/index.ts) | `copera-product-lock` 守卫插件 |
| [`src/product-lock.ts`](src/product-lock.ts) | 被锁定的条目 id，以及守卫与测试共用的锁检查 |

patch 会替换条目的整个 `config`，因此每个覆盖都重新声明所替换条目的全部键。预设条目把插件放在 `config.plugins` 中，而 Loader 没有作用于该列表内部的 patch 操作，所以三个预设文件复制 `dsh-web-app` 的声明，只修改 persona、`compaction-basic` 的摘要路由与 `tool-web` 搜索，去掉 `dsh-doc` 技能目录，并去掉 `tool-plugin-manager` 条目。当目标条目 id 缺失、patch 关闭的条目与被锁定条目不完全一致、组合后 profile 中启用的条目指向 DeepSeek 端点或端点包或挂载 `plugin_manager` 工具、内置预设声明发生变化、或 `copera` 与桌面端组合中启用的条目及预设 id 与 `tests/expected/` 中审阅过的快照不同时，[`tests/patch-ids.spec.ts`](tests/patch-ids.spec.ts) 会失败。[`tests/product-lock.spec.ts`](tests/product-lock.spec.ts) 用 app-boot 的 profile 读取器组合该 profile，并通过 Loader 与启动审计启动守卫。[`tests/wiring.spec.ts`](tests/wiring.spec.ts) 通过 Loader 针对本地伪造的 Copera API 启动该 profile 的 `llm`、`credentials`、`copera-account` 与 `llm-copera` 条目，并检查 token 刷新、401 重放以及未登录时的 `AUTH` 失败。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [组合包分组说明](../README.zh.md)
- [Profile 组合](../../boot/app-boot/README.zh.md#profiles)
- [Agent 预设声明](../../preset/agent-preset/README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

### Copera Code persona

#### 模型看到什么

系统提示词以 `You are Copera Code, a coding agent by Copera.` 开头，不含 harness 身份段落。Standard、PTC 与 Minimal 预设提供相同的 persona 文本；Minimal 保留不含运行时上下文的完整提示词形式。

#### Token 影响

一条简短的固定句子替换上游 persona（上游 persona 会写出模型名），提示词因此少几个 token。

#### KV Cache 影响

对固定的 profile 与预设保持稳定，因为 persona 文本不含模板值。修改它会使缓存前缀失效一次。

### 移除网络搜索工具

#### 模型看到什么

Standard 与 PTC 预设注册 `web_fetch`，不注册 `web_search`。

#### Token 影响

工具目录中不再包含 `web_search` 的 schema。

#### KV Cache 影响

稳定；对一个 profile 与预设，工具目录是固定的。

### 移除插件管理工具

#### 模型看到什么

Standard 与 PTC 预设不注册 `plugin_manager` 工具，因此模型无法列出、安装或移除组合包。

#### Token 影响

工具目录中不再包含 `plugin_manager` 的 schema。

#### KV Cache 影响

稳定；对一个 profile 与预设，工具目录是固定的。

### 移除 harness 文档技能

#### 模型看到什么

Standard 与 PTC 预设不加入 `dsh-doc` 技能目录，因此技能目录不列出说明如何开发 DeepSeek Harness 本身的技能。

#### Token 影响

技能目录少一个条目及其描述。

#### KV Cache 影响

稳定；技能目录对固定的 profile 与预设不变。

### 压缩摘要

#### 模型看到什么

所有预设都向 `copera`/`shikai-ultra-fast` 请求压缩摘要，而不是向最后回答的模型请求。

#### Token 影响

摘要请求按摘要模型计费；主会话不变。

#### KV Cache 影响

摘要请求使用不同的模型，因此与会话模型不共享缓存。

## 已知限制与待办事项

<a id="known-limitations-and-deferred-work"></a>

- **预设重新声明** — 三个预设文件复制了内置声明。`dsh-web-app` 的预设发生变化时，`tests/patch-ids.spec.ts` 会失败，直到更新这些副本。
- **锁的范围** — 守卫读取组合后的 Loader 条目树，因此同时禁用守卫并从 `webserver` 条目的 `inject` 中移除 `coperaProductLock` 的数据目录 patch 会在没有锁的情况下运行。agent 的文件工具可以读取数据目录，并在 `danger-full-access` 模式下或数据目录位于会话工作区内时写入它；沙箱没有按路径的拒绝列表。
- **可选组合包仍然列出** — 安装的可选与按需组合包列表与其他 profile 共享；本组合包隐藏插件页面，而不是移除它们。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
