# server/protocols/server-web

本目录记录 Node.js 服务端对 `server-web` Vue 控制台暴露的上游 HTTP / JSON 协议。

下游控制台消费视角放在：

- `../../../server-web/protocols/server`

边界：

- Node.js 服务端通过稳定 JSON 响应向控制台暴露状态和操作入口。
- `server-web` 只消费 `/api/*`，不导入服务端内部模块。
- 服务端协议是上游承诺，必须兼容旧控制台或提供版本化字段。

协议范围：

- console state
- settings 和规则库
- runtime info、mounts、skills 和 routing
- jobs、job result、normalized documents
- storage summary、doctor、locate、reconcile
- discovery config、client registry、migration state
- logs、events、runtime state

原则：

- 控制台协议面向运维展示和配置操作。
- 控制台不承载业务执行逻辑。
- 响应结构变化必须兼容旧 UI 或提供版本化字段。
