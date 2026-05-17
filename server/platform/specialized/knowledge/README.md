# Knowledge Platform Layout

服务端知识库按四个能力面组织：

| 能力面 | 目录 | 输出 |
| --- | --- | --- |
| 预处理 | `preprocessing/` | 文件档案、文本抽取、结构块、切块 |
| 存储 | `storage/` | KnowledgeCore、源文件档案、语料词典、显著词读取能力 |
| 检索 | `retrieval/` | FTS、向量召回、证据门、源文件搜索 |
| 调用 | `invocation/` | 技能、蒸馏、规则编写、黄金规则运行时 |

## 数据层级

第一层是源文件建档：

- `source_document_profiles` 保存类型、来源、hash、大小、时间、路径和解析元数据。
- `source_corpus_raw_terms` 保存整个语料库级别的原始词频，只表达 `term -> frequency`，不按单个文件建词频档案。

第二层是检索索引：

- `source_document_fts` 保存标题、正文、路径、来源和元数据的 FTS5 倒排索引。
- `source_vocabulary_terms` 保存语料词典统计，包括全库词频、文档频率和 BM25 风格权重。
- `knowledge.corpus.significant_terms` 按批次、客户端、来源类型等 scope 计算 foreground/background 显著词。

第三层是分类和规则：

- 黄金规则、专家词汇库和知识分类标准只消费前两层结果。
- 文档标签属于分类结果，不写回源文件，不影响原始词频和倒排索引。
