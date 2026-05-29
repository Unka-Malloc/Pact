import {
  SECURITY_BOUNDARY_IDS,
  SECURITY_ENVIRONMENT_IDS
} from "./security-governance-constants.mjs";

export const SECURITY_BOUNDARIES = Object.freeze([
  {
    id: SECURITY_BOUNDARY_IDS.CLIENT_MCP_INGRESS,
    label: "客户端 MCP 入口",
    shortLabel: "客户端 MCP 入口",
    fromEnvironmentId: SECURITY_ENVIRONMENT_IDS.TERMINAL_AGENT,
    toEnvironmentId: SECURITY_ENVIRONMENT_IDS.PLATFORM_RUNTIME,
    governanceScope: "面向客户端 MCP 入口的治理",
    trustAssumption: "终端智能体是部分可信或不可信环境；通过客户端 MCP 入口进入平台运行时的声明必须被重新验证。"
  },
  {
    id: SECURITY_BOUNDARY_IDS.SERVER_API_EGRESS,
    label: "服务端 API 出口",
    shortLabel: "服务端 API 出口",
    fromEnvironmentId: SECURITY_ENVIRONMENT_IDS.PLATFORM_RUNTIME,
    toEnvironmentId: SECURITY_ENVIRONMENT_IDS.APPLICATION_SERVER,
    governanceScope: "面向服务端 API 出口的治理",
    trustAssumption: "应用服务器是平台运行时管控之外的系统；服务端 API 出口返回的状态必须被校验、归一化、登记和审计。"
  }
]);
