import {
  installedAgentTargetsSchema,
  type AgentTargetName
} from "../artifacts/schemas/agent.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists, readJsonFile } from "../core/file-system.js";
import { resolvePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { ensureVispProject } from "../policy/policy-loader.js";
import { installedTargetsPath } from "./agent-paths.js";
import {
  runAgentInstall,
  type AgentInstallSummary
} from "./agent-installer.js";

export type AgentRefreshOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly target?: AgentTargetName | "all";
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
};

export type AgentRefreshSummary = AgentInstallSummary & {
  readonly command: "refresh";
};

function targetPathFrom(options: { readonly targetPath?: string; readonly cwd?: string }): string {
  return resolvePath(options.cwd ?? process.cwd(), options.targetPath ?? ".");
}

async function readInstalledTargetNames(
  targetPath: string
): Promise<Result<readonly AgentTargetName[], VispError>> {
  const metadataPath = installedTargetsPath(targetPath);
  const exists = await pathExists(metadataPath);

  if (!exists.ok) return exists;

  if (!exists.value) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "No installed agent targets found. Run `visp agent install codex` or `visp agent install generic` first."
      )
    );
  }

  const raw = await readJsonFile<unknown>(metadataPath);

  if (!raw.ok) return raw;

  const parsed = installedAgentTargetsSchema.safeParse(raw.value);

  if (!parsed.success) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Invalid installed agent metadata: ${parsed.error.issues[0]?.message ?? "unknown error"}`
      )
    );
  }

  const targets = parsed.data.installedTargets.map((target) => target.target);

  if (targets.length === 0) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "No installed agent targets found. Run `visp agent install codex` or `visp agent install generic` first."
      )
    );
  }

  return ok(targets);
}

export async function runAgentRefresh(
  options: AgentRefreshOptions = {}
): Promise<Result<readonly AgentRefreshSummary[], VispError>> {
  const targetPath = targetPathFrom(options);
  const initialized = await ensureVispProject(targetPath);

  if (!initialized.ok) {
    return err(
      new VispError(
        initialized.error.code,
        `${initialized.error.message} Recommended: visp init --agent codex --strictness strict.`
      )
    );
  }

  const installed = await readInstalledTargetNames(targetPath);

  if (!installed.ok) return installed;

  const targets = options.target === undefined || options.target === "all"
    ? installed.value
    : installed.value.includes(options.target)
      ? [options.target]
      : [];

  if (targets.length === 0) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Target ${options.target ?? "all"} is not installed. Run \`visp agent install ${options.target ?? "codex"}\` first.`
      )
    );
  }

  const summaries: AgentRefreshSummary[] = [];

  for (const target of targets) {
    const install = await runAgentInstall({
      targetPath,
      target,
      force: options.force,
      dryRun: options.dryRun,
      now: options.now,
      mode: "refresh"
    });

    if (!install.ok) return install;

    summaries.push({
      ...install.value,
      command: "refresh"
    });
  }

  return ok(summaries);
}
