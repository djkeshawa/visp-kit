/**
 * Which artifacts must an agent have read before this action is legitimate?
 *
 * The action carries a hash of each required read, so a later reader can prove
 * the agent saw the policy and the task graph it claims to be acting on rather
 * than taking the claim on trust. `readRoleOrder` fixes the order those hashes
 * appear in, because the list is part of a hashed identity and must not depend
 * on directory iteration order.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { type ProjectState } from "../orchestrator/project-state.js";
import { compareUtf16CodeUnits, type Sha256Hash } from "./canonical-json.js";
import {
  type AddFinding,
  canonicalFindingReference,
  normalizeProjectPath
} from "./canonical-workflow-action.findings.js";
import {
  type Finding,
  type HashedRead,
  type HashedReadRole
} from "./canonical-workflow-action.types.js";

export type ReadCandidate = {
  readonly id: string;
  readonly role: HashedReadRole;
  readonly path: string;
};

const readRoleOrder: Record<HashedReadRole, number> = {
  policy: 0,
  intent: 1,
  specification: 2,
  plan: 3,
  task_graph: 4,
  context_pack: 5,
  implementation_prompt: 6,
  oracle_plan: 7
};

export function readCandidates(
  state: ProjectState,
  featurePath: string | undefined
): ReadCandidate[] {
  const candidates: ReadCandidate[] = [];
  if (state.initialized) {
    candidates.push({ id: "project-policy", role: "policy", path: ".visp/policy.json" });
  }
  if (featurePath === undefined) return candidates;

  candidates.push({
    id: "feature-intent",
    role: "intent",
    path: `${featurePath}/intent.json`
  });
  if (state.artifactSummary.spec) {
    candidates.push({
      id: "feature-specification",
      role: "specification",
      path: `${featurePath}/spec.json`
    });
  }
  if (state.artifactSummary.plan) {
    candidates.push({ id: "feature-plan", role: "plan", path: `${featurePath}/plan.json` });
  }
  if (state.artifactSummary.taskGraph) {
    candidates.push({
      id: "task-graph",
      role: "task_graph",
      path: `${featurePath}/task-graph.json`
    });
  }
  if (state.selectedTask !== undefined && state.artifactSummary.context) {
    candidates.push({
      id: "task-context",
      role: "context_pack",
      path: `${featurePath}/context/${state.selectedTask.id}.context.json`
    });
    candidates.push({
      id: "implementation-prompt",
      role: "implementation_prompt",
      path: ".visp/prompts/current-task.prompt.md"
    });
  }

  return candidates;
}

export async function collectRequiredReads(
  state: ProjectState,
  candidates: readonly ReadCandidate[],
  addFinding: AddFinding,
  v2FindingOrder: Sha256Hash[]
): Promise<HashedRead[]> {
  const reads: HashedRead[] = [];

  for (const candidate of candidates) {
    const safePath = normalizeProjectPath(candidate.path, addFinding);
    if (safePath === undefined) continue;
    try {
      const contents = await readFile(path.join(state.targetPath, safePath));
      reads.push({
        id: candidate.id,
        role: candidate.role,
        path: safePath,
        contentHash: `sha256:${createHash("sha256").update(contents).digest("hex")}`,
        freshness: "content_hash"
      });
    } catch {
      const finding: Finding = {
        code: "VISP.FRESHNESS.REQUIRED_READ_UNAVAILABLE",
        source: "freshness",
        severity: "error",
        effect: "uncertain",
        message: `Required read is unavailable: ${safePath}.`,
        recommendation: "Restore or regenerate the required read before using this action.",
        evidence: [safePath]
      };
      addFinding(finding);
      v2FindingOrder.push(canonicalFindingReference(finding));
    }
  }

  return reads.sort((left, right) => {
    const roleDifference = readRoleOrder[left.role] - readRoleOrder[right.role];
    if (roleDifference !== 0) return roleDifference;
    const pathDifference = compareUtf16CodeUnits(left.path, right.path);
    return pathDifference !== 0 ? pathDifference : compareUtf16CodeUnits(left.id, right.id);
  });
}
