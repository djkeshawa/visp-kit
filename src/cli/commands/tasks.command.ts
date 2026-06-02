import { Command } from "commander";

import { runTasksWorkflow } from "../../workflows/tasks.workflow.js";
import {
  createTemplateWorkflowCommand,
  type TemplateCommandDependencies
} from "./template-workflow.command.js";

export type TasksCommandDependencies = TemplateCommandDependencies & {
  readonly runTasks?: typeof runTasksWorkflow;
};

export function createTasksCommand(
  dependencies: TasksCommandDependencies = {}
): Command {
  return createTemplateWorkflowCommand({
    name: "tasks",
    description: "Generate or validate task graph templates for a feature.",
    runWorkflow: dependencies.runTasks ?? runTasksWorkflow,
    dependencies
  });
}
