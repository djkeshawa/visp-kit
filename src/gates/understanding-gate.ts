import { z } from "zod";

import { fileIndexArtifactPath, moduleMapArtifactPath } from "../artifacts/artifact-paths.js";
import { optionalArtifact } from "../artifacts/optional-artifact.js";
import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type UnderstandingCaseExport } from "../artifacts/schemas/understanding.schema.js";
import { joinPath, normalizeRepositoryPath, vispDir } from "../core/paths.js";
import { recognisedTextFile, recognisedTextFileFields } from "../scanner/file-index-cache.js";
import { isTestFilePath } from "../scanner/ignore-rules.js";
import { readScanIntelInstanceId } from "../scanner/intel-graph.js";
import { attestsMechanicalClass, isProgramFilePath } from "../scanner/language.js";
import { type ModuleMap } from "../scanner/module-map.js";
import {
  readUnderstandingExport,
  understandingCurrentness
} from "../understanding/understanding-export.js";
import { type GateCheck } from "./gate-result.js";
import {
  classifyTask,
  declaredSurface,
  linkageFromModuleMap,
  linkageFromUnderstanding,
  noSurfaceLinkage,
  type SurfaceLinkage,
  type TaskClassification
} from "./task-classification.js";

const fileIndexSchema = z.object({
  files: z.array(
    z
      .object({
        path: z.string(),
        ...recognisedTextFileFields,
        // Optional so an index written before this field mattered still parses;
        // `isTestFilePath` answers the same question from the path when it is
        // absent, using the rule scan itself used to set it.
        isTestFile: z.boolean().optional()
      })
      .transform((entry) => ({ ...entry, isRecognisedTextFile: recognisedTextFile(entry) }))
  )
});

const moduleMapSchema = z.object({
  modules: z.array(
    z.object({
      name: z.string(),
      root: z.string(),
      files: z.array(z.string()),
      testFiles: z.array(z.string()),
      internalImports: z.array(z.string()),
      externalDependencies: z.array(z.string())
    })
  )
});

/**
 * Hyper's scout output (ADR 0014 Q4). Kit reads only what G3 needs: an honest
 * `unresolved` is as good an answer as a path, and this is where Kit learns
 * that one was given.
 */
const scoutFindingsSchema = z.object({
  taskId: z.string(),
  status: z.enum(["resolved", "unresolved"]),
  unresolved: z.array(
    z.object({
      question: z.string(),
      unknownId: z.string().nullable().optional()
    })
  )
});

function scoutFindingsPath(targetPath: string): string {
  return joinPath(vispDir(targetPath), "hyper", "current", "scout-findings.json");
}

export type UnderstandingGateInput = {
  readonly targetPath: string;
  readonly task: Task;
  readonly contextPack?: ContextPack;
  /** Realized change surface, used by the post-hoc check at verify. */
  readonly realizedSurface?: readonly string[];
  /**
   * Whether an export file is on disk for this task, as the caller established
   * it — the same fact that activates the gate.
   *
   * G1 needs it to say which of two different things happened. Both reach this
   * function as `understanding === undefined`, and they call for opposite
   * actions: nothing was ever exported (run intel), or something was exported
   * and Kit rejected it (fix the export). Absent, G1 reported the first one for
   * both, which is the reading a caller cannot check.
   */
  readonly exportPresent?: boolean;
};

export type UnderstandingGateEvaluation = {
  readonly classification: TaskClassification;
  readonly checks: readonly GateCheck[];
  readonly warnings: readonly string[];
  readonly understanding?: UnderstandingCaseExport;
  readonly current: boolean;
};

