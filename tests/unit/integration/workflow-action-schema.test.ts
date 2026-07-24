import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalJsonV1 } from "../../../src/integration/canonical-json.js";
import {
  DEFAULT_WORKFLOW_ACTION_PROTOCOL,
  SUPPORTED_WORKFLOW_ACTION_PROTOCOLS,
  generatedWorkflowActionSchemaHash,
  generateWorkflowActionSchemaDocument,
  workflowActionSchemaHash,
  workflowActionV2Schema,
  workflowActionV3Schema,
  workflowActionV31Schema
} from "../../../src/integration/workflow-action-schema.js";

const sha256 = `sha256:${"0".repeat(64)}`;

function validAction() {
  return {
    protocolVersion: "3.0",
    canonicalVersion: "1.0",
    actionId: sha256,
    phase: "implement",
    feature: { id: "001", slug: "note-pinning" },
    task: {
      id: "T001",
      title: "Implement pinning",
      status: "ready",
      dependsOn: [],
      parallelizable: false
    },
    taskClass: { state: "unavailable", reasonCode: "not_in_source_artifact" },
    risk: {
      level: { state: "available", value: "medium" },
      factors: { state: "unavailable", reasonCode: "not_in_source_artifact" }
    },
    assurance: {
      level: "kit_strict",
      profile: { state: "unavailable", reasonCode: "not_in_source_artifact" },
      workflowStrictness: { state: "available", value: "strict" }
    },
    goal: "Implement note pinning.",
    baseCommit: { state: "unavailable", reasonCode: "not_captured" },
    requiredReads: [
      {
        id: "project-policy",
        role: "policy",
        path: ".visp/policy.json",
        contentHash: sha256,
        freshness: "content_hash"
      }
    ],
    scope: {
      writablePaths: ["src/notes.ts"],
      expectedPaths: { state: "available", value: [] },
      forbiddenPaths: ["package.json"],
      operationLimits: { state: "unavailable", reasonCode: "not_captured" }
    },
    claims: { state: "available", value: [] },
    validationOracles: [],
    validationCommands: ["pnpm test"],
    requiredEvidence: { state: "unavailable", reasonCode: "not_in_source_artifact" },
    policy: {
      status: { state: "available", value: "valid" },
      appliedOverrides: {
        state: "available",
        value: [
          {
            overrideId: "OVR-001",
            ruleId: "VSP007",
            scope: "task",
            reason: "Approved exception.",
            expiresAt: null,
            appliedToStage: "implement",
            appliedToFeatureId: "001",
            appliedToTaskId: null
          }
        ]
      }
    },
    findings: [],
    verdict: "ready",
    nextCommand: "visp done --task T001"
  } as const;
}

function validAction31() {
  return {
    ...validAction(),
    protocolVersion: "3.1" as const,
    canonicalVersion: "1.1" as const,
    evidence: { state: "unavailable" as const, reasonCode: "source_missing" as const }
  };
}

function evidenceSummary() {
  const result = (
    id: string,
    freshness: Record<string, unknown>,
    outcome: Record<string, unknown>
  ) => ({
    id,
    requirementId: `REQ-${id}`,
    target: { kind: "command", command: "pnpm test" },
    freshness,
    independence: "pre_existing",
    outcome
  });
  return {
    version: "1.0",
    source: "candidate",
    artifact: {
      path: ".visp/features/001-note-pinning/assurance/T001/candidate-evidence.json",
      contentHash: sha256
    },
    generatedAt: "2026-07-25T00:00:00.000Z",
    outcome: "inconclusive",
    freshness: "stale",
    providers: [
      {
        id: "provider-candidate-command",
        provider: { id: "command", version: "1.0" },
        status: "passed",
        failure: null,
        results: [
          result(
            "passed",
            {
              status: "fresh",
              checkedAt: "2026-07-25T00:00:00.000Z",
              inputHashes: [{ id: "command", sha256 }]
            },
            { status: "passed" }
          ),
          result(
            "failed",
            {
              status: "stale",
              checkedAt: "2026-07-25T00:00:01.000Z",
              inputHashes: [],
              reason: "Input changed."
            },
            { status: "failed", reason: "Expectation failed." }
          ),
          result(
            "inconclusive",
            {
              status: "unknown",
              checkedAt: "2026-07-25T00:00:02.000Z",
              inputHashes: [],
              reason: "Input unavailable."
            },
            { status: "inconclusive", reason: "Provider unavailable." }
          ),
          result(
            "not-applicable",
            {
              status: "fresh",
              checkedAt: "2026-07-25T00:00:03.000Z",
              inputHashes: []
            },
            {
              status: "not_applicable",
              reason: "Rule excludes the check.",
              determination: { kind: "rule", ruleId: "VSP-EVIDENCE-NA" }
            }
          )
        ]
      }
    ],
    testStrength: {
      state: "available",
      value: {
        status: "passed",
        independence: ["pre_existing"],
        reason: "A pre-existing regression test is locked."
      }
    }
  } as const;
}

