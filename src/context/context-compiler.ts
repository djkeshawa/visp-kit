import { createHash } from "node:crypto";
import { z, type ZodType } from "zod";

import {
  compactConstitutionArtifactPath,
  dependencyMapArtifactPath,
  fileIndexArtifactPath,
  fileSummariesArtifactPath,
  intelProjectionArtifactPath,
  moduleMapArtifactPath,
  patternsArtifactPath,
  policyArtifactPath,
  projectConfigArtifactPath,
  projectProfileArtifactPath,
  projectSummaryArtifactPath,
  specArtifactPath,
  planArtifactPath,
  taskGraphArtifactPath,
  testMapArtifactPath,
  traceabilityArtifactPath
} from "../artifacts/artifact-paths.js";
import { optionalArtifact } from "../artifacts/optional-artifact.js";
import { type BudgetMode } from "../artifacts/schemas/common.schema.js";
import {
  contextPackSchema,
  type ContextArtifactProvenance,
  type ContextPack
} from "../artifacts/schemas/context-pack.schema.js";
import { planDraftArtifactSchema } from "../artifacts/schemas/plan.schema.js";
import { snippetRelevanceScore, taskKeywords } from "./context-relevance.js";
import { projectConfigSchema, projectProfileSchema } from "../artifacts/schemas/project.schema.js";
import { specArtifactSchema } from "../artifacts/schemas/spec.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { traceabilityMatrixSchema } from "../artifacts/schemas/traceability.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists, readJsonFile, readTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { loadEffectiveGatePolicy } from "../gates/effective-policy.js";
import { fileIndexCacheSchema } from "../scanner/file-index-cache.js";
import { type FileIndexEntry, type FileSummary } from "../scanner/types.js";
import { type ActiveFeature } from "../workflows/shared/active-feature.js";
import {
  contextBudgetPolicy,
  contextBudgetRecommendation,
  defaultCompactSnippetCap,
  effectiveMaxInputTokens,
  type ContextBudgetPolicy
} from "./context-budget.js";
import { estimateContextPackInputTokens, selectContextPack } from "./context-selector.js";
import { defaultCommandRunner, type CommandRunner } from "../core/command-runner.js";
import { loadIntelGraph, readScanIntelInstanceId } from "../scanner/intel-graph.js";
import {
  RETRIEVAL_INPUT_LABELS,
  retrievalInputContentHash,
  type RetrievalInputLabel
} from "./retrieval-inputs.js";
import {
  readUnderstandingExport,
  understandingCurrentness
} from "../understanding/understanding-export.js";
import { understandingView } from "../understanding/understanding-view.js";
import { renderContextMarkdown } from "./context-renderer.js";
import { estimateTokenRange, estimateTokens, tokenEstimatorName } from "./token-estimator.js";

const fileSummariesCacheSchema = z.object({
  items: z.array(
    z
      .object({
        path: z.string(),
        hash: z.string(),
        language: z.string(),
        sizeBytes: z.number(),
        lineCount: z.number(),
        imports: z.array(z.string()),
        exports: z.array(z.string()),
        symbols: z.array(z.string()),
        comments: z.array(z.string()),
        summaryKind: z.literal("deterministic"),
        summarySkippedReason: z.string().optional()
      })
      .strict()
  )
});

export type ContextCompilation = {
  readonly pack: ContextPack;
  readonly markdown: string;
  readonly warnings: readonly string[];
};

export type ContextCompilationInput = {
  readonly targetPath: string;
  readonly feature: ActiveFeature;
  readonly taskGraph: TaskGraphArtifact;
  readonly task: Task;
  readonly budgetMode?: BudgetMode;
  readonly maxTokens?: number;
  readonly includeFullFiles?: boolean;
  /**
   * Over-budget tolerance percent (policy `limits.maxContextOverBudgetPercent`).
   * When omitted, it is loaded from the target's effective policy. Locked mode
   * resolves to 0, which keeps the over-budget check a hard cutoff.
   */
  readonly overBudgetTolerancePercent?: number;
  /**
   * Explicit compact snippet cap for this invocation (`--snippet-cap on|off`).
   * When omitted it is resolved from `.visp/config.json` and then the per-mode
   * default. See `resolveSnippetCap`.
   */
  readonly snippetCap?: boolean;
  /** Injected in tests; production uses the default runner. */
  readonly commandRunner?: CommandRunner;
  readonly now: string;
};

