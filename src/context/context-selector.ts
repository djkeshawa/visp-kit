import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
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
import { taskKeywords } from "./context-relevance.js";
import { extractFileSnippet } from "./file-snippets.js";
import { estimateJsonTokens, estimateTokens, tokenEstimatorName } from "./token-estimator.js";

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
  readonly warnings: readonly string[];
};

type FileContext = {
  readonly file: ContextPack["includedFiles"][number];
  readonly snippet?: ContextPack["includedSnippets"][number];
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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
  const matched = input.summaries
    .filter((summary) => keywords.some((word) => summary.path.toLowerCase().includes(word)))
    .map((summary) => summary.path);

  if (matched.length > 0) {
    input.warnings.push("Task has no allowedFiles; used task keywords to select file summaries.");
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

    const summaryText = fileSummaryText(summary);
    let snippet = await extractFileSnippet({
      rootPath: input.targetPath,
      filePath: normalized,
      maxTokens: input.includeFullFiles
        ? input.policy.maxFullFileTokens
        : input.policy.maxSnippetTokensPerFile,
      fullFile: input.includeFullFiles,
      reason: "Task file context."
    });
    let warning: string | undefined;
    let includeMode: FileContext["file"]["includeMode"] = "summary";

    if (!snippet.ok) {
      warning = snippet.error.message;
      snippet = { ok: true, value: undefined };
    }

    if (snippet.value !== undefined && input.includeFullFiles) {
      if (snippet.value.tokenEstimate <= input.policy.maxFullFileTokens) {
        includeMode = "full";
      } else {
        warning = "Full file exceeded file budget; included snippet instead.";
        snippet = await extractFileSnippet({
          rootPath: input.targetPath,
          filePath: normalized,
          maxTokens: input.policy.maxSnippetTokensPerFile,
          fullFile: false,
          reason: "Task file snippet after full-file fallback."
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
    warnings.push("Scan cache is incomplete; run `visp scan` for better file context.");
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
  const projectContext = {
    summary: input.policy.includeProjectSummary
      ? compactText(input.projectSummary, input.policy.outputStyle === "compact" ? 12 : 20)
      : "",
    patterns: input.policy.includePatterns
      ? compactText(input.patterns, input.policy.outputStyle === "detailed" ? 16 : 10)
      : "",
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
