import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";

import { readTextFile } from "../core/file-system.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { type NextStep } from "../orchestrator/next-step.js";

export const workflowActionV2Schema = z.object({
  protocolVersion: z.literal("2.0"),
  phase: z.enum(["clarify", "specify", "plan", "task", "implement", "verify"]),
  taskId: z.string().nullable(),
  goal: z.string(),
  requiredReads: z.array(z.object({ path: z.string(), role: z.string(), sha256: z.string() }).strict()),
  writablePaths: z.array(z.string()),
  forbiddenPaths: z.array(z.string()),
  acceptanceOracles: z.array(z.object({ id: z.string(), expectedBehavior: z.string(), validation: z.string() }).strict()),
  validationCommands: z.array(z.string()),
  assuranceLevel: z.enum(["kit_strict", "local_checked", "advisory"]),
  verdict: z.enum(["ready", "blocked", "inconclusive"]),
  findings: z.array(z.string()),
  nextCommand: z.string()
}).strict();

export type WorkflowActionV2 = z.infer<typeof workflowActionV2Schema>;

function actionPhase(step: NextStep): WorkflowActionV2["phase"] {
  if (step.state.includes("clarify")) return "clarify";
  if (step.state.includes("spec")) return "specify";
  if (step.state.includes("plan")) return "plan";
  if (step.state.includes("task") || step.state.includes("context")) return "task";
  if (step.state.includes("verify") || step.state.includes("review") || step.state.includes("reconcile")) return "verify";
  return "implement";
}

async function hashedRead(root: string, relative: string, role: string): Promise<{ read?: WorkflowActionV2["requiredReads"][number]; finding?: string }> {
  const result = await readTextFile(path.join(root, relative));
  if (!result.ok) return { finding: `Required read is unavailable: ${relative}.` };
  return {
    read: {
      path: relative.replaceAll("\\", "/"),
      role,
      sha256: createHash("sha256").update(result.value).digest("hex")
    }
  };
}

export async function buildWorkflowActionV2(input: {
  readonly state: ProjectState;
  readonly step: NextStep;
}): Promise<WorkflowActionV2> {
  const phase = actionPhase(input.step);
  const featurePath = input.state.selectedFeature?.relativePath;
  const task = input.state.selectedTask;
  const candidates: Array<{ path: string; role: string }> = [];
  if (input.state.initialized) candidates.push({ path: ".visp/policy.json", role: "policy" });
  if (featurePath !== undefined) {
    candidates.push({ path: `${featurePath}/intent.json`, role: "intent" });
    if (input.state.artifactSummary.spec) candidates.push({ path: `${featurePath}/spec.json`, role: "specification" });
    if (input.state.artifactSummary.plan) candidates.push({ path: `${featurePath}/plan.json`, role: "plan" });
    if (input.state.artifactSummary.taskGraph) candidates.push({ path: `${featurePath}/task-graph.json`, role: "task-graph" });
    if (task !== undefined && input.state.artifactSummary.context) {
      candidates.push({ path: `${featurePath}/context/${task.id}.context.json`, role: "context-pack" });
      candidates.push({ path: ".visp/prompts/current-task.prompt.md", role: "implementation-prompt" });
    }
  }

  const requiredReads: WorkflowActionV2["requiredReads"] = [];
  const readFindings: string[] = [];
  for (const candidate of candidates) {
    const result = await hashedRead(input.state.targetPath, candidate.path, candidate.role);
    if (result.read !== undefined) requiredReads.push(result.read);
    if (result.finding !== undefined) readFindings.push(result.finding);
  }

  const featureWrites = featurePath === undefined ? [] : phase === "clarify"
    ? [`${featurePath}/clarifications.json`]
    : phase === "specify"
      ? [`${featurePath}/spec.json`, `${featurePath}/traceability.json`]
      : phase === "plan"
        ? [`${featurePath}/plan.json`]
        : phase === "task"
          ? [`${featurePath}/task-graph.json`, `${featurePath}/traceability.json`]
          : [];
  const taskWrites = phase === "implement" && task !== undefined
    ? [...new Set([...task.allowedFiles, ...(task.expectedFiles ?? [])])]
    : [];
  const criteria = input.state.contextPack?.includedAcceptanceCriteria ??
    input.state.spec?.acceptanceCriteria.filter((criterion) =>
      task?.acceptanceCriterionIds.includes(criterion.id) ?? true
    ) ?? [];
  const findings = [...new Set([
    ...readFindings,
    ...(input.step.allowed === false ? input.step.blockers : [])
  ])];
  const verdict: WorkflowActionV2["verdict"] = input.step.allowed === false
    ? "blocked"
    : requiredReads.length < candidates.length
      ? "inconclusive"
      : "ready";

  return workflowActionV2Schema.parse({
    protocolVersion: "2.0",
    phase,
    taskId: task?.id ?? null,
    goal: task?.description ?? input.state.selectedFeature?.intent?.rawUserRequest ?? input.step.reason,
    requiredReads,
    writablePaths: [...featureWrites, ...taskWrites],
    forbiddenPaths: task?.forbiddenFiles ?? [],
    acceptanceOracles: criteria.map((criterion) => ({
      id: criterion.id,
      expectedBehavior: criterion.description,
      validation: criterion.validationMethod
    })),
    validationCommands: input.state.contextPack?.validationCommands ?? task?.validationCommands ?? [],
    assuranceLevel: input.step.strictnessMode === "strict" || input.step.strictnessMode === "locked"
      ? "kit_strict"
      : "advisory",
    verdict,
    findings,
    nextCommand: input.step.nextCommand
  });
}
