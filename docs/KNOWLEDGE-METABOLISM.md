# SplitAll 知识代谢管理设计

本文档说明 SplitAll 当前如何在现有结果管线里落地“知识保鲜 / 衰减 / 归档 / 待复核”，以及后续接企业级知识库时的扩展方向。

## 目标

知识代谢管理要解决 4 件事：

1. 给每个知识条目补齐时间维度。
2. 区分哪些知识还能作为正式来源，哪些只能当历史参考。
3. 自动产出待复核清单，而不是把过期知识静默混进回答。
4. 为后续向量检索 / 图谱检索保留可直接接入的字段。

## 当前实现

当前仓库还没有独立的跨批次知识库后端，因此本次实现先把代谢能力落在**单次任务结果**里，做到结果可见、可导出、可验证。

### 1. 来源时间元数据

当前受维护主线里，`server/platform/specialized/knowledge/file-processor/index.mjs` 会在读取材料时附加：

- `sourceCreatedAt`
- `sourceUpdatedAt`
- `sourceCollectedAt`

本地文件优先使用文件系统的 `birthtime / mtime`；浏览器上传和粘贴文本没有可靠来源时间时，退回到本次任务的采集时间。

这些时间会继续传到 chunk 和任务结果。

### 2. 生命周期计算

历史旧实现路径已经移除；当前文档仅保留这套设计思路。

- 知识文档 `documents`
- 问答对 `qaPairs`
- 组织知识资产 `facts / patterns / knowledgeTimeline / knowledgeMap / governanceRules / maintenanceProcedures / responsibilityNetwork / openContexts`

每个条目都会附加：

- `createdAt`
- `lastUpdatedAt`
- `lastVerifiedAt`
- `validUntil`
- `reviewDueAt`
- `status`
- `decayProfile`
- `reviewCycleDays`
- `ageDays`
- `timeWeight`
- `formalUseAllowed`
- `signals`

当前状态分为：

- `ACTIVE`
- `REVIEW_DUE`
- `DEPRECATED`
- `ARCHIVED`

### 3. 衰减策略

当前本地策略是启发式但可解释的：

- `fast`：版本、审批状态、日期、名单、模板、系统入口这类高频变化知识
- `normal`：普通业务知识
- `slow`：原则、制度、职责、归档规范、稳定流程

默认复核周期：

- `fast` -> `30` 天
- `normal` -> `90` 天
- `slow` -> `180` 天

如果文本里已经明确写了 `每周 / 每月 / 每季度 / 每年`，会优先用显式周期。

时间权重使用指数半衰：

```text
timeWeight = exp(-ln(2) * ageDays / reviewCycleDays)
```

这不是“训练出来的时效模型”，而是一个足够轻、能解释、能落到检索排序里的本地算法。

### 4. 正式来源与历史参考

当前规则是：

- `ACTIVE`：可作为正式来源
- `REVIEW_DUE`：进入待复核清单，默认不当正式来源
- `DEPRECATED / ARCHIVED`：降到历史参考区

因此本地结果会新增 `distillation.metabolism`：

- `summary`
- `policy`
- `formalSources`
- `reviewQueue`
- `expiringSoon`
- `historicalReferences`

这组数据曾经接入结果页、导出与联调脚本；当前仓库只保留相关设计记录。

## 当前边界

这次实现故意没有伪装成“完整企业知识库后端”。当前仍然缺这 3 件基础设施：

1. 跨任务持久化知识仓
   现在结果按 job 存在 `jobs/<id>/result.json`，还没有独立的知识主表。

2. 时间加权检索执行层
   当前已经有 `timeWeight` 和 `status`，但还没有独立的 `/api/search` 或向量检索服务。

3. 人工复核闭环
   系统已经能生成待复核清单，但还没有“确认继续有效 / 降级归档 / 替换新版本”的操作流。

## 下一步如何扩展

如果后续要把单次任务结果扩成企业级记忆系统，建议按这个顺序推进：

### 1. 独立知识主表

把当前结果里的知识资产拆出来，存成可复用记录，至少保留：

- `knowledge_id`
- `asset_type`
- `source_ids`
- `chunk_ids`
- `created_at`
- `last_updated_at`
- `last_verified_at`
- `valid_until`
- `status`
- `time_weight`
- `version`

### 2. 检索路由

在检索层把规则明确化：

- 正式回答：只取 `ACTIVE`
- 历史回答：允许 `DEPRECATED / ARCHIVED`
- 混合检索：`semantic_score * time_weight`

### 3. 复核工作流

让业务侧能处理：

- 保持有效
- 需要更新
- 降为归档
- 已被新版本替代

## 相关资料

这些资料直接影响了本次实现方式：

- LangChain Time-Weighted Retriever
  https://docs.langchain.com/oss/javascript/integrations/retrievers/time-weighted-retriever
- LlamaIndex Fixed Recency Postprocessor
  https://docs.llamaindex.ai/en/stable/api_reference/postprocessor/fixed_recency/
- LlamaIndex Recency Filtering Demo
  https://docs.llamaindex.ai/en/v0.12.15/examples/node_postprocessor/RecencyPostprocessorDemo/
- Elasticsearch date decay functions
  https://www.elastic.co/docs/reference/query-languages/query-dsl/query-dsl-script-score-query
- Qdrant datetime payload and filtering
  https://qdrant.tech/documentation/concepts/payload/
  https://qdrant.tech/documentation/concepts/filtering/
- Generative Agents
  https://arxiv.org/abs/2304.03442

这些资料共同说明了一件事：时间衰减不应该只停留在文档字段里，而应该进入检索排序、状态分层和人工复核流程。
