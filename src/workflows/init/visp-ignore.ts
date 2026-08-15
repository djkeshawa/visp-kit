import path from "node:path";

import { type InitFileAction } from "./init-summary.js";

const ENTRY = ".visp";
const BLOCK = "# Visp Kit's workflow artifacts\n.visp/\n";

/**
 * What `init` intends to do to the project's `.gitignore`.
 *
 * Deciding is separate from writing so a dry run can name the change it would
 * make. `init` reports every file it touches outside `.visp/`, and a preview
 * that quietly omitted one would be the same silence the report exists to end.
 */
export type VispIgnorePlan =
  | { readonly needed: false }
  | {
      readonly needed: true;
      readonly action: "created" | "updated";
      readonly contents: string;
    };

/**
 * Keep Kit's own artifact directory out of the user's history.
 *
 * `init` writes `.visp/` into the working tree and never ignored it. On a real
 * project the untracked volume was large enough that the owner added the entry
 * by hand mid-session so their IDE would load the repository again — the same
 * failure visp-memory had with its vector store.
 *
 * Append-only and idempotent: an entry the user already wrote is left alone,
 * and nothing is planned outside a git repository, where creating a .gitignore
 * would be presumptuous.
 */
export async function planVispIgnore(targetPath: string): Promise<VispIgnorePlan> {
  const { access, readFile } = await import("node:fs/promises");

  try {
    await access(path.join(targetPath, ".git"));
  } catch {
    return { needed: false };
  }

  let existing = "";
  let exists = true;
  try {
    existing = await readFile(path.join(targetPath, ".gitignore"), "utf8");
  } catch {
    exists = false;
  }

  const present = new Set(existing.split("\n").map((line) => line.trim().replace(/\/$/u, "")));
  if (present.has(ENTRY)) return { needed: false };

  const separator = existing.length === 0 ? "" : existing.endsWith("\n") ? "\n" : "\n\n";

  return {
    needed: true,
    action: exists ? "updated" : "created",
    contents: `${existing}${separator}${BLOCK}`
  };
}

/**
 * Carries out a plan and reports what happened.
 *
 * A failed write claims no action — an unwritable `.gitignore` is not a reason
 * to fail an otherwise complete init, and reporting a change that did not
 * happen is the thing this module exists to prevent. It is still worth a note:
 * silence leaves the user believing `.visp/` is ignored when it is not, and
 * that belief only surfaces as a large untracked directory later.
 */
export async function applyVispIgnore(input: {
  readonly targetPath: string;
  readonly plan: VispIgnorePlan;
  readonly dryRun: boolean;
}): Promise<{
  readonly actions: readonly InitFileAction[];
  readonly warnings: readonly string[];
}> {
  if (!input.plan.needed) return { actions: [], warnings: [] };

  const action: InitFileAction = { path: ".gitignore", action: input.plan.action };

  if (input.dryRun) return { actions: [action], warnings: [] };

  const { writeFile } = await import("node:fs/promises");

  try {
    await writeFile(path.join(input.targetPath, ".gitignore"), input.plan.contents, "utf8");
  } catch {
    return {
      actions: [],
      warnings: [
        `Could not write .gitignore, so .visp/ is not ignored. Add "${ENTRY}/" to it by hand to keep Visp's artifacts out of your history.`
      ]
    };
  }

  return { actions: [action], warnings: [] };
}
