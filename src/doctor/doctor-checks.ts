import {
  cacheArtifactDir,
  compactConstitutionArtifactPath,
  contextPackArtifactPath,
  evaluationReportArtifactPath,
  featureIntentArtifactPath,
  featurePrArtifactPath,
  featureReconcileArtifactPath,
  featureReviewArtifactPath,
  featuresArtifactDir,
  memoryArtifactDir,
  overridesArtifactPath,
  planArtifactPath,
  policyArtifactPath,
  promptArtifactPath,
  projectConfigArtifactPath,
  projectProfileArtifactPath,
  projectStatusArtifactPath,
  promptsArtifactDir,
  reportsArtifactDir,
  runIndexArtifactPath,
  runsArtifactDir,
  specArtifactPath,
  taskGraphArtifactPath,
  taskReconcileArtifactPath,
  taskReviewArtifactPath,
  traceabilityArtifactPath,
  verificationArtifactPath,
  workflowManifestArtifactPath,
  presetsArtifactDir
} from "../artifacts/artifact-paths.js";
import { type ZodTypeAny } from "zod";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { contextPackSchema } from "../artifacts/schemas/context-pack.schema.js";
import { evaluationReportSchema } from "../artifacts/schemas/evaluation.schema.js";
import { policyArtifactSchema } from "../artifacts/schemas/policy.schema.js";
import { overrideArtifactSchema } from "../artifacts/schemas/override.schema.js";
import { agentCapabilitiesPath } from "../agent/agent-paths.js";
import { agentCapabilitiesSchema } from "../artifacts/schemas/agent.schema.js";
import { featureIntentSchema } from "../artifacts/schemas/feature.schema.js";
import { planDraftArtifactSchema } from "../artifacts/schemas/plan.schema.js";
import { prArtifactSchema } from "../artifacts/schemas/pr.schema.js";
import {
  projectConfigSchema,
  projectProfileSchema,
  projectStatusSchema
} from "../artifacts/schemas/project.schema.js";
import { reconcileReportSchema } from "../artifacts/schemas/reconcile.schema.js";
import { reviewReportSchema } from "../artifacts/schemas/review.schema.js";
import { specArtifactSchema } from "../artifacts/schemas/spec.schema.js";
import { taskGraphArtifactSchema } from "../artifacts/schemas/task.schema.js";
import { traceabilityMatrixSchema } from "../artifacts/schemas/traceability.schema.js";
import { verificationReportSchema } from "../artifacts/schemas/verification.schema.js";
import { runIndexSchema } from "../artifacts/schemas/run.schema.js";
import { workflowManifestSchema } from "../artifacts/schemas/workflow.schema.js";
import { pathExists, readTextFile } from "../core/file-system.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { loadEffectivePolicy } from "../policy/policy-loader.js";
import { readOverrideStore } from "../overrides/override-store.js";
import { validateOverrideArtifact } from "../overrides/override-validator.js";

export type DoctorCheckName = "project" | "artifacts" | "agent" | "git" | "cache" | "schemas";

export type DoctorFinding = {
  readonly id: string;
  readonly category: DoctorCheckName;
  readonly severity: "info" | "warning" | "error";
  readonly title: string;
  readonly description: string;
  readonly file: string | null;
  readonly recommendation: string;
  readonly autoFixable: boolean;
};

export type DoctorCheckResult = {
  readonly name: DoctorCheckName;
  readonly status: "passed" | "warnings" | "failed";
  readonly findings: readonly DoctorFinding[];
};

async function exists(filePath: string): Promise<boolean> {
  const result = await pathExists(filePath);
  return result.ok && result.value;
}

function finding(input: Omit<DoctorFinding, "id">): DoctorFinding {
  return {
    id: "pending",
    ...input
  };
}

function numberFindings(findings: readonly DoctorFinding[]): readonly DoctorFinding[] {
  return findings.map((item, index) => ({
    ...item,
    id: `DOC${String(index + 1).padStart(3, "0")}`
  }));
}

function result(name: DoctorCheckName, findings: readonly DoctorFinding[]): DoctorCheckResult {
  const numbered = numberFindings(findings);

  return {
    name,
    status: numbered.some((item) => item.severity === "error")
      ? "failed"
      : numbered.some((item) => item.severity === "warning")
        ? "warnings"
        : "passed",
    findings: numbered
  };
}

