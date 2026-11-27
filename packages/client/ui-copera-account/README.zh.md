---
description: "Copera Code 登录界面与侧栏账户菜单：未登录时覆盖整个窗口，通过 coperaAccount Remote 命名空间在浏览器中登录，并在登录后显示身份与退出登录。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-copera-account

[English](README.md) | 中文

## 概述

当 Host 没有 Copera 凭据时，Copera Code 的 Web 与桌面客户端会显示覆盖整个窗口的登录界面。“使用 Copera 登录”会在用户的浏览器中打开 Copera 授权页面；界面跟随本次尝试，直到成功、被拒绝、超时或失败，会话过期时会带着提示重新出现。登录后，侧栏账户菜单显示用户的姓名、邮箱和工作区，并提供退出登录。此包自行挂载 `coperaAccount` Remote 命名空间。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在同时于 Host 挂载 [`copera-account`](../../account/copera-account/README.zh.md) 的配置中挂载此行。此行没有 Config。

```yaml
- id: ui-copera-account
  name: '@deepseek-ai/dsh-client-ui-copera-account'
```

### 登录界面

界面注册在 `shell.overlay`，渲染到 `document.body` 中并位于所有其他层之上，将 `#root` 设为 inert，把键盘焦点限制在自身内部，并忽略 Escape。主按钮在挂载时以及每次切换界面后获得焦点。一个 polite 实时区域会播报每个标题和说明。

| 账户状态 | 界面 | 操作 |
|---|---|---|
| 尚未收到状态 | 加载中 | 无 |
| 状态流在收到任何状态前失败 | 无法加载你的账户 | 重试（`getState`） |
| 未登录 | 登录 Copera Code | 使用 Copera 登录 |
| 未登录，`notice: 'session-expired'` | 你的会话已过期 | 使用 Copera 登录 |
| 尝试处于 `awaiting-browser` | 在浏览器中继续，并显示距 `expiresAt` 的剩余时间 | 再次打开浏览器、取消 |
| 尝试为 `denied`、`expired` 或 `failed`；启动被拒绝 | 对应提示 | 重试 |
| 窗口地址无法接收回调 | 此地址不支持登录，并说明 `COPERA_CODE_TOKEN` | 无 |
| 已登录 | 隐藏 | — |

回调源取自访问 Host Web 服务器所用的地址：`127.0.0.1` 和 `[::1]` 保留端口，`localhost:<port>` 变为 `http://127.0.0.1:<port>`，HTTPS、其他主机或没有显式端口的地址不受支持。普通浏览器使用页面地址和 `loginSource: 'web'`；桌面壳使用传输层的 `streamBaseUrl` 和 `loginSource: 'desktop'`。

子插槽 `copera-account.gate.mark`（single，root 作用域）在产品名称前放置品牌标志；没有占用者时界面只显示名称。

### 账户菜单

菜单占用 `settings.launcher`。它列出资料中的姓名、邮箱和工作区名称，然后是设置和退出登录。来自 `COPERA_CODE_TOKEN` 环境变量的会话没有资料；菜单会说明该变量，且不提供退出登录。退出登录失败时显示提示并保留会话。

-----

<a id="understand-the-implementation"></a>
## 理解实现

浏览器入口用 `ctx.remote.$mount` 挂载生成的 `coperaAccount` 贡献，在 `remote.coperaAccount` 可用后注册界面；卸载时先移除界面，再移除命名空间。基于 `watch()` 的一个可重连 `$stream` 把每个状态发布到两个注册共享的快照存储，`startSignIn` 和 `getState` 的响应也以同样方式发布。载体断开时保留最后的状态并把视图标记为失败。

普通浏览器会拦截在 await 之后打开的标签页，因此点击时先打开空白标签页、清除其 opener，并在 `startSignIn` 返回时导航到 `attempt.authorizeUrl`；启动被拒绝时关闭它。桌面壳会把每个 http(s) 地址的 `window.open` 转到系统浏览器并拒绝创建窗口，因此桌面客户端直接打开该地址。两种客户端中的“再次打开浏览器”都在点击中调用 `window.open`。

所有颜色都来自 `--dsw-*` 主题令牌：主按钮使用 `--dsw-alias-brand-primary`，文字使用 `--dsw-alias-label-primary-foreground`，屏幕背景使用 `--dsw-alias-bg-base`。`ui-brand-copera` 的 Copera 令牌层把它们设为 Copera 蓝、白色和深色模式下的 `#050505`。

<a id="model-experience"></a>
## 模型体验

### Copera 登录状态

#### 模型看到什么

无。`coperaAccount` 状态（包括登录进度和资料）只存在于浏览器和 Host 账户服务中；没有任何提示词、工具结果或 Session 事件携带它们。

#### Token 影响

无；此包不添加任何模型可见文本。

#### KV Cache 影响

无；此包不参与构建模型请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 在 Copera 主题发布对应令牌之前，Copera 蓝是包内的字面值。
- 剩余时间由浏览器时钟对照 Host 的 `expiresAt` 计算；两者的时钟偏差只影响显示，不影响 Host 的过期时间。
- 如果普通浏览器的弹窗拦截也拦截了点击时打开的空白标签页，界面会显示等待状态但没有标签页；“再次打开浏览器”会打开它。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
