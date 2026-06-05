import { contextChecklistPath } from "../artifacts/artifact-paths.js";
import { VispError } from "../core/errors.js";
import { pathExists, readTextFile, writeTextFile } from "../core/file-system.js";
import { ok, type Result } from "../core/result.js";

export type ImplementationChecklistStep =
  | "record-usage"
  | "verify"
  | "review"
  | "reconcile";

const stepPatterns: Record<ImplementationChecklistStep, RegExp> = {
  "record-usage": /Record actual token usage/,
  verify: /Run `visp verify --task/,
  review: /Run `visp review --task/,
  reconcile: /Run `visp reconcile --task/
};

function markLine(line: string): string {
  if (!line.startsWith("- [ ] ")) return line;
  return line.replace("- [ ] ", "- [x] ");
}

export async function markImplementationChecklistSteps(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly taskId: string;
  readonly steps: readonly ImplementationChecklistStep[];
  readonly dryRun: boolean;
}): Promise<Result<void, VispError>> {
  const checklistPath = contextChecklistPath(
    input.targetPath,
    input.featureKey,
    input.taskId
  );
  const exists = await pathExists(checklistPath);

  if (!exists.ok) return exists;
  if (!exists.value) return ok(undefined);

  const current = await readTextFile(checklistPath);

  if (!current.ok) return current;

  const patterns = input.steps.map((step) => stepPatterns[step]);
  const next = current.value
    .split("\n")
    .map((line) => patterns.some((pattern) => pattern.test(line)) ? markLine(line) : line)
    .join("\n");

  if (next === current.value || input.dryRun) return ok(undefined);

  const write = await writeTextFile(checklistPath, next);

  if (!write.ok) return write;
  return ok(undefined);
}