function renumberChecks(checks: readonly DoctorCheckResult[]): readonly DoctorCheckResult[] {
  let nextId = 1;

  return checks.map((check) => ({
    ...check,
    findings: check.findings.map((item) => ({
      ...item,
      id: `DOC${String(nextId++).padStart(3, "0")}`
    }))
  }));
}

export async function checkProject(state: ProjectState): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];

  if (!state.initialized) {
    findings.push(
      finding({
        category: "project",
        severity: "error",
        title: "Project is not initialized",
        description: "The target path does not contain a .visp directory.",
        file: ".visp",
        recommendation: "Run visp-kit init.",
        autoFixable: false
      })
    );

    return result("project", findings);
  }

  for (const [label, filePath] of [
    [".visp/project.json", projectProfileArtifactPath(state.targetPath)],
    [".visp/config.json", projectConfigArtifactPath(state.targetPath)],
    [".visp/status.json", projectStatusArtifactPath(state.targetPath)]
  ] as const) {
    if (!(await exists(filePath))) {
      findings.push(
        finding({
          category: "project",
          severity: "error",
          title: "Required project artifact missing",
          description: `${label} is missing.`,
          file: label,
          recommendation: "Run visp-kit init or restore the missing artifact.",
          autoFixable: false
        })
      );
    }
  }

  if (!(await exists(policyArtifactPath(state.targetPath)))) {
    findings.push(
      finding({
        category: "project",
        severity: "warning",
        title: "Policy artifact missing",
        description:
          ".visp/policy.json is missing, so Visp falls back to an in-memory default policy.",
        file: ".visp/policy.json",
        recommendation: "Run visp-kit policy init --strictness strict.",
        autoFixable: true
      })
    );
  }

  for (const [label, dirPath] of [
    [".visp/features", featuresArtifactDir(state.targetPath)],
    [".visp/memory", memoryArtifactDir(state.targetPath)],
    [".visp/cache", cacheArtifactDir(state.targetPath)],
    [".visp/reports", reportsArtifactDir(state.targetPath)],
    [".visp/prompts", promptsArtifactDir(state.targetPath)],
    [".visp/runs", runsArtifactDir(state.targetPath)],
    [".visp/presets", presetsArtifactDir(state.targetPath)]
  ] as const) {
    if (!(await exists(dirPath))) {
      findings.push(
        finding({
          category: "project",
          severity: "warning",
          title: "Required directory missing",
          description: `${label} is missing.`,
          file: label,
          recommendation: "Run visp-kit doctor --fix to recreate safe directories.",
          autoFixable: true
        })
      );
    }
  }

  return result("project", findings);
}

/**
 * Artifacts `visp-kit init` always writes, so their absence in an initialized
 * project means something removed them.
 *
 * Deliberately narrow: everything else in the schema list is optional by
 * design — overrides, evaluation reports, agent capabilities, and every
 * feature-scoped artifact are absent until the workflow that writes them runs.
 * Marking those required would report a healthy new project as broken.
 */
const REQUIRED_ARTIFACTS = new Set([
  ".visp/project.json",
  ".visp/config.json",
  ".visp/status.json",
  ".visp/policy.json",
  ".visp/workflow.json",
  ".visp/runs/index.json"
]);

