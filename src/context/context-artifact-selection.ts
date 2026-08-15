/**
 * Choosing which parts of the spec, plan, and task graph belong in a context pack.
 *
 * A context pack has a token budget, so every selector here answers "what does
 * THIS task need" rather than copying the artifact wholesale. Selection is
 * driven by the task's own declared requirement and acceptance-criterion IDs,
 * which keeps the pack traceable: everything in it can be pointed back to a
 * link the task itself declared.
 */
import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import {
  type AcceptanceCriterion,
  type Requirement
} from "../artifacts/schemas/requirement.schema.js";
import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type ProjectProfile } from "../artifacts/schemas/project.schema.js";
import { type FileSummary } from "../scanner/types.js";
import { uniqueTrimmed as unique } from "../core/collections.js";

export function byId<T extends { readonly id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

export function acceptanceCriteriaForRequirements(
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

export function selectRequirements(input: {
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

export function selectAcceptanceCriteria(input: {
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

export function selectPlanDecisions(
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

export function selectPlanRisks(
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

export function selectDependencyTasks(
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

export function parseCompactRules(
  text: string | undefined
): ContextPack["includedConstitutionRules"] {
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

export function validationCommands(input: {
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

export function taskKeywords(task: Task): readonly string[] {
  return unique(`${task.title} ${task.description}`.toLowerCase().split(/[^a-z0-9]+/)).filter(
    (word) => word.length >= 4 && word !== "task" && word !== "test"
  );
}

export function lexicalTokens(value: string): readonly string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 3);
}

export function rankSummaries(
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

export function compactText(text: string | undefined, maxLines: number): string {
  if (text === undefined) return "";

  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines)
    .join("\n");
}
