import { createHash, randomUUID } from "node:crypto";

export const WORKSPACE_CONTRIBUTION_PROTOCOL_VERSION = "agentstudio.workspace-contribution.v1";

export const CONTRIBUTION_STATES = Object.freeze([
  "submitted",
  "scanned",
  "reviewed",
  "published",
  "rejected",
  "needs_changes",
  "adopted",
  "deprecated",
  "revoked"
]);

export const CONTRIBUTION_TYPES = Object.freeze([
  "knowledge",
  "skill",
  "tool",
  "script",
  "file",
  "goldenRule",
  "expertOpinion"
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  submitted: ["scanned", "rejected", "needs_changes"],
  scanned: ["reviewed", "rejected", "needs_changes"],
  reviewed: ["published", "rejected", "needs_changes"],
  published: ["adopted", "deprecated", "revoked"],
  adopted: ["deprecated", "revoked"],
  needs_changes: ["submitted", "rejected"],
  rejected: [],
  deprecated: ["revoked"],
  revoked: []
});

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function text(value) {
  return String(value ?? "").trim();
}

function shallowObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function hash(value, length = 20) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, length);
}

function stableId(prefix, input) {
  return `${prefix}::${hash(JSON.stringify(input))}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeContributionType(value) {
  const normalized = text(value || "knowledge");
  return CONTRIBUTION_TYPES.includes(normalized) ? normalized : "knowledge";
}

function normalizeVisibility(value) {
  const normalized = text(value || "workspace");
  return ["private", "workspace", "public", "restricted"].includes(normalized) ? normalized : "workspace";
}

function normalizeContribution(input = {}, defaults = {}) {
  const workspaceId = text(input.workspaceId || defaults.workspaceId || "default");
  const contributionId = text(input.contributionId || stableId("contribution", {
    workspaceId,
    contributorId: input.contributorId,
    contributionType: input.contributionType,
    payloadRefs: input.payloadRefs,
    title: input.title
  }));
  const contributionType = normalizeContributionType(input.contributionType);
  return {
    protocolVersion: WORKSPACE_CONTRIBUTION_PROTOCOL_VERSION,
    contributionId,
    workspaceId,
    contributorId: text(input.contributorId || "anonymous"),
    contributorKind: text(input.contributorKind || "agent"),
    sourceWorkspaceIds: asArray(input.sourceWorkspaceIds || workspaceId).map(text).filter(Boolean),
    targetWorkspaceIds: asArray(input.targetWorkspaceIds || workspaceId).map(text).filter(Boolean),
    contributionType,
    title: text(input.title || `${contributionType} contribution`),
    payloadRefs: asArray(input.payloadRefs).map(text).filter(Boolean),
    skillManifestRef: text(input.skillManifestRef || ""),
    toolSchemaRef: text(input.toolSchemaRef || ""),
    scriptRefs: asArray(input.scriptRefs).map(text).filter(Boolean),
    fileRefs: asArray(input.fileRefs).map(text).filter(Boolean),
    knowledgeRefs: asArray(input.knowledgeRefs).map(text).filter(Boolean),
    goldenRuleRefs: asArray(input.goldenRuleRefs).map(text).filter(Boolean),
    expertOpinionRefs: asArray(input.expertOpinionRefs).map(text).filter(Boolean),
    license: text(input.license || "UNREVIEWED"),
    risk: text(input.risk || "medium"),
    requestedVisibility: normalizeVisibility(input.requestedVisibility),
    requestedActions: asArray(input.requestedActions || ["discover", "read"]).map(text).filter(Boolean),
    reviewPolicy: shallowObject(input.reviewPolicy),
    status: "submitted",
    statusHistory: [{
      state: "submitted",
      at: nowIso(),
      actorId: text(input.contributorId || "anonymous"),
      reason: text(input.reason || "initial_submission")
    }],
    metrics: {
      acceptedCount: 0,
      usageCount: 0,
      successfulUseCount: 0,
      uniqueWorkspaceAdoptions: 0,
      skillExecutionCount: 0,
      permissionRequestCount: 0,
      permissionGrantCount: 0,
      rollbackCount: 0,
      maintenanceFreshness: 1,
      successRate: 0,
      rankScore: 0
    },
    grants: [],
    permissionRequests: [],
    usageEvents: [],
    auditIds: [stableId("audit", { contributionId, event: "contribution.submitted" })],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

function rankScoreV0(metrics = {}) {
  const usageCount = Number(metrics.usageCount || 0);
  const successRate = usageCount > 0 ? Number(metrics.successfulUseCount || 0) / usageCount : 0;
  return usageCount * successRate + Number(metrics.uniqueWorkspaceAdoptions || 0) - Number(metrics.rollbackCount || 0);
}

function refreshMetrics(contribution) {
  const adoptionWorkspaces = new Set(contribution.usageEvents.map((event) => event.workspaceId).filter(Boolean));
  contribution.metrics.usageCount = contribution.usageEvents.length;
  contribution.metrics.successfulUseCount = contribution.usageEvents.filter((event) => event.successful !== false).length;
  contribution.metrics.uniqueWorkspaceAdoptions = adoptionWorkspaces.size;
  contribution.metrics.skillExecutionCount = contribution.usageEvents.filter((event) => event.action === "skill.used").length;
  contribution.metrics.permissionRequestCount = contribution.permissionRequests.length;
  contribution.metrics.permissionGrantCount = contribution.grants.length;
  contribution.metrics.successRate =
    contribution.metrics.usageCount > 0
      ? contribution.metrics.successfulUseCount / contribution.metrics.usageCount
      : 0;
  contribution.metrics.rankScore = rankScoreV0(contribution.metrics);
  return contribution;
}

function assertTransition(fromState, toState) {
  const allowed = ALLOWED_TRANSITIONS[fromState] || [];
  if (!allowed.includes(toState)) {
    throw new Error(`Invalid contribution state transition: ${fromState} -> ${toState}`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createContributionRegistry({ workspaceId = "default" } = {}) {
  const contributions = new Map();
  const auditEvents = [];

  function appendAudit(eventType, payload = {}) {
    const audit = {
      auditId: stableId("audit", { eventType, payload, nonce: randomUUID() }),
      eventType,
      workspaceId: text(payload.workspaceId || workspaceId),
      payload,
      createdAt: nowIso()
    };
    auditEvents.push(audit);
    return audit;
  }

  function getContribution(contributionId) {
    const contribution = contributions.get(text(contributionId));
    if (!contribution) {
      throw new Error(`Contribution not found: ${contributionId}`);
    }
    return contribution;
  }

  function transition(contributionId, nextState, input = {}) {
    const contribution = getContribution(contributionId);
    assertTransition(contribution.status, nextState);
    const audit = appendAudit(`contribution.${nextState}`, {
      workspaceId: contribution.workspaceId,
      contributionId: contribution.contributionId,
      actorId: input.actorId || "",
      reason: input.reason || ""
    });
    contribution.status = nextState;
    contribution.updatedAt = nowIso();
    contribution.statusHistory.push({
      state: nextState,
      at: contribution.updatedAt,
      actorId: text(input.actorId || ""),
      reason: text(input.reason || "")
    });
    contribution.auditIds.push(audit.auditId);
    if (["published", "adopted"].includes(nextState)) {
      contribution.metrics.acceptedCount += 1;
    }
    return {
      contribution: clone(refreshMetrics(contribution)),
      audit
    };
  }

  return {
    protocolVersion: WORKSPACE_CONTRIBUTION_PROTOCOL_VERSION,
    submitContribution(input = {}) {
      const contribution = normalizeContribution(input, { workspaceId });
      contributions.set(contribution.contributionId, contribution);
      appendAudit("contribution.submitted", {
        workspaceId: contribution.workspaceId,
        contributionId: contribution.contributionId,
        contributorId: contribution.contributorId,
        contributionType: contribution.contributionType
      });
      return {
        contribution: clone(contribution)
      };
    },
    scanContribution(contributionId, input = {}) {
      return transition(contributionId, "scanned", input);
    },
    reviewContribution(contributionId, input = {}) {
      return transition(contributionId, "reviewed", input);
    },
    publishContribution(contributionId, input = {}) {
      return transition(contributionId, "published", input);
    },
    adoptContribution(contributionId, input = {}) {
      return transition(contributionId, "adopted", input);
    },
    rejectContribution(contributionId, input = {}) {
      return transition(contributionId, "rejected", input);
    },
    requestChanges(contributionId, input = {}) {
      return transition(contributionId, "needs_changes", input);
    },
    revokeContribution(contributionId, input = {}) {
      return transition(contributionId, "revoked", input);
    },
    requestPermission(contributionId, input = {}) {
      const contribution = getContribution(contributionId);
      const permissionRequest = {
        permissionRequestId: stableId("contribution_permission_request", {
          contributionId,
          requesterId: input.requesterId,
          targetWorkspaceId: input.targetWorkspaceId,
          actions: input.actions
        }),
        contributionId,
        requesterId: text(input.requesterId || ""),
        targetWorkspaceId: text(input.targetWorkspaceId || contribution.workspaceId),
        actions: asArray(input.actions || ["read"]).map(text).filter(Boolean),
        purpose: text(input.purpose || ""),
        status: "requested",
        createdAt: nowIso()
      };
      const audit = appendAudit("contribution.permission.requested", permissionRequest);
      contribution.permissionRequests.push(permissionRequest);
      contribution.auditIds.push(audit.auditId);
      refreshMetrics(contribution);
      return {
        permissionRequest: clone(permissionRequest),
        audit
      };
    },
    grantPermission(contributionId, input = {}) {
      const contribution = getContribution(contributionId);
      const grant = {
        contributionGrantId: stableId("contribution_grant", {
          contributionId,
          granteeId: input.granteeId,
          targetWorkspaceId: input.targetWorkspaceId,
          actions: input.actions
        }),
        contributionId,
        granteeId: text(input.granteeId || ""),
        targetWorkspaceId: text(input.targetWorkspaceId || contribution.workspaceId),
        actions: asArray(input.actions || contribution.requestedActions).map(text).filter(Boolean),
        expiresAt: text(input.expiresAt || ""),
        revocationPolicy: text(input.revocationPolicy || "revoke-on-policy-change"),
        createdAt: nowIso()
      };
      const loanRecord = {
        loanRecordId: stableId("contribution_loan_record", grant),
        contributionGrantId: grant.contributionGrantId,
        contributionId,
        workspaceId: contribution.workspaceId,
        targetWorkspaceId: grant.targetWorkspaceId,
        granteeId: grant.granteeId,
        actions: grant.actions,
        canShare: input.canShare === true,
        canRetain: input.canRetain === true,
        revocationPolicy: grant.revocationPolicy,
        expiresAt: grant.expiresAt,
        createdAt: nowIso()
      };
      const audit = appendAudit("contribution.permission.granted", {
        ...grant,
        loanRecordId: loanRecord.loanRecordId
      });
      contribution.grants.push(grant);
      contribution.auditIds.push(audit.auditId);
      refreshMetrics(contribution);
      return {
        contributionGrant: clone(grant),
        loanRecord,
        audit
      };
    },
    recordUsage(contributionId, input = {}) {
      const contribution = getContribution(contributionId);
      const event = {
        usageEventId: stableId("contribution_usage", {
          contributionId,
          actorId: input.actorId,
          workspaceId: input.workspaceId,
          action: input.action,
          nonce: randomUUID()
        }),
        contributionId,
        actorId: text(input.actorId || ""),
        workspaceId: text(input.workspaceId || contribution.workspaceId),
        action: text(input.action || "asset.used"),
        successful: input.successful !== false,
        createdAt: nowIso()
      };
      const audit = appendAudit("contribution.used", event);
      contribution.usageEvents.push(event);
      contribution.auditIds.push(audit.auditId);
      refreshMetrics(contribution);
      appendAudit("contribution.rank.updated", {
        workspaceId: contribution.workspaceId,
        contributionId,
        rankScore: contribution.metrics.rankScore
      });
      return {
        usageEvent: clone(event),
        metrics: clone(contribution.metrics),
        audit
      };
    },
    recordRollback(contributionId, input = {}) {
      const contribution = getContribution(contributionId);
      contribution.metrics.rollbackCount += 1;
      const audit = appendAudit("contribution.rollback.recorded", {
        workspaceId: contribution.workspaceId,
        contributionId,
        reason: input.reason || ""
      });
      contribution.auditIds.push(audit.auditId);
      refreshMetrics(contribution);
      return {
        metrics: clone(contribution.metrics),
        audit
      };
    },
    getContribution(contributionId) {
      return clone(getContribution(contributionId));
    },
    listContributions() {
      return [...contributions.values()].map((contribution) => clone(refreshMetrics(contribution)));
    },
    getLeaderboard() {
      return [...contributions.values()]
        .map((contribution) => clone(refreshMetrics(contribution)))
        .sort((left, right) => Number(right.metrics.rankScore || 0) - Number(left.metrics.rankScore || 0))
        .map((contribution, index) => ({
          rank: index + 1,
          contributionId: contribution.contributionId,
          title: contribution.title,
          contributionType: contribution.contributionType,
          contributorId: contribution.contributorId,
          rankScore: contribution.metrics.rankScore,
          usageCount: contribution.metrics.usageCount,
          successRate: contribution.metrics.successRate,
          uniqueWorkspaceAdoptions: contribution.metrics.uniqueWorkspaceAdoptions,
          rollbackCount: contribution.metrics.rollbackCount,
          acceptedCount: contribution.metrics.acceptedCount
        }));
    },
    getStats() {
      const items = [...contributions.values()].map((contribution) => refreshMetrics(contribution));
      const byType = {};
      const byContributor = {};
      for (const contribution of items) {
        byType[contribution.contributionType] = (byType[contribution.contributionType] || 0) + 1;
        byContributor[contribution.contributorId] = (byContributor[contribution.contributorId] || 0) + 1;
      }
      return {
        protocolVersion: WORKSPACE_CONTRIBUTION_PROTOCOL_VERSION,
        workspaceId,
        contributionCount: items.length,
        acceptedCount: items.reduce((sum, item) => sum + Number(item.metrics.acceptedCount || 0), 0),
        usageCount: items.reduce((sum, item) => sum + Number(item.metrics.usageCount || 0), 0),
        uniqueWorkspaceAdoptions: new Set(items.flatMap((item) => item.usageEvents.map((event) => event.workspaceId))).size,
        skillExecutionCount: items.reduce((sum, item) => sum + Number(item.metrics.skillExecutionCount || 0), 0),
        permissionRequestCount: items.reduce((sum, item) => sum + Number(item.metrics.permissionRequestCount || 0), 0),
        permissionGrantCount: items.reduce((sum, item) => sum + Number(item.metrics.permissionGrantCount || 0), 0),
        rollbackCount: items.reduce((sum, item) => sum + Number(item.metrics.rollbackCount || 0), 0),
        contributionTypeBreakdown: byType,
        contributorBreakdown: byContributor
      };
    },
    getContributionReport(input = {}) {
      const stats = this.getStats();
      const leaderboard = this.getLeaderboard();
      return {
        protocolVersion: WORKSPACE_CONTRIBUTION_PROTOCOL_VERSION,
        reportId: stableId("asset_contribution_report", {
          workspaceId,
          timeRange: input.timeRange || "all"
        }),
        workspaceId,
        timeRange: input.timeRange || "all",
        assetTypeBreakdown: stats.contributionTypeBreakdown,
        contributorBreakdown: stats.contributorBreakdown,
        workspaceAdoptionBreakdown: {},
        permissionFlowBreakdown: {
          requested: stats.permissionRequestCount,
          granted: stats.permissionGrantCount
        },
        usageActionBreakdown: {},
        riskBreakdown: {},
        maintenanceBreakdown: {},
        topReusableAssets: leaderboard.slice(0, 10),
        underMaintainedAssets: this.listContributions().filter((item) => Number(item.metrics.maintenanceFreshness || 0) < 0.5),
        highDemandRestrictedAssets: this.listContributions().filter((item) => item.requestedVisibility === "restricted" && item.metrics.permissionRequestCount > 0),
        rollbackHotspots: this.listContributions().filter((item) => item.metrics.rollbackCount > 0),
        assetContributionReportV0:
          stats.acceptedCount +
          stats.usageCount +
          stats.uniqueWorkspaceAdoptions +
          stats.permissionGrantCount -
          stats.rollbackCount
      };
    },
    listAuditEvents() {
      return clone(auditEvents);
    }
  };
}

export function computeRankScoreV0(metrics = {}) {
  return rankScoreV0(metrics);
}
