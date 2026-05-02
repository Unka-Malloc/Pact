# server-web/protocols/server

本目录记录 `server-web` Vue 控制台消费 Node.js 服务端接口时的下游协议约束。

服务端上游协议放在：

- `../../../server/protocols/server-web`

边界：

- `server-web` 只消费 `/api/*`。
- `server-web` 不导入服务端内部模块，不依赖内部目录结构。
- `server-web` 只依赖稳定 JSON 响应，不把服务端内部目录结构当成协议。

协议范围：

- console state
- settings 和规则库
- runtime info、mounts、skills 和 routing
- jobs、job result、normalized documents
- storage summary、doctor、locate、reconcile
- discovery config、client registry、migration state
- logs、events、runtime state 订阅

原则：

- 控制台协议面向运维展示和配置操作。
- 控制台不承载业务执行逻辑。
- 控制台消费上游更新时优先订阅 `server/protocols/pubsub` 定义的 topic 和 retained snapshot。
- 下游消费约束变化必须同步检查 `server/protocols/server-web` 的上游承诺。
