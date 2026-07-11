import { createHash } from "node:crypto";
import { z, type ZodType } from "zod";

import {
  compactConstitutionArtifactPath,
  dependencyMapArtifactPath,
  fileIndexArtifactPath,
  fileSummariesArtifactPath,
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
import { readArtifact } from "../artifacts/artifact-reader.js";
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
import { type FileIndexEntry, type FileSummary } from "../scanner/types.js";
import { type ActiveFeature } from "../workflows/shared/active-feature.js";
import {
  contextBudgetPolicy,
  contextBudgetRecommendation,
  effectiveMaxInputTokens,
  type ContextBudgetPolicy
} from "./context-budget.js";
import { estimateContextPackInputTokens, selectContextPack } from "./context-selector.js";
import { renderContextMarkdown } from "./context-renderer.js";
import { estimateTokenRange, estimateTokens, tokenEstimatorName } from "./token-estimator.js";

const fileIndexCacheSchema = z.object({
  files: z.array(
    z
      .object({
        path: z.string(),
        extension: z.string(),
        sizeBytes: z.number(),
        hash: z.string(),
        language: z.string(),
        isTestFile: z.boolean(),
        isConfigFile: z.boolean(),
        isSourceFile: z.boolean(),
        lastScannedAt: z.string()
      })
      .strict()
  )
});

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
  readonly now: string;
};

async function optionalArtifact<T>(input: {
  readonly path: string;
  readonly schema: ZodType<T>;
  readonly artifactName: string;
  readonly warnings: string[];
}): Promise<T | undefined> {
  const exists = await pathExists(input.path);

  if (!exists.ok) {
    input.warnings.push(`Unable to access optional ${input.artifactName}: ${exists.error.message}`);
    return undefined;
  }

  if (!exists.value) {
    input.warnings.push(`Optional artifact missing: ${input.artifactName}.`);
    return undefined;
  }

  const artifact = await readArtifact(input.path, input.schema, {
    artifactName: input.artifactName
  });

  if (!artifact.ok) {
    input.warnings.push(
      `Optional artifact unreadable: ${input.artifactName}. ${artifact.error.message}`
    );
    return undefined;
  }

  return artifact.value;
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
  const policy = contextBudgetPolicy(budgetMode, input.maxTokens, tolerancePercent);
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
  const artifactProvenance = await collectArtifactProvenance({
    targetPath: input.targetPath,
    featureKey: input.feature.key,
    warnings
  });
  const selected = await selectContextPack({
    targetPath: input.targetPath,
    feature: input.feature,
    taskGraph: input.taskGraph,
    task: input.task,
    policy,
    includeFullFiles: input.includeFullFiles ?? policy.includeFullFilesByDefault,
    now: input.now,
    spec,
    plan,
    compactConstitution,
    projectSummary,
    patterns,
    fileIndex: fileIndex?.files as readonly FileIndexEntry[] | undefined,
    fileSummaries: fileSummaries?.items as readonly FileSummary[] | undefined,
    projectProfile,
    warnings
  });
  const grounded = {
    ...selected,
    artifactProvenance
  };
  const trimmed = trimOptionalContext({
    pack: grounded,
    feature: input.feature,
    policy,
    includeFullFiles: input.includeFullFiles ?? policy.includeFullFilesByDefault
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