/**
 * HEAD at context generation, which is this task's base.
 *
 * The pack schema has always documented this field and nothing populated it,
 * so VSP021 drift detection and the understanding case's currentness rule both
 * had nothing to compare against. Two cheap git calls, and a project without
 * git simply has no base — exactly as the schema says.
 */
async function captureBaseCommit(input: {
  readonly targetPath: string;
  readonly runner: CommandRunner;
}): Promise<string | undefined> {
  const inside = await input.runner.run("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: input.targetPath,
    timeoutMs: 3000
  });

  if (!inside.ok || inside.value.stdout.trim() !== "true") return undefined;

  const head = await input.runner.run("git", ["rev-parse", "HEAD"], {
    cwd: input.targetPath,
    timeoutMs: 3000
  });

  if (!head.ok) return undefined;

  const commit = head.value.stdout.trim();

  return commit.length === 0 ? undefined : commit;
}

async function optionalText(input: {
  readonly path: string;
  readonly label: string;
  readonly warnings: string[];
}): Promise<string | undefined> {
  const exists = await pathExists(input.path);

  if (!exists.ok) {
    input.warnings.push(`Unable to access optional ${input.label}: ${exists.error.message}`);
    return undefined;
  }

  if (!exists.value) {
    input.warnings.push(`Optional file missing: ${input.label}.`);
    return undefined;
  }

  const text = await readTextFile(input.path);

  if (!text.ok) {
    input.warnings.push(`Optional file unreadable: ${input.label}. ${text.error.message}`);
    return undefined;
  }

  return text.value;
}

async function optionalJson<T>(input: {
  readonly path: string;
  readonly schema: ZodType<T>;
  readonly label: string;
  readonly warnings: string[];
}): Promise<T | undefined> {
  const exists = await pathExists(input.path);

  if (!exists.ok || !exists.value) {
    input.warnings.push(`Optional cache missing: ${input.label}.`);
    return undefined;
  }

  const json = await readJsonFile<unknown>(input.path);

  if (!json.ok) {
    input.warnings.push(`Optional cache unreadable: ${input.label}. ${json.error.message}`);
    return undefined;
  }

  const parsed = input.schema.safeParse(json.value);

  if (!parsed.success) {
    input.warnings.push(`Optional cache invalid: ${input.label}.`);
    return undefined;
  }

  return parsed.data;
}

async function resolveBudgetMode(input: {
  readonly targetPath: string;
  readonly feature: ActiveFeature;
  readonly budgetMode?: BudgetMode;
  readonly warnings: string[];
}): Promise<BudgetMode> {
  if (input.budgetMode !== undefined) {
    return input.budgetMode;
  }

  if (input.feature.intent.budgetMode !== undefined) {
    return input.feature.intent.budgetMode;
  }

  const config = await optionalArtifact({
    path: projectConfigArtifactPath(input.targetPath),
    schema: projectConfigSchema,
    artifactName: "project config",
    warnings: input.warnings
  });

  return config?.budgetMode ?? "lean";
}

async function resolveOverBudgetTolerance(input: {
  readonly targetPath: string;
  readonly now: string;
  readonly override?: number;
}): Promise<number> {
  if (input.override !== undefined) {
    return input.override;
  }

  // Silent resolution: the effective policy loader is authoritative for the
  // tolerance. Its own warnings (uninitialized project, missing policy file)
  // are surfaced by the gate/status workflows, not the context pack, so they
  // are intentionally not appended here to keep pack warnings stable.
  const effective = await loadEffectiveGatePolicy({
    targetPath: input.targetPath,
    now: input.now
  });

  return effective.policy.limits.maxContextOverBudgetPercent;
}

/**
 * Whether the compact snippet cap applies, most specific signal first.
 *
 *  1. `--snippet-cap on|off` on this invocation. Explicit, so it wins outright.
 *  2. `--include-full-files` on this invocation, which turns the cap OFF. Full
 *     files and a forty-line snippet ceiling are contradictory requests, and a
 *     flag the user typed must not be silently swallowed by a default they did
 *     not. A pack that carries the cap silently ignores `--include-full-files`
 *     entirely, because the capped branch never asks for a full file — so this
 *     is not a preference, it is the difference between the flag working and
 *     the flag doing nothing. Warned, so the reason is in the pack.
 *  3. `contextSnippetCap` in `.visp/config.json`, the project-level setting.
 *  4. The per-mode default.
 *
 * The config read is deliberately silent, for the same reason
 * `resolveOverBudgetTolerance` above is: a missing or unreadable project config
 * is doctor's and status's finding to report, and appending it here would make
 * pack warnings depend on which resolver happened to need the file.
 */
