import { type ReviewChangedFile } from "../artifacts/schemas/review.schema.js";
import { finding, type ReviewFindingDraft } from "./review-findings.js";

export function reviewDocumentation(input: {
  readonly changedFiles: readonly ReviewChangedFile[];
}): readonly ReviewFindingDraft[] {
  const paths = input.changedFiles.map((file) => file.path);
  const commandOrSchemaChanged = paths.some((file) =>
    file.startsWith("src/cli/commands/") ||
      file.startsWith("src/artifacts/schemas/") ||
      file === "src/cli/main.ts"
  );
  const docsChanged = paths.some((file) =>
    /^README|^docs\//i.test(file) || file.endsWith(".md")
  );

  if (!commandOrSchemaChanged || docsChanged) return [];

  return [
    finding({
      category: "documentation",
      severity: "warning",
      title: "CLI or schema changed without docs",
      description: "The diff changes command or artifact-schema surfaces but does not include documentation updates.",
      evidence: "Changed files include CLI/schema paths and no README/docs markdown files.",
      recommendation: "Confirm whether README or user-facing docs should be updated."
    })
  ];
}
