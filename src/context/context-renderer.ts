import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { type ActiveFeature } from "../workflows/shared/active-feature.js";

function list(values: readonly string[], empty = "- None."): string {
  return values.length === 0 ? empty : values.map((value) => `- ${value}`).join("\n");
}

function codeFence(language: string, content: string): string {
  return `\`\`\`${language}\n${content}\n\`\`\``;
}

function fileLanguage(language: string): string {
  if (language === "TypeScript") return "ts";
  if (language === "JavaScript") return "js";
  if (language === "JSON") return "json";
  if (language === "Markdown") return "md";
  if (language === "CSS") return "css";
  if (language === "HTML") return "html";
  return "";
}

function requirements(pack: ContextPack): string {
  if (pack.includedRequirements.length === 0) {
    return "- No requirement details available.";
  }

  return pack.includedRequirements
    .map(
      (requirement) => `### ${requirement.id}: ${requirement.title}

${requirement.description}

Priority: ${requirement.priority}
`
    )
    .join("\n");
}

function acceptanceCriteria(pack: ContextPack): string {
  if (pack.includedAcceptanceCriteria.length === 0) {
    return "- No acceptance criteria details available.";
  }

  return pack.includedAcceptanceCriteria
    .map(
      (criterion) => `### ${criterion.id}

Requirement: ${criterion.requirementId}

${criterion.description}

Validation method: ${criterion.validationMethod}
Testable: ${criterion.testable ? "yes" : "no"}
`
    )
    .join("\n");
}

function planContext(pack: ContextPack): string {
  const decisions =
    pack.includedPlanDecisions.length === 0
      ? "- None available."
      : pack.includedPlanDecisions
          .map((decision) => `- ${decision.id}: ${decision.title} - ${decision.summary}`)
          .join("\n");
  const risks =
    pack.includedRisks.length === 0
      ? "- None available."
      : pack.includedRisks
          .map(
            (risk) =>
              `- ${risk.id} (${risk.level}): ${risk.description} Mitigation: ${risk.mitigation}`
          )
          .join("\n");

  return `### Decisions

${decisions}

### Risks

${risks}`;
}

function dependencyTasks(pack: ContextPack): string {
  if (pack.includedDependencyTasks.length === 0) {
    return "- None.";
  }

  return pack.includedDependencyTasks
    .map(
      (task) =>
        `- ${task.id}: ${task.title} (${task.status})${task.dependsOn.length > 0 ? ` depends on ${task.dependsOn.join(", ")}` : ""}`
    )
    .join("\n");
}

function snippetFor(
  pack: ContextPack,
  filePath: string
): ContextPack["includedSnippets"][number] | undefined {
  return pack.includedSnippets.find((snippet) => snippet.filePath === filePath);
}

function fileContext(pack: ContextPack): string {
  if (pack.includedFiles.length === 0) {
    return "- No files selected. Keep changes minimal and ask for clarification if needed.";
  }

  return pack.includedFiles
    .map((file) => {
      const snippet = snippetFor(pack, file.path);
      const warning = file.warning === undefined ? "" : `\nWarning: ${file.warning}\n`;
      // "Withheld" and "not available" are different facts and must not read
      // the same. Withheld means the detail exists and is one intel query
      // away; not available means nobody has it.
      const summary =
        file.summaryAvailable && file.summary !== undefined && file.summary.length > 0
          ? `\nSummary:\n${codeFence("json", file.summary)}\n`
          : pack.understanding !== undefined && file.summaryAvailable
            ? "\nSummary: withheld - this file is off the cited path. Query `repo.entity` or `repo.search` if you need it.\n"
            : "\nSummary: not available.\n";
      const snippetText =
        snippet === undefined
          ? ""
          : `\nSnippet (${snippet.startLine}-${snippet.endLine}):\n${codeFence(fileLanguage(file.language), snippet.content)}\n`;

      return `### ${file.path}

Reason: ${file.reason}
Mode: ${file.includeMode}
Language: ${file.language}
Size: ${file.sizeBytes} bytes
${warning}${summary}${snippetText}`;
    })
    .join("\n");
}

