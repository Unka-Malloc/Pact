import { SECURITY_ENVIRONMENT_IDS } from "./security-governance-constants.mjs";

export const SECURITY_ENVIRONMENTS = Object.freeze([
  {
    id: SECURITY_ENVIRONMENT_IDS.CLIENT_RUNTIME,
    label: "客户端运行环境",
    role: "Pact 之外、主动向 Pact 发起操作的一侧。",
    typicalComponents: Object.freeze([
      "本地智能体",
      "MCP connector",
      "HTTP/stdio MCP client",
      "pact-client runtime",
      "local bridge",
      "上传队列"
    ])
  },
  {
    id: SECURITY_ENVIRONMENT_IDS.PACT_PLATFORM,
    label: "Pact 平台环境",
    role: "安全治理中心，负责 Operation、Capability 裁决、状态提交、审计证据和恢复事实。",
    typicalComponents: Object.freeze([
      "MCP service",
      "Workspace API",
      "Capability Kernel",
      "Binding Guard",
      "SecretStore",
      "Operation Ledger",
      "Audit",
      "Checkpoint Tree"
    ])
  },
  {
    id: SECURITY_ENVIRONMENT_IDS.EXTERNAL_SERVICE,
    label: "外部服务环境",
    role: "Pact 之外、被 Pact 调用或向 Pact 回调的 provider 环境。",
    typicalComponents: Object.freeze([
      "模型 provider",
      "GitHub/Gerrit",
      "云盘",
      "外部知识库",
      "向量库",
      "图数据库",
      "邮箱",
      "业务系统"
    ])
  }
]);
