import {
  installedAgentTargetsSchema,
  type AgentTargetName
} from "../artifacts/schemas/agent.schema.js";
import { policyArtifactPath } from "../artifacts/artifact-paths.js";
import { VispError } from "../core/errors.js";
import { pathExists, readJsonFile, readTextFile } from "../core/file-system.js";
import { relativePath, resolvePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { ensureVispProject, loadEffectivePolicy } from "../policy/policy-loader.js";
import {
  agentsMarkdownPath,
  agentsVispMarkdownPath,
  codexSkillPath,
  genericAgentPromptPath,
  installedTargetsPath
} from "./agent-paths.js";
import { agentWorkflowNames } from "./agent-renderer.js";
import { runAgentInstall } from "./agent-installer.js";

export type AgentDoctorOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly target?: AgentTargetName;
  readonly fix?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
};

export type AgentDoctorFinding = {
  readonly id: string;
  readonly category: "project" | "policy" | "metadata" | "target" | "guidance";
  readonly severity: "info" | "warning" | "error";
  readonly title: string;
  readonly description: string;
  readonly file?: string;
  readonly recommendation: string;
  readonly autoFixable: boolean;
};

export type AgentDoctorSummary = {
  readonly success: boolean;
  readonly command: "doctor";
  readonly targetPath: string;
  readonly result: "passed" | "warnings" | "failed";
  readonly targets: readonly AgentTargetName[];
  readonly findings: readonly AgentDoctorFinding[];
  readonly fixesApplied: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly nextCommand: string;
  readonly dryRun: boolean;
};

function targetPathFrom(options: { readonly targetPath?: string; readonly cwd?: string }): string {
  return resolvePath(options.cwd ?? process.cwd(), options.targetPath ?? ".");
}

function finding(input: Omit<AgentDoctorFinding, "id">, index: number): AgentDoctorFinding {
  return {
    id: `AGT${String(index).padStart(3, "0")}`,
    ...input
  };
}

async function readOptionalText(filePath: string): Promise<Result<string | null, VispError>> {
  const exists = await pathExists(filePath);

  if (!exists.ok) return exists;
  if (!exists.value) return ok(null);

  const text = await readTextFile(filePath);
  return text.ok ? ok(text.value) : text;
}

async function guidanceText(targetPath: string): Promise<Result<{ readonly path: string | null; readonly text: string | null }, VispError>> {
  const agents = await readOptionalText(agentsMarkdownPath(targetPath));

  if (!agents.ok) return agents;
  if (agents.value !== null) {
    return ok({
      path: relativePath(targetPath, agentsMarkdownPath(targetPath)),
      text: agents.value
    });
  }

  const fallback = await readOptionalText(agentsVispMarkdownPath(targetPath));

  if (!fallback.ok) return fallback;

  return ok({
    path: fallback.value === null ? null : relativePath(targetPath, agentsVispMarkdownPath(targetPath)),
    text: fallback.value
  });
}

function containsRequiredGuidance(text: string): boolean {
  const lower = text.toLowerCase();

  return (
    lower.includes("user prompt is raw intent") &&
    lower.includes("visp gate") &&
    lower.includes("visp verify") &&
    lower.includes("visp review") &&
    lower.includes("visp reconcile")
  );
}

async function installedTargets(targetPath: string): Promise<Result<readonly AgentTargetName[], VispError>> {
  const metadataPath = installedTargetsPath(targetPath);
  const exists = await pathExists(metadataPath);

  if (!exists.ok) return exists;
  if (!exists.value) return ok([]);

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

  return ok(parsed.data.installedTargets.map((target) => target.target));
}

async function checkFile(input: {
  readonly targetPath: string;
  readonly filePath: string;
  readonly title: string;
  readonly findings: AgentDoctorFinding[];
}): Promise<Result<void, VispError>> {
  const exists = await pathExists(input.filePath);

  if (!exists.ok) return exists;

  if (!exists.value) {
    input.findings.push(
      finding(
        {
          category: "target",
          severity: "warning",
          title: input.title,
          description: `${relativePath(input.targetPath, input.filePath)} is missing.`,
          file: relativePath(input.targetPath, input.filePath),
          recommendation: "Run `visp agent refresh --force`.",
          autoFixable: true
        },
        input.findings.length + 1
      )
    );
  }

  return ok(undefined);
}

