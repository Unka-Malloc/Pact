import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_INDUSTRIAL_DISTILLATION_MODEL,
  buildEmailThreadDigest,
  buildIndustrialDistillationBenchmark,
  buildIndustrialDistillationPlan,
  buildMarkdownProjectDigest,
  evaluateIndustrialDistillationGap
} from "../platform/specialized/knowledge/invocation/knowledge-distillation-runtime/industrial-benchmark.mjs";
import { createKnowledgeDistillationRuntime } from "../platform/specialized/knowledge/invocation/knowledge-distillation-runtime/index.mjs";

async function writeFile(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
}

const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-industrial-distillation-"));
const projectPath = path.join(rootPath, "project");
const emailPath = path.join(rootPath, "mail");

try {
  assert.equal(DEFAULT_INDUSTRIAL_DISTILLATION_MODEL, "deepseek-v4-flash");

  await writeFile(
    path.join(projectPath, "docs/decision.md"),
    [
      "# Architecture Decision",
      "",
      "## Context",
      "Alpha service needs a shared workspace switch.",
      "",
      "## Decision",
      "Use team-shared workspaces and keep tools/skills shared.",
      "",
      "## Consequences",
      "The distilled document must mention the workspace switch."
    ].join("\n")
  );
  await writeFile(
    path.join(projectPath, "docs/roadmap.md"),
    [
      "# Roadmap",
      "",
      "## Phase 1",
      "Build Markdown project digest from every source document.",
      "",
      "## Phase 2",
      "Compare external skill output with SplitAll distillation."
    ].join("\n")
  );
  await writeFile(
    path.join(projectPath, "node_modules/ignored.md"),
    "# Ignored\n\nThis file must not enter the project digest."
  );

  await writeFile(
    path.join(emailPath, "001.eml"),
    [
      "From: Alice <alice@example.com>",
      "To: Bob <bob@example.com>",
      "Subject: Alpha Proposal",
      "Date: Fri, 01 May 2026 09:00:00 +0000",
      "Message-ID: <alpha-1@example.com>",
      "",
      "Alpha proposal starts with budget 1200 and requires approval."
    ].join("\r\n")
  );
  await writeFile(
    path.join(emailPath, "002.eml"),
    [
      "From: Bob <bob@example.com>",
      "To: Alice <alice@example.com>",
      "Subject: Re: Alpha Proposal",
      "Date: Fri, 01 May 2026 10:00:00 +0000",
      "Message-ID: <alpha-2@example.com>",
      "In-Reply-To: <alpha-1@example.com>",
      "References: <alpha-1@example.com>",
      "",
      "Approval is granted if the shared workspace evidence remains attached."
    ].join("\r\n")
  );
  await writeFile(
    path.join(emailPath, "003.eml"),
    [
      "From: Alice <alice@example.com>",
      "To: Bob <bob@example.com>",
      "Subject: Re: Alpha Proposal",
      "Date: Fri, 01 May 2026 11:00:00 +0000",
      "Message-ID: <alpha-3@example.com>",
      "In-Reply-To: <alpha-2@example.com>",
      "References: <alpha-1@example.com> <alpha-2@example.com>",
      "",
      "Final note: keep the timeline oldest to newest in the distilled output."
    ].join("\r\n")
  );

  const projectDigest = await buildMarkdownProjectDigest({ rootPath: projectPath });
  assert.equal(projectDigest.modelAlias, DEFAULT_INDUSTRIAL_DISTILLATION_MODEL);
  assert.equal(projectDigest.fileCount, 2);
  assert.deepEqual(projectDigest.files.map((file) => file.relativePath), [
    "docs/decision.md",
    "docs/roadmap.md"
  ]);
  assert.ok(projectDigest.digestMarkdown.includes("## Directory Structure"));
  assert.ok(projectDigest.digestMarkdown.includes("### File: docs/decision.md"));
  assert.ok(projectDigest.rawDocuments.every((document) => document.sourceType === "project-markdown"));

  const emailDigest = await buildEmailThreadDigest({ rootPath: emailPath });
  assert.equal(emailDigest.threadCount, 1);
  assert.equal(emailDigest.messageCount, 3);
  assert.equal(emailDigest.threads[0].baseSubject, "Alpha Proposal");
  assert.deepEqual(emailDigest.threads[0].messages.map((message) => message.messageId), [
    "<alpha-1@example.com>",
    "<alpha-2@example.com>",
    "<alpha-3@example.com>"
  ]);
  assert.ok(emailDigest.digestMarkdown.includes("Message-ID / In-Reply-To / References"));
  assert.ok(emailDigest.rawDocuments[0].text.includes("oldest to newest"));

  const plan = buildIndustrialDistillationPlan({ projectRoot: projectPath, emailRoot: emailPath });
  assert.equal(plan.modelAlias, DEFAULT_INDUSTRIAL_DISTILLATION_MODEL);
  assert.ok(plan.baselineSkills.projectDigest.includes("repomix"));
  assert.ok(plan.baselineSkills.projectDigest.includes("gitingest"));
  assert.ok(plan.baselineSkills.evaluation.includes("deepeval"));
  assert.ok(plan.phases.some((phase) => phase.id === "gap_loop"));

  const strongDocument = [
    projectDigest.digestMarkdown,
    emailDigest.digestMarkdown,
    "Final industrial answer: same-matter email merge passed; source markers retained."
  ].join("\n\n");
  const strongEvaluation = evaluateIndustrialDistillationGap({
    projectDigest,
    emailDigest,
    baselineDocument: strongDocument,
    frameworkDocument: strongDocument
  });
  assert.equal(strongEvaluation.passed, true);
  assert.equal(strongEvaluation.metrics.frameworkCoverage.score, 1);

  const weakEvaluation = evaluateIndustrialDistillationGap({
    projectDigest,
    emailDigest,
    baselineDocument: strongDocument,
    frameworkDocument: "Alpha Proposal summary without timeline, source paths, message ids, or project headings."
  });
  assert.equal(weakEvaluation.passed, false);
  assert.ok(weakEvaluation.gaps.length > 0);

  const benchmark = await buildIndustrialDistillationBenchmark({
    projectRoot: projectPath,
    emailRoot: emailPath
  });
  assert.equal(benchmark.frameworkInputs.modelAlias, DEFAULT_INDUSTRIAL_DISTILLATION_MODEL);
  assert.equal(benchmark.frameworkInputs.project.rawDocuments.length, 2);
  assert.equal(benchmark.frameworkInputs.email.rawDocuments.length, 1);
  assert.ok(benchmark.acceptanceGate.requiredChecks.includes("same_matter_email_merge"));

  const runtime = createKnowledgeDistillationRuntime({ userDataPath: rootPath });
  const description = runtime.describe();
  assert.equal(description.policies.industrialBaselineModelAlias, DEFAULT_INDUSTRIAL_DISTILLATION_MODEL);
} finally {
  await fs.rm(rootPath, { recursive: true, force: true });
}

console.log("knowledge industrial distillation verification passed");
