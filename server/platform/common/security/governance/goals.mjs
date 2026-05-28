import { SECURITY_GOVERNANCE_GOAL_IDS } from "./security-governance-constants.mjs";

export const SECURITY_GOVERNANCE_GOALS = Object.freeze([
  {
    id: SECURITY_GOVERNANCE_GOAL_IDS.ADMISSION_IDENTITY_TRUST,
    label: "准入与身份信任",
    question: "谁或什么可以进入边界。",
    outcome: "建立调用者、客户端、设备、provider account、凭据和租户映射的可信上下文。"
  },
  {
    id: SECURITY_GOVERNANCE_GOAL_IDS.PERMISSION_BEHAVIOR_POLICY,
    label: "权限与行为策略",
    question: "允许做什么、禁止做什么、需要什么确认。",
    outcome: "把身份上下文、请求意图、Capability、资源范围、风险级别和外部副作用统一到执行前裁决。"
  },
  {
    id: SECURITY_GOVERNANCE_GOAL_IDS.DATA_STATE_SEMANTICS,
    label: "数据与状态语义",
    question: "数据是什么状态、是否真的保存、是否只是引用、是否可以恢复。",
    outcome: "防止把 queued、cached、projected、contractVerified 误说成 archived、committed 或 synced。"
  },
  {
    id: SECURITY_GOVERNANCE_GOAL_IDS.TRAFFIC_RESOURCE_COST,
    label: "流量、资源与成本控制",
    question: "能用多少、什么时候用、失败后如何退避。",
    outcome: "保护 Pact 平台、客户端机器、外部 provider、预算和用户体验。"
  },
  {
    id: SECURITY_GOVERNANCE_GOAL_IDS.AUDIT_EVIDENCE_LIFECYCLE,
    label: "审计、证据与生命周期",
    question: "事后如何证明、如何撤销、如何恢复、如何下线。",
    outcome: "让每个跨边界行为都可解释、可复查、可统计，并可回到安全状态。"
  }
]);