async function resolveSnippetCap(input: {
  readonly targetPath: string;
  readonly budgetMode: BudgetMode;
  readonly includeFullFiles: boolean;
  readonly override?: boolean;
  readonly warnings: string[];
}): Promise<boolean> {
  if (input.override !== undefined) {
    return input.override;
  }

  if (input.includeFullFiles) {
    input.warnings.push(
      "Full-file context was requested, so the compact snippet cap is off for this pack; pass --snippet-cap on to keep the cap."
    );
    return false;
  }

  const config = await optionalArtifact({
    path: projectConfigArtifactPath(input.targetPath),
    schema: projectConfigSchema,
    artifactName: "project config",
    warnings: []
  });

  return config?.contextSnippetCap ?? defaultCompactSnippetCap(input.budgetMode);
}

function tokenizedPack(input: {
  readonly pack: ContextPack;
  readonly markdown: string;
  readonly policy: ContextBudgetPolicy;
  readonly includeFullFiles: boolean;
}): ContextPack {
  const legacyEstimate = estimateContextPackInputTokens(input.pack, input.markdown);
  const markdownRange = estimateTokenRange(input.markdown);
  const jsonRange = estimateTokenRange(JSON.stringify(input.pack, null, 2));
  const lowerBound = Math.max(markdownRange.lowerBound, jsonRange.lowerBound);
  const upperBound = Math.max(markdownRange.upperBound, jsonRange.upperBound, legacyEstimate);
  const inputTokens = upperBound;
  // Over-budget honors the policy tolerance: the effective cutoff is
  // maxInputTokens * (1 + tolerance/100). Locked mode is 0% tolerance, so this
  // stays a hard cutoff at maxInputTokens (identical to previous behavior).
  const effectiveMax = effectiveMaxInputTokens(input.policy);
  const overBudget = inputTokens > effectiveMax;
  const overBudgetBy = Math.max(0, inputTokens - effectiveMax);
  const recommendation = contextBudgetRecommendation({
    overBudget,
    overBudgetBy,
    hasAllowedFiles: input.pack.selectedTask.allowedFiles.length > 0,
    includeFullFiles: input.includeFullFiles
  });
  const warning = overBudget
    ? `Context is over budget by ${overBudgetBy} input tokens. ${recommendation}`
    : undefined;

  return {
    ...input.pack,
    estimatedTokens: {
      input: inputTokens,
      expectedOutput: input.policy.expectedOutputTokens,
      total: inputTokens + input.policy.expectedOutputTokens,
      maxInput: input.policy.maxInputTokens,
      mode: input.policy.mode,
      estimator: tokenEstimatorName,
      lowerBound,
      upperBound,
      profile: markdownRange.profile,
      uncertainty: markdownRange.uncertainty
    },
    overBudget,
    recommendation,
    warnings: warning === undefined ? input.pack.warnings : [...input.pack.warnings, warning]
  };
}

function lowestRelevanceSnippetIndex(pack: ContextPack): number {
  const keywords = taskKeywords(pack.selectedTask);
  let lowestIndex = pack.includedSnippets.length - 1;
  let lowestScore = Number.POSITIVE_INFINITY;

  pack.includedSnippets.forEach((snippet, index) => {
    const score = snippetRelevanceScore(snippet, keywords);

    // Ties prefer the later snippet, preserving the earlier remove-last order.
    if (score <= lowestScore) {
      lowestScore = score;
      lowestIndex = index;
    }
  });

  return lowestIndex;
}

function removeLowestRelevanceSnippet(pack: ContextPack): {
  readonly pack: ContextPack;
  readonly removedPath: string | undefined;
} {
  const index = lowestRelevanceSnippetIndex(pack);
  const snippet = pack.includedSnippets[index];

  if (snippet === undefined) {
    return { pack, removedPath: undefined };
  }

  return {
    removedPath: snippet.filePath,
    pack: {
      ...pack,
      includedSnippets: pack.includedSnippets.filter((_, position) => position !== index),
      includedFiles: pack.includedFiles.map((file) =>
        file.path === snippet.filePath
          ? {
              ...file,
              includeMode: file.includeMode === "full" ? "summary" : file.includeMode,
              snippetIncluded: false,
              warning: file.warning ?? "Snippet removed to reduce context size."
            }
          : file
      )
    }
  };
}

