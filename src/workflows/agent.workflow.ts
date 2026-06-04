import { type AgentTargetName } from "../artifacts/schemas/agent.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { supportedAgentTargets } from "../agent/agent-target.js";
import {
  runAgentInstall,
  type AgentInstallSummary
} from "../agent/agent-installer.js";
import {
  runAgentDoctor,
  type AgentDoctorSummary
} from "../agent/agent-doctor.js";
import {
  runAgentRefresh,
  type AgentRefreshSummary
} from "../agent/agent-refresh.js";
import {
  formatAgentDoctor,
  formatAgentInstall,
  formatAgentList,
  formatAgentRefresh,
  type AgentListSummary
} from "../agent/agent-summary.js";
import { ok, type Result } from "../core/result.js";
import { type VispError } from "../core/errors.js";

export type AgentListOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
};

export type AgentInstallWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly target: AgentTargetName;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly strictness?: StrictnessMode;
};

export type AgentDoctorWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly target?: AgentTargetName;
  readonly fix?: boolean;
  readonly dryRun?: boolean;
};

export type AgentRefreshWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly target?: AgentTargetName | "all";
  readonly force?: boolean;
  readonly dryRun?: boolean;
};

export function runAgentListWorkflow(): Result<AgentListSummary, VispError> {
  return ok({
    success: true,
    targets: supportedAgentTargets.map((target) => ({
      ...target,
      status: "supported" as const
    }))
  });
}

export async function runAgentInstallWorkflow(
  options: AgentInstallWorkflowOptions
): Promise<Result<AgentInstallSummary, VispError>> {
  return runAgentInstall(options);
}

export async function runAgentDoctorWorkflow(
  options: AgentDoctorWorkflowOptions = {}
): Promise<Result<AgentDoctorSummary, VispError>> {
  return runAgentDoctor(options);
}

export async function runAgentRefreshWorkflow(
  options: AgentRefreshWorkflowOptions = {}
): Promise<Result<readonly AgentRefreshSummary[], VispError>> {
  return runAgentRefresh(options);
}

export {
  formatAgentDoctor,
  formatAgentInstall,
  formatAgentList,
  formatAgentRefresh
};
