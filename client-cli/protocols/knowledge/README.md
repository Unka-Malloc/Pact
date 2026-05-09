# client-cli/protocols/knowledge

本目录定义客户端执行层的本地知识库镜像协议。

## 边界

- 协议名：`client.knowledge.mirror`
- 服务端上游：`GET /api/knowledge/sync?scope=mirror`
- 本地执行层：Rust `client-cli` / `clientd`
- Flutter GUI：只调用 CLI / daemon 方法，不直接维护知识库索引或同步游标。

## 本地布局

```text
<portable-data>/knowledge/
  index.sqlite
  documents/
  assets/
  normalized-documents/
```

`documents/` 保存 Markdown 和 JSON sidecar，作为离线可读知识库；`assets/` 保存通过
`/api/knowledge/assets/:assetId` 下载的二进制资产；`normalized-documents/` 保存服务端归一化
DOCX。`knowledge_suggestions` 只缓存服务端自进化建议的摘要和状态，不缓存服务端 LanceDB
索引或学习运行时内部数据。客户端只读取当前 `knowledge/` 布局；旧版
`<portable-data>/knowledge-cache.sqlite` 自动迁移已移除。

## CLI / RPC

- `knowledge.status`
- `knowledge.sync`
- `knowledge.search`
- `knowledge.document.get`
- `knowledge.document.open`
- `knowledge.export`
- `knowledge.agent.context`
- `knowledge.agent.answer`

`knowledge.sync` 默认 `scope=mirror` 且 `pushOutbox=false`。客户端作为下游时以服务端为权威；
只有显式传入 `pushOutbox=true` 时才提交本地结构化变更。

## 冲突与智能体

客户端本地 cache 不作为 canonical store。服务端返回的对象会覆盖本地投影，服务端返回的
`suggestion` 会更新本地待审核/已拒绝/已解决状态，`tombstone` 会删除本地索引记录。智能体接口只读取本地知识库并返回可引用的 context pack；
配置云端 HTTP endpoint 后，`knowledge.agent.answer` 才会调用云端回答能力。

云端智能体 HTTP/SSE 报文由 `client-cli/protocols/agent` 定义。`knowledge.agent.answer` 不直接维护
网络协议，只把本地知识上下文附加到 agent `parameters` 后调用通用 agent 组件。
