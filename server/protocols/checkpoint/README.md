# server/protocols/checkpoint

本目录记录服务端 checkpoint / 断点续传协议。

它与 `client-cli/protocols/checkpoint` 互相呼应：两边描述同一套对接报文，只是视角不同。

本目录包含服务端侧 checkpoint 报文、接收状态机和协议边界内执行适配。客户端协议镜像在 `client-cli/protocols/checkpoint`。

## 服务端暴露的协议面

服务端对 checkpoint / 断点续传暴露四类稳定接口：

- 创建或恢复 upload session
- 查询 upload session
- 接收文件 chunk
- 创建 job 时把 upload session 转成 checkpoint receipt
- 通过 pub-sub 发布 upload session 权威状态

协议名：`checkpoint.upload`

当前版本：`v1`

## Upload Session 报文

创建或恢复：

```http
POST /api/upload-sessions
content-type: application/json
```

服务端必须校验：

- `checkpoint.checkpointId` 非空
- `manifest.manifestDigest` 非空
- 客户端显式提供的 `checkpoint.archiveBatchId` / `checkpoint.batchId` / `checkpoint.clientBatchId` 是归档批次真相源，服务端必须原值保留为 `archiveBatchId`。
- `checkpoint.clientUid` 或 `manifest.clientUid` 标识客户端来源；`checkpoint.sourceType` 或 `manifest.sourceType` 标识客户端提交的资源类型。
- 客户端传入的 `checkpointId` 不能作为服务端 ID 或路径使用；服务端必须用 sha256 派生 `checkpoint_*` 和 `upload_session_*`
- 客户端传入的 `files[].name`、`files[].relativePath`、`files[].mediaType` 不能回写成服务端路径或路由标识；服务端只保存 hash 派生的 `upload_file_*` 和来源 hash
- 同一服务端 `checkpoint_*` 已存在时，`manifestDigest` 和 `inputDigest` 必须一致
- `files[].relativePath` 只用于输入校验和 hash 派生，不能作为存储路径
- `files[].byteSize` 是非负数字

成功响应是服务端权威 session：

```json
{
  "sessionId": "string",
  "checkpointId": "string",
  "archiveBatchId": "string",
  "clientUid": "string",
  "sourceType": "string",
  "manifestDigest": "sha256-hex",
  "inputDigest": "sha256-hex",
  "status": "uploading|complete",
  "createdAt": "iso-8601",
  "updatedAt": "iso-8601",
  "files": [
    {
      "index": 0,
      "name": "string",
      "relativePath": "string",
      "originalFileName": "string",
      "clientUid": "string",
      "sourceType": "string",
      "mediaType": "string",
      "sha256": "sha256-hex",
      "byteSize": 0,
      "receivedBytes": 0,
      "completed": false,
      "completedAt": "iso-8601"
    }
  ]
}
```

响应中的 `sessionId`、`checkpointId`、`files[].name`、`files[].relativePath` 是服务端生成的无意义 token。`archiveBatchId` 在客户端显式提供 `archiveBatchId`/`batchId`/`clientBatchId` 时保持原值；未提供时才由服务端派生。

查询：

```http
GET /api/upload-sessions/{sessionId}
```

成功响应与创建响应一致。

## Chunk 接收报文

```http
PUT /api/upload-sessions/{sessionId}/files/{fileIndex}?offset={receivedBytes}
content-type: application/octet-stream
```

服务端规则：

- `offset` 必须等于该文件当前 `receivedBytes`。
- chunk 长度不能超过剩余字节数。
- chunk 只能追加到该文件对应的临时对象。
- 文件完成时必须校验 sha256。
- sha256 不一致时，服务端重置该文件上传进度。
- 每次成功或失败都返回服务端权威 session 或可用于恢复的 session。
- `sessionId` 必须匹配服务端 token 格式，`fileIndex` 必须是非负整数。

冲突响应：

```json
{
  "code": "offset_mismatch|chunk_too_large|sha256_mismatch|file_not_found|not_found",
  "error": "string",
  "expectedOffset": 0,
  "session": {}
}
```