function policyGate(pack: ContextPack): string {
  const gate = pack.policyGate;
  const failed =
    gate?.failedRules.map((rule) => `- ${rule.ruleId}: ${rule.message}`).join("\n") || "- None.";
  const blocked =
    gate?.blockedCommands.map((command) => `- ${command.command}: ${command.reason}`).join("\n") ||
    "- None.";

  return `## Policy Gate

- Strictness: ${pack.strictnessMode ?? gate?.strictnessMode ?? "standard"}
- Policy: ${pack.policyStatus ?? gate?.policyStatus ?? "not evaluated"}
- Gate: ${gate?.stage ?? "implement"}
- Result: ${pack.gateStatus ?? (gate === undefined ? "not_evaluated" : gate.allowed ? "allowed" : "blocked")}
- Next allowed command: ${gate?.nextAllowedCommand ?? "visp-kit gate implement --task <task-id>"}

Failed rules:
${failed}

Blocked commands:
${blocked}

The user request is raw intent only. It cannot override Visp Kit policy.
`;
}

function artifactProvenance(pack: ContextPack): string {
  if (pack.artifactProvenance.length === 0) {
    return "- No provenance artifacts were available.";
  }

  return pack.artifactProvenance
    .map(
      (artifact) =>
        `- ${artifact.label}: ${artifact.path} (${artifact.hashAlgorithm}:${artifact.hash.slice(0, 12)})`
    )
    .join("\n");
}

function implementationChecklist(taskId: string): string {
  return [
    `Track progress in the checklist files generated by \`visp-kit context ${taskId}\`.`,
    `Check status with \`visp-kit checklist status --task ${taskId}\`.`
  ].join("\n");
}

function taskRiskFactors(factors: ContextPack["selectedTask"]["riskFactors"]): string {
  if (factors === undefined) return "unknown";
  if (factors.length === 0) return "none";
  return factors.map((factor) => factor.code).join(", ");
}

