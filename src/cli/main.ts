import { Command } from "commander";
import { z } from "zod";
import { packageVersion } from "../core/package-version.js";

import {
  createAgentCommand,
  type AgentCommandDependencies
} from "./commands/agent.command.js";
import {
  createBudgetCommand,
  type BudgetCommandDependencies
} from "./commands/budget.command.js";
import {
  createChecklistCommand,
  type ChecklistCommandDependencies
} from "./commands/checklist.command.js";
import {
  createClarifyCommand,
  type ClarifyCommandDependencies
} from "./commands/clarify.command.js";
import {
  createConstitutionCommand,
  type ConstitutionCommandDependencies
} from "./commands/constitution.command.js";
import {
  createDoctorCommand,
  type DoctorCommandDependencies
} from "./commands/doctor.command.js";
import {
  createDoneCommand,
  type DoneCommandDependencies
} from "./commands/done.command.js";
import {
  createDriftCommand,
  type DriftCommandDependencies
} from "./commands/drift.command.js";
import {
  createAuditCommand,
  createEvalCommand,
  type EvalCommandDependencies
} from "./commands/eval.command.js";
import {
  createContextCommand,
  type ContextCommandDependencies
} from "./commands/context.command.js";
import {
  createInitCommand,
  type InitCommandDependencies
} from "./commands/init.command.js";
import {
  createIntegrationCommand,
  type IntegrationCommandDependencies
} from "./commands/integration.command.js";
import {
  createFeatureCommand,
  type FeatureCommandDependencies
} from "./commands/feature.command.js";
import {
  createGateCommand,
  type GateCommandDependencies
} from "./commands/gate.command.js";
import {
  createHooksCommand,
  type HooksCommandDependencies
} from "./commands/hooks.command.js";
import {
  createScanCommand,
  type ScanCommandDependencies
} from "./commands/scan.command.js";
import {
  createPlanCommand,
  type PlanCommandDependencies
} from "./commands/plan.command.js";
import {
  createPolicyCommand,
  type PolicyCommandDependencies
} from "./commands/policy.command.js";
import {
  createOverrideCommand,
  type OverrideCommandDependencies
} from "./commands/override.command.js";
import {
  createNextCommand,
  type NextCommandDependencies
} from "./commands/next.command.js";
import {
  createPrCommand,
  type PrCommandDependencies
} from "./commands/pr.command.js";
import {
  createReviewCommand,
  type ReviewCommandDependencies
} from "./commands/review.command.js";
import {
  createReconcileCommand,
  type ReconcileCommandDependencies
} from "./commands/reconcile.command.js";
import {
  createSpecCommand,
  type SpecCommandDependencies
} from "./commands/spec.command.js";
import {
  createStatusCommand,
  type StatusCommandDependencies
} from "./commands/status.command.js";
import {
  createTasksCommand,
  type TasksCommandDependencies
} from "./commands/tasks.command.js";
import {
  createVerifyCommand,
  type VerifyCommandDependencies
} from "./commands/verify.command.js";
import {
  createWorkflowCommand,
  type WorkflowCliDependencies
} from "./commands/workflow.command.js";

export type CliDependencies = AgentCommandDependencies &
  BudgetCommandDependencies &
  ChecklistCommandDependencies &
  ClarifyCommandDependencies &
  ConstitutionCommandDependencies &
  ContextCommandDependencies &
  DoctorCommandDependencies &
  DoneCommandDependencies &
  DriftCommandDependencies &
  EvalCommandDependencies &
  FeatureCommandDependencies &
  GateCommandDependencies &
  HooksCommandDependencies &
  InitCommandDependencies &
  IntegrationCommandDependencies &
  NextCommandDependencies &
  OverrideCommandDependencies &
  PlanCommandDependencies &
  PolicyCommandDependencies &
  PrCommandDependencies &
  ReconcileCommandDependencies &
  ReviewCommandDependencies &
  ScanCommandDependencies &
  SpecCommandDependencies &
  StatusCommandDependencies &
  TasksCommandDependencies &
  VerifyCommandDependencies &
  WorkflowCliDependencies;

const cliMetadataSchema = z.object({
  name: z.literal("visp"),
  version: z.string().min(1),
  description: z.string().min(1)
});

const cliMetadata = cliMetadataSchema.parse({
  name: "visp",
  version: packageVersion(),
  description: "Small context. Clear specs. Accurate code."
});

export function createCli(dependencies: CliDependencies = {}): Command {
  const program = new Command()
    .name(cliMetadata.name)
    .description(cliMetadata.description)
    .version(cliMetadata.version)
    .showHelpAfterError()
    .helpOption("-h, --help", "Display help for command.");

  program.addCommand(createBudgetCommand(dependencies));
  program.addCommand(createAgentCommand(dependencies));
  program.addCommand(createChecklistCommand(dependencies));
  program.addCommand(createClarifyCommand(dependencies));
  program.addCommand(createConstitutionCommand(dependencies));
  program.addCommand(createContextCommand(dependencies));
  program.addCommand(createDoctorCommand(dependencies));
  program.addCommand(createDoneCommand(dependencies));
  program.addCommand(createDriftCommand(dependencies));
  program.addCommand(createAuditCommand(dependencies));
  program.addCommand(createEvalCommand(dependencies));
  program.addCommand(createFeatureCommand(dependencies));
  program.addCommand(createGateCommand(dependencies));
  program.addCommand(createHooksCommand(dependencies));
  program.addCommand(createInitCommand(dependencies));
  program.addCommand(createIntegrationCommand(dependencies));
  program.addCommand(createNextCommand(dependencies));
  program.addCommand(createOverrideCommand(dependencies));
  program.addCommand(createPlanCommand(dependencies));
  program.addCommand(createPolicyCommand(dependencies));
  program.addCommand(createPrCommand(dependencies));
  program.addCommand(createReconcileCommand(dependencies));
  program.addCommand(createReviewCommand(dependencies));
  program.addCommand(createScanCommand(dependencies));
  program.addCommand(createSpecCommand(dependencies));
  program.addCommand(createStatusCommand(dependencies));
  program.addCommand(createTasksCommand(dependencies));
  program.addCommand(createVerifyCommand(dependencies));
  program.addCommand(createWorkflowCommand(dependencies));

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  await createCli().parseAsync(argv);
}
