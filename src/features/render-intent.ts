const defaultKnownConstraints = [
  "Follow the existing project architecture.",
  "Preserve existing project style and conventions.",
  "Keep implementation minimal and task-specific.",
  "Avoid unrelated refactoring.",
  "Do not introduce new dependencies without approval.",
  "Keep AI context token-efficient."
] as const;

const defaultUnknowns = [
  "What exact user-visible behavior is expected?",
  "Are there edge cases that affect data, permissions, integrations, or UI behavior?",
  "What validation or tests should prove the feature works?"
] as const;

export type RenderIntentInput = {
  readonly title: string;
  readonly rawUserRequest: string;
  readonly projectContext?: string;
  readonly knownConstraints?: readonly string[];
};

function sectionList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function projectContextSection(projectContext: string | undefined): string {
  if (projectContext === undefined || projectContext.trim().length === 0) {
    return "";
  }

  return `\n## Project Context\n\n${projectContext.trim()}\n`;
}

export function projectContextFromSummary(
  projectSummary: string | undefined
): string | undefined {
  if (projectSummary === undefined) {
    return undefined;
  }

  const selected = projectSummary
    .split("\n")
    .filter((line) =>
      [
        "- Project name:",
        "- Languages:",
        "- Frameworks:"
      ].some((prefix) => line.startsWith(prefix))
    )
    .filter((line) => !line.includes("Unknown") && !line.includes("None detected"))
    .slice(0, 3);

  return selected.length > 0 ? selected.join("\n") : undefined;
}

export function knownConstraintsFromCompactConstitution(
  compactConstitution: string | undefined
): readonly string[] | undefined {
  if (compactConstitution === undefined) {
    return undefined;
  }

  const rules = compactConstitution
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^C\d{3}: /.test(line))
    .slice(0, 3)
    .map((line) => `Constitution ${line}`);

  return rules.length > 0
    ? [...defaultKnownConstraints, ...rules]
    : undefined;
}

export function renderIntentMarkdown(input: RenderIntentInput): string {
  const constraints = input.knownConstraints ?? defaultKnownConstraints;

  return `# Feature Intent: ${input.title}

## User Request

${input.rawUserRequest}
${projectContextSection(input.projectContext)}
## Initial Interpretation

Users need this feature added to the project. The exact requirements will be refined in later workflow steps.

## Known Constraints

${sectionList(constraints)}

## Unknowns

${sectionList(defaultUnknowns)}

## Next Step

Run:

visp clarify
`;
}