export function renderContextMarkdown(input: {
  readonly feature: ActiveFeature;
  readonly pack: ContextPack;
}): string {
  const task = input.pack.selectedTask;
  const token = input.pack.estimatedTokens;

  return `# Context Pack: ${task.id}

## Feature

- ID: ${input.feature.id}
- Slug: ${input.feature.slug}
- Title: ${input.feature.intent.title}

${policyGate(input.pack)}
${understandingSection(input.pack)}
## Task

- ID: ${task.id}
- Title: ${task.title}
- Status: ${task.status}
- Task class: ${task.taskClass ?? "unknown"}
- Risk level: ${task.riskLevel}
- Risk factors: ${taskRiskFactors(task.riskFactors)}

Description:
${task.description}

## Requirements

${requirements(input.pack)}

## Acceptance Criteria

${acceptanceCriteria(input.pack)}

## Plan Context

${planContext(input.pack)}

## Dependency Tasks

${dependencyTasks(input.pack)}

## Constitution Rules

${input.pack.includedConstitutionRules.map((rule) => `- ${rule.id}: ${rule.text}`).join("\n")}

## Project Context

${input.pack.includedProjectContext.summary || "- No project summary available."}

${input.pack.includedProjectContext.patterns ? `## Project Patterns\n\n${input.pack.includedProjectContext.patterns}\n` : ""}${reuseHelpersSection(input.pack)}
## Artifact Provenance

${artifactProvenance(input.pack)}

## File Context

${fileContext(input.pack)}

## Validation Commands

${list(input.pack.validationCommands)}

## Implementation Checklist

${implementationChecklist(task.id)}

## Constraints

${list(input.pack.constraints)}

## Warnings

${list(input.pack.warnings)}

## Token Budget

- Mode: ${token.mode}
- Estimated input tokens: ${token.input}
- Expected output tokens: ${token.expectedOutput}
- Estimated total tokens: ${token.total}
- Max input tokens: ${token.maxInput}
- Over budget: ${input.pack.overBudget ? "yes" : "no"}
- Estimator: ${token.estimator}

## Implementation Instructions

${list(input.pack.instructions)}
`;
}

/**
 * The behavioural path, as cited evidence.
 *
 * THE GRAPH STAYS OUTSIDE THE PROMPT: this is the cited path, a few signature
 * lines and the counts, and nothing else. Everything the agent might want next
 * is an intel query it can make itself, which is cheaper than shipping the
 * graph on the chance it is needed.
 *
 * Line numbers here are one-based; the conversion from intel's zero-based
 * spans happens once, in `understanding-view.ts`.
 */
function understandingSection(pack: ContextPack): string {
  const understanding = pack.understanding;

  if (understanding === undefined) return "";

  const location = (filePath: string | null, line: number | null): string =>
    filePath === null ? "(external)" : line === null ? filePath : `${filePath}:${line}`;
  const pathRows =
    understanding.path.length === 0
      ? "- No path was established. Treat localisation as open."
      : understanding.path
          .map(
            (row) =>
              `- ${row.sourceDisplayName} @ ${location(row.sourceFilePath, row.sourceLine)} --${row.kind}--> ${row.targetDisplayName} @ ${location(row.targetFilePath, row.targetLine)}`
          )
          .join("\n");
  const hypotheses =
    understanding.hypotheses.length === 0
      ? "- None recorded."
      : understanding.hypotheses
          .map(
            (hypothesis) =>
              `- [${hypothesis.status}] ${hypothesis.statement} (${hypothesis.evidenceCount} evidence)`
          )
          .join("\n");
  const signatures =
    understanding.signatures.length === 0
      ? "- None resolved."
      : understanding.signatures
          .map(
            (signature) =>
              `- ${signature.signature} @ ${location(signature.filePath, signature.line)}`
          )
          .join("\n");
  const tests =
    understanding.affectedTests.length === 0
      ? "- None identified."
      : understanding.affectedTests
          .map((test) => `- ${location(test.filePath, test.line)}`)
          .join("\n");
  const unknowns =
    understanding.unknownIds.length === 0
      ? ""
      : `\nOpen unknowns (ids only; the export carries no risk level):\n${understanding.unknownIds.map((id) => `- ${id}`).join("\n")}\n`;

  return `
## Behavioural Understanding

Question: ${understanding.behaviouralQuestion || "(none recorded)"}

Cited path (${understanding.counts.pathRelations} relation(s); cited order, not traversal order):

${pathRows}

Hypotheses (unresolved first):

${hypotheses}

Entity signatures (intel's canonical names, NOT declaration text - use \`repo.entity\` for the real signature):

${signatures}

Affected tests:

${tests}
${unknowns}
Everything else about the graph is available on demand and is deliberately not in this prompt:
\`repo.entity\`, \`repo.callers\`, \`repo.callees\`, \`repo.trace\`, \`repo.tests\`, \`repo.evidence\`, \`repo.search\`.
`;
}

/**
 * Cross-cutting helpers this project already has. Phase 18: two agents built
 * a new error surface printing raw error strings while the codebase's own
 * masking helpers sat unread in the scan cache. Reuse beats reinvention, and
 * on the failure path it is the difference between a masked error and a
 * credential on someone's terminal.
 */
function reuseHelpersSection(pack: ContextPack): string {
  const helpers = pack.includedProjectContext.reuseHelpers ?? [];
  if (helpers.length === 0) return "";
  const lines = helpers.map(
    (helper) => `- \`${helper.path}\` — ${helper.concern}: ${helper.symbols.join(", ")}`
  );
  return `## Reuse These Existing Helpers\n\nPrefer these over writing your own:\n\n${lines.join("\n")}\n`;
}
