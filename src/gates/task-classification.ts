import { type RiskFactorCode, type TaskClass } from "../artifacts/schemas/common.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type UnderstandingCaseExport } from "../artifacts/schemas/understanding.schema.js";
import { normalizeRepositoryPath } from "../core/paths.js";
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
 * Every member of `riskFactorCodeValues`, and whether it is behavioural on its
 * own (ADR 0014 Q2, F1).
 *
 * These are DECLARED, auditable fields on the task, not inferences. Written as
 * a total record for the same reason as `taskClassVerdicts`: the previous
 * `Set<string>` held seven of ten codes and nothing said whether the other
 * three were a decision or an oversight. They are a decision, recorded here.
 *
 * F1 is a FLOOR, not a classifier: `false` means "does not make the task
 * behavioural by itself", never "mechanical". A task carrying one of the three
 * still reaches B1, B2 and B3 like any other.
 *
 *  - `dependency`  — a version bump is the ordinary mechanical edit; when it
 *                    changes behaviour the task also declares a class.
 *  - `concurrency` — the closest call of the three. Left off the floor because
 *                    a concurrency-tagged task that touches source almost
 *                    always carries `localized_bug` or `cross_file_change`
 *                    too, and F1 exists for the tasks that declare nothing
 *                    else. Revisit with a measurement, not with an opinion.
 *  - `deployment`  — pipeline and environment configuration, outside the code
 *                    whose behaviour this gate is about.
 */
const riskFactorFloor = {
  authentication: true,
  authorization: true,
  cryptography: true,
  public_api: true,
  schema: true,
  data_migration: true,
  permissions: true,
  dependency: false,
  concurrency: false,
  deployment: false
} as const satisfies Record<RiskFactorCode, boolean>;

/**
 * Every member of `taskClassValues`, mapped to a verdict. TOTAL, and total by
 * construction rather than by review.
 *
 * The previous version was two `Set<string>`s holding seven of the eight enum
 * members between them. `refactor` was in neither, so a task declaring a valid
 * `taskClass` fell through every rule to `ambiguous_default_mechanical` and
 * was not gated — a verifier defeated VSP026 with exactly that, on a real CLI
 * run. A refactor is a change whose whole claim is *about* behaviour, and the
 * most common way that claim is broken is by accident, so it is behavioural.
 *
 * `satisfies Record<TaskClass, ...>` is the part that matters more than the
 * missing entry: adding a member to `taskClassValues` now fails to compile
 * until someone decides which side it is on. A gate hole that a type checker
 * can find should not be left to an audit.
 */
const taskClassVerdicts = {
  localized_bug: "behavioural",
  bounded_feature: "behavioural",
  cross_file_change: "behavioural",
  migration: "behavioural",
  security: "behavioural",
  refactor: "behavioural",
  documentation: "mechanical",
  regression_test: "mechanical"
} as const satisfies Record<TaskClass, TaskClassificationVerdict>;

export const declaredTaskClassVerdicts: Readonly<Record<TaskClass, TaskClassificationVerdict>> =
  taskClassVerdicts;

/** The members of `taskClassValues` that `taskClassVerdicts` calls mechanical. */
type MechanicalTaskClass = {
  [K in TaskClass]: (typeof taskClassVerdicts)[K] extends "mechanical" ? K : never;
}[TaskClass];

/**
 * What surface fact CORROBORATES each declared mechanical class, and what
 * refutes it.
 *
 * A declared class is the one input on a task that the agent writing the task
 * chooses freely. `refutedByCodeInSurface` is what stops that choice being a
 * choice of gate: the class holds only while the change surface agrees with it,
 * and disagreement is decided from scan's file index, never from the
 * declaration itself.
 *
 * Total over the mechanical classes by construction, for the same reason
 * `taskClassVerdicts` is total over all of them: the previous rule had a
 * catch-all `M3_declared_mechanical_class` branch that accepted any declared
 * mechanical class whatever the surface held, and a verifier defeated VSP026 by
 * declaring `documentation` over source files to reach it. Adding a mechanical
 * member to `taskClassValues` now fails to compile until someone writes down
 * what would corroborate it.
 */
const mechanicalClassCorroboration = {
  documentation: { refutedByCodeInSurface: true },
  regression_test: { refutedByCodeInSurface: true }
} as const satisfies Record<MechanicalTaskClass, { readonly refutedByCodeInSurface: boolean }>;