export async function checkSchemas(state: ProjectState): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];

  if (!state.initialized) return result("schemas", findings);

  const featureKey = state.selectedFeature?.key;
  const selectedTaskId = state.selectedTask?.id;
  const schemaChecks: Array<readonly [string, string, ZodTypeAny]> = [
    [".visp/project.json", projectProfileArtifactPath(state.targetPath), projectProfileSchema],
    [".visp/config.json", projectConfigArtifactPath(state.targetPath), projectConfigSchema],
    [".visp/status.json", projectStatusArtifactPath(state.targetPath), projectStatusSchema],
    [".visp/policy.json", policyArtifactPath(state.targetPath), policyArtifactSchema],
    [".visp/overrides.json", overridesArtifactPath(state.targetPath), overrideArtifactSchema],
    [".visp/workflow.json", workflowManifestArtifactPath(state.targetPath), workflowManifestSchema],
    [".visp/runs/index.json", runIndexArtifactPath(state.targetPath), runIndexSchema],
    [
      ".visp/reports/evaluation-report.json",
      evaluationReportArtifactPath(state.targetPath),
      evaluationReportSchema
    ],
    [
      ".visp/agent/capabilities.json",
      agentCapabilitiesPath(state.targetPath),
      agentCapabilitiesSchema
    ],
    ...(featureKey === undefined
      ? []
      : ([
          [
            `.visp/features/${featureKey}/intent.json`,
            featureIntentArtifactPath(state.targetPath, featureKey),
            featureIntentSchema
          ],
          [
            `.visp/features/${featureKey}/spec.json`,
            specArtifactPath(state.targetPath, featureKey),
            specArtifactSchema
          ],
          [
            `.visp/features/${featureKey}/plan.json`,
            planArtifactPath(state.targetPath, featureKey),
            planDraftArtifactSchema
          ],
          [
            `.visp/features/${featureKey}/task-graph.json`,
            taskGraphArtifactPath(state.targetPath, featureKey),
            taskGraphArtifactSchema
          ],
          [
            `.visp/features/${featureKey}/traceability.json`,
            traceabilityArtifactPath(state.targetPath, featureKey),
            traceabilityMatrixSchema
          ],
          [
            `.visp/features/${featureKey}/verification.json`,
            verificationArtifactPath(state.targetPath, featureKey),
            verificationReportSchema
          ],
          [
            `.visp/features/${featureKey}/review.json`,
            featureReviewArtifactPath(state.targetPath, featureKey),
            reviewReportSchema
          ],
          [
            `.visp/features/${featureKey}/reconcile.json`,
            featureReconcileArtifactPath(state.targetPath, featureKey),
            reconcileReportSchema
          ],
          [
            `.visp/features/${featureKey}/pr.json`,
            featurePrArtifactPath(state.targetPath, featureKey),
            prArtifactSchema
          ],
          ...(selectedTaskId === undefined
            ? []
            : ([
                [
                  `.visp/features/${featureKey}/context/${selectedTaskId}.context.json`,
                  contextPackArtifactPath(state.targetPath, featureKey, selectedTaskId),
                  contextPackSchema
                ],
                [
                  `.visp/features/${featureKey}/review/${selectedTaskId}.review.json`,
                  taskReviewArtifactPath(state.targetPath, featureKey, selectedTaskId),
                  reviewReportSchema
                ],
                [
                  `.visp/features/${featureKey}/reconcile/${selectedTaskId}.reconcile.json`,
                  taskReconcileArtifactPath(state.targetPath, featureKey, selectedTaskId),
                  reconcileReportSchema
                ]
              ] as const))
        ] as const))
  ];

  for (const [label, filePath, schema] of schemaChecks) {
    if (!(await exists(filePath))) {
      // Deleting an artifact used to be quieter than corrupting one: a missing
      // file was skipped while a malformed file was an error. An interrupted
      // run leaves files missing rather than malformed, so it was exactly the
      // case that slipped through.
      if (REQUIRED_ARTIFACTS.has(label)) {
        findings.push(
          finding({
            category: "schemas",
            severity: "error",
            title: "Required artifact missing",
            description: `${label} is required for an initialized project but is not present.`,
            file: label,
            recommendation: "Restore the artifact from version control, or re-run visp-kit init.",
            autoFixable: false
          })
        );
      }

      continue;
    }

    const artifact = await readArtifact(filePath, schema, { artifactName: label });

    if (!artifact.ok) {
      findings.push(
        finding({
          category: "schemas",
          severity: "error",
          title: "Invalid JSON artifact",
          description: artifact.error.message,
          file: label,
          recommendation: "Repair the JSON artifact manually.",
          autoFixable: false
        })
      );
    }
  }

  return result("schemas", findings);
}

export async function checkCache(state: ProjectState): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];

  if (!state.initialized) return result("cache", findings);

  for (const [label, present] of Object.entries(state.scanCacheFiles)) {
    if (!present) {
      findings.push(
        finding({
          category: "cache",
          severity: "warning",
          title: "Scan cache missing",
          description: `${label} is missing.`,
          file: `.visp/cache/${label}`,
          recommendation: "Run visp-kit scan --changed.",
          autoFixable: false
        })
      );
    }
  }

  if (!(await exists(compactConstitutionArtifactPath(state.targetPath)))) {
    findings.push(
      finding({
        category: "cache",
        severity: "warning",
        title: "Compact constitution missing",
        description: "constitution.compact.md is missing.",
        file: ".visp/memory/constitution.compact.md",
        recommendation: "Run visp-kit constitution.",
        autoFixable: false
      })
    );
  }

  return result("cache", findings);
}

