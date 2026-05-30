# Scenario 04: 工作空间文件传输

状态：已确认场景草案

## 元数据

### 执行路线

```text
智能体 MCP -> workspace file operation -> 身份与 workspace 权限裁决 -> 上传会话 / 文件写入 -> 服务端工作空间文件夹 -> 文件元数据 / receipt -> 工作空间文件下载 -> audit / checkpoint / trace
```

### 涉及模块

#### 接入层

- MCP 服务端入口与 `pact.sharedspace` / workspace 文件工具。
- Tool Management grant、能力发现和智能体调用路由。

#### 调度层

- Operation Registry / Dispatcher。
- Workspace runtime operation executor。
- 上传会话、下载响应和失败重试。

#### 安全治理层

- 智能体身份绑定、用户 / workspace 权限裁决。
- 数据等级、路径约束和外发策略。
- 高风险覆盖、删除或下载审批。

#### 业务能力层

- Agent Workspace。
- Workspace file metadata、upload session、download operation。
- Workspace governance、checkpoint 和文件生命周期管理。

#### 数据与观测层

- 服务端 workspace 文件夹。
- Metadata store、raw object / file receipt。
- Audit、Checkpoint、Trace 和 Report。

## 场景目标

智能体通过 Pact MCP 上传文件到服务端工作空间文件夹，并能从工作空间下载文件。Pact 必须完成身份绑定、workspace 权限裁决、文件写入、元数据记录、下载授权和审计。

```text
智能体 MCP
-> workspace file operation
-> 身份与 workspace 权限裁决
-> 服务端工作空间文件夹
-> 文件元数据 / receipt
-> 工作空间文件下载
-> audit / checkpoint / trace
```

## 链路要求

- 上传必须落到受管 workspace 文件夹，不得写入任意服务端路径。
- 下载必须受 workspace、文件权限和数据等级约束。
- 上传返回值必须包含 workspaceId、文件路径、大小、hash、receipt 和可查询元数据。
- 覆盖、删除、移动、重命名等后续行为必须进入同一 workspace 治理链路。
- 大文件、失败重试和断点续传应复用统一上传会话和 checkpoint 机制。

## 验收口径

- 智能体 MCP 上传后，服务端工作空间文件夹存在对应文件。
- 管控台或 API 能看到该文件的元数据。
- 智能体 MCP 可以下载有权限的文件，不能下载无权限文件。
- 上传、下载、拒绝和失败均有 audit / checkpoint / trace。