async function loadLinkage(input: {
  readonly targetPath: string;
  readonly surface: readonly string[];
  readonly indexedFiles: ReadonlySet<string>;
  readonly understanding?: UnderstandingCaseExport;
  readonly warnings: string[];
}): Promise<SurfaceLinkage> {
  if (input.understanding !== undefined) {
    return linkageFromUnderstanding({
      export: input.understanding,
      surface: input.surface
    });
  }

  const moduleMap = await optionalArtifact<Pick<ModuleMap, "modules">>({
    path: moduleMapArtifactPath(input.targetPath),
    schema: moduleMapSchema,
    artifactName: "module map",
    warnings: input.warnings
  });

  if (moduleMap === undefined) return noSurfaceLinkage;

  return linkageFromModuleMap({
    moduleMap: { generatedAt: "", sourceRoots: [], modules: moduleMap.modules },
    surface: input.surface,
    indexedFiles: input.indexedFiles
  });
}

/**
 * Classify the task and, when the verdict is behavioural, evaluate VSP026's
 * gate conditions G1-G6. Each condition is its own finding so the message
 * names which one failed.
 *
 * A mechanical task produces a classification record and no findings at all.
 * That is the point: it is not gated, and the record is what lets the
 * misclassification rate be measured instead of asserted.
 */
export async function evaluateUnderstandingGate(
  input: UnderstandingGateInput
): Promise<UnderstandingGateEvaluation> {
  const warnings: string[] = [];
  // One spelling, once, at the boundary. Everything below joins this list
  // against scan's index, the module map and intel's resolved paths by exact
  // string, and a task that wrote `./src/a.ts` used to match none of them —
  // which emptied the linkage and left the task at the ungated default.
  const surface = (
    input.realizedSurface === undefined ? declaredSurface(input.task) : [...input.realizedSurface]
  ).map(normalizeRepositoryPath);
  const fileIndex = await optionalArtifact({
    path: fileIndexArtifactPath(input.targetPath),
    schema: fileIndexSchema,
    artifactName: "file index",
    warnings
  });
  const indexedFiles = new Set(
    (fileIndex?.files ?? []).map((file) => normalizeRepositoryPath(file.path))
  );
  const recognisedTextFiles = new Set(
    (fileIndex?.files ?? [])
      .filter((file) => file.isRecognisedTextFile)
      .map((file) => normalizeRepositoryPath(file.path))
  );
  // Absence of evidence is not evidence of absence, and it has to hold per
  // FILE, not only for the index as a whole. A file scan has never seen — the
  // ordinary case for an `expectedFiles` entry, which exists precisely to name
  // a file the task will create — is not thereby a non-source file. Filtering
  // it out emptied `sourceSurface` and fired M2 with the evidence line "the
  // file index reports no source file in the surface", which the index had
  // said nothing of the kind about. M1 and M2 now fire only on files the index
  // knows and reports as non-source.
  const sourceSurface = surface.filter(
    (file) => fileIndex === undefined || !indexedFiles.has(file) || recognisedTextFiles.has(file)
  );
  const indexTestFiles = new Set(
    (fileIndex?.files ?? [])
      .filter((file) => file.isTestFile === true)
      .map((file) => normalizeRepositoryPath(file.path))
  );
  // B4's evidence, in two lists that answer the same question from opposite
  // failure directions.
  //
  // `codeSurface` is FAIL-OPEN and unchanged: surface files POSITIVELY known to
  // be non-test executable code. `isRecognisedTextFile` alone cannot answer
  // this — it is `true` for Markdown, so "no source file in the surface" was
  // never true of a documentation task. `isProgramFilePath` is the narrower
  // question, and a file must clear BOTH: scan saw it and recognised its
  // language, and that language is a programming language.
  //
  // `unattestedSurface` is FAIL-CLOSED and new: non-test surface files whose
  // language cannot corroborate a declared mechanical class — an extension
  // nobody here can classify, or markup. It is read by B4 alone, so it can only
  // ever affect a task that DECLARED such a class; an undeclared task sees
  // exactly the previous behaviour, which is what ADR 0014's failure direction
  // protects.
  const nonTestSurface = surface.filter(
    (file) => !isTestFilePath(file) && !indexTestFiles.has(file)
  );
  const scanCallsItText = (file: string): boolean =>
    !indexedFiles.has(file) || recognisedTextFiles.has(file);
  const codeSurface = nonTestSurface.filter(
    (file) => isProgramFilePath(file) && scanCallsItText(file)
  );
  const unattestedSurface = nonTestSurface.filter(
    (file) => !isProgramFilePath(file) && !attestsMechanicalClass(file)
  );
  const understanding = await readUnderstandingExport({
    targetPath: input.targetPath,
    taskId: input.task.id,
    warnings
  });
  const currentness =
    understanding === undefined
      ? {
          current: false,
          reasons: [
            input.exportPresent === true
              ? "an understanding case export is on disk for this task but Kit could not use it; see the gate warnings for what it objected to"
              : "no understanding case export was found"
          ]
        }
      : understandingCurrentness({
          export: understanding,
          scanRepositoryInstanceId: await readScanIntelInstanceId(input.targetPath),
          baseCommit: input.contextPack?.baseCommit
        });
  // Only a CURRENT case is admissible evidence (E3). A stale one describes a
  // repository that no longer exists; it never fails a command, it simply does
  // not count.
  const currentCase = currentness.current ? understanding : undefined;
  const linkage = await loadLinkage({
    targetPath: input.targetPath,
    surface,
    indexedFiles,
    ...(currentCase === undefined ? {} : { understanding: currentCase }),
    warnings
  });
  const classification = classifyTask({
    task: input.task,
    surface,
    sourceSurface,
    codeSurface,
    unattestedSurface,
    linkage
  });

  if (classification.verdict === "mechanical") {
    return {
      classification,
      checks: [],
      warnings,
      ...(understanding === undefined ? {} : { understanding }),
      current: currentness.current
    };
  }

  const checks =
    currentCase === undefined
      ? [
          fail(
            "G1",
            "No current understanding case is available for this behavioural task.",
            input.exportPresent === true
              ? `Re-export the intel understanding case for ${input.task.id} against the current commit, or fix what the warnings say is wrong with it.`
              : `Run the intel understanding export for ${input.task.id}, then re-run this gate.`,
            currentness.reasons.join("; ")
          )
        ]
      : conditionChecks({
          task: input.task,
          understanding: currentCase,
          surface,
          scout: await readScoutFindings({ targetPath: input.targetPath, taskId: input.task.id })
        });

  return {
    classification,
    checks,
    warnings,
    ...(understanding === undefined ? {} : { understanding }),
    current: currentness.current
  };
}

