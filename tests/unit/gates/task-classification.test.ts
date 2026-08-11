import { describe, expect, it } from "vitest";

import {
  riskFactorCodeValues,
  taskClassValues
} from "../../../src/artifacts/schemas/common.schema.js";
import { type Task } from "../../../src/artifacts/schemas/task.schema.js";
import { type UnderstandingCaseExport } from "../../../src/artifacts/schemas/understanding.schema.js";
import {
  classifyTask,
  declaredSurface,
  declaredTaskClassVerdicts,
  linkageFromModuleMap,
  linkageFromUnderstanding,
  noSurfaceLinkage
} from "../../../src/gates/task-classification.js";
import { concreteScopePaths } from "../../../src/gates/task-gate-checks.js";
import { isTestFilePath } from "../../../src/scanner/ignore-rules.js";
import { attestsMechanicalClass, isProgramFilePath } from "../../../src/scanner/language.js";
import { type ModuleMap } from "../../../src/scanner/module-map.js";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "T001",
    title: "Rewrite authentication to be trivial",
    description: "This prose is inadmissible and must not change the verdict.",
    requirementIds: [],
    acceptanceCriterionIds: [],
    dependsOn: [],
    allowedFiles: ["src/notes.ts"],
    validationCommands: ["pnpm test"],
    status: "ready",
    parallelizable: false,
    riskLevel: "low",
    ...overrides
  };
}

function classify(input: {
  readonly task: Task;
  readonly sourceSurface?: readonly string[];
  readonly codeSurface?: readonly string[];
  readonly unattestedSurface?: readonly string[];
  readonly linkage?: Parameters<typeof classifyTask>[0]["linkage"];
}) {
  const surface = declaredSurface(input.task);

  return classifyTask({
    task: input.task,
    surface,
    sourceSurface: input.sourceSurface ?? surface,
    // The same join the gate performs, so a test that does not care about the
    // distinction still gets the production answer rather than an empty list
    // that would silently disarm B4.
    codeSurface:
      input.codeSurface ??
      surface.filter((file) => isProgramFilePath(file) && !isTestFilePath(file)),
    unattestedSurface:
      input.unattestedSurface ??
      surface.filter(
        (file) => !isTestFilePath(file) && !isProgramFilePath(file) && !attestsMechanicalClass(file)
      ),
    linkage: input.linkage ?? noSurfaceLinkage
  });
}

