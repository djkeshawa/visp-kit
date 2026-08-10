import {
  type ContextPack,
  type ContextUnderstanding
} from "../artifacts/schemas/context-pack.schema.js";
import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import {
  type AcceptanceCriterion,
  type Requirement
} from "../artifacts/schemas/requirement.schema.js";
import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type ProjectProfile } from "../artifacts/schemas/project.schema.js";
import { shouldIgnorePath, isBinaryPath, isLockFile } from "../scanner/ignore-rules.js";
import { type FileIndexEntry, type FileSummary } from "../scanner/types.js";
import { type ActiveFeature } from "../workflows/shared/active-feature.js";
import { type ContextBudgetPolicy } from "./context-budget.js";
import { extractFileSnippet } from "./file-snippets.js";
import { estimateJsonTokens, estimateTokens, tokenEstimatorName } from "./token-estimator.js";
import { findReuseHelpers } from "./reuse-helpers.js";

export type ContextSelectionInput = {
  readonly targetPath: string;
  readonly feature: ActiveFeature;
  readonly taskGraph: TaskGraphArtifact;
  readonly task: Task;
  readonly policy: ContextBudgetPolicy;
  readonly includeFullFiles: boolean;
  readonly now: string;
  readonly spec?: SpecArtifact;
  readonly plan?: PlanDraftArtifact;
  readonly compactConstitution?: string;
  readonly projectSummary?: string;
  readonly patterns?: string;
  readonly fileIndex?: readonly FileIndexEntry[];
  readonly fileSummaries?: readonly FileSummary[];
  readonly projectProfile?: ProjectProfile;
  /**
   * The compact task model (ADR 0014 Q3), present only when a CURRENT
   * understanding case exists. Its presence is what switches the pack from
   * "everything that might be relevant" to "the cited path plus what is being
   * changed". Absent, every line below behaves exactly as it did before.
   */
  readonly understanding?: ContextUnderstanding;
  readonly warnings: readonly string[];
};

/**
 * Snippet budget for the compact pack: at most four files, at most forty lines
 * each (ADR 0014 Q3, 1,200 tokens). Files outside this set still appear in the
 * pack — they are the authorization surface — they just arrive without a body.
 */
const COMPACT_MAX_SNIPPET_FILES = 4;
const COMPACT_MAX_SNIPPET_LINES = 40;

function snippetBudget(
  onPath: ReadonlySet<string> | undefined,
  policy: ContextBudgetPolicy
): number {
  return onPath === undefined ? policy.maxFiles : COMPACT_MAX_SNIPPET_FILES;
}

/**
 * Files the compact pack may show code for: those holding an entity on the
 * cited path or in the candidate change set.
 *
 * The membership decision upstream is by entity id; these are the file paths
 * those ids resolved to. A path is an identity within one snapshot of one
 * repository, which is the only reason it is safe to compare here.
 */
export function understandingFilePaths(understanding: ContextUnderstanding): ReadonlySet<string> {
  const paths = new Set<string>();

  for (const row of understanding.path) {
    if (row.sourceFilePath !== null) paths.add(row.sourceFilePath);
    if (row.targetFilePath !== null) paths.add(row.targetFilePath);
  }

  for (const signature of understanding.signatures) {
    if (signature.filePath !== null) paths.add(signature.filePath);
  }

  return paths;
}

type FileContext = {
  readonly file: ContextPack["includedFiles"][number];
  readonly snippet?: ContextPack["includedSnippets"][number];
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function taskKeywords(task: Task): readonly string[] {
  return unique(`${task.title} ${task.description}`.toLowerCase().split(/[^a-z0-9]+/)).filter(
    (word) => word.length >= 4 && word !== "task" && word !== "test"
  );
}

function lexicalTokens(value: string): readonly string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 3);
}

