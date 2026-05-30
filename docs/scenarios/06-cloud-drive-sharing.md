# Scenario 06: 云盘共享

状态：已确认场景草案

## 元数据

### 执行路线

```text
智能体 MCP -> cloud drive operation -> 身份 / workspace / 云盘授权裁决 -> 外部云盘 adapter -> 上传文件到外部云盘 -> provider receipt -> 从外部云盘下载文件 -> audit / trace / sync 状态
```

### 涉及模块

#### 接入层

- MCP 服务端入口与云盘文件工具。
- Tool Management grant、智能体调用路由和连接发现。

#### 调度层

- Operation Registry / Dispatcher。
- Cloud drive operation executor。
- 上传、下载、同步、重试和失败处理。

#### 安全治理层

- 智能体身份绑定、workspace 权限和云盘连接授权。
- 数据等级、外发策略、provider scope 和 token 保护。
- 授权过期、撤销和高风险外发审批。

#### 业务能力层

- Cloud Drive Port。
- iCloud / OneDrive / Google Drive / Dropbox adapter。
- Provider file upload / download、etag / version 和 sync 状态管理。

#### 数据与观测层

- 云盘连接配置和 secret-ref。
- Provider receipt、外部文件 ID、hash 和本地落地记录。
- Audit、Trace、Sync state 和 Report。

## 场景目标

智能体通过 Pact MCP 把文件上传到外部云盘，并能从外部云盘下载文件。Pact 必须通过云盘 adapter 处理身份授权、外部 provider receipt、同步状态和审计。

```text
智能体 MCP
-> cloud drive operation
-> 身份、workspace 与云盘授权裁决
-> 外部云盘 adapter
-> 上传文件到外部云盘
-> 从外部云盘下载文件
-> provider receipt / audit / trace
```

## 链路要求

- 云盘连接必须是受管连接，不能让智能体直接持有外部云盘 token。
- 上传前必须检查 workspace、数据等级、外发策略和目标云盘权限。
- 上传返回值必须包含 provider、外部文件 ID、路径、版本或 etag、receipt。
- 下载必须记录外部文件来源、落地位置、hash 和权限快照。
- Provider 失败、限流、断连和授权过期必须明确进入失败状态。

## 验收口径

- 智能体 MCP 可以通过受管连接上传文件到外部云盘。
- 上传后能从 provider receipt 定位外部文件。
- 智能体 MCP 可以下载有权限的外部文件。
- 未授权外发或下载会被拒绝，并在 audit / trace 中显示原因。
