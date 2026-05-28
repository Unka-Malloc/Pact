import {
  SECURITY_BOUNDARY_IDS,
  SECURITY_ENVIRONMENT_IDS
} from "./security-governance-constants.mjs";

export const SECURITY_BOUNDARIES = Object.freeze([
  {
    id: SECURITY_BOUNDARY_IDS.CLIENT_RUNTIME_PACT_PLATFORM,
    label: "客户端运行环境与 Pact 平台之间的边界",
    shortLabel: "客户端边界",
    fromEnvironmentId: SECURITY_ENVIRONMENT_IDS.CLIENT_RUNTIME,
    toEnvironmentId: SECURITY_ENVIRONMENT_IDS.PACT_PLATFORM,
    governanceObject: "面向客户端的治理",
    trustAssumption: "客户端运行环境是部分可信或不可信环境；客户端声明必须由 Pact 重新验证。"
  },
  {
    id: SECURITY_BOUNDARY_IDS.EXTERNAL_SERVICE_PACT_PLATFORM,
    label: "外部服务与 Pact 平台之间的边界",
    shortLabel: "外部服务边界",
    fromEnvironmentId: SECURITY_ENVIRONMENT_IDS.PACT_PLATFORM,
    toEnvironmentId: SECURITY_ENVIRONMENT_IDS.EXTERNAL_SERVICE,
    governanceObject: "面向外部服务的治理",
    trustAssumption: "外部服务是 Pact 管控之外的系统；provider 返回状态必须被校验、归一化、登记和审计。"
  }
]);
