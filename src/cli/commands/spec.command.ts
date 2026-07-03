import { type Command } from "commander";

import { runSpecWorkflow } from "../../workflows/spec.workflow.js";
import {
  createTemplateWorkflowCommand,
  type TemplateCommandDependencies
} from "./template-workflow.command.js";

export type SpecCommandDependencies = TemplateCommandDependencies & {
  readonly runSpec?: typeof runSpecWorkflow;
};

export function createSpecCommand(dependencies: SpecCommandDependencies = {}): Command {
  return createTemplateWorkflowCommand({
    name: "spec",
    description: "Generate or validate specification templates for a feature.",
    runWorkflow: dependencies.runSpec ?? runSpecWorkflow,
    dependencies
  });
}