`expectedOffset` 是客户端下一次应该使用的 offset。

## Checkpoint Receipt

创建 job 时：

```http
POST /api/jobs
content-type: application/json
```

```json
{
  "checkpoint": {
    "checkpointId": "string",
    "clientBatchId": "string",
    "clientUid": "string",
    "sourceType": "string",
    "mode": "initial|resume|append|branch|pact-cli"
  },
  "uploadSessionId": "string",
  "uploadedFiles": [],
  "settings": {}
}
```

服务端内部生成 receipt：

```json
{
  "checkpointId": "string",
  "archiveBatchId": "string",
  "clientUid": "string",
  "sourceType": "string",
  "verifiedAt": "iso-8601",
  "manifestSha256": "sha256-hex",
  "fileCount": 0,
  "files": [
    {
      "name": "string",
      "relativePath": "string",
      "sha256": "sha256-hex",
      "byteSize": 0
    }
  ]
}
```

receipt 是服务端生成的处理凭证，不接受客户端直接提交。
receipt 内的 `checkpointId` 与文件 `name`/`relativePath` 也必须是服务端 token；原始客户端字符串最多以 hash 形式进入 `sourceNameHash`、`sourceRelativePathHash`。
receipt 内的 `archiveBatchId` 是归档批次真相源：客户端显式提供时必须与客户端批次 ID 一致，后续原始对象、知识元数据和检索记录必须使用该 ID，而不是服务端 jobId。

## Manifest 与检索边界

upload session `meta.json` 是断点续传状态，不是检索索引。它只保存 session、checkpoint、归档批次、客户端来源、资源类型、文件 hash/size、offset 和完成状态。

创建 job 后，服务端会把 upload session 转成 checkpoint receipt。receipt 只证明该批输入已完成校验，并把 `archiveBatchId` 带入任务；它不是长期元数据表。

任务完成后，正式检索只读 SQLite / 知识库索引。需要打开原始文件时，先查 SQLite `raw_mail_objects.storage_rel_path`，再读取 `objects/<ClientUID>/<SourceType>/<FileName>`。任何客户端、控制台、智能体工具都不能直接扫描 upload session manifest、job result manifest 或 `objects/` 作为检索入口。

## Pub-Sub 发布

服务端在 upload session 创建、恢复或 chunk 接收成功后，必须发布：

```json
{
  "topic": "uploads.session",
  "type": "uploads.session.upserted|uploads.session.chunk.accepted",
  "payload": {
    "session": {}
  }
}
```

`payload.session` 必须与 upload session HTTP 响应结构一致。该 topic 是 retained topic，新订阅者可以通过 `includeSnapshot=1` 获得最新权威 session。

服务端还会发布细粒度调试事件：

```json
{
  "topic": "uploads.trace",
  "type": "uploads.trace.request_received|uploads.trace.created|uploads.trace.accepted|uploads.trace.failed",
  "payload": {
    "traceVersion": 1,
    "requestId": "uuid",
    "layer": "controller|store",
    "functionName": "handleCreateUploadSession",
    "stage": "request_received",
    "message": "string",
    "http": {
      "method": "POST",
      "path": "/api/upload-sessions",
      "status": 200
    },
    "request": {},
    "session": {},
    "error": ""
  }
}
```

`uploads.trace` 是非 retained 事件流，会持久写入 `userDataPath/protocol-events/events.jsonl`，用于还原上传报文摘要和关键函数调用顺序。该事件不记录原始文件名、原始相对路径或文件字节；客户端字符串只以 hash、digest、offset、byte count、服务端 token 和字段存在性形式记录。

## 兼容规则

- 服务端返回的 session 是权威状态。
- 客户端上报的 offset 只能用于一致性校验，不能覆盖服务端状态。
- 客户端不得依赖服务端回显原始文件名或相对路径。
- 新字段必须可选。
- 移除或改变既有字段含义必须升级协议版本。
- 协议变更必须同时更新 `client-cli/protocols/checkpoint`。
