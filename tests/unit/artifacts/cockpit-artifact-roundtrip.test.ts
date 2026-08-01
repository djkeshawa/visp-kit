import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  artifactSchemas,
  assuranceCaseArtifactPath,
  assuranceCaseArtifactRoleSchema,
  createArtifactReader,
  currentReviewDecisionArtifactPath,
  doctorReportArtifactPath,
  featureIntentArtifactPath,
  patternsArtifactPath,
  planArtifactPath,
  policyArtifactPath,
  projectConfigArtifactPath,
  projectProfileArtifactPath,
  projectStatusArtifactPath,
  projectSummaryArtifactPath,
  readContainedTextArtifactState,
  reviewDecisionHistoryArtifactPath,
  reviewReportSchema,
  runEventSchema,
  runEventsPath,
  runIndexArtifactPath,
  specArtifactPath,
  taskGraphArtifactPath,
  taskReviewArtifactPath,
  verificationArtifactPath,
  workflowManifestArtifactPath,
  constitutionMarkdownArtifactPath,
  type CurrentReviewDecisionPointer,
  type DiffSnapshot,
  type DiffSnapshotWithoutHash,
  type FeatureIntent,
  type ProjectStatus,
  type ReviewDecision,
  type ReviewDecisionWithoutHash,
  type RunEvent,
  type RunIndex,
  type SpecArtifact
} from "../../../src/artifacts/public.js";
import { buildAssuranceCase } from "../../../src/assurance/assurance-case.js";
import { hashOracleValue } from "../../../src/oracle/oracle-authorization.js";
import { createDefaultPolicy } from "../../../src/policy/policy-defaults.js";
import { createReviewDecisionHash } from "../../../src/review/review-decision-hash.js";
import { createPlanDraftArtifact } from "../../../src/templates/phase7-templates.js";
import { defaultWorkflowManifest } from "../../../src/workflow-manifest/default-workflow.js";
import {
  timestamp,
  validFeature,
  validProjectConfig,
  validProjectProfile,
  validRequirement,
  validReviewReport,
  validTaskGraph,
  validVerificationReport
} from "./fixtures.js";

const featureKey = "001-note-pinning";
const taskId = "T001";
const runId = "RUN-000001";
const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

function assuranceCaseFixture() {
  const changeUnits: DiffSnapshot["changeUnits"] = [];
  const stateWithoutHash = {
    headRevision: "0".repeat(40),
    indexTreeRevision: "1".repeat(40),
    implementationSha256: hashOracleValue(changeUnits)
  };
  const state = {
    ...stateWithoutHash,
    stateSha256: hashOracleValue(stateWithoutHash)
  };
  const snapshotWithoutHash: DiffSnapshotWithoutHash = {
    version: "1.0",
    mode: "base_to_workspace",
    baseRevision: "0".repeat(40),
    targetRevision: "WORKSPACE",
    state,
    changeUnits
  };
  const snapshot: DiffSnapshot = {
    ...snapshotWithoutHash,
    snapshotSha256: hashOracleValue(snapshotWithoutHash)
  };
  const bindings = assuranceCaseArtifactRoleSchema.options.map((role) => ({
    id: `B-${role}`,
    role,
    status: "available" as const,
    path: `.visp/fixtures/${role}.json`,
    sha256: sha("a")
  }));
  const built = buildAssuranceCase({
    actionId: sha("b"),
    featureId: validFeature.id,
    featureSlug: validFeature.slug,
    taskId,
    assuranceProfile: "behavioral",
    bindings,
    baselineState: {
      status: "captured",
      revision: "0".repeat(40),
      sha256: sha("c")
    },
    snapshot,
    claims: [
      {
        id: "CL001",
        source: {
          kind: "invariant",
          invariantId: "INV001",
          origin: "business_rule"
        },
        priority: "should",
        assuranceProfile: "behavioral",
        statement: "Cockpit quotes the assurance verdict from Kit.",
        disposition: "unmapped",
        changeUnitIds: [],
        evidenceComparisonIds: [],
        unresolvedItemIds: []
      }
    ],
    comparisons: [],
    hotspots: [],
    spec: { assumptions: [] },
    unresolvedItems: [],
    overrides: [],
    manualChecks: [],
    challengerFindings: []
  });

  if (!built.ok) throw built.error;
  return built.value;
}

function reviewDecisionFixture(): ReviewDecision {
  const withoutHash: ReviewDecisionWithoutHash = {
    version: "1.0",
    featureId: validFeature.id,
    featureSlug: validFeature.slug,
    taskId,
    assuranceProfile: "behavioral",
    reviewerId: "cockpit-reviewer",
    identityAssurance: "self_declared",
    decision: "accept",
    reason: "All mandatory Cockpit evidence was reviewed.",
    reviewedHotspotIds: [],
    assuranceCase: {
      path: `.visp/features/${featureKey}/assurance/${taskId}/assurance-case.json`,
      sha256: sha("d")
    },
    codeState: {
      mode: "base_to_workspace",
      baseRevision: "0".repeat(40),
      targetRevision: "WORKSPACE",
      snapshotSha256: sha("e"),
      stateSha256: sha("f")
    },
    policy: {
      path: ".visp/policy.json",
      sha256: sha("1")
    },
    freshnessInputs: [],
    supersedesDecisionHash: null,
    decidedAt: timestamp
  };

  return {
    ...withoutHash,
    decisionHash: createReviewDecisionHash(withoutHash)
  };
}

