---
description: "通过系统浏览器以 OAuth 2.1 和 PKCE 登录 Copera，将轮换的授权保存在本地凭据存储中，并向 copera 模型路由提供 Copera 访问令牌。"
kind: "package-reference"
---

# @deepseek-ai/dsh-copera-account

[English](README.md) | 中文

## 概述

从浏览器登录 Copera，并在 `copera` 模型请求中发送 Copera 访问令牌。授权保存在本地凭据存储中，并在过期前刷新；并发调用方和多个进程共享同一次刷新，因为 Copera 在已轮换的刷新令牌再次出现时会撤销整个登录。没有已保存的登录时，使用启动器提供的 `DSH_COPERA_TOKEN`。登录要求 Host Web 服务器可通过 `127.0.0.1` 或 `[::1]` 加显式端口访问。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在同时挂载 `credentials` 和 Host Web 服务器的 Host 配置中挂载此服务，然后由客户端调用 `coperaAccount` Remote 命名空间。

### 何时选择

用于 Copera Code 产品：`copera` 模型路由需要 Copera 访问令牌。不要与期望由 DeepSeek 账户流程处理 `/oauth/callback` 的配置一起挂载：两者在同一 Web 服务器上监听该路径。

### 最小配置

此服务没有 Config。它读取两个环境变量，只由 Copera Code 启动器设置：

| 变量 | 默认值 | 含义 |
|---|---|---|
| `DSH_COPERA_API_ORIGIN` | `https://api.copera.ai` | 提供 `/oauth/authorize`、`/oauth/token` 和 `/oauth/revoke` 的 Copera API 源。仅限 HTTPS；纯 HTTP 只在 `127.0.0.1` 或 `[::1]` 上用于本地测试服务器。 |
| `DSH_COPERA_TOKEN` | 未设置 | 没有已保存的 OAuth 授权时使用的访问令牌。它从不刷新或撤销。 |

### Remote 操作

| 方法 | 结果 |
|---|---|
| `getState()` | `CoperaAccountState`：`status`、`via`（`oauth` 或 `env-token`）、`profile`、`attempt`、`notice` |
| `watch()` | `CoperaAccountState` 流，以当前状态开始 |
| `startSignIn(callbackOrigin, loginSource)` | 开始或加入一次尝试；`attempt.authorizeUrl` 是浏览器打开的页面 |
| `cancelSignIn()` | 丢弃当前尝试 |
| `signOut()` | 删除已保存的授权，然后在后台撤销它 |

`callbackOrigin` 必须是 `http://127.0.0.1:<port>` 或 `http://[::1]:<port>`；`localhost` 会被拒绝。一次尝试最多等待 600 秒，之后报告阶段 `expired`。用户拒绝授权时报告 `denied`，授权码交换失败时报告 `failed`。当 Copera 拒绝已保存的刷新令牌时，授权被删除，状态携带 `notice: 'session-expired'`，直到下一次登录或退出。

### 令牌提供者

此服务提供 `ctx.coperaTokens`，即 [`llm-copera`](../../llm/llm-copera/src/token-source.ts) 声明的 `CoperaTokenSource`。`getAccessToken()` 返回已保存的访问令牌（在 60 秒内过期时先刷新），否则返回 `DSH_COPERA_TOKEN`。`onRejected(token)` 在 `token` 仍是已保存的访问令牌时刷新一次；若其他调用方已替换它，则不发请求直接返回已保存的令牌；对环境令牌返回 `undefined`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

授权是凭据记录 `copera-account/default`，绑定到签发它的 API 源；来自其他源的记录视为未登录。刷新在持有凭据文件锁的 `credentials.modifyRecord` 中运行，并且只在已保存的访问令牌仍是过期令牌时执行，因此等待锁的另一个进程会复用替换后的令牌。同一进程内的并发刷新共享一个 promise。刷新期限为 20 秒，低于其他写入方 30 秒的锁等待。令牌端点返回 HTTP 400 或 401 表示授权已被撤销：只有当记录仍持有被拒绝的刷新令牌时才删除记录。网络失败、超时和其他状态码都保留记录。

回调监听器在 Web 服务器认证之前的 `webserver/request` 瀑布中运行。它只响应 `Host` 等于回调源、且唯一的 `state` 以常量时间比较匹配的 `GET /oauth/callback`；尝试不再等待后返回 410。浏览器收到带有 `Content-Security-Policy: default-src 'none'` 和 `Cache-Control: no-store` 的静态页面；页面中不出现任何请求值。

退出时先删除授权并发布未登录状态，然后在后台撤销刷新令牌和访问令牌，失败后在 1、2、4 秒后最多重试三次。销毁服务会中止待处理的撤销。

<a id="model-experience"></a>
## 模型体验

### Copera 访问令牌

#### 模型看到什么

无。访问令牌用于认证 `copera` 模型路由的 HTTP 请求；账户状态、资料和登录进度从不进入提示词、工具结果或 Session 日志。

#### Token 影响

无；不增加模型可见的文本。

#### KV Cache 影响

无；令牌刷新不会改变任何模型请求前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 删除已撤销的授权时，先在凭据锁下重新读取记录，再通过第二次加锁操作删除。若另一个进程在两次操作之间保存了新的登录，该登录也会被删除，用户需要重新登录。
- 只有刷新被 Copera 拒绝的进程会报告 `notice: 'session-expired'`；其他进程只看到记录消失，报告普通的未登录状态。
- 两种界面都接受 `loginSource`，但它目前不改变浏览器页面。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
