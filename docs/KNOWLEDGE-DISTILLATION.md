# SplitAll 组织知识提炼 / 文档治理设计

本文档基于 2026-04-19 可获取的一手论文和官方实现，梳理当前知识蒸馏主流架构，并说明本仓库的落地方式。

在 SplitAll 的三层知识管理体系中，知识蒸馏是第三层：它只消费第二层 `KnowledgeCore` / `knowledge.search` / evidence pack 产出的权威证据，把核心信息压缩成运行时背景、工作空间上下文、摘要和候选治理资产。蒸馏结果是有损的，可能引入选择性遗漏、概括偏差或模型幻觉，因此不能替代第二层全量查询，也不能直接覆盖 canonical evidence。

## 主流架构

### 1. 经典离线蒸馏

- `DistilBERT`：预训练阶段联合语言模型损失、蒸馏损失和余弦距离损失，把大模型压缩到更小 student。
  来源：https://arxiv.org/abs/1910.01108
- `MiniLM / MiniLMv2`：蒸馏 self-attention 结构与 attention relation，强调 task-agnostic 压缩。
  来源：https://arxiv.org/abs/2002.10957
  官方实现：https://github.com/microsoft/unilm/tree/master/minilm

这类方法的特点：

- teacher / student 同时可见
- 训练数据多为静态样本
- 更适合白盒模型压缩

### 2. 上下文蒸馏

- `Learning by Distilling Context`：把提示词、scratchpad、示例等上下文收益“内化”到模型参数。
  来源：https://arxiv.org/abs/2209.15189

这类方法的特点：

- 不只是学输出，还要学“带上下文时的能力”
- 很适合把复杂提示模板内化成更稳定的推理行为

### 3. 生成式 / LLM 蒸馏

- `PromptKD`：通过 prompt tuning 让 teacher 产出更适合 student 学习的知识。
  来源：https://arxiv.org/abs/2402.12842
- `Distil-Whisper`：大规模伪标注 + 质量过滤 + KL/Cross-Entropy 联合训练。
  来源：https://arxiv.org/abs/2311.00430
  官方实现：https://github.com/huggingface/distil-whisper

这类方法的特点：

- 伪标注质量过滤非常关键
- prompt 设计和数据清洗本身就是蒸馏质量的上限

### 4. On-Policy Distillation

- `GKD / On-Policy Distillation of Language Models`：student 在自己的轨迹上生成，teacher 在 student 访问到的状态上给反馈，解决 exposure bias。
  来源：https://arxiv.org/abs/2306.13649
- `Black-Box On-Policy Distillation of Large Language Models (GAD)`：teacher 只有文本输出时，用对抗式判别器实现黑盒 on-policy 蒸馏。
  来源：https://arxiv.org/abs/2511.10643
- `Self-Distilled Reasoner (OPSD)`：teacher / student 是同一个模型的不同上下文视角，teacher 看 privileged context，student 只看问题。
  来源：https://arxiv.org/abs/2601.18734
  官方实现：https://github.com/siyan-zhao/OPSD
- `G-OPD / ExOPD`：把 OPD 解释为 KL 约束 RL，并加入 reward scaling 与 reference model。
  来源：https://arxiv.org/abs/2602.12125
  官方实现：https://github.com/RUCBM/G-OPD
- `Rethinking OPD`：指出 OPD 成功依赖 compatible thinking pattern、冷启动和 teacher-aligned prompt selection。
  来源：https://arxiv.org/abs/2604.13016
  官方实现：https://github.com/thunlp/OPD

截至 2026-04-19，前沿焦点已经明显转向：

- `off-policy cold start`
- `on-policy/self-distillation`
- `teacher-aligned prompt selection`
- `reward / KL 重新加权`
- `黑盒 teacher` 条件下的稳定蒸馏

## 本项目的本地复刻

本仓库不是训练框架，而是一个文档处理与知识生成系统。当前需求也很明确：**不训练模型，不额外塞 student/teacher，本地只用算法或显式启用的智能体完成组织知识提炼 / 文档治理沉淀**。

因此当前落地方式是第三层**证据约束的组织知识提炼**：

