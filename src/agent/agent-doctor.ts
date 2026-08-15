import {
  agentCapabilitiesSchema,
  installedAgentTargetsSchema,
  type AgentTargetName
} from "../artifacts/schemas/agent.schema.js";
import { policyArtifactPath } from "../artifacts/artifact-paths.js";
import { VispError } from "../core/errors.js";
import { pathExists, readJsonFile, readTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { ensureVispProject, loadEffectivePolicy } from "../policy/policy-loader.js";
import {
  agentsMarkdownPath,
  agentsVispMarkdownPath,
  agentCapabilitiesPath,
  codexSkillPath,
  copilotInstructionsPath,
  copilotWorkflowInstructionPath,
  cursorRulePath,
  geminiCommandPath,
  geminiMarkdownPath,
  geminiVispMarkdownPath,
  genericAgentPromptPath,
  installedTargetsPath,
  vispRulesFilePath
} from "./agent-paths.js";
import { agentWorkflowNames } from "./agent-renderer.js";
import { runAgentInstall } from "./agent-installer.js";
import { targetPathFrom } from "../core/paths.js";

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

async function guidanceText(
  targetPath: string,
  target?: AgentTargetName
): Promise<Result<{ readonly path: string | null; readonly text: string | null }, VispError>> {
  const primaryPath =
    target === "gemini" ? geminiMarkdownPath(targetPath) : agentsMarkdownPath(targetPath);
  const fallbackPath =
    target === "gemini" ? geminiVispMarkdownPath(targetPath) : agentsVispMarkdownPath(targetPath);
  const primary = await readOptionalText(primaryPath);

  if (!primary.ok) return primary;
  if (primary.value !== null) {
    return ok({
      path: relativePath(targetPath, primaryPath),
      text: primary.value
    });
  }

  const fallback = await readOptionalText(fallbackPath);

  if (!fallback.ok) return fallback;

  return ok({
    path: fallback.value === null ? null : relativePath(targetPath, fallbackPath),
    text: fallback.value
  });
}

/**
 * Dual-vocabulary match (D-119 deprecation window): instruction files
 * generated before the rename say `visp <cmd>`, files generated after it say
 * `visp-kit <cmd>`. Both count as guidance — a pre-existing project must not
 * fail its own health check because the binary was renamed out from under it.
 */
function hasCommand(lower: string, subcommand: string): boolean {
  return lower.includes(`visp-kit ${subcommand}`) || lower.includes(`visp ${subcommand}`);
}

function containsRequiredGuidance(text: string): boolean {
  const lower = text.toLowerCase();
  const evidencePipeline =
    hasCommand(lower, "done") ||
    (hasCommand(lower, "verify") && hasCommand(lower, "review") && hasCommand(lower, "reconcile"));

  return (
    lower.includes("user prompt is raw intent") && hasCommand(lower, "gate") && evidencePipeline
  );
}

async function installedTargets(
  targetPath: string
): Promise<Result<readonly AgentTargetName[], VispError>> {
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
          recommendation: "Run `visp-kit agent refresh --force`.",
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
  if (input.target !== "claude" && input.target !== "cursor") {
    const guidance = await guidanceText(input.targetPath, input.target);

    if (!guidance.ok) return guidance;

    if (guidance.value.text === null) {
      input.findings.push(
        finding(
          {
            category: "guidance",
            severity: "warning",
            title: "Agent guidance missing",
            description:
              input.target === "gemini"
                ? "GEMINI.md or GEMINI.visp.md is missing."
                : "AGENTS.md or AGENTS.visp.md is missing.",
            recommendation: `Run \`visp-kit agent install ${input.target}\`.`,
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
            recommendation: `Run \`visp-kit agent refresh --target ${input.target} --force\`.`,
            autoFixable: false
          },
          input.findings.length + 1
        )
      );
    }
  }

  const targetFiles = (() => {
    switch (input.target) {
      case "codex":
        return agentWorkflowNames.map((workflow) =>
          codexSkillPath(input.targetPath, `visp-${workflow}`)
        );
      case "generic":
      case "opencode":
        return agentWorkflowNames.map((workflow) =>
          genericAgentPromptPath(input.targetPath, workflow)
        );
      case "claude":
        // P10-US-06: installed slash commands are Hyper-owned; Kit's claude
        // target is rules + hooks only.
        return [vispRulesFilePath(input.targetPath)];
      case "copilot":
        return [
          copilotInstructionsPath(input.targetPath),
          ...agentWorkflowNames.map((workflow) =>
            copilotWorkflowInstructionPath(input.targetPath, workflow)
          )
        ];
      case "cursor":
        return [
          cursorRulePath(input.targetPath, "visp-rules"),
          ...agentWorkflowNames.map((workflow) =>
            cursorRulePath(input.targetPath, `visp-${workflow}`)
          )
        ];
      case "gemini":
        return agentWorkflowNames.map((workflow) =>
          geminiCommandPath(input.targetPath, `visp-${workflow}`)
        );
    }
  })().concat(vispRulesFilePath(input.targetPath));

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
            recommendation: `Run \`visp-kit agent refresh --target ${input.target} --force\`.`,
            autoFixable: false
          },
          input.findings.length + 1
        )
      );
    }
  }

  if (input.target === "codex") {
    input.findings.push(
      finding(
        {
          category: "guidance",
          severity: "info",
          title: "Codex repo-local skill loading depends on the active surface",
          description:
            "Visp verified repository Codex skill files. If `$visp-feature` or `$visp-task` is not visible in the active Codex session, reload the session or reference AGENTS.md and .agents/skills directly.",
          recommendation:
            "Use `visp-kit agent bootstrap codex` in new projects and run `visp-kit agent doctor --target codex` after installation.",
          autoFixable: false
        },
        input.findings.length + 1
      )
    );
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
        `${initialized.error.message} Recommended: visp-kit init --strictness strict.`
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
          recommendation: "Run `visp-kit policy init --strictness strict`.",
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

  const capabilitiesPath = agentCapabilitiesPath(targetPath);
  const capabilitiesExists = await pathExists(capabilitiesPath);

  if (!capabilitiesExists.ok) return capabilitiesExists;

  if (!capabilitiesExists.value && installed.value.length > 0) {
    findings.push(
      finding(
        {
          category: "metadata",
          severity: "warning",
          title: "Agent capability profile missing",
          description: ".visp/agent/capabilities.json is missing.",
          file: ".visp/agent/capabilities.json",
          recommendation: "Run `visp-kit agent refresh --force`.",
          autoFixable: true
        },
        findings.length + 1
      )
    );
  } else if (capabilitiesExists.value) {
    const rawCapabilities = await readJsonFile<unknown>(capabilitiesPath);

    if (!rawCapabilities.ok) return rawCapabilities;

    const parsedCapabilities = agentCapabilitiesSchema.safeParse(rawCapabilities.value);

    if (!parsedCapabilities.success) {
      findings.push(
        finding(
          {
            category: "metadata",
            severity: "error",
            title: "Agent capability profile is invalid",
            description:
              parsedCapabilities.error.issues[0]?.message ?? "Invalid capabilities metadata.",
            file: ".visp/agent/capabilities.json",
            recommendation: "Run `visp-kit agent refresh --force`.",
            autoFixable: true
          },
          findings.length + 1
        )
      );
    } else {
      const capabilityTargets = parsedCapabilities.data.capabilities.map((item) => item.target);
      const missingCapabilities = installed.value.filter(
        (target) => !capabilityTargets.includes(target)
      );

      if (missingCapabilities.length > 0) {
        findings.push(
          finding(
            {
              category: "metadata",
              severity: "warning",
              title: "Agent capability profile is stale",
              description: `Capabilities are missing installed target(s): ${missingCapabilities.join(", ")}.`,
              file: ".visp/agent/capabilities.json",
              recommendation: "Run `visp-kit agent refresh --force`.",
              autoFixable: true
            },
            findings.length + 1
          )
        );
      }
    }
  }

  const targets = options.target === undefined ? installed.value : [options.target];

  if (targets.length === 0) {
    findings.push(
      finding(
        {
          category: "metadata",
          severity: "warning",
          title: "No installed agent targets",
          description: ".visp/agent/installed-targets.json does not list any targets.",
          recommendation:
            "Run `visp-kit agent bootstrap codex` or `visp-kit agent install <target>`.",
          autoFixable: false
        },
        findings.length + 1
      )
    );
  }

  for (const target of targets) {
    if (!installed.value.includes(target)) {
      findings.push(
        finding(
          {
            category: "metadata",
            severity: "warning",
            title: "Target metadata missing",
            description: `.visp/agent/installed-targets.json does not include ${target}.`,
            recommendation: `Run \`visp-kit agent install ${target}\`.`,
            autoFixable: true
          },
          findings.length + 1
        )
      );
    }

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

  const errors = findings
    .filter((item) => item.severity === "error")
    .map((item) => item.description);
  const warnings = findings
    .filter((item) => item.severity === "warning")
    .map((item) => item.description);
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
    nextCommand: result === "passed" ? "visp-kit agent refresh" : "visp-kit agent refresh --force",
    dryRun: options.dryRun ?? false
  });
}
