import { SECURITY_ENVIRONMENT_IDS } from "./security-governance-constants.mjs";

export const SECURITY_ENVIRONMENTS = Object.freeze([
  {
    id: SECURITY_ENVIRONMENT_IDS.TERMINAL_AGENT,
    label: "终端智能体",
    role: "平台运行时之外、通过客户端 MCP 入口主动发起操作的一侧。",
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
    id: SECURITY_ENVIRONMENT_IDS.PLATFORM_RUNTIME,
    label: "平台运行时",
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
    id: SECURITY_ENVIRONMENT_IDS.APPLICATION_SERVER,
    label: "应用服务器",
    role: "平台运行时之外、通过服务端 API 出口被调用、写入、同步或回调的一侧。",
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