type ActionFixture = ReturnType<typeof validAction>;
type SchemaDocumentView = {
  readonly $schema: string;
  readonly $id: string;
  readonly type: string;
  readonly additionalProperties: boolean;
  readonly properties: Readonly<Record<string, { readonly const?: unknown }>>;
  readonly required: readonly string[];
};

function evidenceRequirement(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    version: "1.0",
    id: "EV001",
    providerId: "provider",
    target: { kind: "command", command: "pnpm test" },
    freshnessRule: "current",
    independenceRule: "independent",
    requiredVerdict: "passed",
    ...overrides
  };
}

describe("workflow-action runtime schemas", () => {
  it("keeps v2 permissiveness while exposing exact protocol constants", () => {
    expect(SUPPORTED_WORKFLOW_ACTION_PROTOCOLS).toEqual(["2.0", "3.0", "3.1"]);
    expect(DEFAULT_WORKFLOW_ACTION_PROTOCOL).toBe("2.0");
    expect(
      workflowActionV2Schema.parse({
        protocolVersion: "2.0",
        phase: "implement",
        taskId: null,
        goal: "",
        requiredReads: [{ path: "", role: "future-role", sha256: "not-a-hash" }],
        writablePaths: [""],
        forbiddenPaths: [],
        acceptanceOracles: [],
        validationCommands: [],
        assuranceLevel: "local_checked",
        verdict: "inconclusive",
        findings: [],
        nextCommand: ""
      })
    ).toBeDefined();
  });

  it("strictly accepts the complete v3 shape including nested override nulls", () => {
    expect(workflowActionV3Schema.parse(validAction())).toEqual(validAction());
  });

  it("strictly separates evidence-aware 3.1 from immutable 3.0", () => {
    expect(workflowActionV31Schema.parse(validAction31())).toEqual(validAction31());
    expect(() => workflowActionV3Schema.parse(validAction31())).toThrow();
    expect(() => workflowActionV31Schema.parse(validAction())).toThrow();
  });

  it("preserves every evidence status and freshness state in 3.1", () => {
    const action = {
      ...validAction31(),
      evidence: { state: "available" as const, value: evidenceSummary() }
    };
    const parsed = workflowActionV31Schema.parse(action);
    const results =
      parsed.evidence.state === "available"
        ? parsed.evidence.value.providers.flatMap((provider) => provider.results)
        : [];

    expect(results.map((result) => result.outcome.status)).toEqual([
      "passed",
      "failed",
      "inconclusive",
      "not_applicable"
    ]);
    expect(results.map((result) => result.freshness.status)).toEqual([
      "fresh",
      "stale",
      "unknown",
      "fresh"
    ]);
  });

  it.each([
    "next",
    "setup",
    "feature",
    "clarify",
    "spec",
    "plan",
    "tasks",
    "context",
    "implement",
    "verify",
    "review",
    "reconcile",
    "pr"
  ] as const)("accepts canonical phase %s", (phase) => {
    expect(workflowActionV3Schema.parse({ ...validAction(), phase }).phase).toBe(phase);
  });

  it.each([
    ["unknown top-level field", (value: ActionFixture) => ({ ...value, extra: true })],
    [
      "unknown nested field",
      (value: ActionFixture) => ({ ...value, risk: { ...value.risk, extra: true } })
    ],
    ["wrong protocol literal", (value: ActionFixture) => ({ ...value, protocolVersion: "2.0" })],
    ["wrong canonical literal", (value: ActionFixture) => ({ ...value, canonicalVersion: "2.0" })],
    ["malformed action identity", (value: ActionFixture) => ({ ...value, actionId: "sha256:ABC" })],
    ["empty goal", (value: ActionFixture) => ({ ...value, goal: "" })],
    ["empty next command", (value: ActionFixture) => ({ ...value, nextCommand: "" })],
    [
      "unsafe path",
      (value: ActionFixture) => ({
        ...value,
        scope: { ...value.scope, writablePaths: ["../secret"] }
      })
    ],
    [
      "malformed content hash",
      (value: ActionFixture) => ({
        ...value,
        requiredReads: [{ ...value.requiredReads[0], contentHash: "sha256:ABC" }]
      })
    ],
    [
      "wrong read freshness literal",
      (value: ActionFixture) => ({
        ...value,
        requiredReads: [{ ...value.requiredReads[0], freshness: "mtime" }]
      })
    ],
    [
      "wrong risk-factor version literal",
      (value: ActionFixture) => ({
        ...value,
        risk: {
          ...value.risk,
          factors: {
            state: "available",
            value: [{ version: "2.0", code: "schema" }]
          }
        }
      })
    ],
    [
      "wrong operation-limits version literal",
      (value: ActionFixture) => ({
        ...value,
        scope: {
          ...value.scope,
          operationLimits: {
            state: "available",
            value: { version: "2.0", maxChangedFiles: 4, dependencyChangesAllowed: false }
          }
        }
      })
    ],
    [
      "wrong evidence version literal",
      (value: ActionFixture) => ({
        ...value,
        requiredEvidence: { state: "available", value: [evidenceRequirement({ version: "2.0" })] }
      })
    ],
    [
      "wrong evidence verdict literal",
      (value: ActionFixture) => ({
        ...value,
        requiredEvidence: {
          state: "available",
          value: [evidenceRequirement({ requiredVerdict: "warning" })]
        }
      })
    ],
    [
      "Kit local_checked assurance",
      (value: ActionFixture) => ({
        ...value,
        assurance: { ...value.assurance, level: "local_checked" }
      })
    ],
    [
      "invalid unavailable reason",
      (value: ActionFixture) => ({
        ...value,
        taskClass: { state: "unavailable", reasonCode: "guessed" }
      })
    ],
    ["null enrichment", (value: ActionFixture) => ({ ...value, taskClass: null })],
    [
      "contradictory declared value",
      (value: ActionFixture) => ({
        ...value,
        taskClass: { state: "available", value: "refactor", reasonCode: "not_captured" }
      })
    ]
  ])("rejects %s", (_name, mutate) => {
    expect(() => workflowActionV3Schema.parse(mutate(validAction()))).toThrow();
  });

  it.each([
    "/absolute",
    "C:/absolute",
    "src\\windows.ts",
    "src//double.ts",
    "src/./dot.ts",
    "src/../traversal.ts",
    "src/trailing/",
    "src/\0nul.ts"
  ])("rejects unsafe canonical path %j", (unsafePath) => {
    const value = validAction();
    expect(() =>
      workflowActionV3Schema.parse({
        ...value,
        scope: { ...value.scope, writablePaths: [unsafePath] }
      })
    ).toThrow();
  });

  it("keeps available-empty, unavailable, and not-applicable distinct", () => {
    const base = validAction();
    expect(
      workflowActionV3Schema.parse({
        ...base,
        taskClass: { state: "available", value: "documentation" },
        scope: {
          ...base.scope,
          expectedPaths: { state: "available", value: [] }
        }
      }).scope.expectedPaths
    ).toEqual({ state: "available", value: [] });
    expect(
      workflowActionV3Schema.parse({
        ...base,
        taskClass: { state: "unavailable", reasonCode: "not_captured" },
        scope: {
          ...base.scope,
          expectedPaths: { state: "unavailable", reasonCode: "source_missing" }
        }
      }).scope.expectedPaths
    ).toEqual({ state: "unavailable", reasonCode: "source_missing" });
    expect(
      workflowActionV3Schema.parse({
        ...base,
        task: null,
        taskClass: { state: "not_applicable", reasonCode: "no_active_task" }
      }).taskClass
    ).toEqual({ state: "not_applicable", reasonCode: "no_active_task" });
    expect(
      workflowActionV3Schema.parse({
        ...base,
        scope: {
          ...base.scope,
          operationLimits: {
            state: "available",
            value: { version: "1.0", maxChangedFiles: 4, dependencyChangesAllowed: false }
          }
        }
      }).scope.operationLimits
    ).toEqual({
      state: "available",
      value: { version: "1.0", maxChangedFiles: 4, dependencyChangesAllowed: false }
    });
  });

  it("accepts authoritative top-level feature and task absence", () => {
    expect(
      workflowActionV3Schema.parse({
        ...validAction(),
        feature: null,
        task: null,
        taskClass: { state: "not_applicable", reasonCode: "no_active_task" },
        claims: { state: "not_applicable", reasonCode: "no_active_task" }
      })
    ).toMatchObject({ feature: null, task: null });
  });

  it.each(Object.keys(validAction()))("requires top-level field %s", (field) => {
    const entries = Object.entries(validAction()).filter(([key]) => key !== field);
    expect(() => workflowActionV3Schema.parse(Object.fromEntries(entries))).toThrow();
  });

  it.each([
    ["risk.level", (value: ActionFixture) => ({ ...value, risk: { factors: value.risk.factors } })],
    [
      "assurance.profile",
      (value: ActionFixture) => ({
        ...value,
        assurance: {
          level: value.assurance.level,
          workflowStrictness: value.assurance.workflowStrictness
        }
      })
    ],
    [
      "scope.expectedPaths",
      (value: ActionFixture) => ({
        ...value,
        scope: {
          writablePaths: value.scope.writablePaths,
          forbiddenPaths: value.scope.forbiddenPaths,
          operationLimits: value.scope.operationLimits
        }
      })
    ],
    [
      "requiredReads.contentHash",
      (value: ActionFixture) => ({
        ...value,
        requiredReads: [
          {
            id: value.requiredReads[0].id,
            role: value.requiredReads[0].role,
            path: value.requiredReads[0].path,
            freshness: value.requiredReads[0].freshness
          }
        ]
      })
    ]
  ])("requires nested field %s", (_field, mutate) => {
    expect(() => workflowActionV3Schema.parse(mutate(validAction()))).toThrow();
  });

  it("locks every task, classification, risk, and assurance enum value", () => {
    const base = validAction();
    for (const status of ["pending", "ready", "in_progress", "blocked", "done", "verified"]) {
      expect(
        workflowActionV3Schema.parse({
          ...base,
          task: { ...base.task, status }
        }).task?.status
      ).toBe(status);
    }
    for (const taskClass of [
      "localized_bug",
      "bounded_feature",
      "cross_file_change",
      "regression_test",
      "refactor",
      "migration",
      "security",
      "documentation"
    ]) {
      expect(
        workflowActionV3Schema.parse({
          ...base,
          taskClass: { state: "available", value: taskClass }
        }).taskClass
      ).toEqual({ state: "available", value: taskClass });
    }
    for (const level of ["low", "medium", "high"]) {
      expect(
        workflowActionV3Schema.parse({
          ...base,
          risk: { ...base.risk, level: { state: "available", value: level } }
        }).risk.level
      ).toEqual({ state: "available", value: level });
    }
    for (const code of [
      "authentication",
      "authorization",
      "cryptography",
      "public_api",
      "schema",
      "dependency",
      "concurrency",
      "permissions",
      "deployment",
      "data_migration"
    ]) {
      expect(
        workflowActionV3Schema.parse({
          ...base,
          risk: {
            ...base.risk,
            factors: { state: "available", value: [{ version: "1.0", code }] }
          }
        }).risk.factors
      ).toEqual({ state: "available", value: [{ version: "1.0", code }] });
    }
    for (const profile of ["routine", "behavioral", "critical"]) {
      expect(
        workflowActionV3Schema.parse({
          ...base,
          assurance: {
            ...base.assurance,
            profile: { state: "available", value: profile }
          }
        }).assurance.profile
      ).toEqual({ state: "available", value: profile });
    }
    for (const strictness of ["relaxed", "standard", "strict", "locked"]) {
      expect(
        workflowActionV3Schema.parse({
          ...base,
          assurance: {
            ...base.assurance,
            workflowStrictness: { state: "available", value: strictness }
          }
        }).assurance.workflowStrictness
      ).toEqual({ state: "available", value: strictness });
    }
    for (const level of ["kit_strict", "advisory"]) {
      expect(
        workflowActionV3Schema.parse({
          ...base,
          assurance: { ...base.assurance, level }
        }).assurance.level
      ).toBe(level);
    }
  });

  it("locks read, claim, oracle, evidence, and policy enum values", () => {
    const base = validAction();
    for (const role of [
      "policy",
      "intent",
      "specification",
      "plan",
      "task_graph",
      "context_pack",
      "implementation_prompt",
      "oracle_plan"
    ]) {
      expect(
        workflowActionV3Schema.parse({
          ...base,
          requiredReads: [{ ...base.requiredReads[0], role }]
        }).requiredReads[0]?.role
      ).toBe(role);
    }
    for (const validationMethod of ["unit", "integration", "e2e", "manual", "static"]) {
      expect(
        workflowActionV3Schema.parse({
          ...base,
          validationOracles: [
            {
              id: "AC001",
              claimId: "REQ001",
              statement: "Pinning works.",
              testable: true,
              validationMethod
            }
          ]
        }).validationOracles[0]?.validationMethod
      ).toBe(validationMethod);
    }
    for (const priority of ["must", "should", "could"]) {
      expect(
        workflowActionV3Schema.parse({
          ...base,
          claims: {
            state: "available",
            value: [
              {
                id: "REQ001",
                statement: "Pinning is explicit.",
                priority,
                acceptanceCriterionIds: ["AC001"],
                accountableOwner: { state: "unavailable", reasonCode: "not_captured" }
              }
            ]
          }
        }).claims
      ).toMatchObject({ state: "available", value: [{ priority }] });
    }
    const targets = [
      { kind: "command", command: "pnpm test" },
      { kind: "validation_oracle", oracleId: "AC001" },
      { kind: "static_check", checkId: "TYPECHECK" },
      { kind: "security_check", checkId: "SAST" },
      { kind: "human_review", reviewId: "REVIEW001" }
    ];
    for (const target of targets) {
      const parsed = workflowActionV3Schema.parse({
        ...base,
        requiredEvidence: {
          state: "available",
          value: [
            {
              version: "1.0",
              id: "EV001",
              providerId: "provider",
              target,
              freshnessRule: "current",
              independenceRule: "independent",
              requiredVerdict: "passed"
            }
          ]
        }
      });
      expect(parsed.requiredEvidence).toMatchObject({
        state: "available",
        value: [{ target }]
      });
    }
    for (const status of ["valid", "missing", "invalid", "default"]) {
      expect(
        workflowActionV3Schema.parse({
          ...base,
          policy: { ...base.policy, status: { state: "available", value: status } }
        }).policy.status
      ).toEqual({ state: "available", value: status });
    }
    for (const scope of ["project", "feature", "task", "stage"]) {
      const override = { ...base.policy.appliedOverrides.value[0], scope };
      expect(
        workflowActionV3Schema.parse({
          ...base,
          policy: {
            ...base.policy,
            appliedOverrides: { state: "available", value: [override] }
          }
        }).policy.appliedOverrides
      ).toMatchObject({ state: "available", value: [{ scope }] });
    }
    for (const appliedToStage of [
      "next",
      "setup",
      "feature",
      "clarify",
      "spec",
      "plan",
      "tasks",
      "context",
      "implement",
      "verify",
      "review",
      "reconcile",
      "pr"
    ]) {
      const override = { ...base.policy.appliedOverrides.value[0], appliedToStage };
      expect(
        workflowActionV3Schema.parse({
          ...base,
          policy: {
            ...base.policy,
            appliedOverrides: { state: "available", value: [override] }
          }
        }).policy.appliedOverrides
      ).toMatchObject({ state: "available", value: [{ appliedToStage }] });
    }
  });

  it("locks finding, verdict, and availability reason vocabularies", () => {
    const base = validAction();
    for (const source of ["policy", "workflow", "contract", "freshness"]) {
      for (const severity of ["info", "warning", "error"]) {
        for (const effect of ["none", "blocks", "uncertain"]) {
          const parsed = workflowActionV3Schema.parse({
            ...base,
            findings: [
              {
                code: "VISP.TEST",
                source,
                severity,
                effect,
                message: "Finding message.",
                recommendation: "Review the finding.",
                evidence: []
              }
            ]
          });
          expect(parsed.findings[0]).toMatchObject({ source, severity, effect });
        }
      }
    }
    for (const verdict of ["ready", "blocked", "inconclusive"]) {
      expect(workflowActionV3Schema.parse({ ...base, verdict }).verdict).toBe(verdict);
    }
    for (const reasonCode of [
      "not_in_source_artifact",
      "not_in_protocol",
      "source_missing",
      "source_invalid",
      "not_captured",
      "unsupported"
    ]) {
      expect(
        workflowActionV3Schema.parse({
          ...base,
          taskClass: { state: "unavailable", reasonCode }
        }).taskClass
      ).toEqual({ state: "unavailable", reasonCode });
    }
    for (const reasonCode of [
      "no_active_feature",
      "no_active_task",
      "stage_does_not_require_value"
    ]) {
      expect(
        workflowActionV3Schema.parse({
          ...base,
          taskClass: { state: "not_applicable", reasonCode }
        }).taskClass
      ).toEqual({ state: "not_applicable", reasonCode });
    }
  });
});