function trimOptionalContext(input: {
  readonly pack: ContextPack;
  readonly feature: ActiveFeature;
  readonly policy: ContextBudgetPolicy;
  readonly includeFullFiles: boolean;
}): { readonly pack: ContextPack; readonly markdown: string } {
  let pack = input.pack;
  let markdown = renderContextMarkdown({ feature: input.feature, pack });
  let tokenized = tokenizedPack({
    pack,
    markdown,
    policy: input.policy,
    includeFullFiles: input.includeFullFiles
  });

  if (!tokenized.overBudget) {
    return {
      pack: tokenized,
      markdown: renderContextMarkdown({ feature: input.feature, pack: tokenized })
    };
  }

  const originalSnippetCount = pack.includedSnippets.length;
  let removedPatterns = false;

  if (pack.includedProjectContext.patterns.length > 0) {
    removedPatterns = true;
    pack = {
      ...pack,
      includedProjectContext: {
        ...pack.includedProjectContext,
        patterns: ""
      },
      warnings: [...pack.warnings, "Removed project patterns to reduce context size."]
    };
  }

  const trimTarget = effectiveMaxInputTokens(input.policy);

  while (pack.includedSnippets.length > 0) {
    markdown = renderContextMarkdown({ feature: input.feature, pack });
    const estimate = estimateTokens(markdown);

    if (estimate <= trimTarget) {
      break;
    }

    const removal = removeLowestRelevanceSnippet(pack);

    pack = {
      ...removal.pack,
      warnings: [
        ...pack.warnings,
        removal.removedPath === undefined
          ? "Removed a file snippet to reduce context size."
          : `Removed snippet ${removal.removedPath} (lowest relevance) to reduce context size.`
      ]
    };
  }

  const removedSnippetCount = originalSnippetCount - pack.includedSnippets.length;
  const stillOverBudget =
    estimateTokens(renderContextMarkdown({ feature: input.feature, pack })) >
    input.policy.maxInputTokens;
  const heavilyTrimmed =
    (originalSnippetCount > 0 && removedSnippetCount > originalSnippetCount / 2) ||
    (pack.includedSnippets.length === 0 && stillOverBudget);

  if (removedSnippetCount > 0 || removedPatterns) {
    pack = {
      ...pack,
      trimming: {
        removedSnippetCount,
        removedPatterns,
        heavilyTrimmed
      },
      warnings: heavilyTrimmed
        ? [
            ...pack.warnings,
            "Context was heavily trimmed to fit the token budget; agents should treat this pack as degraded and consider splitting the task or raising --max-tokens."
          ]
        : pack.warnings
    };
  }

  markdown = renderContextMarkdown({ feature: input.feature, pack });
  tokenized = tokenizedPack({
    pack,
    markdown,
    policy: input.policy,
    includeFullFiles: input.includeFullFiles
  });

  return {
    pack: tokenized,
    markdown: renderContextMarkdown({ feature: input.feature, pack: tokenized })
  };
}

async function collectArtifactProvenance(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly warnings: string[];
}): Promise<ContextArtifactProvenance[]> {
  const candidates = [
    { label: "spec", path: specArtifactPath(input.targetPath, input.featureKey) },
    { label: "plan", path: planArtifactPath(input.targetPath, input.featureKey) },
    { label: "task graph", path: taskGraphArtifactPath(input.targetPath, input.featureKey) },
    { label: "policy", path: policyArtifactPath(input.targetPath) },
    { label: "project config", path: projectConfigArtifactPath(input.targetPath) },
    { label: "project profile", path: projectProfileArtifactPath(input.targetPath) },
    { label: "compact constitution", path: compactConstitutionArtifactPath(input.targetPath) },
    { label: "project summary", path: projectSummaryArtifactPath(input.targetPath) },
    { label: "project patterns", path: patternsArtifactPath(input.targetPath) }
  ];
  const provenance: ContextArtifactProvenance[] = [];

  for (const candidate of candidates) {
    const exists = await pathExists(candidate.path);
    if (!exists.ok) {
      input.warnings.push(
        `Unable to access provenance artifact ${candidate.label}: ${exists.error.message}`
      );
      continue;
    }
    if (!exists.value) {
      continue;
    }

    const text = await readTextFile(candidate.path);
    if (!text.ok) {
      input.warnings.push(
        `Unable to hash provenance artifact ${candidate.label}: ${text.error.message}`
      );
      continue;
    }

    provenance.push({
      label: candidate.label,
      path: relativePath(input.targetPath, candidate.path),
      hash: createHash("sha256").update(text.value).digest("hex"),
      hashAlgorithm: "sha256"
    });
  }

  return provenance;
}

