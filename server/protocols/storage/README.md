# server/protocols/storage

本目录记录 Node.js 核心服务与持久化层之间的协议。

边界：

- SQLite 是服务端元数据真相源。
- 检索入口只能是 SQLite / 知识库协议索引，不能直接扫描 manifest 或 `objects/`。
- raw object 保留原始文件名和原始内容，不做破坏性改写。
- raw object 与知识元数据使用 `archiveBatchId` 作为归档批次；`jobId` 只表示服务端处理任务。
- raw object 落盘维度固定为 `objects/<ClientUID>/<SourceType>/<OriginalFileName>__<ArchiveBatchId>.<ext>`；客户端显式传入的归档批次 ID 必须与服务端使用的 `archiveBatchId` 保持一致。
- 服务端分析、检索、审计需要的字段必须存入 SQLite 或 manifest，不能追加写入 raw object 源文件。
- job snapshot 用于恢复、回放、排障和元数据库重建。
- normalized documents 是面向外部知识库摄取的交付物。

协议范围：

- SQLite schema 与迁移规则
- batch / source / raw object / message / thread / transaction / people 元数据
- lineage、retrieval index、FTS 和删除协调状态
- raw object 路径、hash、byteSize 和审计字段
- jobs `<jobId>/meta.json`、`payload.json`、`result.json`
- normalized documents manifest 和下载映射
- reconcile、doctor、metadata rebuild 的输入输出语义

原则：

- 存储协议必须可审计、可恢复、可重建。
- 对象内容不应被静默篡改。
- schema 或 manifest 破坏兼容时必须写明迁移和回滚策略。

## 元数据与 Manifest 关系

| 记录位置 | 权威职责 | 可用于检索 | 不允许承担的职责 |
| --- | --- | --- | --- |
| `metadata/splitall.sqlite` | batch、source、raw object、message、thread、transaction、people、timeline、retrieval/FTS、删除协调状态 | 是 | 不存原始文件字节 |
| `upload-sessions/<sessionId>/meta.json` | 上传会话、分块 offset、sha256/byteSize 校验、断点续传状态 | 否 | 不作为长期索引，不作为业务检索入口 |
| job 的 `checkpointReceipt` | 创建 job 时的服务端凭证，证明 upload session 已完成校验 | 否 | 不作为文件归档目录，不作为检索元数据源 |
| `jobs/<jobId>/result.json` | 任务结果快照、回放、排障、SQLite 重建输入 | 否，正常在线检索不读它 | 不与 SQLite 竞争权威元数据 |
| `objects/<ClientUID>/<SourceType>/<FileName>` | 客户端上传的原始文件字节 | 否 | 不存搜索字段、审计字段或服务端补充字段 |

检索链路必须固定为：

```text
查询请求
  -> SQLite retrieval / FTS / knowledge index
  -> 命中 source/raw object 元数据
  -> 需要原文时按 raw_mail_objects.storage_rel_path 读取 objects 文件
```

`upload session manifest`、`checkpoint receipt` 和 `job result manifest` 只能用于上传恢复、任务恢复、排障和元数据库重建。它们可以冗余少量校验字段，但不能成为第二套检索索引。

## Manifest 最小字段原则

- session 级字段：`sessionId`、`checkpointId`、`archiveBatchId`、`clientUid`、`sourceType`、`providerId`、`externalId`、`syncBatchId`、`contentHash`、`capturedAt`、`manifestDigest`、`inputDigest`、`status`、时间戳。
- session file 级字段：`index`、服务端 token 文件名、`originalFileName`、`clientUid`、`sourceType`、`providerId`、`externalId`、`syncBatchId`、`contentHash`、`capturedAt`、`sourceMetadata`、`sha256`、`byteSize`、`receivedBytes`、`completedAt`。混合来源上传时，file 级来源字段覆盖 session 级默认值。
- job result 中的 source 只应保留 `rawObjectId` 或 `rawObjectRef` 级引用；正式的 `clientUid/sourceType/archiveFileName/storageRelativePath` 以 SQLite `raw_mail_objects` 为准。
- normalized documents 的 `manifest.json` 只描述 DOCX 和允许输出的 source material 下载映射，不参与 raw object 检索。

## 多源来源字段

服务端统一接收客户端连接器、本地目录、Mail 导入和知识镜像传入的来源字段：

- `clientUid`：客户端全局唯一标识。
- `sourceType`：客户端提交的资源类型，如 `mail`、`file`、`chat`、`knowledge`。
- `providerId`：来源应用或连接器，如 `gmail`、`google-drive`、`slack`。
- `externalId`：来源系统中的对象 ID，如邮件 ID、网盘文件 ID、聊天消息 ID。
- `syncBatchId`：客户端同步批次；创建服务端 upload session 时必须作为 `archiveBatchId/clientBatchId` 的来源，保证客户端和服务端批次一致。
- `contentHash`：来源对象内容 hash；未提供时服务端使用原始文件 sha256。
- `capturedAt`：客户端捕获或同步该对象的可信时间。
- `sourceMetadata`：只存结构化定位信息和连接器辅助字段，不存 OAuth token、cookie、密钥或源文件正文。

这些字段写入 `raw_mail_objects`、`source_files` 和 KnowledgeCore evidence；`objects/<ClientUID>/<SourceType>/...` 中的源文件字节保持与客户端上传内容完全一致。