describe("generated workflow-action schemas", () => {
  it("contains exactly the supported schema artifacts", async () => {
    expect((await readdir(path.join(process.cwd(), "schemas", "workflow-action"))).sort()).toEqual([
      "2.0.schema.json",
      "3.0.schema.json",
      "3.1.schema.json"
    ]);
  });

  it.each([
    "2.0",
    "3.0",
    "3.1"
  ] as const)("matches the committed %s artifact document", async (protocol) => {
    const filePath = path.join(
      process.cwd(),
      "schemas",
      "workflow-action",
      `${protocol}.schema.json`
    );
    const text = await readFile(filePath, "utf8");
    expect(JSON.parse(text)).toEqual(generateWorkflowActionSchemaDocument(protocol));
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("uses stable metadata, closed objects, and protocol literals", () => {
    const v2 = generateWorkflowActionSchemaDocument("2.0") as SchemaDocumentView;
    const v3 = generateWorkflowActionSchemaDocument("3.0") as SchemaDocumentView;
    const v31 = generateWorkflowActionSchemaDocument("3.1") as SchemaDocumentView;

    expect(v2).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "urn:visp:schema:workflow-action:2.0",
      type: "object",
      additionalProperties: false
    });
    expect(v3).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "urn:visp:schema:workflow-action:3.0",
      type: "object",
      additionalProperties: false
    });
    expect(v31).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "urn:visp:schema:workflow-action:3.1",
      type: "object",
      additionalProperties: false
    });
    expect(v2.properties.protocolVersion.const).toBe("2.0");
    expect(v3.properties.protocolVersion.const).toBe("3.0");
    expect(v31.properties.protocolVersion.const).toBe("3.1");
    expect(v3.required).toEqual(Object.keys(validAction()));
    expect(v31.required).toEqual(Object.keys(validAction31()));
  });

  it("hashes canonical parsed JSON rather than formatting", async () => {
    expect({
      "2.0": workflowActionSchemaHash("2.0"),
      "3.0": workflowActionSchemaHash("3.0"),
      "3.1": workflowActionSchemaHash("3.1")
    }).toEqual({
      "2.0": "sha256:c63b279b1ce89f047b2be696a47e845a57adda7f8437892e211e3a4cfad39ed6",
      "3.0": "sha256:ceb45ad3a27a4172c4dbe7e7caacf473570f4578eda27744662a8ed094e96ce7",
      "3.1": "sha256:41ffa28fcd4476ea1812ff307df67a7ab7edb5b2cf4d6c11955d34d4aad74d4d"
    });

    for (const protocol of SUPPORTED_WORKFLOW_ACTION_PROTOCOLS) {
      const document = generateWorkflowActionSchemaDocument(protocol);
      const reparsed = JSON.parse(`\n${JSON.stringify(document, null, 4)}\n`);
      const committedText = await readFile(
        path.join(process.cwd(), "schemas", "workflow-action", `${protocol}.schema.json`),
        "utf8"
      );
      const independentHash = `sha256:${createHash("sha256")
        .update(canonicalJsonV1(JSON.parse(committedText)), "utf8")
        .digest("hex")}`;
      expect(canonicalJsonV1(reparsed)).toBe(canonicalJsonV1(document));
      expect(generatedWorkflowActionSchemaHash(protocol)).toBe(independentHash);
      expect(workflowActionSchemaHash(protocol)).toBe(independentHash);
    }
  });

  it("keeps generated schema documents and accepted hashes immutable", () => {
    const document = generateWorkflowActionSchemaDocument("3.0");
    const text = JSON.stringify(document);
    const hash = workflowActionSchemaHash("3.0");

    expect(Object.isFrozen(document)).toBe(true);
    expect(Reflect.set(document, "title", "tampered")).toBe(false);
    expect(JSON.stringify(generateWorkflowActionSchemaDocument("3.0"))).toBe(text);
    expect(workflowActionSchemaHash("3.0")).toBe(hash);
    expect(Object.isFrozen(SUPPORTED_WORKFLOW_ACTION_PROTOCOLS)).toBe(true);
  });

  it("closes every object shape in both generated documents", () => {
    const assertClosed = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) assertClosed(item);
        return;
      }
      if (value === null || typeof value !== "object") return;

      const object = value as Record<string, unknown>;
      if (object.type === "object") expect(object.additionalProperties).toBe(false);
      for (const nested of Object.values(object)) assertClosed(nested);
    };

    assertClosed(generateWorkflowActionSchemaDocument("2.0"));
    assertClosed(generateWorkflowActionSchemaDocument("3.0"));
  });
});