/**
 * Provenance for the four artifacts the FILE SELECTION reads.
 *
 * Separate from `collectArtifactProvenance` because the hash means something
 * different — see `retrieval-inputs.ts` — and because these entries are
 * conditional on the artifact being both present and parseable, where the nine
 * authored artifacts are conditional only on presence. An input that is absent
 * contributes no entry, which is the correct record: a pack built with no
 * projection was not a function of one.
 */
async function collectRetrievalInputProvenance(input: {
  readonly targetPath: string;
  readonly hasIntelFileGraph: boolean;
}): Promise<ContextArtifactProvenance[]> {
  const candidates: readonly { readonly label: RetrievalInputLabel; readonly path: string }[] = [
    { label: RETRIEVAL_INPUT_LABELS.fileIndex, path: fileIndexArtifactPath(input.targetPath) },
    {
      label: RETRIEVAL_INPUT_LABELS.fileSummaries,
      path: fileSummariesArtifactPath(input.targetPath)
    },
    { label: RETRIEVAL_INPUT_LABELS.moduleMap, path: moduleMapArtifactPath(input.targetPath) },
    // Recorded only when the projection was actually USED. A projection on disk
    // that `loadIntelGraph` refused — oversized, unparseable, or describing a
    // snapshot that was not the head — did not condition this pack, and saying
    // it did would be a stronger provenance claim than Kit holds.
    ...(input.hasIntelFileGraph
      ? [
          {
            label: RETRIEVAL_INPUT_LABELS.intelProjection,
            path: intelProjectionArtifactPath(input.targetPath)
          }
        ]
      : [])
  ];
  const provenance: ContextArtifactProvenance[] = [];

  for (const candidate of candidates) {
    const raw = await readJsonFile<unknown>(candidate.path);

    if (!raw.ok) continue;

    const hash = retrievalInputContentHash({ label: candidate.label, raw: raw.value });

    if (hash === undefined) continue;

    provenance.push({
      label: candidate.label,
      path: relativePath(input.targetPath, candidate.path),
      hash,
      hashAlgorithm: "sha256",
      hashScope: "content"
    });
  }

  return provenance;
}

