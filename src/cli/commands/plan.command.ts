import { Command } from "commander";

import { runPlanWorkflow } from "../../workflows/plan.workflow.js";
import {
  createTemplateWorkflowCommand,
  type TemplateCommandDependencies
} from "./template-workflow.command.js";

export type PlanCommandDependencies = TemplateCommandDependencies & {
  readonly runPlan?: typeof runPlanWorkflow;
};

export function createPlanCommand(
  dependencies: PlanCommandDependencies = {}
): Command {
  return createTemplateWorkflowCommand({
    name: "plan",
    description: "Generate or validate implementation plan templates for a feature.",
    runWorkflow: dependencies.runPlan ?? runPlanWorkflow,
    dependencies
  });
}
