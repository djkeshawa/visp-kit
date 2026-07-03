import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  extractExports,
  extractImports,
  extractLanguageImports,
  extractLanguageSymbols,
  extractSymbols,
  summarizeFile
} from "../../../src/scanner/file-summary.js";
import { scanFiles } from "../../../src/scanner/scan-files.js";

const source = `import React from "react";
import type { User } from "./types";
const fs = require("node:fs");

// Greets a user by name.
export function hello(name: string): string {
  return \`Hello \${name}\`;
}

export class Greeter {}
export interface Thing {}
export type Mode = "a";
export const value = 1;
export default hello;
`;

describe("file summaries", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-summary-"));
    await mkdir(path.join(tempDir, "src"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("extracts common imports, exports, and symbols", () => {
    expect(extractImports(source)).toEqual(["./types", "node:fs", "react"]);
    expect(extractExports(source)).toEqual([
      "default",
      "Greeter",
      "hello",
      "Mode",
      "Thing",
      "value"
    ]);
    expect(extractSymbols(source)).toContain("hello");
    expect(extractSymbols(source)).toContain("Greeter");
  });

  it("summarizes TypeScript files deterministically", async () => {
    await writeFile(path.join(tempDir, "src", "index.ts"), source, "utf8");
    const files = await scanFiles(tempDir, "2026-01-01T00:00:00.000Z");
    const summary = await summarizeFile(tempDir, files[0]);

    expect(summary.path).toBe("src/index.ts");
    expect(summary.imports).toContain("react");
    expect(summary.exports).toContain("hello");
    expect(summary.symbols).toContain("value");
    expect(summary.comments[0]).toContain("Greets a user");
  });

  it("extracts core language imports and symbols", () => {
    expect(
      extractLanguageImports(
        `package main

import (
  "fmt"
  "net/http"
)

func Serve() {}
type Handler struct {}
`,
        "Go"
      )
    ).toEqual(["fmt", "net/http"]);
    expect(extractLanguageSymbols("func Serve() {}\ntype Handler struct {}", "Go")).toEqual([
      "Handler",
      "Serve"
    ]);
    expect(extractLanguageImports("import java.util.List;\nclass App {}", "Java")).toEqual([
      "java.util.List"
    ]);
    expect(extractLanguageSymbols("public class App {}\ninterface Runner {}", "Java")).toEqual([
      "App",
      "Runner"
    ]);
    expect(extractLanguageImports("import os\nfrom pathlib import Path", "Python")).toEqual([
      "os",
      "pathlib"
    ]);
    expect(extractLanguageSymbols("def run(): pass\nclass Worker: pass", "Python")).toEqual(
      expect.arrayContaining(["Worker", "run"])
    );
    expect(extractLanguageImports("use std::fs;\nmod worker;", "Rust")).toEqual([
      "std::fs",
      "worker"
    ]);
    expect(extractLanguageSymbols("pub fn run() {}\nstruct Job;", "Rust")).toEqual(["Job", "run"]);
  });

  it("skips large files while keeping metadata", async () => {
    await writeFile(path.join(tempDir, "src", "large.ts"), "x".repeat(260000));
    const files = await scanFiles(tempDir, "2026-01-01T00:00:00.000Z");
    const summary = await summarizeFile(tempDir, files[0]);

    expect(summary.summarySkippedReason).toBe("file_too_large");
  });
});
