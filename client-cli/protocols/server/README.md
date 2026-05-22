# client-cli/protocols/server

本目录记录 Rust `client-cli` / `clientd` 消费 Node.js 服务端接口时的下游协议约束。

服务端上游协议放在：

- `../../../server/protocols/client-cli`
- `../../../server/protocols/checkpoint`

边界：

- `client-cli` 是客户端执行层，可以独立于 Flutter 前端运行。
- `client-gui` 通过 `client-cli` / daemon 间接消费服务端协议。
- 客户端协议视角只记录 CLI 依赖的字段、错误语义、重试语义、缓存和降级策略。
- 上传、订阅、导出和本地状态机中属于协议边界的部分放在 `client-cli/protocols`，Rust 业务执行和系统适配放在 Rust 源码中。

协议范围：

- bootstrap 与服务发现
- client check-in 与迁移状态
- upload session 创建、恢复和分块上传
- checkpoint 与 manifest
- job 创建、轮询、取消、删除和结果拉取
- result export 与 normalized documents 下载
- 智能体注册表同步、服务端代理调用和本地自定义智能体降级
- events / logs / runtime state 订阅

恢复策略：

- 服务端不可达时，客户端执行层不能丢弃任务或清空本地镜像；本地文件、checkpoint、知识镜像和事件 cursor 都必须保留。
- `server.events.sync` 消费 `/api/events` 并持久化 `nextCursor` 到本地 backend 状态；失败时下次从同一 cursor 继续。
- 上传队列的网络型错误进入 `waiting_server`，由后台 worker 指数退避重试。只有权限、参数、文件不存在、校验失败等不可恢复错误才进入 `failed`。

手动命令：

```bash
pact-client events sync --topic jobs.job --include-snapshot
pact-client upload retry <task-id>
pact-client upload run
```

原则：

- CLI 和 GUI 不各自定义一套业务协议。
- 客户端执行能力必须能通过 CLI 直接调用。
- 客户端消费上游更新时优先订阅 `server/protocols/pubsub` 定义的 topic 和 retained snapshot。
- 破坏兼容的字段变更必须同步服务端上游协议，并提供版本和迁移策略。
- `protocols` 记录对接报文格式、协议状态机和协议边界内执行适配。
