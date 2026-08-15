import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKFLOW_ACTION_PROTOCOL,
  SUPPORTED_WORKFLOW_ACTION_PROTOCOLS
} from "../../../src/integration/workflow-action-schema.js";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

/**
 * Fenced blocks are quotation, not assertion. ADR 0007 has to be able to show
 * the exact `">=0.2.3 <0.7.0"` it retires, and the retirement is worthless if
 * the reader cannot see the string being retired. Prose is where a support
 * claim is actually made, so prose is what this test governs.
 */
function stripFencedBlocks(markdown: string): string {
  return markdown.replace(/^```[\s\S]*?^```/gmu, "");
}

function collapseWhitespace(markdown: string): string {
  return markdown.replace(/\s+/gu, " ");
}

const vispPackageName = "visp(?:-kit|-hyper-agent|-hyper|-memory|-dev)";
const comparatorRange = String.raw`(?:>=|<=|[<>^~])\s*\d`;
const englishRange = String.raw`(?:or|and)\s+(?:later|newer|above|higher|greater)`;
const gap = String.raw`[^\n]{0,60}?`;

/**
 * Both orders matter: "visp-hyper-agent >= 0.6.0" and "requires at least
 * 0.6.0 of visp-hyper-agent" are the same claim.
 */
const rangeClaimPatterns: readonly RegExp[] = [
  new RegExp(`${vispPackageName}${gap}(?:${comparatorRange}|${englishRange})`, "iu"),
  new RegExp(`(?:${comparatorRange}|${englishRange})${gap}${vispPackageName}`, "iu")
];

function rangeClaimsIn(markdown: string): readonly string[] {
  const prose = collapseWhitespace(stripFencedBlocks(markdown));

  return rangeClaimPatterns.flatMap((pattern) => {
    const match = pattern.exec(prose);

    return match === null ? [] : [match[0]];
  });
}

function currentUserFacingDocs(): readonly string[] {
  // docs/adr/ is deliberately excluded: an accepted decision record is a
  // historical statement and must stay quotable after the decision changes.
  const docsDir = path.join(root, "docs");
  const docFiles = readdirSync(docsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join("docs", entry.name));

  return ["README.md", ...docFiles].sort();
}

describe("Kit↔Hyper pair compatibility claim (ADR 0007)", () => {
  it("states no supported version range for any sibling Visp package", () => {
    const offenders = currentUserFacingDocs().flatMap((file) => {
      const claims = rangeClaimsIn(read(file));

      return claims.map((claim) => `${file}: ${claim}`);
    });

    expect(offenders).toEqual([]);
  });

  it("answers the compatibility question with the pinned pair and a check", () => {
    const readme = read("README.md");
    const heading = "## Compatibility";
    const start = readme.indexOf(heading);

    expect(start).toBeGreaterThanOrEqual(0);

    const afterHeading = readme.slice(start + heading.length);
    const nextHeadingStart = afterHeading.search(/^## /mu);

    expect(nextHeadingStart).toBeGreaterThan(0);

    const compatibility = afterHeading.slice(0, nextHeadingStart);

    // The negative claim has to be stated, not merely implied by the absence
    // of a range: a reader who finds no number needs to know that is a
    // decision rather than an omission.
    expect(compatibility).toContain("no supported version range");
    // What identifies a supported pairing.
    expect(compatibility).toContain("commit, tree, and package tarball hash");
    // Where the authoritative answer comes from.
    expect(compatibility).toContain("visp-dev doctor");
    expect(compatibility).toContain("installable: false");
    // What Kit itself actually enforces, so the reader is not left thinking
    // nothing checks anything.
    expect(compatibility).toContain("visp-kit integration contract");
    expect(compatibility).toContain("ADR 0007");
  });

  it("declares no dependency of any kind on the coordinator package", () => {
    const pkg = JSON.parse(read("package.json")) as Record<string, unknown>;

    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
      "peerDependenciesMeta"
    ]) {
      const block = pkg[field];
      const names = block === undefined ? [] : Object.keys(block as Record<string, unknown>);

      expect(names, field).not.toContain("visp-hyper-agent");
    }
  });

  it("keeps ADR 0007 and names the two statements Kit does not own", () => {
    const adr = read("docs/adr/0007-pair-compatibility-is-pinned-not-ranged.md");

    expect(adr).toContain("visp-hyper-agent/package.json");
    expect(adr).toContain("visp-dev/src/machine-scope.mjs");
    expect(adr).toContain("visp-dev/compatibility.json");
    expect(adr).toContain("exact-pair");
  });
});

/**
 * ADR 0007 makes the protocol advertisement the thing Kit actually enforces in
 * place of a version range. That only helps a reader if the documented set is
 * the implemented set. It was not: the docs stopped at 3.2 while Kit emits 3.4,
 * so the doc understated the very contract the range was being retired in
 * favour of.
 */
describe("documented WorkflowAction protocol set matches the implemented set", () => {
  const supported = [...SUPPORTED_WORKFLOW_ACTION_PROTOCOLS];

  it("lists every implemented protocol in the `next` flag and the exact-values note", () => {
    const commands = read("docs/commands.md");

    expect(commands).toContain(`- \`--protocol <${supported.join("|")}>\``);

    for (const protocol of supported) {
      expect(commands, `--protocol ${protocol}`).toContain(`\`${protocol}\``);
    }
  });

  it("advertises the implemented set and default in the integration contract docs", () => {
    const commands = read("docs/commands.md");
    const advertised = supported.map((protocol) => `"${protocol}"`).join(", ");

    expect(commands).toContain(`\`[${advertised}]\``);
    expect(commands).toContain(`the unchanged default \`"${DEFAULT_WORKFLOW_ACTION_PROTOCOL}"\``);
  });

  it("packages a public schema for every implemented protocol and documents it", () => {
    const commands = read("docs/commands.md");
    const packaged = new Set(readdirSync(path.join(root, "schemas", "workflow-action")));

    for (const protocol of supported) {
      const schemaFile = `${protocol}.schema.json`;

      expect(packaged, schemaFile).toContain(schemaFile);
      expect(commands, schemaFile).toContain(`schemas/workflow-action/${schemaFile}`);
    }
  });
});