export async function compileContext(
  input: ContextCompilationInput
): Promise<Result<ContextCompilation, VispError>> {
  const warnings: string[] = [];
  const budgetMode = await resolveBudgetMode({
    targetPath: input.targetPath,
    feature: input.feature,
    budgetMode: input.budgetMode,
    warnings
  });
  const tolerancePercent = await resolveOverBudgetTolerance({
    targetPath: input.targetPath,
    now: input.now,
    override: input.overBudgetTolerancePercent
  });
  const modeDefaults = contextBudgetPolicy(budgetMode, input.maxTokens, tolerancePercent);
  const includeFullFiles = input.includeFullFiles ?? modeDefaults.includeFullFilesByDefault;
  const snippetCap = await resolveSnippetCap({
    targetPath: input.targetPath,
    budgetMode,
    includeFullFiles,
    ...(input.snippetCap === undefined ? {} : { override: input.snippetCap }),
    warnings
  });
  const policy = contextBudgetPolicy(budgetMode, input.maxTokens, tolerancePercent, snippetCap);
  const spec = await optionalArtifact({
    path: specArtifactPath(input.targetPath, input.feature.key),
    schema: specArtifactSchema,
    artifactName: "spec",
    warnings
  });
  const plan = await optionalArtifact({
    path: planArtifactPath(input.targetPath, input.feature.key),
    schema: planDraftArtifactSchema,
    artifactName: "plan",
    warnings
  });
  await optionalArtifact({
    path: traceabilityArtifactPath(input.targetPath, input.feature.key),
    schema: traceabilityMatrixSchema,
    artifactName: "traceability",
    warnings
  });
  await optionalJson({
    path: moduleMapArtifactPath(input.targetPath),
    schema: z.unknown(),
    label: "module map",
    warnings
  });
  await optionalJson({
    path: testMapArtifactPath(input.targetPath),
    schema: z.unknown(),
    label: "test map",
    warnings
  });
  await optionalJson({
    path: dependencyMapArtifactPath(input.targetPath),
    schema: z.unknown(),
    label: "dependency map",
    warnings
  });

  const projectProfile = await optionalArtifact({
    path: projectProfileArtifactPath(input.targetPath),
    schema: projectProfileSchema,
    artifactName: "project profile",
    warnings
  });
  const compactConstitution = await optionalText({
    path: compactConstitutionArtifactPath(input.targetPath),
    label: "compact constitution",
    warnings
  });
  const projectSummary = await optionalText({
    path: projectSummaryArtifactPath(input.targetPath),
    label: "project summary",
    warnings
  });
  const patterns = await optionalText({
    path: patternsArtifactPath(input.targetPath),
    label: "project patterns",
    warnings
  });
  const fileIndex = await optionalJson({
    path: fileIndexArtifactPath(input.targetPath),
    schema: fileIndexCacheSchema,
    label: "file index",
    warnings
  });
  const fileSummaries = await optionalJson({
    path: fileSummariesArtifactPath(input.targetPath),
    schema: fileSummariesCacheSchema,
    label: "file summaries",
    warnings
  });
  // Intel INFORMS. This reads a ≤16 MiB JSON artifact off disk and reuses
  // `loadIntelGraph`'s existing size bound, schema check and
  // snapshotId===headSnapshotId currency rule rather than restating any of
  // them. It does NOT load intel's store and never shells out to the intel CLI,
  // so the ~24s `repo describe` cost on a large store stays out of the
  // retrieval path.
  //
  // Its warnings are deliberately NOT appended to the pack. They are about the
  // state of a scan input and scan already raises them; adding them here would
  // make a pack's text differ between a project that has intel and one that
  // does not for reasons unrelated to what the pack contains.
  const intelGraph = await loadIntelGraph(input.targetPath);
  const artifactProvenance = [
    ...(await collectArtifactProvenance({
      targetPath: input.targetPath,
      featureKey: input.feature.key,
      warnings
    })),
    ...(await collectRetrievalInputProvenance({
      targetPath: input.targetPath,
      hasIntelFileGraph: intelGraph.fileGraph !== undefined
    }))
  ];
  const baseCommit = await captureBaseCommit({
    targetPath: input.targetPath,
    runner: input.commandRunner ?? defaultCommandRunner
  });
  // Intel INFORMS: this is evidence, and Kit decides whether it counts. A
  // stale case is not an error and does not fail the command; it is simply not
  // rendered, and the pack reverts to the behaviour it has today.
  const understandingExport = await readUnderstandingExport({
    targetPath: input.targetPath,
    taskId: input.task.id,
    warnings
  });
  const currentness =
    understandingExport === undefined
      ? undefined
      : understandingCurrentness({
          export: understandingExport,
          scanRepositoryInstanceId: await readScanIntelInstanceId(input.targetPath),
          baseCommit
        });

  if (understandingExport !== undefined && currentness?.current === false) {
    warnings.push(
      `Understanding case for ${input.task.id} is not current (${currentness.reasons.join("; ")}); it was not used.`
    );
  }

  const understanding =
    understandingExport === undefined || currentness?.current !== true
      ? undefined
      : understandingView({
          export: understandingExport,
          current: true,
          currentnessReasons: []
        });
  const selected = await selectContextPack({
    targetPath: input.targetPath,
    feature: input.feature,
    taskGraph: input.taskGraph,
    task: input.task,
    policy,
    includeFullFiles,
    now: input.now,
    spec,
    plan,
    compactConstitution,
    projectSummary,
    patterns,
    fileIndex: fileIndex?.files as readonly FileIndexEntry[] | undefined,
    fileSummaries: fileSummaries?.items as readonly FileSummary[] | undefined,
    projectProfile,
    ...(understanding === undefined ? {} : { understanding }),
    ...(intelGraph.fileGraph === undefined ? {} : { fileGraph: intelGraph.fileGraph }),
    warnings
  });
  const grounded = {
    ...selected,
    ...(baseCommit === undefined ? {} : { baseCommit }),
    artifactProvenance
  };
  const trimmed = trimOptionalContext({
    pack: grounded,
    feature: input.feature,
    policy,
    includeFullFiles
  });
  const validation = contextPackSchema.safeParse(trimmed.pack);

  if (!validation.success) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Generated context pack is invalid: ${validation.error.issues[0]?.message ?? "unknown error"}`
      )
    );
  }

  return ok({
    pack: validation.data,
    markdown: trimmed.markdown,
    warnings: trimmed.pack.warnings
  });
}