1. `evidence selection`
   只从第二层 evidence pack、hierarchy、sourceTrace 和 citations 中选择输入，不直接读取 raw object、job 目录或连接器远端数据。
2. `fact extraction`
   抽取组织事实、知识资产、治理决策、依赖关系、风险和时间线线索，但保留 evidenceRefs。
3. `pattern mining`
   抽取反复出现的治理模式、维护习惯、核验动作、依赖模式和避坑模式。
4. `knowledge packaging`
   把事实和模式组装成运行时背景资产：主题摘要、知识地图、治理规则候选、维护 SOP、责任网络、未完事项和 governance card。
5. `residual coverage recovery`
   仅在 `frontier` 模式下，对未覆盖的高分 evidence 做补偿提炼。
6. `coverage analysis`
   最终把结果回对齐到 evidenceRefs / chunkIds，计算覆盖率、未引用结论、冲突和待补证项。

## 代码位置

当前主线已经切到新的服务端与薄客户端架构。第三层相关实现归入 `server/platform/specialized/knowledge/invocation/knowledge-distillation-runtime`、`knowledge-summarization-runtime`、`knowledge-evolution-runtime`、`ContextRuntime` 和 `AgentWorkspace` 等运行时。它们必须通过第二层 `knowledgeBase` mount / `splitall.knowledge.v1` 读取 evidence，不允许直接耦合 KnowledgeCore SQLite、资产目录或第一层 raw object。

## 当前输出结构

组织知识结果包含：

- `executiveSummary`
- `facts`
- `patterns`
- `knowledgeTimeline`
- `knowledgeMap`
- `governanceRules`
- `maintenanceProcedures`
- `responsibilityNetwork`
- `openContexts`
- `governanceCard`
- `metabolism`
- `coverage`
- `architecture`

其中 `architecture` 会记录当前本地复刻采用的提炼路径：

- `standard`：组织事实提取 + 治理模式提取 + 知识包组装 + 覆盖率分析
- `frontier`：在 `standard` 基础上增加未覆盖块补偿提炼、责任关系推断和治理画像归纳

所有输出都必须保留 `evidenceRefs`、`citations`、`sourceTrace` 和 `coverage`。面向工作空间和上下文运行时的 distilled background 可以被直接消费；面向规则、实体、关系或分类法的输出只能作为候选进入审核，不能自动写入 canonical knowledge。

## 为什么这样做

因为对 SplitAll 这类系统，真正需要被第三层“蒸馏”的不是模型参数本身，也不是第二层可查询索引本身，而是：

- 原始材料中的组织事实和隐性上下文
- 规则切分后材料里的结构信号
- 第一轮知识索引 / 问答中的冗余、重复和偏差
- 长任务、工作空间和上下文运行时不适合每次全量检索的背景信息

把前沿蒸馏研究映射到本系统，最合理的做法不是训练一个新 student 模型，而是：

- 用事实提取恢复“有哪些知识资产、规则、依赖和风险”
- 用模式提取恢复“哪些治理动作是默认要求”
- 用知识包装恢复“哪些材料、责任和未闭环事项需要持续维护”
- 用本地去重和 chunk 对齐充当“质量过滤器”
- 用 evidenceRefs、coverage 和审核状态阻止有损摘要被误认为权威事实

这与最新 OPD 文献强调的几个方向是一致的，但实现方式更贴合资源紧缺场景：

- 不要只做静态离线压缩
- 要关注覆盖率和纠偏
- 要有稳定的质量过滤
- 在 black-box teacher 不可常驻、本地资源紧缺时，优先采用轻量算法而不是额外模型

## 与知识代谢的关系

当前仓库把第三层内部的“知识提炼”和“知识代谢”拆成两个职责：

- `distillation.mjs` 负责把材料压成组织知识资产
- `knowledge-metabolism.mjs` 负责给这些资产补生命周期、时间权重、待复核和历史参考分层

也就是说，第三层结果不仅会告诉你“提炼出了什么知识”，还会告诉你“这些知识现在还能不能作为上下文背景使用”。这仍然不改变三层边界：第二层 `knowledge.search` 是权威查询面，第三层蒸馏和代谢只提供有损运行时背景与候选审核材料。
