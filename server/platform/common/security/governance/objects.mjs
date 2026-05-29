import { SECURITY_GOVERNANCE_OBJECT_IDS } from "./security-governance-constants.mjs";

export const SECURITY_GOVERNANCE_OBJECTS = Object.freeze([
  {
    id: SECURITY_GOVERNANCE_OBJECT_IDS.IDENTITY_ADMISSION_AUTHENTICATION,
    label: "身份与准入认证",
    question: "谁或什么可以进入边界，身份是否可信。",
    outcome: "建立终端智能体、用户、设备、provider account、凭据和租户映射的可信上下文。"
  },
  {
    id: SECURITY_GOVERNANCE_OBJECT_IDS.PERMISSION_BEHAVIOR_POLICY,
    label: "权限与行为策略",
    question: "允许做什么、禁止做什么、需要什么确认。",
    outcome: "把身份上下文、请求意图、Capability、资源范围、风险级别和外部副作用统一到执行前裁决。"
  },
  {
    id: SECURITY_GOVERNANCE_OBJECT_IDS.DATA_STATE_SEMANTICS,
    label: "数据与状态语义",
    question: "数据是什么状态、是否真的保存、是否只是引用、是否可以恢复。",
    outcome: "防止把 queued、cached、projected、contractVerified 误说成 archived、committed 或 synced。"
  },
  {
    id: SECURITY_GOVERNANCE_OBJECT_IDS.TRAFFIC_RESOURCE_MANAGEMENT,
    label: "流量与资源管理",
    question: "能用多少、什么时候用、失败后如何退避。",
    outcome: "保护平台运行时、终端智能体、应用服务器、预算和用户体验。"
  },
  {
    id: SECURITY_GOVERNANCE_OBJECT_IDS.AUDIT_FACT_VERIFICATION,
    label: "审计与事实验证",
    question: "事后如何证明、如何复查、如何追踪责任。",
    outcome: "让每个跨边界行为都可解释、可复查、可统计，并能关联到对应状态变化。"
  }
]);