async function checkTarget(input: {
  readonly targetPath: string;
  readonly target: AgentTargetName;
  readonly findings: AgentDoctorFinding[];
}): Promise<Result<void, VispError>> {
  const guidance = await guidanceText(input.targetPath);

  if (!guidance.ok) return guidance;

  if (guidance.value.text === null) {
    input.findings.push(
      finding(
        {
          category: "guidance",
          severity: "warning",
          title: "Agent guidance missing",
          description: "AGENTS.md or AGENTS.visp.md is missing.",
          recommendation: `Run \`visp agent install ${input.target}\`.`,
          autoFixable: true
        },
        input.findings.length + 1
      )
    );
  } else if (!containsRequiredGuidance(guidance.value.text)) {
    input.findings.push(
      finding(
        {
          category: "guidance",
          severity: "warning",
          title: "Agent guidance is incomplete",
          description: "Generated guidance is missing strict Visp policy wording.",
          file: guidance.value.path ?? undefined,
          recommendation: `Run \`visp agent refresh --target ${input.target} --force\`.`,
          autoFixable: false
        },
        input.findings.length + 1
      )
    );
  }

  const targetFiles = input.target === "codex"
    ? agentWorkflowNames.map((workflow) =>
        codexSkillPath(input.targetPath, `visp-${workflow}`)
      )
    : agentWorkflowNames.map((workflow) =>
        genericAgentPromptPath(input.targetPath, workflow)
      );

  for (const filePath of targetFiles) {
    const check = await checkFile({
      targetPath: input.targetPath,
      filePath,
      title: `${input.target} agent file missing`,
      findings: input.findings
    });

    if (!check.ok) return check;

    const text = await readOptionalText(filePath);

    if (!text.ok) return text;

    if (text.value !== null && !containsRequiredGuidance(text.value)) {
      input.findings.push(
        finding(
          {
            category: "guidance",
            severity: "warning",
            title: `${input.target} agent file is incomplete`,
            description: `${relativePath(input.targetPath, filePath)} is missing strict Visp workflow guidance.`,
            file: relativePath(input.targetPath, filePath),
            recommendation: `Run \`visp agent refresh --target ${input.target} --force\`.`,
            autoFixable: false
          },
          input.findings.length + 1
        )
      );
    }
  }

  return ok(undefined);
}

export async function runAgentDoctor(
  options: AgentDoctorOptions = {}
): Promise<Result<AgentDoctorSummary, VispError>> {
  const targetPath = targetPathFrom(options);
  const now = options.now ?? new Date().toISOString();
  const initialized = await ensureVispProject(targetPath);

  if (!initialized.ok) {
    return err(
      new VispError(
        initialized.error.code,
        `${initialized.error.message} Recommended: visp init --agent codex --strictness strict.`
      )
    );
  }

  const findings: AgentDoctorFinding[] = [];
  const policyPath = policyArtifactPath(targetPath);
  const policyExists = await pathExists(policyPath);

  if (!policyExists.ok) return policyExists;

  if (!policyExists.value) {
    findings.push(
      finding(
        {
          category: "policy",
          severity: "warning",
          title: "Policy file missing",
          description: ".visp/policy.json is missing.",
          file: ".visp/policy.json",
          recommendation: "Run `visp policy init --strictness strict`.",
          autoFixable: false
        },
        findings.length + 1
      )
    );
  } else {
    const policy = await loadEffectivePolicy({ targetPath, now });
    if (!policy.ok) return policy;
  }

  const installed = await installedTargets(targetPath);

  if (!installed.ok) return installed;

  const targets = options.target === undefined
    ? installed.value
    : [options.target];

  if (targets.length === 0) {
    findings.push(
      finding(
        {
          category: "metadata",
          severity: "warning",
          title: "No installed agent targets",
          description: ".visp/agent/installed-targets.json does not list any targets.",
          recommendation: "Run `visp agent install codex` or `visp agent install generic`.",
          autoFixable: false
        },
        findings.length + 1
      )
    );
  }

  for (const target of targets) {
    const check = await checkTarget({ targetPath, target, findings });
    if (!check.ok) return check;
  }

  const fixesApplied: string[] = [];

  if ((options.fix ?? false) && targets.length > 0) {
    for (const target of targets) {
      const fix = await runAgentInstall({
        targetPath,
        target,
        dryRun: options.dryRun,
        force: false,
        now
      });

      if (!fix.ok) return fix;
      fixesApplied.push(...fix.value.createdFiles, ...fix.value.updatedFiles);
    }
  }

  const errors = findings.filter((item) => item.severity === "error").map((item) => item.description);
  const warnings = findings.filter((item) => item.severity === "warning").map((item) => item.description);
  const result = errors.length > 0 ? "failed" : warnings.length > 0 ? "warnings" : "passed";

  return ok({
    success: errors.length === 0,
    command: "doctor",
    targetPath,
    result,
    targets,
    findings,
    fixesApplied,
    warnings,
    errors,
    nextCommand: result === "passed" ? "visp agent refresh" : "visp agent refresh --force",
    dryRun: options.dryRun ?? false
  });
}
