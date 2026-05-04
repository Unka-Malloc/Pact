# server/protocols/storage

本目录记录 Node.js 核心服务与持久化层之间的协议。

边界：

- SQLite 是服务端元数据真相源。
- raw object 保留原始文件名和原始内容，不做破坏性改写。
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
