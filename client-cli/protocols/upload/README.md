# client-cli/protocols/upload

本目录定义客户端执行层的上传队列协议。队列由 `client-cli` / `clientd`
拥有，Flutter GUI 只能发布命令意图、订阅事件和读取投影，不能直接维护真实上传队列。

## 协议边界

- 协议名：`client.upload.queue`
- 当前版本：`v1`
- 事件源：`backend/upload-queue/events.jsonl`
- 投影状态：由事件日志重放生成，不以可变状态文件作为权威来源
- 下游断点续传协议：`client-cli/protocols/checkpoint`
- 服务端会话协议：`server/protocols/checkpoint`

## 命令

所有命令通过 client backend RPC / command file / CLI 暴露：

- `upload.queue.enqueue`
- `upload.queue.list`
- `upload.queue.get`
- `upload.queue.pause`
- `upload.queue.resume`
- `upload.queue.cancel`
- `upload.queue.retry`
- `upload.queue.clearCompleted`
- `upload.queue.process`

CLI 对应：

```bash
pact-client upload enqueue '<json>'
pact-client upload list
pact-client upload get <task-id>
pact-client upload run [task-id]
pact-client upload pause <task-id>
pact-client upload resume <task-id>
pact-client upload cancel <task-id>
pact-client upload retry <task-id>
pact-client upload clear-completed
```

## enqueue 请求

```json
{
  "taskId": "optional-stable-id",
  "serviceBaseUrl": "http://127.0.0.1:8787",
  "inputText": "string",
  "files": [
    {
      "path": "/absolute/local/path.txt",
      "name": "path.txt",
      "relativePath": "folder/path.txt",
      "mediaType": "text/plain"
    }
  ],
  "settings": {},
  "checkpointId": "optional-stable-checkpoint-id",
  "wait": false,
  "process": false,
  "startPaused": false
}
```

`client-cli` 负责读取本地文件、计算 sha256、生成 manifest digest 和稳定 checkpoint id。
这些可读字符串只发给服务端做输入校验和 hash 派生；服务端不会把它们作为 session、checkpoint、文件名或存储路径使用。
`wait: true` 表示命令调用会在事件队列内执行该任务并等待服务端 job 完成；`process: true`
表示入队后立即启动队列 worker。

## 事件

队列状态只能由以下事件重放得到：

- `upload.queue.enqueued`
- `upload.queue.started`
- `upload.queue.paused`
- `upload.queue.resumed`
- `upload.queue.cancelled`
- `upload.queue.retried`
- `upload.queue.failed`
- `upload.queue.completed`
- `upload.queue.cleared`
- `upload.queue.session.created`
- `upload.queue.session.updated`
- `upload.queue.session.realigned`
- `upload.queue.file.started`
- `upload.queue.file.progress`
- `upload.queue.file.failed`
- `upload.queue.job.created`
- `upload.queue.job.completed`
- `knowledge.sync.requested`
- `knowledge.sync.started`
- `knowledge.sync.completed`
- `knowledge.sync.failed`

每条队列事件同时镜像到 client backend 的全局 `events.jsonl`，因此 GUI 可以继续通过
`events.subscribe` 获得上传队列变化。

## 投影状态

`upload.queue.list` 返回：

```json
{
  "ok": true,
  "state": {
    "schemaVersion": 1,
    "eventCount": 0,
    "nextOffset": 0,
    "activeTaskId": "",
    "updatedAt": "",
    "tasks": []
  }
}
```

任务投影包含 `knowledgeStatus`，取值为 `pending`、`syncing`、`synced`、`failed`。
上传任务完成后，CLI 会触发一次 `knowledge.sync`，把服务端 job/batch 生成的知识镜像回本地。

任务状态机：

```text
queued -> running -> completed
queued -> paused -> queued
running -> paused -> queued
queued|running|paused|failed|cancelled -> queued   (retry)
queued|running|paused -> cancelled
running -> failed
completed|cancelled -> cleared
```

## 恢复约束

- daemon 启动后会定期重放事件日志并处理 `queued` 任务。
- worker 以 `backend/upload-queue/worker.lock` 保证同一工作区只有一个上传执行器。
- 暂停和取消通过事件表达；worker 在分片边界、job 轮询边界检查投影状态。
- offset mismatch、chunk too large 和 sha256 mismatch 仍以服务端 checkpoint 响应为准。
- checkpoint id 不得复用于不同 manifest digest。