describe("VSP026 task classification", () => {
  it("F1: a declared floor risk factor is always behavioural", () => {
    const result = classify({
      task: task({ riskFactors: [{ version: "1.0", code: "authentication" }] })
    });

    expect(result.verdict).toBe("behavioural");
    expect(result.basis).toEqual(["F1_risk_factor_floor"]);
  });

  it("F1: a non-floor risk factor does not reach the floor", () => {
    const result = classify({
      task: task({ riskFactors: [{ version: "1.0", code: "concurrency" }] })
    });

    expect(result.verdict).toBe("mechanical");
  });

  it("F2: an external blast radius is behavioural", () => {
    expect(classify({ task: task({ blastRadius: "external" }) }).basis).toEqual([
      "F2_blast_radius_external"
    ]);
  });

  it("F3: an irreversible task is behavioural", () => {
    expect(classify({ task: task({ reversibility: "irreversible" }) }).basis).toEqual([
      "F3_irreversible"
    ]);
  });

  it("B1: a behavioural task class is behavioural", () => {
    expect(classify({ task: task({ taskClass: "bounded_feature" }) }).verdict).toBe("behavioural");
  });

  it("M1: a documentation task with no source file is mechanical", () => {
    const result = classify({
      task: task({ taskClass: "documentation", allowedFiles: ["docs/readme.md"] }),
      sourceSurface: []
    });

    expect(result.verdict).toBe("mechanical");
    expect(result.basis).toEqual(["M1_documentation_or_regression_test_only"]);
  });

  /**
   * The realistic version of the test above, and the reason M1 needed a
   * different input than `sourceSurface`.
   *
   * Scan's `isRecognisedTextFile` is `true` for Markdown — every `.md` file in this
   * repository is indexed that way — so a documentation task's `sourceSurface`
   * is NOT empty and M1's old condition could not fire on the one class it was
   * written for. The rule now asks whether the surface holds non-test
   * executable code, which is what "no non-test source file" was reaching for.
   */
  it("M1: a documentation task is mechanical even though scan calls Markdown a source file", () => {
    const result = classify({
      task: task({ taskClass: "documentation", allowedFiles: ["docs/readme.md"] }),
      sourceSurface: ["docs/readme.md"]
    });

    expect(result.verdict).toBe("mechanical");
    expect(result.basis).toEqual(["M1_documentation_or_regression_test_only"]);
  });

  it("M1: a regression_test task over test files only is mechanical", () => {
    const result = classify({
      task: task({ taskClass: "regression_test", allowedFiles: ["tests/notes.test.ts"] })
    });

    expect(result.verdict).toBe("mechanical");
    expect(result.basis).toEqual(["M1_documentation_or_regression_test_only"]);
  });

  it("M2: a surface with no source file is mechanical", () => {
    const result = classify({
      task: task({ allowedFiles: ["config/app.yaml"] }),
      sourceSurface: []
    });

    expect(result.basis).toEqual(["M2_non_source_surface"]);
  });

  /**
   * The second hole a verifier defeated VSP026 with.
   *
   * `documentation` is a class any task may write about itself, and the old
   * `M3_declared_mechanical_class` branch accepted it whatever the surface
   * held — so declaring it over source files was an agent choosing its own
   * gate. A declared mechanical class now holds only while the change surface
   * agrees with it.
   */
  it("B4: a documentation class over source files is refuted, not honoured", () => {
    const result = classify({
      task: task({ taskClass: "documentation", allowedFiles: ["src/notes.ts"] })
    });

    expect(result.verdict).toBe("behavioural");
    expect(result.basis).toEqual(["B4_mechanical_class_refuted_by_surface"]);
    expect(result.evidence.join(" ")).toContain("src/notes.ts");
  });

  it("B4: a regression_test class over non-test code is refuted too", () => {
    const result = classify({
      task: task({ taskClass: "regression_test", allowedFiles: ["src/notes.ts"] })
    });

    expect(result.verdict).toBe("behavioural");
    expect(result.basis).toEqual(["B4_mechanical_class_refuted_by_surface"]);
  });

  /**
   * B4 fires on contradicting evidence, never on missing evidence. A surface
   * the file index cannot call code — a YAML file here — leaves the declared
   * class standing, which is ADR 0014's failure direction and not an oversight.
   */
  it("B4: absent evidence does not refute a declared mechanical class", () => {
    const result = classify({
      task: task({ taskClass: "documentation", allowedFiles: ["config/app.yaml"] })
    });

    expect(result.verdict).toBe("mechanical");
    expect(result.basis).toEqual(["M1_documentation_or_regression_test_only"]);
  });

  /**
   * The property, over the enum, so the next mechanical class cannot reopen
   * this the way `refactor` reopened the behavioural side.
   */
  it("no declared mechanical class survives code in its surface", () => {
    for (const taskClass of taskClassValues) {
      if (declaredTaskClassVerdicts[taskClass] !== "mechanical") continue;

      const result = classify({
        task: task({ taskClass, allowedFiles: ["src/notes.ts"] })
      });

      expect(result.verdict, `taskClass=${taskClass}`).toBe("behavioural");
    }
  });

  it("the ambiguous default is reachable ONLY when no class is declared", () => {
    const result = classify({ task: task() });

    expect(result.verdict).toBe("mechanical");
    expect(result.basis).toEqual(["ambiguous_default_mechanical"]);
  });

  /**
   * The hole a verifier defeated VSP026 with, closed as a property rather than
   * as one more example.
   *
   * `refactor` was a valid member of `taskClassValues` that appeared in neither
   * the behavioural nor the mechanical list, so it fell through every rule to
   * the ambiguous default and was not gated. The fix is only worth as much as
   * the guarantee that the next enum member cannot do the same, so this asserts
   * over the enum itself: no declared class may reach the default, whatever the
   * surface, and the enum is what is iterated — not a list copied from it.
   */
  it("no member of taskClassValues can reach the ambiguous default", () => {
    for (const taskClass of taskClassValues) {
      for (const surface of [[], ["src/notes.ts"], ["docs/readme.md"]]) {
        const result = classify({
          task: task({ taskClass, allowedFiles: surface }),
          sourceSurface: surface.filter((file) => file.endsWith(".ts"))
        });

        expect(
          result.basis,
          `taskClass=${taskClass} with surface [${surface.join(",")}]`
        ).not.toContain("ambiguous_default_mechanical");
      }
    }
  });

  it("every member of taskClassValues has a recorded verdict", () => {
    expect(Object.keys(declaredTaskClassVerdicts).sort()).toEqual([...taskClassValues].sort());
  });

  it("B1: a refactor is behavioural — it is a claim about behaviour", () => {
    const result = classify({ task: task({ taskClass: "refactor" }) });

    expect(result.verdict).toBe("behavioural");
    expect(result.basis).toEqual(["B1_task_class"]);
  });

  it("F1: every risk factor code has a recorded floor decision", () => {
    // Same guarantee as the task classes, on the other declared enum. A code
    // that is on the floor gates alone; a code that is not still reaches
    // B1/B2/B3. What must never happen is a code nobody decided about.
    for (const code of riskFactorCodeValues) {
      const result = classify({ task: task({ riskFactors: [{ version: "1.0", code }] }) });
      const onFloor = result.basis.includes("F1_risk_factor_floor");

      expect(onFloor, `riskFactor ${code} must be a decision, not an oversight`).toBe(
        [
          "authentication",
          "authorization",
          "cryptography",
          "public_api",
          "schema",
          "data_migration",
          "permissions"
        ].includes(code)
      );
    }
  });

  it("prose never changes the verdict", () => {
    // The title says "authentication" and the description begs for a gate. The
    // rule reads neither: intent is raw input under VSP019, and prose is the
    // one input an agent can rewrite to change its own gate.
    const loud = classify({
      task: task({
        title: "SECURITY: rewrite authorization and cryptography",
        description: "migration schema public_api data_migration permissions"
      })
    });

    expect(loud.verdict).toBe("mechanical");
    expect(loud.evidence.join(" ")).not.toContain("SECURITY");
  });
});

