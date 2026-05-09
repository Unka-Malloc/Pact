# client-cli/protocols/checkpoint

本目录记录 `client-cli` 与服务端对接 checkpoint / 断点续传时使用的报文协议。

本目录包含客户端侧 checkpoint 报文、恢复状态机和协议边界约束。服务端协议镜像在 `server/protocols/checkpoint`。

## 边界

`client-cli/protocols/checkpoint` 只定义客户端需要发送、接收和兼容的报文格式：

- upload session 创建 / 恢复请求
- upload session 查询响应
- 文件 chunk 上传请求
- offset mismatch / chunk too large / sha256 mismatch 响应
- job 创建时的 checkpoint 关联字段

以下内容不属于本目录，应放在 Rust 业务执行或系统适配层：

- 本地文件枚举
- 本地 sha256 计算
- 本地 checkpoint store 物理写入
- 系统文件打开、权限探测或平台 API

chunk size、offset 对齐、重试、退避和网络恢复属于 checkpoint 协议状态机，必须与本协议同步演进。

## 协议版本

- 协议名：`checkpoint.upload`
- 当前版本：`v1`
- 兼容要求：字段只能追加，不能改变既有字段含义
- 破坏兼容时必须新增协议版本，并在 `server/protocols/checkpoint` 中同步

## 1. 创建或恢复 Upload Session

客户端请求：

```http
POST /api/upload-sessions
content-type: application/json
```

```json
{
  "checkpoint": {
    "checkpointId": "string",
    "clientBatchId": "string",
    "clientUid": "string",
    "sourceType": "string",
    "parentCheckpointId": "string",
    "mode": "initial|resume|append|branch|splitall-cli"
  },
  "manifest": {
    "manifestDigest": "sha256-hex",
    "inputDigest": "sha256-hex",
    "clientUid": "string",
    "sourceType": "string"
  },
  "files": [
    {
      "name": "string",
      "relativePath": "string",
      "originalFileName": "string",
      "mediaType": "string",
      "sha256": "sha256-hex",
      "byteSize": 0
    }
  ]
}
```

服务端响应：

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

客户端必须以服务端返回的 `receivedBytes` 作为下一次上传 offset。响应中的 `sessionId`、`checkpointId`、`files[].name`、`files[].relativePath` 是服务端 hash token，不是客户端原始字符串回显。客户端显式传入的 `clientBatchId` 会作为服务端 `archiveBatchId` 原值保留，用于后续 raw object 和检索元数据归档。

## 2. 查询 Upload Session

客户端请求：

```http
GET /api/upload-sessions/{sessionId}
```

成功响应与创建 upload session 的响应相同。

`404` 表示服务端不存在该 session，客户端不能自行假设服务端已有分块。

## 3. 上传文件 Chunk

客户端请求：

```http
PUT /api/upload-sessions/{sessionId}/files/{fileIndex}?offset={receivedBytes}
content-type: application/octet-stream
```

请求体是该文件从 `offset` 开始的连续字节。客户端选择远端文件时必须以服务端返回的 `index` 为准，并用本地 `sha256`、`byteSize` 做一致性确认；不能依赖原始 `relativePath` 被服务端回显。

成功响应：

```json
{
  "sessionId": "string",
  "status": "uploading|complete",
  "files": []
}
```

成功响应必须包含最新 session 状态。客户端不得用本地推算值覆盖服务端返回值。

冲突响应：

```json
{
  "code": "offset_mismatch|chunk_too_large|sha256_mismatch|file_not_found|not_found",
  "error": "string",
  "expectedOffset": 0,
  "session": {}
}
```

客户端处理规则：

- `offset_mismatch` 语义：以 `expectedOffset` 重新读取本地文件并继续上传
- `chunk_too_large` 语义：重新按服务端 `receivedBytes` 计算剩余大小
- `sha256_mismatch` 语义：服务端已重置该文件进度，客户端从 `0` 重新上传该文件

客户端必须以 `code` 判断恢复策略，不能解析 `error` 文本。

网络恢复规则：

- 连接拒绝、超时、DNS 临时失败、连接重置、临时 `408/425/429/500/502/503/504` 不改变 checkpointId，也不进入终态失败。
- 客户端把该任务标记为 `waiting_server`，记录错误类型、下一次重试时间和已有 session/job 引用。
- 后台 worker 到达重试时间后重新使用同一 checkpointId 和 manifestDigest 创建或恢复 upload session。
- 如果服务端返回 offset mismatch，仍以服务端 `expectedOffset` 重新对齐；不能因为本地记录较新而覆盖服务端权威 offset。
- `pause` / `cancel` 优先于自动恢复；用户手动 `retry` / `resume` 可以清除等待时间并立即重新入队。

## 4. 创建 Job

上传完成后，客户端通过 `uploadSessionId` 把 upload session 绑定到 job：

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
    "mode": "initial|resume|append|branch|splitall-cli"
  },
  "uploadSessionId": "string",
  "archiveBatchId": "string",
  "clientUid": "string",
  "sourceType": "string",
  "uploadedFiles": [],
  "settings": {}
}
```

服务端负责把 `uploadSessionId` 转成 checkpoint receipt。客户端不能伪造 receipt。

## 5. 订阅服务端发布

服务端每次创建、恢复或更新 upload session 后，会通过 pub-sub topic 发布权威 session：

```http
GET /api/events?cursor=0&topic=uploads.session&includeSnapshot=1
```

事件 `payload.session` 与 upload session 响应结构一致。客户端完成一次响应处理后，必须保存 `nextCursor` 并继续订阅。

## 客户端约束

- `checkpointId` 在同一批输入的续传过程中必须稳定。
- `clientBatchId` 在同一批输入的续传过程中必须稳定；服务端返回的 `archiveBatchId` 必须与客户端批次一致。
- `clientUid` 标识本客户端，`sourceType` 标识提交资源类型；两者用于服务端归档路径维度，不用于本地扫描路径。
- 多源连接器上传必须同时传递 `providerId`、`externalId`、`syncBatchId`、`contentHash`、`capturedAt`、`sourceMetadata`；混合来源批次可以在 `files[]` 上覆盖这些字段。
- `manifestDigest` 必须由 `relativePath + sha256 + byteSize` 等稳定输入计算。
- `relativePath` 必须是相对路径，不能包含空段、`.`、`..` 或绝对路径前缀；服务端只使用它做 hash 派生。
- 客户端不得假设服务端保留或回显任何原始文件名、相对路径、checkpoint 字符串或 media type 字符串。
- 每个 chunk 的 `offset` 必须等于服务端返回的 `receivedBytes`。
- 如果订阅到 `uploads.session` retained snapshot，客户端必须用该 snapshot 校正本地 checkpoint 状态。
- Flutter GUI 不能直接调用本协议，必须通过 `client-cli` 或 `client-cli` daemon 间接调用。

## 存储与检索边界

客户端只消费 upload session 状态来恢复上传，不把服务端 manifest 当作检索索引。服务端正式检索入口是 SQLite / 知识库索引；需要打开原始文件时由服务端按 SQLite 中的 raw object 引用读取对象存储。客户端不得推导或扫描服务端 `objects/` 目录。