type ScoutFindings = z.infer<typeof scoutFindingsSchema>;

async function readScoutFindings(input: {
  readonly targetPath: string;
  readonly taskId: string;
}): Promise<ScoutFindings | undefined> {
  const discarded: string[] = [];
  const findings = await optionalArtifact({
    path: scoutFindingsPath(input.targetPath),
    schema: scoutFindingsSchema,
    artifactName: "scout findings",
    // A missing scout report is the ordinary case and must not warn the way a
    // missing understanding case does; G3 already says what is absent.
    warnings: discarded
  });

  return findings?.taskId === input.taskId ? findings : undefined;
}

function conditionChecks(input: {
  readonly task: Task;
  readonly understanding: UnderstandingCaseExport;
  readonly surface: readonly string[];
  readonly scout?: ScoutFindings;
}): readonly GateCheck[] {
  const counts = input.understanding.counts;
  const checks: GateCheck[] = [
    pass("G1", "A current understanding case is available.", `case=${input.understanding.case.id}`)
  ];

  checks.push(
    counts.entrypoints >= 1
      ? pass("G2", "The case names at least one entrypoint.", `entrypoints=${counts.entrypoints}`)
      : fail(
          "G2",
          "The understanding case names no entrypoint.",
          "Establish where the behaviour is entered before implementing.",
          "counts.entrypoints=0"
        )
  );

  // An honest unresolved passes; a silent empty path does not. The difference
  // is the whole point of G3: "I looked and could not establish the path" is
  // knowledge, "the path is empty" is its absence wearing the same shape.
  const honestlyUnresolved =
    input.scout?.status === "unresolved" && input.scout.unresolved.length >= 1;

  checks.push(
    counts.pathRelations >= 1
      ? pass("G3", "The case cites a path.", `pathRelations=${counts.pathRelations}`)
      : honestlyUnresolved
        ? pass(
            "G3",
            "No path was established and the scout said so explicitly.",
            `scout status=unresolved with ${input.scout?.unresolved.length ?? 0} open question(s)`
          )
        : fail(
            "G3",
            "The understanding case establishes no path and nothing recorded why.",
            "Trace the behaviour, or record an explicit unresolved scout status naming what is unknown.",
            "counts.pathRelations=0 and no unresolved scout findings"
          )
  );

  const validationCommands = input.task.validationCommands.filter(
    (command) => command.trim().length > 0 && command.trim().toUpperCase() !== "TBD"
  );

  checks.push(
    counts.affectedTests >= 1 || validationCommands.length > 0
      ? pass(
          "G4",
          "The change has a way to be checked.",
          `affectedTests=${counts.affectedTests}; validationCommands=${validationCommands.length}`
        )
      : fail(
          "G4",
          "Nothing would check this change.",
          `Add validation commands to task ${input.task.id}, or identify the tests the change affects.`,
          "counts.affectedTests=0 and the task declares no concrete validation command"
        )
  );

  // G5 cannot be decided from the export. The five-field contract carries
  // `case.unknownIds` and `counts.unknowns` and no risk level, and `resolution`
  // is entity-keyed so an unknown has nowhere to carry one. Kit will not invent
  // the field, and will not pretend the condition passed either: it reports the
  // cited unknowns as a warning, which locked mode promotes to an error. This
  // needs an ADR amendment (a sixth field, or unknowns admitted into
  // `resolution` with an explicit entry shape).
  checks.push(
    counts.unknowns === 0
      ? pass("G5", "The case cites no unknowns.", "counts.unknowns=0")
      : {
          ruleId: "VSP026",
          passed: false,
          severity: "warning",
          message: `G5: the case cites ${counts.unknowns} unknown(s) whose risk level the export does not carry.`,
          recommendation: `Resolve them, or record a VSP026 override for ${input.task.id} naming them in the reason.`,
          evidence: `unknownIds=${input.understanding.case.unknownIds.join(", ")}; the export contract carries no risk field, so high/critical cannot be distinguished here.`
        }
  );

  const surface = new Set(input.surface.map(normalizeRepositoryPath));
  const strayCandidates = input.understanding.case.candidateChangeEntityIds
    .map((entityId) => {
      const resolved = input.understanding.resolution[entityId]?.filePath ?? null;

      return {
        entityId,
        filePath: resolved === null ? null : normalizeRepositoryPath(resolved)
      };
    })
    .filter((entry) => entry.filePath === null || !surface.has(entry.filePath));

  checks.push(
    strayCandidates.length === 0
      ? pass(
          "G6",
          "Every candidate change entity lands inside the declared surface.",
          `candidateChanges=${counts.candidateChanges}`
        )
      : fail(
          "G6",
          "The case and the task disagree about what is being changed.",
          `Widen allowedFiles on ${input.task.id} to cover them, or re-scope the case.`,
          strayCandidates
            .map((entry) => `${entry.entityId} -> ${entry.filePath ?? "(unresolved file)"}`)
            .join(", ")
        )
  );

  return checks;
}

function pass(condition: string, message: string, evidence: string): GateCheck {
  return {
    ruleId: "VSP026",
    passed: true,
    message: `${condition}: ${message}`,
    recommendation: "Continue.",
    evidence
  };
}

function fail(
  condition: string,
  message: string,
  recommendation: string,
  evidence: string
): GateCheck {
  return {
    ruleId: "VSP026",
    passed: false,
    severity: "error",
    message: `${condition}: ${message}`,
    recommendation,
    evidence: evidence.length === 0 ? condition : evidence
  };
}
