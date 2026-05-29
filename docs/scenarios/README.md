# Pact Scenarios

本目录记录 Pact 从客户端入口到服务端后端实现的一条条完整链路场景。

这里的场景文档是讨论和拆分用的工作稿，不替代五份核心设计文档。场景中沉淀为长期架构、协议或生产验收口径的结论，最终必须回写到 `Architecture.md`、`PROTOCOLS.md`、`WORKSPACE-ASSET-GOVERNANCE.md`、`KNOWLEDGE-GOVERNANCE.md` 或 `PRODUCTION-CAPABILITY-GAP.md`。

## 场景定义

一个场景必须描述完整链路：

```text
客户端入口
-> 本地连接器 / GUI / CLI / MCP tool
-> 服务端 API / RPC / operation
-> 身份、权限与策略裁决
-> 业务 provider / domain runtime
-> 存储 / 外部服务 / 队列 / workflow
-> ledger / audit / checkpoint / receipt / trace / report
-> 服务端响应
-> 客户端可见结果或后续动作
```

## 当前场景

| 编号 | 场景 | 文档 |
| --- | --- | --- |
| 01 | 智能体提交代码 | [01-agent-code-submission.md](01-agent-code-submission.md) |
