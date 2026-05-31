import { CommanderError } from "commander";
import { describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";

describe("createCli", () => {
  it("prints basic help for the visp command", () => {
    const help = createCli().helpInformation();

    expect(help).toContain("Usage: visp [options]");
    expect(help).toContain("Small context. Clear specs. Accurate code.");
    expect(help).toContain("-h, --help");
    expect(help).toContain("-V, --version");
  });

  it("prints the CLI version", () => {
    const output: string[] = [];
    const program = createCli();

    program.configureOutput({
      writeOut: (value) => output.push(value),
      writeErr: (value) => output.push(value)
    });
    program.exitOverride();

    try {
      program.parse(["node", "visp", "--version"]);
    } catch (error) {
      if (
        !(error instanceof CommanderError) ||
        error.code !== "commander.version"
      ) {
        throw error;
      }
    }

    expect(output.join("")).toContain("0.0.0");
  });
});