describe("Cockpit artifact schema and accessor round trips", () => {
  let rootPath: string;

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(os.tmpdir(), "visp-cockpit-artifacts-"));
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it("round-trips every Cockpit JSON artifact with a typed root-bound accessor", async () => {
    const status: ProjectStatus = {
      initialized: true,
      activeFeatureId: validFeature.id,
      activeFeatureSlug: validFeature.slug,
      activeFeaturePath: `.visp/features/${featureKey}`,
      activeTaskId: taskId,
      currentState: "context_ready",
      lastCommand: "context",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const featureIntent: FeatureIntent = {
      ...validFeature,
      rawUserRequest: "Expose Kit artifacts to a local read-only Cockpit."
    };
    const plan = createPlanDraftArtifact({
      feature: {
        id: validFeature.id,
        slug: validFeature.slug,
        key: featureKey,
        path: path.join(rootPath, ".visp", "features", featureKey),
        relativePath: `.visp/features/${featureKey}`,
        intent: featureIntent
      },
      now: timestamp
    });
    const specification: SpecArtifact = {
      featureId: validFeature.id,
      featureSlug: validFeature.slug,
      title: validFeature.title,
      status: "ready",
      userStories: [
        {
          id: "US-001",
          title: "Read current artifact state",
          actor: "reviewer",
          capability: "inspect the local Cockpit",
          outcome: "understand Kit's recorded state"
        }
      ],
      requirements: [validRequirement],
      acceptanceCriteria: validRequirement.acceptanceCriteria,
      businessRules: ["Cockpit renders; Kit decides."],
      nonFunctionalRequirements: {
        performance: [],
        security: ["No repository mutation."],
        accessibility: [],
        reliability: ["Missing artifacts remain explicit."],
        maintainability: []
      },
      edgeCases: ["An artifact can disappear between refreshes."],
      assumptions: validRequirement.assumptions,
      outOfScope: validRequirement.outOfScope,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const assuranceCase = assuranceCaseFixture();
    const reviewDecision = reviewDecisionFixture();
    const currentReviewDecision: CurrentReviewDecisionPointer = {
      version: "1.0",
      featureId: validFeature.id,
      featureSlug: validFeature.slug,
      taskId,
      decisionPath: `.visp/features/${featureKey}/assurance/${taskId}/review-decisions/${reviewDecision.decisionHash.slice("sha256:".length)}.json`,
      decisionHash: reviewDecision.decisionHash,
      updatedAt: timestamp
    };
    const runIndex: RunIndex = {
      latestRunId: runId,
      runs: [
        {
          id: runId,
          command: "verify",
          featureId: validFeature.id,
          featureSlug: validFeature.slug,
          taskId,
          startedAt: timestamp,
          endedAt: timestamp,
          success: true,
          result: "passed",
          runPath: `.visp/runs/${runId}/run.json`
        }
      ]
    };
    const reader = createArtifactReader(rootPath);
    const cases = [
      {
        label: "project profile",
        schema: artifactSchemas.projectProfile,
        value: validProjectProfile,
        artifactPath: projectProfileArtifactPath(rootPath),
        read: () => reader.projectProfile()
      },
      {
        label: "project config",
        schema: artifactSchemas.projectConfig,
        value: validProjectConfig,
        artifactPath: projectConfigArtifactPath(rootPath),
        read: () => reader.projectConfig()
      },
      {
        label: "project status",
        schema: artifactSchemas.projectStatus,
        value: status,
        artifactPath: projectStatusArtifactPath(rootPath),
        read: () => reader.projectStatus()
      },
      {
        label: "policy",
        schema: artifactSchemas.policy,
        value: createDefaultPolicy({ strictnessMode: "strict", now: timestamp }),
        artifactPath: policyArtifactPath(rootPath),
        read: () => reader.policy()
      },
      {
        label: "workflow manifest",
        schema: artifactSchemas.workflowManifest,
        value: defaultWorkflowManifest(timestamp),
        artifactPath: workflowManifestArtifactPath(rootPath),
        read: () => reader.workflowManifest()
      },
      {
        label: "feature intent",
        schema: artifactSchemas.featureIntent,
        value: featureIntent,
        artifactPath: featureIntentArtifactPath(rootPath, featureKey),
        read: () => reader.featureIntent(featureKey)
      },
      {
        label: "specification",
        schema: artifactSchemas.specification,
        value: specification,
        artifactPath: specArtifactPath(rootPath, featureKey),
        read: () => reader.specification(featureKey)
      },
      {
        label: "plan",
        schema: artifactSchemas.plan,
        value: plan,
        artifactPath: planArtifactPath(rootPath, featureKey),
        read: () => reader.plan(featureKey)
      },
      {
        label: "task graph",
        schema: artifactSchemas.taskGraph,
        value: validTaskGraph,
        artifactPath: taskGraphArtifactPath(rootPath, featureKey),
        read: () => reader.taskGraph(featureKey)
      },
      {
        label: "verification",
        schema: artifactSchemas.verification,
        value: validVerificationReport,
        artifactPath: verificationArtifactPath(rootPath, featureKey),
        read: () => reader.verification(featureKey)
      },
      {
        label: "task review",
        schema: reviewReportSchema,
        value: validReviewReport,
        artifactPath: taskReviewArtifactPath(rootPath, featureKey, taskId),
        read: () => reader.taskReview(featureKey, taskId)
      },
      {
        label: "assurance case",
        schema: artifactSchemas.assuranceCase,
        value: assuranceCase,
        artifactPath: assuranceCaseArtifactPath(rootPath, featureKey, taskId),
        read: () => reader.assuranceCase(featureKey, taskId)
      },
      {
        label: "current review pointer",
        schema: artifactSchemas.currentReviewDecision,
        value: currentReviewDecision,
        artifactPath: currentReviewDecisionArtifactPath(rootPath, featureKey, taskId),
        read: () => reader.currentReviewDecision(featureKey, taskId)
      },
      {
        label: "review history decision",
        schema: artifactSchemas.reviewDecision,
        value: reviewDecision,
        artifactPath: reviewDecisionHistoryArtifactPath(
          rootPath,
          featureKey,
          taskId,
          reviewDecision.decisionHash
        ),
        read: () => reader.reviewDecision(featureKey, taskId, reviewDecision.decisionHash)
      },
      {
        label: "run index",
        schema: artifactSchemas.runIndex,
        value: runIndex,
        artifactPath: runIndexArtifactPath(rootPath),
        read: () => reader.runIndex()
      }
    ];

    for (const artifact of cases) {
      const serialized = JSON.stringify(artifact.value);
      const schemaValue = artifact.schema.parse(JSON.parse(serialized));
      expect(schemaValue, `${artifact.label} schema round trip`).toEqual(artifact.value);
      await mkdir(path.dirname(artifact.artifactPath), { recursive: true });
      await writeFile(artifact.artifactPath, serialized, "utf8");

      const result = await artifact.read();

      expect(result.state, `${artifact.label} read state`).toBe("present");
      if (result.state === "present") {
        expect(result.path, `${artifact.label} source path`).toBe(artifact.artifactPath);
        expect(result.value, `${artifact.label} accessor value`).toEqual(schemaValue);
      }
    }
  });

  it("round-trips each Cockpit Markdown artifact with an explicit present state", async () => {
    const reader = createArtifactReader(rootPath);
    const cases = [
      {
        label: "constitution",
        value: "# Constitution\n\nCockpit renders; Kit decides.\n",
        artifactPath: constitutionMarkdownArtifactPath(rootPath),
        read: () => reader.constitution()
      },
      {
        label: "patterns",
        value: "# Patterns\n\n- Quote authoritative artifact values.\n",
        artifactPath: patternsArtifactPath(rootPath),
        read: () => reader.patterns()
      },
      {
        label: "project summary",
        value: "# Project summary\n\nA deterministic local artifact reader.\n",
        artifactPath: projectSummaryArtifactPath(rootPath),
        read: () => reader.projectSummary()
      },
      {
        label: "doctor report",
        value: "# Visp Doctor\n\nAll required artifacts are readable.\n",
        artifactPath: doctorReportArtifactPath(rootPath),
        read: () => reader.doctorReport()
      }
    ];

    for (const artifact of cases) {
      await mkdir(path.dirname(artifact.artifactPath), { recursive: true });
      await writeFile(artifact.artifactPath, artifact.value, "utf8");

      const result = await artifact.read();

      expect(result.state, `${artifact.label} read state`).toBe("present");
      if (result.state === "present") {
        expect(result.path, `${artifact.label} source path`).toBe(artifact.artifactPath);
        expect(result.value, `${artifact.label} accessor value`).toBe(artifact.value);
      }
    }
  });

  it("round-trips a run event from its JSONL file through the public event schema", async () => {
    const runEvent: RunEvent = {
      id: "EVT-000001",
      runId,
      type: "artifact_written",
      command: "verify",
      featureId: validFeature.id,
      featureSlug: validFeature.slug,
      taskId,
      message: "Verification evidence was written.",
      artifactPath: `.visp/features/${featureKey}/verification.json`,
      data: { evidenceCount: 1 },
      createdAt: timestamp
    };
    const artifactPath = runEventsPath(rootPath, runId);
    const serialized = `${JSON.stringify(runEvent)}\n`;
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, serialized, "utf8");

    const result = await readContainedTextArtifactState(rootPath, artifactPath, z.string().min(1));

    expect(result.state).toBe("present");
    if (result.state === "present") {
      expect(result.path).toBe(artifactPath);
      const events = result.value
        .trimEnd()
        .split("\n")
        .map((line) => runEventSchema.parse(JSON.parse(line)));
      expect(events).toEqual([runEvent]);
    }
  });
});
