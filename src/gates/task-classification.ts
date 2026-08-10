import { type Task } from "../artifacts/schemas/task.schema.js";
import { type UnderstandingCaseExport } from "../artifacts/schemas/understanding.schema.js";
import { type ModuleMap } from "../scanner/module-map.js";
import { concreteScopePaths } from "./task-gate-checks.js";

export type TaskClassificationVerdict = "behavioural" | "mechanical";

export type TaskClassification = {
  readonly verdict: TaskClassificationVerdict;
  readonly basis: readonly string[];
  readonly evidence: readonly string[];
  readonly ruleVersion: "1.0";
};

/**
 * Risk factors that make a task behavioural on their own (ADR 0014 Q2, F1).
 *
 * These are DECLARED, auditable fields on the task, not inferences. That is
 * what keeps `ambiguous_default_mechanical` from being a hole: the cases where
 * being wrong is expensive are named here, and they never reach the default.
 */
const floorRiskFactors = new Set([
  "authentication",
  "authorization",
  "cryptography",
  "public_api",
  "schema",
  "data_migration",
  "permissions"
]);

const behaviouralTaskClasses = new Set([
  "localized_bug",
  "bounded_feature",
  "cross_file_change",
  "migration",
  "security"
]);

const mechanicalTaskClasses = new Set(["documentation", "regression_test"]);

export type SurfaceLinkage = {
  /** Two or more surface source files linked to each other. */
  readonly linkedSurfaceFiles: readonly string[];
  /** Surface files with an inbound caller from outside the surface. */
  readonly inboundCallers: readonly string[];
  readonly source: "intel_case" | "scan_module_map" | "none";
};

export const noSurfaceLinkage: SurfaceLinkage = {
  linkedSurfaceFiles: [],
  inboundCallers: [],
  source: "none"
};

/**
 * The declared change surface (E1): `allowedFiles` ∪ `expectedFiles`, with the
 * task generator's `TBD` placeholders removed. A placeholder is not a declared
 * file; treating it as one would classify from a string nobody wrote.
 */
export function declaredSurface(task: Task): readonly string[] {
  return [
    ...new Set(concreteScopePaths([...task.allowedFiles, ...(task.expectedFiles ?? [])]))
  ].sort();
}

/**
 * B2/B3 from intel's case (E3).
 *
 * Every membership decision joins on entity id and only converts to a file
 * path at the end. `displayName` is never consulted: two entities named
 * `handler` in two files are two identities, and every Phase 19 false edge
 * came from forgetting that.
 */
export function linkageFromUnderstanding(input: {
  readonly export: UnderstandingCaseExport;
  readonly surface: readonly string[];
}): SurfaceLinkage {
  const surface = new Set(input.surface);
  const filePathOf = (entityId: string): string | undefined => {
    const entry = input.export.resolution[entityId];
    return entry?.filePath ?? undefined;
  };
  const linked = new Set<string>();
  const inbound = new Set<string>();

  for (const row of input.export.path) {
    const source = filePathOf(row.sourceId);
    const target = filePathOf(row.targetId);

    if (source === undefined || target === undefined) continue;

    const sourceInside = surface.has(source);
    const targetInside = surface.has(target);

    if (sourceInside && targetInside && source !== target) {
      linked.add(source);
      linked.add(target);
      continue;
    }

    // The change is observable from somewhere the task does not list.
    if (targetInside && !sourceInside) inbound.add(target);
  }

  return {
    linkedSurfaceFiles: [...linked].sort(),
    inboundCallers: [...inbound].sort(),
    source: "intel_case"
  };
}

/**
 * B2 from scan's repository model (E4), so classification never itself
 * requires intel.
 *
 * Deliberately narrower than the intel case: it answers B2 and NOT B3. The
 * module map aggregates imports per module, so "something outside the surface
 * reaches in" can only be answered at module grain, and a module-grain yes
 * would gate tasks whose surface has no inbound caller at all. Over-gating a
 * mechanical task is the error that destroys the mechanism, so this source
 * declines to answer rather than guess.
 *
 * An `internalImports` entry counts only when it names a file the index knows.
 * Intel-backed maps carry resolved file paths; the summary-derived fallback
 * carries raw specifiers like `../foo.js`, which name nothing joinable.
 */
