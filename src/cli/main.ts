import { Command } from "commander";
import { z } from "zod";

import {
  createBudgetCommand,
  type BudgetCommandDependencies
} from "./commands/budget.command.js";
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
  createContextCommand,
  type ContextCommandDependencies
} from "./commands/context.command.js";
import {
  createInitCommand,
  type InitCommandDependencies
} from "./commands/init.command.js";
import {
  createFeatureCommand,
  type FeatureCommandDependencies
} from "./commands/feature.command.js";
import {
  createScanCommand,
  type ScanCommandDependencies
} from "./commands/scan.command.js";
import {
  createPlanCommand,
  type PlanCommandDependencies
} from "./commands/plan.command.js";
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

export type CliDependencies = BudgetCommandDependencies &
  ClarifyCommandDependencies &
  ConstitutionCommandDependencies &
  ContextCommandDependencies &
  DoctorCommandDependencies &
  FeatureCommandDependencies &
  InitCommandDependencies &
  NextCommandDependencies &
  PlanCommandDependencies &
  PrCommandDependencies &
  ReconcileCommandDependencies &
  ReviewCommandDependencies &
  ScanCommandDependencies &
  SpecCommandDependencies &
  StatusCommandDependencies &
  TasksCommandDependencies &
  VerifyCommandDependencies;

const cliMetadataSchema = z.object({
  name: z.literal("visp"),
  version: z.string().min(1),
  description: z.string().min(1)
});

const cliMetadata = cliMetadataSchema.parse({
  name: "visp",
  version: "0.1.0",
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
  program.addCommand(createClarifyCommand(dependencies));
  program.addCommand(createConstitutionCommand(dependencies));
  program.addCommand(createContextCommand(dependencies));
  program.addCommand(createDoctorCommand(dependencies));
  program.addCommand(createFeatureCommand(dependencies));
  program.addCommand(createInitCommand(dependencies));
  program.addCommand(createNextCommand(dependencies));
  program.addCommand(createPlanCommand(dependencies));
  program.addCommand(createPrCommand(dependencies));
  program.addCommand(createReconcileCommand(dependencies));
  program.addCommand(createReviewCommand(dependencies));
  program.addCommand(createScanCommand(dependencies));
  program.addCommand(createSpecCommand(dependencies));
  program.addCommand(createStatusCommand(dependencies));
  program.addCommand(createTasksCommand(dependencies));
  program.addCommand(createVerifyCommand(dependencies));

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  await createCli().parseAsync(argv);
}