function declaredMechanicalClass(task: Task): MechanicalTaskClass | undefined {
  const declared = task.taskClass;

  if (declared === undefined || taskClassVerdicts[declared] !== "mechanical") return undefined;

  return declared as MechanicalTaskClass;
}

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
  const surface = new Set(input.surface.map(normalizeRepositoryPath));
  const filePathOf = (entityId: string): string | undefined => {
    const entry = input.export.resolution[entityId];
    // Normalised on both sides of the join: intel resolves an entity to a path
    // it chose the spelling of, and the surface is a path a task author chose
    // the spelling of.
    return entry?.filePath === null || entry?.filePath === undefined
      ? undefined
      : normalizeRepositoryPath(entry.filePath);
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
  const surface = new Set(input.surface.map(normalizeRepositoryPath));
  const indexedFiles = new Set([...input.indexedFiles].map(normalizeRepositoryPath));
  const linked = new Set<string>();

  for (const module of input.moduleMap.modules) {
    const members = [...module.files, ...module.testFiles]
      .map(normalizeRepositoryPath)
      .filter((file) => surface.has(file));

    if (members.length < 2) continue;

    const resolvedImports = module.internalImports
      .map(normalizeRepositoryPath)
      .filter((target) => indexedFiles.has(target) && surface.has(target));

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
  /**
   * Surface entries that are POSITIVELY known to be non-test executable code
   * (E1 joined with E4). Absence of evidence keeps a file out of this list: a
   * file whose language is not a programming language, a file the index reports
   * as a test, and — for a file nobody has indexed — anything the path rule
   * cannot call code are all excluded. The list is what refutes a declared
   * mechanical class, so it must never be populated by a guess.
   */
  readonly codeSurface: readonly string[];
  /**
   * Non-test surface entries whose language CANNOT corroborate a declared
   * mechanical class: an extension nobody in this codebase can classify, or
   * markup that is part of a running interface.
   *
   * Read only by B4, and therefore only for a task that declared such a class.
   * This is the fail-closed list, and it exists because `codeSurface` is
   * fail-open by design: `codeSurface` protects the AMBIGUOUS task, the one
   * whose evidence is missing, and a task that declared `documentation` and put
   * its change in a file nobody can classify is the other case — it made a
   * claim the evidence cannot corroborate.
   */
  readonly unattestedSurface: readonly string[];
  /** E3/E4. */
  readonly linkage: SurfaceLinkage;
};

/**
 * VSP026's classification rule (ADR 0014 Q2). First match wins, in this order:
 * F1, F2, F3, B1, B4, B2, B3, M1, M2, then the ambiguous default.
 *
 * The declared-class mapping is TOTAL (`taskClassVerdicts`), so a task that
 * declares any member of `taskClassValues` is decided by B1, B4 or M1 and can
 * never reach the ambiguous default. Only a task that declares no class at all
 * can, which is a task that has stated nothing for this rule to read.
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
  const floorFactors = factors.filter((code) => riskFactorFloor[code]);

  if (floorFactors.length > 0) {
    return behavioural("F1_risk_factor_floor", [`E2:riskFactors=${floorFactors.join(",")}`]);
  }

  if (task.blastRadius === "external") {
    return behavioural("F2_blast_radius_external", ["E2:blastRadius=external"]);
  }

  if (task.reversibility === "irreversible") {
    return behavioural("F3_irreversible", ["E2:reversibility=irreversible"]);
  }

  if (task.taskClass !== undefined && taskClassVerdicts[task.taskClass] === "behavioural") {
    return behavioural("B1_task_class", [`E2:taskClass=${task.taskClass}`]);
  }

  // B4 — the task declared a mechanical class and its own change surface
  // refutes it. This is the only rule that reads a declared class and gates on
  // it, and it does so on POSITIVE evidence: `codeSurface` holds the surface
  // files scan's index reports as non-test executable code. A declared class is
  // free for the agent to write, so it may lower the gate only while the
  // change surface agrees with it.
  //
  // Absent evidence is still not evidence: a file nobody indexed and whose path
  // does not say "code" stays out of `codeSurface` and does not fire this rule.
  // ADR 0014's failure direction protects the AMBIGUOUS task — the one where
  // the evidence is missing — not the one whose declaration the evidence
  // contradicts.
  //
  // Ordered with B1 rather than after linkage on purpose. The declared class is
  // decided against the surface FIRST, so a refuted declaration always reports
  // basis `B4_...` and never hides behind whichever linkage rule happened to
  // match too. The verify-stage enforcement keys on that basis; when B2 could
  // pre-empt it, a refuted declaration on two linked files was reported as
  // ordinary drift and went unenforced.
  //
  // Two lists refute, and the basis string is deliberately the SAME for both.
  // `codeSurface` is a file positively known to be executable code;
  // `unattestedSurface` is a file whose language cannot corroborate the
  // declaration — an unrecognised extension, or markup. The second is the
  // fail-closed half added after the language list turned out to recognise
  // seven languages, which made "declare documentation, edit Ruby" an ungated
  // task. One basis, because the verify-stage enforcement keys on it and both
  // cases are the same finding: a declaration its own diff does not support.
  // The evidence tags keep them distinguishable for measurement.
  const mechanicalClass = declaredMechanicalClass(task);
  const refutingEvidence =
    mechanicalClass === undefined ||
    !mechanicalClassCorroboration[mechanicalClass].refutedByCodeInSurface
      ? []
      : [
          ...(input.codeSurface.length > 0
            ? [`E1/E4:codeInSurface=${input.codeSurface.join(",")}`]
            : []),
          ...(input.unattestedSurface.length > 0
            ? [`E1/E4:unattestedInSurface=${input.unattestedSurface.join(",")}`]
            : [])
        ];

  if (mechanicalClass !== undefined && refutingEvidence.length > 0) {
    return behavioural("B4_mechanical_class_refuted_by_surface", [
      `E2:taskClass=${mechanicalClass}`,
      ...refutingEvidence
    ]);
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

  // M1 — a declared mechanical class the surface CORROBORATES. Reaching here
  // means B4 has already looked for code in the surface and found none, which
  // is ADR 0014's "no non-test source file in the surface" stated in terms of
  // what the index actually distinguishes.
  if (mechanicalClass !== undefined) {
    return mechanical("M1_documentation_or_regression_test_only", [
      `E2:taskClass=${mechanicalClass}`,
      `E1/E4:no non-test code file in the surface (${input.surface.length === 0 ? "(undeclared)" : input.surface.join(",")})`
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
