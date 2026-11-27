---
description: "Copera Shikai adapter for the LLM seam, locked to the copera route."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-copera

[English](README.md) | 中文

## 概述

注册 `copera` 模型提供方路由，所有模型请求都通过 Copera 的 Shikai 路由器的 OpenAI 兼容 Chat Completions API 发送。该路由提供 `shikai` 与 `shikai-ultra-fast`，没有任何设置项。每个请求携带 `coperaTokens` 服务给出的访问令牌；该服务的接口由本包定义，由账户包提供。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

```yaml
- id: llm-copera
  name: '@deepseek-ai/dsh-llm-copera'
```

插件注入 `llm` 与 `coperaTokens`，不接受配置。端点取启动进程自身环境中的 `DSH_COPERA_API_ORIGIN`，未设置时为 `https://api.copera.ai`，再加上 `/public/v1`。项目与用户的 `.env` 文件无法设置它。不是纯 `https:` 源的取值会让插件在启动时失败，因为路由会把用户令牌发往该地址；纯 `http:` 只接受 `127.0.0.1` 与 `[::1]`。

`CoperaTokenSource` 有两个方法。`getAccessToken()` 返回当前令牌，用户未登录时返回 `undefined`；未登录的请求在任何网络 I/O 之前以 `AUTH` 失败。Shikai 返回 401 时调用一次 `onRejected(token)`；若得到不同的新令牌，同一请求重放一次，否则请求以 `AUTH` 结束。

两个模型都声明 200,000 token 上下文窗口、16,000 token 默认输出上限、文本与图像输入，且没有推理强度档位。模型列表与登录状态无关。

Shikai 的 HTTP 错误，以及已打开的流中的 `data: {"error":…}` 事件，按状态码以及错误信封中的 `code` 与 `type` 映射为 harness 失败代码。`insufficient_quota`、带 `x-should-retry: false` 的 429 以及 402 变为 `QUOTA`。其他 429 与 `rate_limit_exceeded` 变为 `RATE_LIMIT`，并把 `retry-after` 作为 `providerRetryAfterMs`。401 与 `permission_denied` 变为 `AUTH`。服务端错误变为 `SERVER`；带 `x-should-retry: false` 的服务端错误以 `HTTP_<status>` 作为代码，重试策略不会重复它。每个失败都带有 Shikai 自己的消息；失败来自 HTTP 响应时还带有 HTTP 状态。该路由使用默认重试策略：重试 `RATE_LIMIT` 与服务端失败，不重试 `QUOTA` 与 `AUTH`。`src/errors.ts` 中的 `mapShikaiError` 返回同样的分类，并附带用于界面文案的 `messageKey`。

<a id="understand-the-implementation"></a>
## 实现说明

`CoperaAdapter` 把模型元数据委托给一个由固定 `openai-completions` 配置构建的 `PiAiAdapter`；该配置由本包通过 pi-ai 公开的 `createProvider` API 组装，其流与图像限制等于 llm-pi-ai 的配置默认值。每次流式调用都构建自己的 `PiAiAdapter`，其 `fetch` 只属于该次调用，因此并发请求不共享令牌或错误状态。该 `fetch` 在发送前拒绝任何源不是所配置 Copera 源的请求，不跟随重定向（`redirect: 'error'`），以 `User-Agent: copera-code/<DSH_COPERA_PRODUCT_VERSION> (+https://github.com/Copera-ai/copera-code)` 替代 harness 署名且不发送任何 `x-deepseek-*` 头，在 Chat Completions 请求体中加入 `include_reasoning: true`，执行唯一一次 401 重放，记录最终的非 2xx 响应，并对 200 流的每个数据块先转发、再扫描第一个错误事件；随后适配器用分类后的失败替换 pi-ai 展平的错误文本。pi-ai 在该路由上拿不到任何已存储凭据或环境变量。请求使用 `system` 角色、`max_tokens` 与 `stream_options.include_usage`，不发送 `store`。

<a id="further-exploration"></a>
## 延伸阅读

[pi-ai 适配器](../llm-pi-ai/README.zh.md) · [LLM 重试](../llm-retry/README.zh.md)

<a id="model-experience"></a>
## 模型体验

### Shikai 请求

#### 模型看到的内容

本包不添加任何模型可见文本；系统提示、消息与工具由 pi-ai 的 Chat Completions 序列化生成。

#### Token 影响

该路由不增加输入 token。`include_reasoning` 让 Shikai 流式返回所选上游模型的推理内容，它作为推理输出记录，并计入输出 token。

#### KV Cache 影响

请求前缀是 pi-ai 对已记录上下文的序列化，因此本包不改变缓存复用。Shikai 按请求选择上游模型，换用不同上游模型时不会复用之前的缓存。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 该路由的限制与请求方言在本包中重新声明，而不是由 llm-pi-ai 的配置解析得出，因此 llm-pi-ai 配置默认值的变化不会影响该路由。
- `mapShikaiError` 的 `messageKey` 指向由 Copera 账户界面拥有的文案；本包不提供这些文案的翻译。
- 模型限制在本包中声明，而不是从 Shikai 读取，因此 Shikai 一侧的变化需要发布本包的新版本。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