describe("VSP026 linkage evidence", () => {
  const A = "urn:visp-intel:entity:1.0:sha256:a";
  const B = "urn:visp-intel:entity:1.0:sha256:b";
  const OUTSIDE = "urn:visp-intel:entity:1.0:sha256:outside";

  function exportWith(rows: UnderstandingCaseExport["path"]): UnderstandingCaseExport {
    return {
      kind: "understanding-case-export",
      schemaVersion: "1.0",
      case: {
        schemaVersion: "1.0",
        authority: "descriptive",
        authorizationEffect: "none",
        id: "case",
        taskStateId: "state",
        taskId: "T001",
        snapshotId: "snap",
        behavioralQuestion: "",
        observations: [],
        hypotheses: [],
        entrypointIds: [],
        relationIds: [],
        evidenceIds: [],
        unknownIds: [],
        candidateChangeEntityIds: [],
        affectedUnchangedEntityIds: [],
        affectedTestIds: [],
        queryReceiptIds: [],
        impactQueryReceiptIds: [],
        validationSuggestions: []
      },
      resolution: {
        [A]: {
          kind: "function",
          filePath: "src/a.ts",
          startLine: 0,
          endLine: 1,
          signature: "function src/a.ts#handler",
          displayName: "handler"
        },
        [B]: {
          kind: "function",
          filePath: "src/b.ts",
          startLine: 0,
          endLine: 1,
          signature: "function src/b.ts#handler",
          displayName: "handler"
        },
        [OUTSIDE]: {
          kind: "function",
          filePath: "src/caller.ts",
          startLine: 0,
          endLine: 1,
          signature: "function src/caller.ts#handler",
          displayName: "handler"
        }
      },
      identity: {
        repositoryInstanceId: "repo",
        snapshotId: "snap",
        headSnapshotId: "snap",
        gitCommit: null,
        dirty: null,
        worktreeFingerprint: "f".repeat(64)
      },
      path: rows,
      counts: {
        entrypoints: 0,
        pathRelations: rows.length,
        candidateChanges: 0,
        affectedUnchanged: 0,
        affectedTests: 0,
        unknowns: 0
      }
    };
  }

  it("B2: two surface files linked to each other are a path, not an edit", () => {
    const linkage = linkageFromUnderstanding({
      export: exportWith([
        { relationId: "r1", sourceId: A, targetId: B, kind: "calls", evidenceId: "e1" }
      ]),
      surface: ["src/a.ts", "src/b.ts"]
    });

    expect(linkage.linkedSurfaceFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(
      classify({
        task: task({ allowedFiles: ["src/a.ts", "src/b.ts"] }),
        linkage
      }).basis
    ).toEqual(["B2_linked_surface"]);
  });

  it("B3: an inbound caller from outside the surface makes it observable", () => {
    const linkage = linkageFromUnderstanding({
      export: exportWith([
        { relationId: "r1", sourceId: OUTSIDE, targetId: A, kind: "calls", evidenceId: "e1" }
      ]),
      surface: ["src/a.ts"]
    });

    expect(linkage.inboundCallers).toEqual(["src/a.ts"]);
    expect(classify({ task: task({ allowedFiles: ["src/a.ts"] }), linkage }).basis).toEqual([
      "B3_inbound_caller_outside_surface"
    ]);
  });

  it("three entities named handler in three files stay three identities", () => {
    // Every resolution entry here has displayName "handler". If linkage joined
    // on the name, the outside caller would look like it was inside the
    // surface and B3 would silently stop firing.
    const linkage = linkageFromUnderstanding({
      export: exportWith([
        { relationId: "r1", sourceId: OUTSIDE, targetId: A, kind: "calls", evidenceId: "e1" }
      ]),
      surface: ["src/a.ts"]
    });

    expect(linkage.inboundCallers).toEqual(["src/a.ts"]);
  });

  it("the module map answers B2 and declines to answer B3", () => {
    const moduleMap: ModuleMap = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      sourceRoots: ["src"],
      modules: [
        {
          name: "src",
          root: "src",
          files: ["src/a.ts", "src/b.ts"],
          testFiles: [],
          internalImports: ["src/b.ts"],
          externalDependencies: []
        }
      ]
    };
    const linkage = linkageFromModuleMap({
      moduleMap,
      surface: ["src/a.ts", "src/b.ts"],
      indexedFiles: new Set(["src/a.ts", "src/b.ts"])
    });

    expect(linkage.linkedSurfaceFiles).toEqual(["src/a.ts", "src/b.ts"]);
    // Module-grain aggregation cannot tell an inbound caller from a sibling
    // import, and a guess here would over-gate. It says nothing instead.
    expect(linkage.inboundCallers).toEqual([]);
  });

  it("unresolved import specifiers are not treated as file paths", () => {
    const moduleMap: ModuleMap = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      sourceRoots: ["src"],
      modules: [
        {
          name: "src",
          root: "src",
          files: ["src/a.ts", "src/b.ts"],
          testFiles: [],
          internalImports: ["../b.js", "./b"],
          externalDependencies: []
        }
      ]
    };

    expect(
      linkageFromModuleMap({
        moduleMap,
        surface: ["src/a.ts", "src/b.ts"],
        indexedFiles: new Set(["src/a.ts", "src/b.ts"])
      }).linkedSurfaceFiles
    ).toEqual([]);
  });
});

