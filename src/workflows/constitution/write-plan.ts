import path from "node:path";

import {
  compactConstitutionArtifactPath,
  constitutionMarkdownArtifactPath
} from "../../artifacts/artifact-paths.js";
import { VispError } from "../../core/errors.js";
import { pathExists, writeTextFile } from "../../core/file-system.js";
import { toPosixPath } from "../../core/paths.js";
import { ok, type Result } from "../../core/result.js";
import { type ConstitutionFileAction } from "../../constitution/constitution-summary.js";

export type PlannedConstitutionFile = {
  readonly path: string;
  readonly displayPath: string;
  readonly contents: string;
};

function displayPath(targetPath: string, filePath: string): string {
  return toPosixPath(path.relative(targetPath, filePath));
}

export function plannedConstitutionFiles(input: {
  readonly targetPath: string;
  readonly full: string;
  readonly compact: string;
}): readonly PlannedConstitutionFile[] {
  const fullPath = constitutionMarkdownArtifactPath(input.targetPath);
  const compactPath = compactConstitutionArtifactPath(input.targetPath);

  return [
    {
      path: fullPath,
      displayPath: displayPath(input.targetPath, fullPath),
      contents: input.full
    },
    {
      path: compactPath,
      displayPath: displayPath(input.targetPath, compactPath),
      contents: input.compact
    }
  ];
}

export async function writePlannedConstitutionFile(
  file: PlannedConstitutionFile,
  options: { readonly force: boolean; readonly dryRun: boolean }
): Promise<Result<ConstitutionFileAction, VispError>> {
  const exists = await pathExists(file.path);

  if (!exists.ok) {
    return exists;
  }

  if (exists.value && !options.force) {
    return ok({ path: file.displayPath, action: "skipped" });
  }

  const action = exists.value ? "overwritten" : "created";

  if (options.dryRun) {
    return ok({ path: file.displayPath, action });
  }

  const write = await writeTextFile(file.path, file.contents);

  if (!write.ok) {
    return write;
  }

  return ok({ path: file.displayPath, action });
}
