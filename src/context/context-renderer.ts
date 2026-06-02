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

function snippetFor(pack: ContextPack, filePath: string): ContextPack["includedSnippets"][number] | undefined {
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
      const summary =
        file.summaryAvailable && file.summary !== undefined && file.summary.length > 0
          ? `\nSummary:\n${codeFence("json", file.summary)}\n`
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

## Task

- ID: ${task.id}
- Title: ${task.title}
- Status: ${task.status}
- Risk: ${task.riskLevel}

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

${input.pack.includedConstitutionRules
  .map((rule) => `- ${rule.id}: ${rule.text}`)
  .join("\n")}

## Project Context

${input.pack.includedProjectContext.summary || "- No project summary available."}

${input.pack.includedProjectContext.patterns ? `## Project Patterns\n\n${input.pack.includedProjectContext.patterns}\n` : ""}
## File Context

${fileContext(input.pack)}

## Validation Commands

${list(input.pack.validationCommands)}

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
