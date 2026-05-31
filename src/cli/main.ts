import { Command } from "commander";
import { z } from "zod";

import {
  createInitCommand,
  type InitCommandDependencies
} from "./commands/init.command.js";

export type CliDependencies = InitCommandDependencies;

const cliMetadataSchema = z.object({
  name: z.literal("visp"),
  version: z.string().min(1),
  description: z.string().min(1)
});

const cliMetadata = cliMetadataSchema.parse({
  name: "visp",
  version: "0.0.0",
  description: "Small context. Clear specs. Accurate code."
});

export function createCli(dependencies: CliDependencies = {}): Command {
  const program = new Command()
    .name(cliMetadata.name)
    .description(cliMetadata.description)
    .version(cliMetadata.version)
    .showHelpAfterError()
    .helpOption("-h, --help", "Display help for command.");

  program.addCommand(createInitCommand(dependencies));

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  await createCli().parseAsync(argv);
}
