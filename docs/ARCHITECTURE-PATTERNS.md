# SplitAll 架构设计模式说明

本文记录服务端当前采用的工程模式，目标是让代码边界清晰、运行状态可观测、变更可验证。

## 组合根

`server/platform/interactive/composition-root.mjs` 是服务端的组合根。

它负责创建并连接以下对象：

- 平台注册表
- 运行时配置与运行时实例
- 控制台鉴权
- 操作审计
- 协议事件总线
- 存储、模块、运维等底层平台注册项
- 可用操作列表与功能运行状态

HTTP 入口只使用组合根返回的能力，不直接创建底层服务。这样启动装配集中在一个地方，接口层只关心请求处理。

## 注册表

`server/platform/interactive/platform-registry.mjs` 是平台能力注册表。

底层平台把能力注册到统一入口，产品层通过注册表读取能力。注册表限制可注册的平台类型，并拒绝重复注册，从结构上减少横向引用和隐式依赖。

## Facade

`server/platform/interactive/product-api.mjs` 是产品层访问底层平台的 Facade。

产品代码不直接穿透到底层目录，而是通过 Facade 使用状态写入、路径校验、运行时日志、操作分发、统一注册等能力。这样产品代码可以保持稳定，底层实现可独立演进。

## Strategy

功能运行配置和操作过滤使用 Strategy 思路：启动时解析当前 profile，再把操作、面板、脚本等运行能力映射为活跃集合。调用方只面对解析后的结果，不需要知道具体选择过程。

## Provider Registry

`server/platform/interactive/server-runtime-providers.mjs` 管理可选运行时的创建。

HTTP 入口把当前运行状态、依赖和能力判断传入 Provider Registry，由它决定需要创建哪些运行时服务。新增运行时服务时，应扩展 provider 注册逻辑，而不是继续扩张 HTTP 入口。

## Adapter

外部模块、知识库、向量库、图谱库、解析器、连接器都应以 Adapter 形式接入。Adapter 负责把外部能力转换为 SplitAll 内部稳定接口，避免外部协议渗透到核心流程。

## Observer

协议事件总线和系统状态订阅使用 Observer 思路。配置、队列、报警、接口目录、发现状态等变化通过事件发布，控制台和后台流程按 topic 消费。

## State Machine

工作队列、上传 checkpoint、报警恢复、连接器同步、巡检流程都应按状态机建模。状态转换需要有明确输入、持久化记录和审计事件，避免只靠内存变量判断运行情况。

## Policy

权限、工具授权、接口过滤、风险审批、来源可信度等规则采用 Policy 模式。业务流程只询问裁决结果，具体策略可以独立测试和替换。

## Agent capability baseline

`docs/AGENT-CAPABILITY-AUDIT.md` 是知识库、工具链和上下文管理主线的能力审计基线。它把 OpenCode、LangChain Deep Agents、OpenClaw 和 Hermes Agent 的公开源码/官方文档模式映射到本仓库的 `AgentWorkspace`、`ContextRuntime`、`AgentGateway`、`Tool Management`、`AgentMemory`、知识检索质量回放和 runtime mount 热插拔实现。

这份审计只允许作为模式对照，不允许复制外部项目代码。新增智能体、上下文、工具或知识库能力时，必须补充本仓库的可验证 artifact，而不是只写外部项目名或概念描述。

## Knowledge governance baseline

`docs/KNOWLEDGE-ARCHITECTURE-GOVERNANCE.md` 是知识库模块的架构治理基线。它把 `knowledgeBase` mount、`splitall.knowledge.v1`、`SERVER_API_OPERATIONS`、Tool Management v1、前端功能注册表和浏览器视觉检查串成一条可验证链路，并明确知识库必须满足七大设计原则。

新增或调整知识库能力时，应同步更新协议、注册表、前端覆盖和验证脚本，避免后端能力、工具目录和控制台页面脱节。

## 架构校验

`npm run server:verify:architecture-patterns` 会检查：

- HTTP 入口必须通过组合根创建服务端运行对象。
- HTTP 入口不得直接装配平台服务。
- 组合根必须拥有平台注册、鉴权、审计、事件总线、运行时和操作过滤的装配职责。
- HTTP 入口必须通过 Provider Registry 创建可选运行时服务。
- Agent 能力审计必须引用外部对照项目，并映射到本仓库的知识库、工具链和上下文管理 artifact。
- 知识库治理基线必须存在，并通过 `npm run server:verify:knowledge-architecture-governance` 单独校验。

`npm run server:verify:platform-layout` 会继续检查平台层、产品层和交互层的目录边界。