function rankSummaries(
  summaries: readonly FileSummary[],
  keywords: readonly string[]
): readonly string[] {
  if (keywords.length === 0 || summaries.length === 0) return [];
  const documents = summaries.map((summary) => ({
    path: summary.path,
    tokens: lexicalTokens(
      [
        summary.path,
        ...summary.symbols,
        ...summary.exports,
        ...summary.imports,
        ...summary.comments
      ].join(" ")
    )
  }));
  const averageLength =
    documents.reduce((sum, document) => sum + document.tokens.length, 0) /
    Math.max(1, documents.length);
  const documentFrequency = new Map<string, number>();
  for (const keyword of keywords) {
    documentFrequency.set(
      keyword,
      documents.filter((document) => document.tokens.includes(keyword)).length
    );
  }

  return documents
    .map((document) => {
      let score = 0;
      for (const keyword of keywords) {
        const frequency = document.tokens.filter((token) => token === keyword).length;
        if (frequency === 0) continue;
        const df = documentFrequency.get(keyword) ?? 0;
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
        const normalized =
          frequency +
          1.2 * (1 - 0.75 + (0.75 * document.tokens.length) / Math.max(1, averageLength));
        score += (idf * (frequency * 2.2)) / normalized;
        if (document.path.toLowerCase().includes(keyword)) score += idf * 2;
      }
      return { path: document.path, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .map((entry) => entry.path);
}

function compactText(text: string | undefined, maxLines: number): string {
  if (text === undefined) return "";

  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines)
    .join("\n");
}

function byId<T extends { readonly id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function acceptanceCriteriaForRequirements(
  requirements: readonly Requirement[],
  spec: SpecArtifact | undefined
): readonly AcceptanceCriterion[] {
  const topLevel = spec?.acceptanceCriteria ?? [];
  const all = [
    ...topLevel,
    ...requirements.flatMap((requirement) => requirement.acceptanceCriteria)
  ];
  const seen = new Set<string>();

  return all.filter((criterion) => {
    if (seen.has(criterion.id)) return false;
    seen.add(criterion.id);
    return requirements.some((requirement) => requirement.id === criterion.requirementId);
  });
}

function selectRequirements(input: {
  readonly task: Task;
  readonly spec?: SpecArtifact;
  readonly warnings: string[];
}): readonly Requirement[] {
  if (input.spec === undefined) {
    if (input.task.requirementIds.length > 0) {
      input.warnings.push("Spec artifact is missing; requirement details could not be included.");
    }
    return [];
  }

  const requirementsById = byId(input.spec.requirements);
  const requirements = input.task.requirementIds
    .map((id) => {
      const requirement = requirementsById.get(id);
      if (requirement === undefined) {
        input.warnings.push(`Task references missing requirement ${id}.`);
      }
      return requirement;
    })
    .filter((requirement): requirement is Requirement => requirement !== undefined);

  if (input.task.requirementIds.length === 0) {
    input.warnings.push(
      "Selected task does not reference requirements; included only minimal feature context."
    );
  }

  return requirements;
}

function selectAcceptanceCriteria(input: {
  readonly task: Task;
  readonly requirements: readonly Requirement[];
  readonly spec?: SpecArtifact;
  readonly warnings: string[];
}): readonly AcceptanceCriterion[] {
  if (input.spec === undefined) return [];

  const criteria = acceptanceCriteriaForRequirements(input.requirements, input.spec);
  const criteriaById = byId(criteria);

  if (input.task.acceptanceCriterionIds.length === 0 && input.requirements.length > 0) {
    input.warnings.push(
      "Task does not explicitly map acceptance criteria; included criteria from referenced requirements."
    );
    return criteria;
  }

  return input.task.acceptanceCriterionIds
    .map((id) => {
      const criterion = criteriaById.get(id);
      if (criterion === undefined) {
        input.warnings.push(`Task references missing acceptance criterion ${id}.`);
      }
      return criterion;
    })
    .filter((criterion): criterion is AcceptanceCriterion => criterion !== undefined);
}

function selectPlanDecisions(
  plan: PlanDraftArtifact | undefined,
  requirementIds: readonly string[]
): ContextPack["includedPlanDecisions"] {
  if (plan === undefined) return [];
  const requirements = new Set(requirementIds);

  return plan.decisions
    .filter((decision) =>
      decision.requirementIds.some((requirementId) => requirements.has(requirementId))
    )
    .map((decision) => ({
      id: decision.id,
      title: decision.title,
      summary: `${decision.decision} ${decision.reason}`.trim(),
      requirementIds: decision.requirementIds
    }));
}

function selectPlanRisks(
  plan: PlanDraftArtifact | undefined,
  requirementIds: readonly string[]
): ContextPack["includedRisks"] {
  if (plan === undefined) return [];
  const requirements = new Set(requirementIds);

  return plan.risks
    .filter((risk) => risk.requirementIds.some((requirementId) => requirements.has(requirementId)))
    .map((risk) => ({
      id: risk.id,
      description: risk.description,
      level: risk.level,
      mitigation: risk.mitigation,
      requirementIds: risk.requirementIds
    }));
}

function selectDependencyTasks(
  taskGraph: TaskGraphArtifact,
  task: Task
): ContextPack["includedDependencyTasks"] {
  const tasksById = new Map(taskGraph.tasks.map((candidate) => [candidate.id, candidate]));

  return task.dependsOn
    .map((dependencyId) => tasksById.get(dependencyId))
    .filter((dependency): dependency is Task => dependency !== undefined)
    .map((dependency) => ({
      id: dependency.id,
      title: dependency.title,
      status: dependency.status,
      dependsOn: dependency.dependsOn
    }));
}

function parseCompactRules(text: string | undefined): ContextPack["includedConstitutionRules"] {
  if (text === undefined) {
    return [
      {
        id: "C-FALLBACK",
        text: "Compact constitution is missing; keep changes scoped, tested, and token-efficient."
      }
    ];
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([A-Za-z0-9._:-]+):\s*(.+)$/.exec(line);
      return match === null ? undefined : { id: match[1] ?? "C-UNKNOWN", text: match[2] ?? line };
    })
    .filter((rule): rule is ContextPack["includedConstitutionRules"][number] => rule !== undefined)
    .filter((rule) =>
      /token|task|scope|test|dependency|function|structure|convention|trace/i.test(rule.text)
    );
}

function validationCommands(input: {
  readonly task: Task;
  readonly plan?: PlanDraftArtifact;
  readonly projectProfile?: ProjectProfile;
  readonly warnings: string[];
}): readonly string[] {
  const taskCommands = input.task.validationCommands.filter(
    (command) => command.trim().length > 0 && command.trim().toUpperCase() !== "TBD"
  );
  const planCommands =
    input.plan?.testingStrategy
      .map((item) => item.validationCommand)
      .filter((command) => command.trim().length > 0 && command.trim().toUpperCase() !== "TBD") ??
    [];
  const projectCommands = [
    ...(input.projectProfile?.testCommands ?? []),
    ...(input.projectProfile?.typecheckCommands ?? []),
    ...(input.projectProfile?.buildCommands ?? [])
  ];
  const commands = unique([...taskCommands, ...planCommands, ...projectCommands]);

  if (commands.length === 0) {
    input.warnings.push("No concrete validation commands were available for this task.");
  }

  return commands;
}

function candidateFiles(input: {
  readonly task: Task;
  readonly plan?: PlanDraftArtifact;
  readonly summaries: readonly FileSummary[];
  readonly index: readonly FileIndexEntry[];
  readonly warnings: string[];
}): readonly string[] {
  const direct = unique([...input.task.allowedFiles, ...(input.task.expectedFiles ?? [])]);
  const concreteDirect = direct.filter((filePath) => filePath.toUpperCase() !== "TBD");

  if (concreteDirect.length > 0) {
    return concreteDirect;
  }

  const affected = unique(
    input.plan?.affectedModules
      .map((module) => module.moduleOrFileArea)
      .filter((filePath) => filePath.toUpperCase() !== "TBD") ?? []
  );

  if (affected.length > 0) {
    input.warnings.push("Task has no allowedFiles; used plan affected modules as file hints.");
    return affected;
  }

  const keywords = taskKeywords(input.task);
  const matched = rankSummaries(input.summaries, keywords);

  if (matched.length > 0) {
    input.warnings.push("Task has no allowedFiles; used ranked lexical symbol and path retrieval.");
    return matched;
  }

  if (/test|spec/i.test(input.task.title)) {
    const tests = input.index.filter((file) => file.isTestFile).map((file) => file.path);
    if (tests.length > 0) {
      input.warnings.push("Task looks test-related; selected existing test files.");
      return tests;
    }
  }

  input.warnings.push(
    "No allowed files declared for this task. Keep changes minimal and ask for clarification if needed."
  );
  return direct.length > 0 ? direct : [];
}

function fileSummaryText(summary: FileSummary | undefined): string {
  if (summary === undefined) return "";

  return JSON.stringify(
    {
      language: summary.language,
      lineCount: summary.lineCount,
      imports: summary.imports,
      exports: summary.exports,
      symbols: summary.symbols,
      comments: summary.comments,
      skipped: summary.summarySkippedReason
    },
    null,
    2
  );
}

async function buildFileContexts(input: {
  readonly targetPath: string;
  readonly policy: ContextBudgetPolicy;
  readonly includeFullFiles: boolean;
  readonly task: Task;
  readonly plan?: PlanDraftArtifact;
  readonly fileIndex: readonly FileIndexEntry[];
  readonly fileSummaries: readonly FileSummary[];
  readonly understanding?: ContextUnderstanding;
  readonly warnings: string[];
}): Promise<readonly FileContext[]> {
  const indexByPath = new Map(input.fileIndex.map((file) => [file.path, file]));
  const summariesByPath = new Map(input.fileSummaries.map((summary) => [summary.path, summary]));
  const paths = candidateFiles({
    task: input.task,
    plan: input.plan,
    summaries: input.fileSummaries,
    index: input.fileIndex,
    warnings: input.warnings
  }).slice(0, input.policy.maxFiles);
  const forbidden = new Set(input.task.forbiddenFiles ?? []);
  const onPath =
    input.understanding === undefined ? undefined : understandingFilePaths(input.understanding);
  let snippetsTaken = 0;
  const contexts: FileContext[] = [];

  for (const filePath of paths) {
    const normalized = filePath.replaceAll("\\", "/");

    if (
      forbidden.has(normalized) ||
      shouldIgnorePath(normalized) ||
      isBinaryPath(normalized) ||
      (isLockFile(normalized) && !/dependency|package/i.test(input.task.title))
    ) {
      input.warnings.push(`Skipped ignored or forbidden file context: ${normalized}.`);
      continue;
    }

    const indexEntry = indexByPath.get(normalized);
    const summary = summariesByPath.get(normalized);

    if (indexEntry === undefined) {
      contexts.push({
        file: {
          path: normalized,
          reason: "Task allowed or expected file is not present yet.",
          includeMode: "new-file",
          hash: "new-file",
          language: "unknown",
          sizeBytes: 0,
          tokenEstimate: 0,
          summaryAvailable: false,
          snippetIncluded: false,
          warning: "Expected new file or file missing from scan cache."
        }
      });
      continue;
    }

    // The pack's bulk was here: a JSON summary (imports, exports, symbols,
    // comments) for every candidate file, plus a keyword-selected snippet.
    // With a cited path available, a file off that path contributes its
    // identity and its authorization status and nothing else; its detail is a
    // `repo.entity` or `repo.search` call away, and shipping it unasked is
    // what put Visp at 90-135k tokens against bare's 42k.
    const withhold = onPath !== undefined && !onPath.has(normalized);
    const summaryText = withhold ? "" : fileSummaryText(summary);
    const snippetAllowed = !withhold && snippetsTaken < snippetBudget(onPath, input.policy);
    let snippet = snippetAllowed
      ? await extractFileSnippet({
          rootPath: input.targetPath,
          filePath: normalized,
          maxTokens: input.includeFullFiles
            ? input.policy.maxFullFileTokens
            : input.policy.maxSnippetTokensPerFile,
          fullFile: input.includeFullFiles && onPath === undefined,
          reason: onPath === undefined ? "Task file context." : "Entity on the cited path.",
          focusTerms: taskKeywords(input.task),
          ...(onPath === undefined ? {} : { maxLines: COMPACT_MAX_SNIPPET_LINES })
        })
      : ({ ok: true, value: undefined } as const);
    let warning: string | undefined;
    let includeMode: FileContext["file"]["includeMode"] = "summary";

    if (!snippet.ok) {
      warning = snippet.error.message;
      snippet = { ok: true, value: undefined };
    }

    if (snippet.value !== undefined) snippetsTaken += 1;

    if (snippet.value !== undefined && input.includeFullFiles && onPath === undefined) {
      if (snippet.value.tokenEstimate <= input.policy.maxFullFileTokens) {
        includeMode = "full";
      } else {
        warning = "Full file exceeded file budget; included snippet instead.";
        snippet = await extractFileSnippet({
          rootPath: input.targetPath,
          filePath: normalized,
          maxTokens: input.policy.maxSnippetTokensPerFile,
          fullFile: false,
          reason: "Task file snippet after full-file fallback.",
          focusTerms: taskKeywords(input.task)
        });
        includeMode = snippet.ok && snippet.value !== undefined ? "snippet" : "summary";
      }
    } else if (snippet.value !== undefined) {
      includeMode = "snippet";
    }

    const contextSnippet =
      snippet.ok && snippet.value !== undefined
        ? {
            filePath: snippet.value.filePath,
            reason: snippet.value.reason,
            startLine: snippet.value.startLine,
            endLine: snippet.value.endLine,
            content: snippet.value.content,
            tokenEstimate: snippet.value.tokenEstimate
          }
        : undefined;

    contexts.push({
      file: {
        path: normalized,
        reason: input.task.allowedFiles.includes(normalized)
          ? "Task allowed file."
          : "Task expected or related file.",
        includeMode,
        hash: indexEntry.hash,
        language: indexEntry.language,
        sizeBytes: indexEntry.sizeBytes,
        tokenEstimate: estimateTokens(summaryText) + (contextSnippet?.tokenEstimate ?? 0),
        summaryAvailable: summary !== undefined,
        snippetIncluded: contextSnippet !== undefined,
        summary: summaryText,
        warning
      },
      snippet: contextSnippet
    });
  }

  return contexts;
}

export async function selectContextPack(input: ContextSelectionInput): Promise<ContextPack> {
  const warnings = [...input.warnings];

  if (input.compactConstitution === undefined) {
    warnings.push("Compact constitution is missing; used fallback implementation rules.");
  }

  if (input.fileIndex === undefined || input.fileSummaries === undefined) {
    warnings.push("Scan cache is incomplete; run `visp-kit scan` for better file context.");
  }

  const requirements = selectRequirements({
    task: input.task,
    spec: input.spec,
    warnings
  });
  const acceptanceCriteria = selectAcceptanceCriteria({
    task: input.task,
    requirements,
    spec: input.spec,
    warnings
  });
  const requirementIds = requirements.map((requirement) => requirement.id);
  const planDecisions = selectPlanDecisions(input.plan, requirementIds);
  const planRisks = selectPlanRisks(input.plan, requirementIds);
  const validation = validationCommands({
    task: input.task,
    plan: input.plan,
    projectProfile: input.projectProfile,
    warnings
  });
  const fileContexts = await buildFileContexts({
    targetPath: input.targetPath,
    policy: input.policy,
    includeFullFiles: input.includeFullFiles,
    task: input.task,
    plan: input.plan,
    fileIndex: input.fileIndex ?? [],
    fileSummaries: input.fileSummaries ?? [],
    ...(input.understanding === undefined ? {} : { understanding: input.understanding }),
    warnings
  });
  const constraints = unique([
    ...input.task.allowedFiles.map((file) => `Allowed file: ${file}`),
    ...(input.task.expectedFiles ?? []).map((file) => `Expected file: ${file}`),
    ...(input.task.forbiddenFiles ?? []).map((file) => `Forbidden file: ${file}`),
    "Implement only the selected task.",
    "Do not add unrelated refactoring.",
    "Do not introduce dependencies unless this task explicitly allows it."
  ]);
  // What scan already knows, handed to whoever writes the code. Not gated on
  // the summary/pattern budget switches: a one-line pointer at an existing
  // redaction helper is the cheapest and highest-value thing in this pack.
  const reuseHelpers = findReuseHelpers(
    (input.fileSummaries ?? []).map((summary) => ({
      path: summary.path,
      symbols: summary.symbols ?? []
    }))
  );
  // Dropped in compact mode: projectSummary and patterns are free text about
  // the repository as a whole, and the compact constitution already carries
  // the part of it that constrains the edit. reuseHelpers is NOT dropped with
  // them — it is the regex helper list behind the only measured behaviour win
  // in this project (credential leaks 0 of 4 versus 3 of 4), it is not
  // graph-derived, and the graph does not replace it.
  const compact = input.understanding !== undefined;
  const projectContext = {
    summary:
      input.policy.includeProjectSummary && !compact
        ? compactText(input.projectSummary, input.policy.outputStyle === "compact" ? 12 : 20)
        : "",
    patterns:
      input.policy.includePatterns && !compact
        ? compactText(input.patterns, input.policy.outputStyle === "detailed" ? 16 : 10)
        : "",
    ...(reuseHelpers.length > 0
      ? { reuseHelpers: reuseHelpers.map((h) => ({ ...h, symbols: [...h.symbols] })) }
      : {}),
    warnings: []
  };

  return {
    id: `CTX-${input.task.id}`,
    featureId: input.feature.id,
    featureSlug: input.feature.slug,
    taskId: input.task.id,
    budgetMode: input.policy.mode,
    estimatedTokens: {
      input: 0,
      expectedOutput: input.policy.expectedOutputTokens,
      total: input.policy.expectedOutputTokens,
      maxInput: input.policy.maxInputTokens,
      mode: input.policy.mode,
      estimator: tokenEstimatorName
    },
    overBudget: false,
    recommendation: "OK",
    warnings,
    selectedTask: input.task,
    includedRequirements: [...requirements],
    includedAcceptanceCriteria: [...acceptanceCriteria],
    includedPlanDecisions: planDecisions,
    includedRisks: planRisks,
    includedDependencyTasks: selectDependencyTasks(input.taskGraph, input.task),
    includedConstitutionRules: parseCompactRules(input.compactConstitution),
    includedProjectContext: projectContext,
    ...(input.understanding === undefined ? {} : { understanding: input.understanding }),
    artifactProvenance: [],
    includedFiles: fileContexts.map((context) => context.file),
    includedSnippets: fileContexts
      .map((context) => context.snippet)
      .filter(
        (snippet): snippet is ContextPack["includedSnippets"][number] => snippet !== undefined
      ),
    validationCommands: [...validation],
    constraints: [...constraints],
    instructions: [
      `Use this context to implement only ${input.task.id}.`,
      "Keep changes minimal and traceable to the listed requirements.",
      "Run the validation commands after implementation.",
      "Do not implement other tasks."
    ],
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function estimateContextPackInputTokens(pack: ContextPack, markdown: string): number {
  return Math.max(estimateTokens(markdown), estimateJsonTokens(pack));
}
