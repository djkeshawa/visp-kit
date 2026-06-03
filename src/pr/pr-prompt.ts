export function renderPrPrompt(input: {
  readonly featureKey: string;
}): string {
  return `# Visp PR Prompt

Create or refine a pull request description using:

- .visp/features/${input.featureKey}/pr.md
- .visp/features/${input.featureKey}/spec.md
- .visp/features/${input.featureKey}/tasks.md
- .visp/features/${input.featureKey}/verification.md
- .visp/features/${input.featureKey}/review/
- .visp/features/${input.featureKey}/reconcile/

Rules:
- Keep the PR summary concise and factual.
- Do not claim tests passed unless verification evidence shows it.
- Mention warnings or follow-up work honestly.
- Do not include huge diffs.
- Do not invent requirements.
- Do not modify implementation code.
`;
}
