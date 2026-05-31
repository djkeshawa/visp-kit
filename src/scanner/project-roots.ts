import path from "node:path";

import { pathExists } from "../core/file-system.js";

const sourceCandidates = [
  "src",
  "app",
  "lib",
  "packages",
  "apps",
  "services",
  "backend",
  "frontend",
  "server",
  "client"
] as const;

const testCandidates = [
  "test",
  "tests",
  "__tests__",
  "spec",
  "specs",
  "e2e",
  "integration"
] as const;

async function existingChildren(
  rootPath: string,
  names: readonly string[]
): Promise<string[]> {
  const existing: string[] = [];

  for (const name of names) {
    const result = await pathExists(path.join(rootPath, name));

    if (result.ok && result.value) {
      existing.push(name);
    }
  }

  return existing;
}

export async function detectSourceRoots(rootPath: string): Promise<string[]> {
  return existingChildren(rootPath, sourceCandidates);
}

export async function detectTestRoots(rootPath: string): Promise<string[]> {
  return existingChildren(rootPath, testCandidates);
}