export function linkageFromModuleMap(input: {
  readonly moduleMap: ModuleMap;
  readonly surface: readonly string[];
  readonly indexedFiles: ReadonlySet<string>;
}): SurfaceLinkage {
  const surface = new Set(input.surface);
  const linked = new Set<string>();

  for (const module of input.moduleMap.modules) {
    const members = [...module.files, ...module.testFiles].filter((file) => surface.has(file));

    if (members.length < 2) continue;

    const resolvedImports = module.internalImports.filter(
      (target) => input.indexedFiles.has(target) && surface.has(target)
    );

    if (resolvedImports.length === 0) continue;

    for (const member of members) linked.add(member);
  }

  return {
    linkedSurfaceFiles: [...linked].sort(),
    inboundCallers: [],
    source: "scan_module_map"
  };
}

export type TaskClassificationInput = {
  readonly task: Task;
  /** E1, already resolved against scan's file index by the caller. */
  readonly surface: readonly string[];
  /** Surface entries scan's file index reports as source files. */
  readonly sourceSurface: readonly string[];
  /** E3/E4. */
  readonly linkage: SurfaceLinkage;
};

/**
 * VSP026's classification rule (ADR 0014 Q2). First match wins, in this order:
 * F1, F2, F3, B1, B2, B3, M1, M2, M3.
 *
 * `task.title`, `task.description`, spec prose and the user prompt are
 * INADMISSIBLE and are not read here. Intent is raw input under VSP019, and
 * prose is the one input an agent can rewrite to change its own gate.
 *
 * The failure direction is deliberate: an ambiguous task is NOT gated.
 * Under-gating a behavioural task costs today's Kit behaviour — the baseline,
 * not a regression. Over-gating a mechanical task costs the gate itself: no
 * weak-model run in this workspace has ever completed an added ceremony step
 * unaided, and an over-gated trivial edit teaches the agent that the gate is
 * noise, after which it routes around the gate on behavioural tasks too.
 */
export function classifyTask(input: TaskClassificationInput): TaskClassification {
  const task = input.task;
  const factors = (task.riskFactors ?? []).map((factor) => factor.code);
  const floorFactors = factors.filter((code) => floorRiskFactors.has(code));

  if (floorFactors.length > 0) {
    return behavioural("F1_risk_factor_floor", [`E2:riskFactors=${floorFactors.join(",")}`]);
  }

  if (task.blastRadius === "external") {
    return behavioural("F2_blast_radius_external", ["E2:blastRadius=external"]);
  }

  if (task.reversibility === "irreversible") {
    return behavioural("F3_irreversible", ["E2:reversibility=irreversible"]);
  }

  if (task.taskClass !== undefined && behaviouralTaskClasses.has(task.taskClass)) {
    return behavioural("B1_task_class", [`E2:taskClass=${task.taskClass}`]);
  }

  if (input.linkage.linkedSurfaceFiles.length >= 2) {
    return behavioural("B2_linked_surface", [
      `${evidenceTag(input.linkage.source)}:linkedSurfaceFiles=${input.linkage.linkedSurfaceFiles.join(",")}`
    ]);
  }

  if (input.linkage.inboundCallers.length > 0) {
    return behavioural("B3_inbound_caller_outside_surface", [
      `${evidenceTag(input.linkage.source)}:inboundCallers=${input.linkage.inboundCallers.join(",")}`
    ]);
  }

  if (
    task.taskClass !== undefined &&
    mechanicalTaskClasses.has(task.taskClass) &&
    input.sourceSurface.length === 0
  ) {
    return mechanical("M1_documentation_or_regression_test_only", [
      `E2:taskClass=${task.taskClass}`,
      "E1:no non-test source file in the declared surface"
    ]);
  }

  if (input.surface.length > 0 && input.sourceSurface.length === 0) {
    return mechanical("M2_non_source_surface", [
      `E1:surface=${input.surface.join(",")}`,
      "E4:file index reports no source file in the surface"
    ]);
  }

  return mechanical("ambiguous_default_mechanical", [
    `E1:surface=${input.surface.length === 0 ? "(undeclared)" : input.surface.join(",")}`,
    `E3/E4:linkage=${input.linkage.source}`
  ]);
}

function evidenceTag(source: SurfaceLinkage["source"]): string {
  return source === "intel_case" ? "E3" : source === "scan_module_map" ? "E4" : "E0";
}

function behavioural(basis: string, evidence: readonly string[]): TaskClassification {
  return { verdict: "behavioural", basis: [basis], evidence, ruleVersion: "1.0" };
}

function mechanical(basis: string, evidence: readonly string[]): TaskClassification {
  return { verdict: "mechanical", basis: [basis], evidence, ruleVersion: "1.0" };
}
