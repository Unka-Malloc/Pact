# Scenario 08: 操作审核

状态：已确认场景草案

## 元数据

### 执行路线

```text
智能体 MCP 请求 -> Pact MCP 网关 -> 高危行为识别 -> 主页审批流 pending item -> 用户 / 管理员审批 -> 审批通过后恢复原请求并放行 -> 业务 operation 执行 -> 拒绝 / 超时 / 放行审计
```

### 涉及模块

#### 接入层

- Pact MCP 网关。
- 智能体 MCP 请求入口、主页审批流入口和 completion reply。

#### 调度层

- Operation Registry / Dispatcher。
- Approval operation executor。
- Pending request 挂起、恢复、超时和放行调度。

#### 安全治理层

- 高危行为识别、risk policy 和 operation policy。
- Authorization Governance approval store。
- 用户 / 管理员审批权限、撤销和过期策略。

#### 业务能力层

- 被拦截的原始 MCP tool / operation。
- 主页审批流、审批项状态机和审批结果回写。
- 审批通过后的原请求恢复执行。

#### 数据与观测层

- Approval record、pending operation state 和 decision receipt。
- Audit、Trace、Report 和拒绝 / 超时记录。
- 智能体响应与管控台状态同步。

## 场景目标

智能体 MCP 请求进入 Pact 平台的 MCP 网关后，所有高危行为都必须被拦截并提交到主页审批流。审批通过后，Pact 才能放行智能体操作；拒绝或超时必须终止操作。

```text
智能体 MCP 请求
-> Pact MCP 网关
-> 高危行为识别
-> 主页审批流
-> 用户 / 管理员审批
-> 审批通过后放行智能体操作
-> 拒绝 / 超时 / 放行审计
```

## 链路要求

- 高危行为识别必须发生在 MCP 网关层，不能等业务 provider 已执行后再补记。
- 审批项必须出现在主页审批流，包含主体、动作、目标、风险原因、权限上下文和过期时间。
- 审批通过后必须恢复原始智能体操作，并保留原请求上下文。
- 审批拒绝、过期、撤销必须阻止操作继续执行。
- 放行结果必须回写给智能体 MCP，并对管控台可见。

## 验收口径

- 高危 MCP 请求默认被拦截，不会直接执行。
- 主页出现可审批的 pending item。
- 审批通过后，原智能体操作继续执行并返回结果。
- 拒绝或超时后，智能体收到明确失败，业务副作用不发生。
- 拦截、审批、放行和拒绝均可在 audit / trace 中查询。