export async function checkGit(state: ProjectState): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];

  if (!state.git.isRepo) {
    findings.push(
      finding({
        category: "git",
        severity: "warning",
        title: "Git repository unavailable",
        description: "Git diff and PR summaries will be limited.",
        file: null,
        recommendation: "Initialize Git or run from a Git project root.",
        autoFixable: false
      })
    );
  } else if (state.git.changedFiles.length > 0) {
    findings.push(
      finding({
        category: "git",
        severity: "info",
        title: "Working tree has changes",
        description: `${state.git.changedFiles.length} changed file(s) detected.`,
        file: null,
        recommendation: "Run visp-kit verify/review/reconcile before PR.",
        autoFixable: false
      })
    );
  }

  return result("git", findings);
}

export async function checkAgent(state: ProjectState): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];

  // D-118 decision 4: the generated CI workflow is the one asset whose
  // breakage lands in the user's pipeline at their next pull request, not in
  // their terminal — so a stale one is named here, loudly, as an error.
  const ciWorkflowPath = `${state.targetPath}/.github/workflows/visp-evidence.yml`;
  if (await exists(ciWorkflowPath)) {
    const ciText = await readTextFile(ciWorkflowPath);
    if (ciText.ok && /^\s*run: visp (?!-)/mu.test(ciText.value)) {
      findings.push(
        finding({
          category: "agent",
          severity: "error",
          title: "Generated CI workflow uses the removed `visp` command",
          description:
            "`.github/workflows/visp-evidence.yml` installs visp-kit and then runs `visp ...`. Since visp-kit 0.4.0 that package provides the `visp-kit` command, so this workflow fails command-not-found on the next pull request.",
          file: ".github/workflows/visp-evidence.yml",
          recommendation: "Run visp-kit hooks ci --force to regenerate it, then commit the result.",
          autoFixable: false
        })
      );
    }
  }

  if (state.config?.agent === "codex") {
    const agents = await exists(`${state.targetPath}/AGENTS.md`);
    const agentsVisp = await exists(`${state.targetPath}/AGENTS.visp.md`);
    const skillDir = await exists(`${state.targetPath}/.agents/skills`);

    if (!agents && !agentsVisp) {
      findings.push(
        finding({
          category: "agent",
          severity: "warning",
          title: "Codex guidance file missing",
          description: "Neither AGENTS.md nor AGENTS.visp.md exists.",
          file: "AGENTS.md",
          recommendation: "Run visp-kit agent bootstrap codex or visp-kit agent install codex.",
          autoFixable: false
        })
      );
    }

    const guidancePath = agents
      ? `${state.targetPath}/AGENTS.md`
      : agentsVisp
        ? `${state.targetPath}/AGENTS.visp.md`
        : null;
    if (guidancePath !== null) {
      const text = await readTextFile(guidancePath);

      if (
        !text.ok ||
        !text.value.includes("The user prompt is raw intent only") ||
        // Dual vocabulary (D-119): guidance generated before the rename says
        // `visp gate implement`; both count during the deprecation window.
        !(
          text.value.includes("visp-kit gate implement") ||
          text.value.includes("visp gate implement")
        )
      ) {
        findings.push(
          finding({
            category: "agent",
            severity: "warning",
            title: "Codex guidance is missing strict Visp policy language",
            description:
              "Agent guidance should say that user prompts cannot override Visp policy and that implementation requires visp-kit gate implement.",
            file: agents ? "AGENTS.md" : "AGENTS.visp.md",
            recommendation:
              "Run visp-kit agent refresh --target codex --force only if it is safe to refresh generated guidance, or merge AGENTS.visp.md manually.",
            autoFixable: false
          })
        );
      }
    }

    if (!skillDir) {
      findings.push(
        finding({
          category: "agent",
          severity: "warning",
          title: "Codex skills folder missing",
          description: ".agents/skills is missing.",
          file: ".agents/skills",
          recommendation: "Add project-specific Codex skills if this project uses Codex guidance.",
          autoFixable: false
        })
      );
    }

    const taskSkill = `${state.targetPath}/.agents/skills/visp-task/SKILL.md`;
    if (await exists(taskSkill)) {
      const text = await readTextFile(taskSkill);

      if (!text.ok || !text.value.includes("visp-kit gate") || !text.value.includes("raw intent")) {
        findings.push(
          finding({
            category: "agent",
            severity: "warning",
            title: "Visp task skill is missing policy reminders",
            description:
              "The generated task skill should tell agents to obey Visp policy and stop on failed gates.",
            file: ".agents/skills/visp-task/SKILL.md",
            recommendation: "Run visp-kit agent refresh --target codex --force.",
            autoFixable: false
          })
        );
      }
    }
  }

  return result("agent", findings);
}