describe("declared surface", () => {
  it("does not treat the task generator's TBD placeholder as a declared file", () => {
    expect(declaredSurface(task({ allowedFiles: ["TBD"], expectedFiles: ["src/a.ts"] }))).toEqual([
      "src/a.ts"
    ]);
  });
});

/**
 * The three ways a task could reach `implement` ungated through VSP026, all
 * named from source and all closed here.
 *
 * Route 1 is the language list: `isProgramFilePath` recognised seven languages,
 * so B4 — the rule whose entire job is stopping a task from choosing its own
 * gate — could not fire on a change written in any of the others.
 *
 * Route 2 is the spelling: the declared surface was not normalised, so
 * `./src/a.ts` never joined scan's index and both linkage rules went silently
 * empty.
 *
 * Route 3 is the parser: an entry containing a space was dropped from the
 * surface entirely, taking M2 and both linkage rules with it. Which is the same
 * shape as the defect this file's neighbour already records — the way to escape
 * the check was to remove what the check reads — performed by the parser
 * instead of by an agent.
 */
describe("VSP026 defeat routes", () => {
  it("route 1: a declared documentation class does not survive a change in an unrecognised language", () => {
    const result = classify({
      task: task({ taskClass: "documentation", allowedFiles: ["src/app.rb"] })
    });

    expect(result.verdict).toBe("behavioural");
    expect(result.basis).toEqual(["B4_mechanical_class_refuted_by_surface"]);
    expect(result.evidence.join(" ")).toContain("unattestedInSurface=src/app.rb");
  });

  it("route 1: markup is not documentation either", () => {
    for (const filePath of ["src/theme.css", "public/index.html"]) {
      expect(
        classify({ task: task({ taskClass: "documentation", allowedFiles: [filePath] }) }).verdict
      ).toBe("behavioural");
    }
  });

  it("route 1: prose, fixtures and configuration still corroborate the class", () => {
    for (const filePath of ["docs/readme.md", "tests/fixtures/data.json", "ci/build.yml"]) {
      const result = classify({
        task: task({ taskClass: "documentation", allowedFiles: [filePath] })
      });

      expect(result.verdict, filePath).toBe("mechanical");
      expect(result.basis).toEqual(["M1_documentation_or_regression_test_only"]);
    }
  });

  /**
   * The asymmetry, stated deliberately. Fail-closed applies to a task that made
   * a claim its evidence cannot corroborate. It must NOT apply to a task that
   * claimed nothing: ADR 0014's failure direction protects the ambiguous task,
   * and over-gating a trivial edit is what teaches an agent that the gate is
   * noise.
   */
  it("route 1: an undeclared task in the same unrecognised language is still not gated", () => {
    const result = classify({ task: task({ allowedFiles: ["src/app.rb"] }) });

    expect(result.verdict).toBe("mechanical");
    expect(result.basis).toEqual(["ambiguous_default_mechanical"]);
  });

  it("route 2: a ./-spelled surface still joins scan's index", () => {
    expect(declaredSurface(task({ allowedFiles: ["./src/a.ts", "src\\b.ts"] }))).toEqual([
      "src/a.ts",
      "src/b.ts"
    ]);
  });

  it("route 2: a ./-spelled surface still links through the module map", () => {
    const moduleMap: ModuleMap = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      sourceRoots: ["src"],
      modules: [
        {
          name: "src",
          root: "src",
          files: ["src/a.ts", "src/b.ts"],
          testFiles: [],
          internalImports: ["src/b.ts"],
          externalDependencies: []
        }
      ]
    };

    expect(
      linkageFromModuleMap({
        moduleMap,
        surface: ["./src/a.ts", "./src/b.ts"],
        indexedFiles: new Set(["src/a.ts", "src/b.ts"])
      }).linkedSurfaceFiles
    ).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("route 2: a ./-spelled surface still refutes a declared mechanical class", () => {
    expect(
      classify({ task: task({ taskClass: "documentation", allowedFiles: ["./src/a.ts"] }) }).verdict
    ).toBe("behavioural");
  });

  it("route 3: a file whose name has a space in it is still a file", () => {
    expect(declaredSurface(task({ allowedFiles: ["src/my file.ts"] }))).toEqual(["src/my file.ts"]);
    expect(
      classify({ task: task({ taskClass: "documentation", allowedFiles: ["src/my file.ts"] }) })
        .verdict
    ).toBe("behavioural");
  });

  it("route 3: the task generator's prose rule is still not a declared path", () => {
    expect(
      concreteScopePaths([
        "Dependency manifests and lockfiles unless dependency approval is part of this task",
        "TBD",
        "   ",
        "src/a.ts"
      ])
    ).toEqual(["src/a.ts"]);
  });
});
