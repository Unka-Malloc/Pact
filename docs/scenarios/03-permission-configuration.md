# Scenario 03: 权限配置

状态：已确认场景草案

## 元数据

### 执行路线

```text
管控台权限入口 -> authorization governance operation -> 权限策略持久化 -> 上游 / 下游网关策略刷新 -> 智能体 MCP grant / key 权限刷新 -> 网关拦截验证 -> audit / trace / receipt
```

### 涉及模块

#### 接入层

- 管控台权限配置页。
- Frontend bridge、HTTP API 和 operation 调用入口。

#### 调度层

- Operation Registry / Dispatcher。
- Console Domain Operation Executor。
- 策略刷新、缓存失效和结果回执。

#### 安全治理层

- Console Auth、用户 / 团队 / 角色管理。
- Authorization Governance Store。
- Tool Management grant、MCP key / token 权限和风险策略。

#### 业务能力层

- 权限策略编辑、校验、版本化和持久化。
- 上游 / 下游网关策略同步。
- 智能体能力目录刷新和权限解释。

#### 数据与观测层

- 权限策略 store、grant store 和 approval store。
- 拦截记录、policy decision receipt。
- Audit、Trace、Report 和安全事件。

## 场景目标

用户从管控台入口更新权限配置。Pact 必须把配置变更持久化，并让上下游网关拦截策略和智能体 MCP 密钥权限刷新生效。

```text
管控台入口
-> authorization governance operation
-> 权限策略持久化
-> 上游 / 下游网关策略刷新
-> 智能体 MCP grant / key 权限刷新
-> 拦截验证
-> audit / trace / receipt
```

## 链路要求

- 管控台必须能配置用户、团队、智能体、智能体分组、tool grant、workspace 和外部服务权限。
- 权限更新必须生成可追溯的策略版本或 receipt。
- 上下游网关必须读取新的策略版本，不能继续用旧缓存放行。
- 智能体 MCP 密钥或 grant 的有效权限必须在配置变更后刷新。
- 刷新失败时必须返回明确失败状态，不能静默成功。

## 验收口径

- 修改权限后，同一智能体 MCP 请求的放行 / 拒绝结果发生预期变化。
- 网关拦截记录能显示使用了新的策略版本。
- MCP grant / key 的权限解释能显示刷新后的 scope / toolset。
- 权限变更、刷新、拦截结果都能在 audit / trace 中查询。