export async function checkArtifacts(state: ProjectState): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];

  if (
    state.selectedFeature !== undefined &&
    !state.artifactSummary.taskGraph &&
    state.status?.currentState === "tasks_ready"
  ) {
    findings.push(
      finding({
        category: "artifacts",
        severity: "error",
        title: "Task graph missing for tasks-ready state",
        description: "status.json says tasks are ready, but task-graph.json is missing.",
        file: `${state.selectedFeature.relativePath}/task-graph.json`,
        recommendation: "Run visp-kit tasks.",
        autoFixable: false
      })
    );
  }

  if (state.artifactSummary.context) {
    const prompt = await readTextFile(promptArtifactPath(state.targetPath, "current-task"));

    if (!prompt.ok || !prompt.value.startsWith("# Strict Visp Task Prompt")) {
      findings.push(
        finding({
          category: "artifacts",
          severity: "warning",
          title: "Current task prompt is missing strict policy header",
          description:
            "The generated current-task prompt should remind agents that user prompts cannot override Visp policy.",
          file: ".visp/prompts/current-task.prompt.md",
          recommendation:
            "Run visp-kit context --next --force or visp-kit context <task-id> --force.",
          autoFixable: false
        })
      );
    }
  }

  if (state.pr !== undefined && state.pr.policyGate === undefined) {
    findings.push(
      finding({
        category: "artifacts",
        severity: "warning",
        title: "PR summary lacks policy readiness evidence",
        description:
          "The PR summary was generated before policy gate integration or does not include PR gate status.",
        file:
          state.selectedFeature === undefined
            ? ".visp/features/<feature>/pr.json"
            : `${state.selectedFeature.relativePath}/pr.json`,
        recommendation: "Run visp-kit pr again after passing policy gates.",
        autoFixable: false
      })
    );
  }

  if (await exists(overridesArtifactPath(state.targetPath))) {
    const now = new Date().toISOString();
    const policy = await loadEffectivePolicy({ targetPath: state.targetPath, now });
    const store = await readOverrideStore(state.targetPath);

    if (!store.ok) {
      findings.push(
        finding({
          category: "artifacts",
          severity: "error",
          title: "Overrides artifact is invalid",
          description: store.error.message,
          file: ".visp/overrides.json",
          recommendation: "Repair .visp/overrides.json or revoke invalid overrides.",
          autoFixable: false
        })
      );
    } else {
      const validation = validateOverrideArtifact({
        artifact: store.value.artifact,
        policy: policy.ok ? policy.value.policy : undefined,
        now
      });

      for (const error of validation.errors) {
        findings.push(
          finding({
            category: "artifacts",
            severity: "error",
            title: "Invalid policy override",
            description: error,
            file: ".visp/overrides.json",
            recommendation: "Run visp-kit override validate, then fix or revoke the override.",
            autoFixable: false
          })
        );
      }

      for (const warning of validation.warnings) {
        findings.push(
          finding({
            category: "artifacts",
            severity: "warning",
            title: "Policy override needs attention",
            description: warning,
            file: ".visp/overrides.json",
            recommendation: "Run visp-kit override validate or revoke expired overrides.",
            autoFixable: false
          })
        );
      }
    }
  }

  return result("artifacts", findings);
}

export async function runDoctorChecks(input: {
  readonly state: ProjectState;
  readonly check: "all" | DoctorCheckName;
}): Promise<readonly DoctorCheckResult[]> {
  const checks: Record<DoctorCheckName, () => Promise<DoctorCheckResult>> = {
    project: () => checkProject(input.state),
    artifacts: () => checkArtifacts(input.state),
    agent: () => checkAgent(input.state),
    git: () => checkGit(input.state),
    cache: () => checkCache(input.state),
    schemas: () => checkSchemas(input.state)
  };
  const names = input.check === "all" ? (Object.keys(checks) as DoctorCheckName[]) : [input.check];

  return renumberChecks(await Promise.all(names.map((name) => checks[name]())));
}
