# SplitAll Docs

本文档目录分为核心设计文档和运行支持文档。新的长期架构决策只能进入核心设计文档，避免重新扩散成多份互相漂移的设计说明。

## 核心设计文档

当前核心设计文档固定为五份：

- `Architecture.md`：软件设计说明书；总定位、设计范围、需求、系统分层、模块设计、数据模型、运行时边界和验收设计。
- `PROTOCOLS.md`：Workspace API、Operation、Tool Management、Knowledge 和协议适配边界。
- `WORKSPACE-ASSET-GOVERNANCE.md`：公共工作空间资产治理、快照、溯源、恢复、复制和安全原则。
- `KNOWLEDGE-GOVERNANCE.md`：知识证据、三层知识模型、智能体可引用上下文和知识维护闭环。
- `PRODUCTION-CAPABILITY-GAP.md`：生产能力差距、验收门禁和当前阻塞项。

## 运行支持文档

- `SERVER.md`：服务端启动、运行、协议、打包和运维说明。
- `USAGE.md`：控制台和客户端使用说明。
- `FEATURE-PROFILES.md`：feature profile 规划、裁剪和构建命令。
- `IMPLEMENTATION-DECISION-REGISTER.md`：实现前设计决策登记表；拍板后的长期结论必须回写到五份核心设计文档。
- `ENTITY-CONFIG-LAYOUT.md`：可人工维护的实体配置目录、轻量技能包和验证入口。
- `TEST-FRAMEWORK.md`：统一测试框架。
- `GIT-COLLAB.md`：本地协作约定。
- `testing/memory-and-smoke-framework.md`：记忆与 smoke 测试框架。

## 维护规则

- 不再新增横向设计文档；新设计必须合并到五份核心文档之一。
- 旧设计说明如果仍有价值，先合并为核心文档章节，再删除旧文件。
- 操作说明、命令说明、配置说明可以保留为运行支持文档，但不得承载新的架构决策。
- 生成物不进入 `docs/`。需要长期维护的图、报告或导出必须转成可审阅的 Markdown 设计或运行文档。
