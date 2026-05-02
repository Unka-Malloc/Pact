# client-cli/protocols

本目录存放客户端执行层所属的协议文档。

范围：

- Rust `client-cli` / `clientd` 消费上游服务端能力时依赖的下游协议约束。
- 客户端侧 checkpoint / 断点续传发送协议。
- Flutter `client-gui` 通过 CLI / daemon 间接使用客户端能力时必须遵守的稳定契约。
- 客户端订阅服务端上游 topic 时的 cursor、缓存和降级策略。

当前目录：

- `server/`：客户端消费服务端 API 时的下游协议约束。
- `checkpoint/`：客户端侧 checkpoint / 断点续传发送协议。
- `upload/`：客户端上传队列的事件溯源命令、事件和投影协议。
- `knowledge/`：客户端本地知识库镜像、离线文档和智能体上下文协议。
- `agent/`：客户端执行层调用云端智能体的 HTTP/SSE 下游协议。

协议报文、协议状态机和协议边界内执行适配放在这里。Rust 业务执行和系统适配逻辑仍放在 Rust 源码。
