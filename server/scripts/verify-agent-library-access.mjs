import assert from "node:assert/strict";
import {
  ACCESS_MODES,
  AGENT_LIBRARY_PROTOCOL_VERSION,
  KNOWLEDGE_ACCESS_PROTOCOL_VERSION,
  REQUESTED_EGRESS,
  applyKnowledgeAccessToEvidencePack,
  createAuthorizationOverlay,
  createDerivedKnowledgeView,
  evaluateKnowledgeAccess
} from "../platform/specialized/knowledge/agent-library/access-policy.mjs";

function buildFixture() {
  const view = createDerivedKnowledgeView({
    upstreamKnowledgeRef: "upstream://kb/customer-renewal",
    upstreamPolicyRef: "upstream-policy://source/renewal",
    derivedViewRef: "derived://pact/customer-renewal/full",
    derivedKnowledgeSpace: "workspace-a-library",
    dataClass: "customer-confidential",
    sensitivity: "restricted",
    workspaceScope: ["workspace-a", "workspace-b"],
    allowedSubjects: ["subject-a", "subject-b"],
    allowedAgentProfiles: ["analyst", "viewer"],
    allowedActions: ["discover", "read", "export", "checkout"],
    checkoutPolicy: {
      allowRetain: true,
      allowShare: false,
      expiresInSeconds: 3600,
      revocationPolicy: "revoke-on-policy-change"
    },
    refs: [
      { ref: "document:renewal", refType: "document" },
      { ref: "section:budget", refType: "section" },
      { ref: "table-cell:budget:approval", refType: "tableCell" }
    ]
  });
  const authorizationOverlay = createAuthorizationOverlay({
    derivedViewRef: view.derivedViewRef,
    defaultAccessMode: "deny",
    rules: [
      {
        ruleId: "allow-a-checkout",
        effect: "allow",
        subjects: ["subject-a"],
        workspaces: ["workspace-a"],
        agentProfiles: ["analyst"],
        actions: ["read", "export", "checkout"],
        egress: ["searchResult", "evidenceRead", "contextBundle", "exportFile", "toolCall"],
        accessMode: "checkoutAllowed"
      },
      {
        ruleId: "deny-b",
        effect: "deny",
        subjects: ["subject-b"],
        workspaces: ["workspace-b"],
        reason: "workspace_b_not_authorized"
      }
    ]
  });
  return { view, authorizationOverlay };
}

function requestFor(subjectId, workspaceId, egress = "exportFile") {
  return {
    libraryCardId: `card-${subjectId}`,
    subject: { subjectId },
    operatorId: `operator-${subjectId}`,
    agentProfile: { profileId: subjectId === "subject-a" ? "analyst" : "viewer" },
    workspaceId,
    taskId: "task-renewal",
    requestedAction: egress === "searchResult" ? "read" : "export",
    requestedAccessMode: egress === "exportFile" ? "checkoutAllowed" : "copyToContext",
    requestedEgress: egress,
    targetRefs: [
      { ref: "document:renewal", refType: "document" },
      { ref: "section:budget", refType: "section" }
    ],
    contextTarget: "agent-response",
    modelRoute: "local-analyst"
  };
}

function assertAccessModesAndEgressCatalogs() {
  for (const mode of ["deny", "discoverOnly", "metadataOnly", "readInPlace", "citeOnly", "copyToContext", "exportAllowed", "checkoutAllowed"]) {
    assert.ok(ACCESS_MODES.includes(mode), `missing access mode ${mode}`);
  }
  for (const egress of ["searchResult", "evidenceRead", "contextBundle", "artifactWrite", "exportFile", "distillationInput", "distillationOutput", "memoryWrite", "toolCall", "evaluationSample"]) {
    assert.ok(REQUESTED_EGRESS.includes(egress), `missing requested egress ${egress}`);
  }
}

function assertAuthorizedSubjectGetsReceiptAndLoan() {
  const { view, authorizationOverlay } = buildFixture();
  const decision = evaluateKnowledgeAccess(requestFor("subject-a", "workspace-a", "exportFile"), {
    view,
    authorizationOverlay
  });

  assert.equal(decision.protocolVersion, KNOWLEDGE_ACCESS_PROTOCOL_VERSION);
  assert.equal(decision.agentLibraryProtocolVersion, AGENT_LIBRARY_PROTOCOL_VERSION);
  assert.equal(decision.allowed, true);
  assert.equal(decision.accessMode, "checkoutAllowed");
  assert.ok(decision.knowledgeAccessReceipt?.receiptId, "allowed access must create knowledgeAccessReceipt");
  assert.ok(decision.loanRecord?.loanRecordId, "export/checkout must create loanRecord");
  assert.equal(decision.loanRecord.canRetain, true);
  assert.equal(decision.loanRecord.canShare, false);
  assert.equal(decision.canExport, true);
  assert.equal(decision.canWriteMemory, true);
  assert.equal(decision.allowedRefs.length, 2);
  assert.ok(decision.auditId);
}

function assertDeniedSubjectCannotBypassAnyExit() {
  const { view, authorizationOverlay } = buildFixture();
  for (const egress of REQUESTED_EGRESS) {
    const decision = evaluateKnowledgeAccess(requestFor("subject-b", "workspace-b", egress), {
      view,
      authorizationOverlay
    });
    assert.equal(decision.allowed, false, `subject-b must be denied for ${egress}`);
    assert.equal(decision.accessMode, "deny");
    assert.equal(decision.upstreamAccessDenied, true);
    assert.ok(decision.deniedRequestAudit?.auditId, `denied request audit missing for ${egress}`);
    assert.equal(decision.knowledgeAccessReceipt, null);
    assert.equal(decision.loanRecord, null);
    assert.ok(decision.filteredReason.includes("workspace_b_not_authorized") || decision.filteredReason.includes("authorization_overlay"));
  }
}

function assertEvidencePackFiltering() {
  const { view, authorizationOverlay } = buildFixture();
  const denied = evaluateKnowledgeAccess(requestFor("subject-b", "workspace-b", "evidenceRead"), {
    view,
    authorizationOverlay
  });
  const pack = applyKnowledgeAccessToEvidencePack({
    evidenceRefs: ["document:renewal"],
    assetRefs: ["asset:raw-file"],
    citations: [{ source: "renewal" }]
  }, denied);
  assert.deepEqual(pack.evidenceRefs, []);
  assert.deepEqual(pack.assetRefs, []);
  assert.equal(pack.permissionScope, "denied");
  assert.equal(pack.accessMode, "deny");
  assert.ok(pack.backendTrace.agentLibraryDecisionId);
}

assertAccessModesAndEgressCatalogs();
assertAuthorizedSubjectGetsReceiptAndLoan();
assertDeniedSubjectCannotBypassAnyExit();
assertEvidencePackFiltering();

console.log("agent library access verification passed");
