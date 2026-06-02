import { Command } from "commander";

import { runClarifyWorkflow } from "../../workflows/clarify.workflow.js";
import {
  createTemplateWorkflowCommand,
  type TemplateCommandDependencies
} from "./template-workflow.command.js";

export type ClarifyCommandDependencies = TemplateCommandDependencies & {
  readonly runClarify?: typeof runClarifyWorkflow;
};

export function createClarifyCommand(
  dependencies: ClarifyCommandDependencies = {}
): Command {
  return createTemplateWorkflowCommand({
    name: "clarify",
    description: "Generate or validate clarification templates for a feature.",
    runWorkflow: dependencies.runClarify ?? runClarifyWorkflow,
    dependencies
  });
}
