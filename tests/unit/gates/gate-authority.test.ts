// P13-US-03 — the gate's authority, specified before reading the gate code.
//
// Visp's entire claim is that it stops work which lacks proof. The gate is
// where that claim is enforced: Hyper's composite loop, the generated hooks,
// and any external orchestrator all ask `visp-kit gate <stage>` for permission
// and act on the answer.
//
// So the gate has exactly one obligation, and it is stated here as the
// invariant every test in this file checks a face of:
//
//     THE GATE MUST NOT AUTHORIZE WHAT THE PRODUCT WILL THEN REFUSE.
//
// A gate that answers "allowed" while `visp-kit <stage>` rejects the same
// artifacts is not a permissive gate — it is a gate reporting on something
// other than the thing it names. That is the defect class this codebase keeps
// producing, and here it sits in the component whose only job is to be right.
//
// Written behaviour-first: these assertions were authored against the
// documented promise, before the implementation was changed to satisfy them.
// Where they failed, the code was the bug.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../../src/cli/main.js";
import { evaluateGate } from "../../../src/gates/gate-engine.js";
import { runClarifyWorkflow } from "../../../src/workflows/clarify.workflow.js";
import { runFeatureWorkflow } from "../../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";
import { runPlanWorkflow } from "../../../src/workflows/plan.workflow.js";
import { runSpecWorkflow } from "../../../src/workflows/spec.workflow.js";
import { createPhase8Fixture, expectOk } from "../../integration/phase8-fixture.js";

const execFileAsync = promisify(execFile);

const NOW = "2026-01-01T00:00:00.000Z";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-gate-authority-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function featureKey(): Promise<string> {
  const { readdir } = await import("node:fs/promises");
  const [key] = await readdir(path.join(tempDir, ".visp", "features"));
  if (key === undefined) throw new Error("No feature directory was created.");
  return key;
}

async function artifactPath(name: string): Promise<string> {
  return path.join(tempDir, ".visp", "features", await featureKey(), name);
}

async function editArtifact(name: string, update: (value: any) => void): Promise<void> {
  const file = await artifactPath(name);
  const value = JSON.parse(await readFile(file, "utf8"));
  update(value);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** A project with an active feature and Kit's own freshly generated clarifications. */
async function projectWithClarificationsDraft(): Promise<void> {
  expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
  expectOk(
    await runFeatureWorkflow({
      targetPath: tempDir,
      featureIdea: "add a login page",
      noBranch: true,
      now: NOW
    })
  );
  expectOk(await runClarifyWorkflow({ targetPath: tempDir, now: NOW }));
}

/** Fill the clarifications in honestly so the spec stage becomes reachable. */
async function completeClarifications(): Promise<void> {
  await editArtifact("clarifications.json", (artifact) => {
    artifact.status = "ready";
    artifact.questions = [
      {
        id: "CQ001",
        question: "Which identity provider backs the login page?",
        category: "security",
        blocking: true,
        recommendedDefault: "Reuse the session cookie provider already configured in the app.",
        reason: "The authentication choice determines the whole request flow.",
        status: "answered",
        answer: "Reuse the existing session cookie provider."
      }
    ];
    artifact.assumptions = [
      {
        id: "CA001",
        text: "Accounts are provisioned outside this feature.",
        reason: "No signup flow appears in the feature intent.",
        source: "intent",
        accepted: true
      }
    ];
  });
}

/**
 * Evaluate a gate in STRICT mode.
 *
 * The ordering rules VSP003/VSP004/VSP005 are switched off in `standard`, the
 * default mode — `relaxed` and `standard` are documented as advisory, and only
 * `strict`/`locked` enforce. That is a product decision about what the default
 * means, and it is recorded separately below rather than smuggled into these
 * tests. Here the rules are ON, so what is under test is the check's verdict
 * rather than whether the check runs at all.
 */
async function gate(stage: "spec" | "plan" | "tasks"): Promise<{
  allowed: boolean;
  failedRules: readonly { ruleId: string }[];
}> {
  const result = expectOk(
    await evaluateGate({ targetPath: tempDir, stage, strictness: "strict", dryRun: true, now: NOW })
  );
  return { allowed: result.allowed, failedRules: result.failedRules };
}

describe("the gate never authorizes what the product refuses", () => {
  // ---------------------------------------------------------------------
  // BEHAVIOUR: `visp-kit spec` refuses an unanswered clarifications draft.
  // Therefore `gate spec` must refuse it too.
  //
  // Kit's own `clarify` writes this artifact: status draft_invalid, every
  // field the literal string "TBD". It is not a corrupted file or a hostile
  // input — it is the normal output of the previous step, and the gate said
  // "allowed" for it.
  // ---------------------------------------------------------------------
  it("refuses the spec stage while clarifications are still an unanswered draft", async () => {
    await projectWithClarificationsDraft();

    // Establish the premise rather than assume it: the command really does refuse.
    const command = await runSpecWorkflow({ targetPath: tempDir, now: NOW });
    expect(
      command.ok,
      "Premise broken: visp-kit spec accepted a TBD clarifications draft, so this test is no longer checking the gate against the command."
    ).toBe(false);

    const result = await gate("spec");

    expect(
      result.allowed,
      "gate spec authorized a stage that visp-kit spec then refuses. An agent trusting the gate " +
        "would write a specification on top of unanswered clarifications."
    ).toBe(false);
    expect(result.failedRules.map((rule) => rule.ruleId)).toContain("VSP003");
  });

  // ---------------------------------------------------------------------
  // BEHAVIOUR: `visp-kit plan` refuses a spec that is still a TBD draft.
  // Therefore `gate plan` must refuse it too.
  //
  // This is the reachable-by-normal-use case: `visp-kit spec` GENERATES a
  // draft_invalid spec whose single requirement is titled "TBD", and the plan
  // gate passed it because the file existed and the array was non-empty.
  // ---------------------------------------------------------------------
  it("refuses the plan stage while the spec is still the TBD draft Kit generated", async () => {
    await projectWithClarificationsDraft();
    await completeClarifications();
    expectOk(await runSpecWorkflow({ targetPath: tempDir, now: NOW }));

    const command = await runPlanWorkflow({ targetPath: tempDir, now: NOW });
    expect(command.ok, "Premise broken: visp-kit plan accepted the TBD spec draft.").toBe(false);

    const result = await gate("plan");

    expect(
      result.allowed,
      "gate plan authorized planning against a spec whose every field is the placeholder 'TBD'. " +
        "The spec-first workflow is the product's core promise; this advances past it."
    ).toBe(false);
    expect(result.failedRules.map((rule) => rule.ruleId)).toContain("VSP004");
  });

  it("refuses the tasks stage while the spec is still the TBD draft Kit generated", async () => {
    await projectWithClarificationsDraft();
    await completeClarifications();
    expectOk(await runSpecWorkflow({ targetPath: tempDir, now: NOW }));

    const result = await gate("tasks");

    expect(
      result.allowed,
      "gate tasks authorized task decomposition from a placeholder specification."
    ).toBe(false);
    expect(result.failedRules.map((rule) => rule.ruleId)).toContain("VSP004");
  });

  // ---------------------------------------------------------------------
  // The other half of the invariant, and the one that keeps this honest.
  //
  // A gate that refuses everything satisfies every test above and is useless.
  // These state the converse: once the artifacts genuinely are complete, the
  // gate must open. Without this pair, "fixing" the gate by blocking harder
  // would look like success.
  // ---------------------------------------------------------------------
  it("allows the spec stage once clarifications are genuinely answered", async () => {
    await projectWithClarificationsDraft();
    await completeClarifications();

    const command = await runSpecWorkflow({ targetPath: tempDir, now: NOW });
    expect(command.ok, "Premise broken: visp-kit spec refused complete clarifications.").toBe(true);

    // Re-evaluate on a fresh project so the gate answers about the same state
    // the command accepted, not about the artifacts the command just wrote.
    await rm(tempDir, { recursive: true, force: true });
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-gate-authority-"));
    await projectWithClarificationsDraft();
    await completeClarifications();

    const result = await gate("spec");
    expect(
      result.allowed,
      "gate spec blocked a stage visp-kit spec accepts. Over-blocking is the same defect wearing " +
        "the opposite sign: the gate still disagrees with the product."
    ).toBe(true);
  });

  it("allows the plan stage once the spec is genuinely complete", async () => {
    await projectWithClarificationsDraft();
    await completeClarifications();
    expectOk(await runSpecWorkflow({ targetPath: tempDir, now: NOW }));

    // Complete the spec the way an agent is expected to.
    await editArtifact("spec.json", (spec) => {
      spec.status = "ready";
      spec.userStories = [
        {
          id: "US001",
          title: "Sign in with an existing account",
          actor: "returning user",
          capability: "enter credentials on a login page",
          outcome: "an authenticated session is established"
        }
      ];
      const criterion = {
        id: "AC001",
        requirementId: "REQ001",
        description:
          "Submitting valid credentials establishes a session cookie and redirects to the dashboard.",
        testable: true,
        validationMethod: "integration"
      };
      spec.requirements = [
        {
          ...spec.requirements[0],
          id: "REQ001",
          title: "Authenticate a returning user",
          description:
            "The login page must exchange submitted credentials for a session using the existing provider.",
          acceptanceCriteria: [criterion]
        }
      ];
      spec.acceptanceCriteria = [criterion];
      spec.businessRules = ["Only provisioned accounts may sign in."];
      spec.nonFunctionalRequirements = {
        performance: ["Sign-in completes within one round trip to the provider."],
        security: ["Credentials are never written to logs or artifacts."],
        accessibility: ["The form is reachable and submittable by keyboard alone."],
        reliability: ["A provider timeout surfaces a retryable error."],
        maintainability: ["Authentication logic stays behind the existing provider seam."]
      };
      spec.edgeCases = ["Submitting an unprovisioned account is rejected without disclosing why."];
      spec.outOfScope = ["Account signup and password reset."];
      spec.assumptions = [];
    });

    const result = await gate("plan");
    expect(
      result.allowed,
      "gate plan blocked planning against a complete, ready specification."
    ).toBe(true);
  });
});

// =========================================================================
// VSP012 — declared scope.
//
// The product's headline promise is that an agent declares an exact
// allowed-file list BEFORE it edits anything, and that edits outside the list
// are blocked. VSP012 is the rule that enforces it.
//
// A task carrying `allowedFiles: []` has not declared a narrow scope. It has
// declared nothing. Every layer read that as "unrestricted" and reported the
// check as PASSED with the evidence "Task has no allowedFiles." — so the
// documented way to switch off scope enforcement is to delete the scope list,
// and the gate calls the result a pass.
//
// That is the defect class again: VSP012 says "Changed files are inside task
// scope" while testing something else entirely, because there is no scope for
// anything to be inside of.
// =========================================================================

async function gitBaseline(rootPath: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: rootPath });
  await execFileAsync("git", ["add", "."], { cwd: rootPath });
  await execFileAsync(
    "git",
    ["-c", "user.email=visp@example.test", "-c", "user.name=Visp Test", "commit", "-m", "baseline"],
    { cwd: rootPath }
  );
}

const taskGraphPath = (): string =>
  path.join(tempDir, ".visp", "features", "001-add-note-pinning", "task-graph.json");

async function setTaskScope(scope: {
  readonly allowedFiles: readonly string[];
  readonly expectedFiles?: readonly string[];
}): Promise<void> {
  const graph = JSON.parse(await readFile(taskGraphPath(), "utf8"));
  graph.tasks[0] = {
    ...graph.tasks[0],
    allowedFiles: [...scope.allowedFiles],
    ...(scope.expectedFiles === undefined ? {} : { expectedFiles: [...scope.expectedFiles] })
  };
  await writeFile(taskGraphPath(), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
}

/** A complete project, on a git baseline, with one out-of-scope source edit. */
async function projectWithOutOfScopeEdit(): Promise<void> {
  await createPhase8Fixture(tempDir);
  await gitBaseline(tempDir);

  const program = createCli({ writeOut: () => undefined });
  await program.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);

  // The fixture's T001 allows src/notes.ts. Edit something else.
  await writeFile(
    path.join(tempDir, "src", "unrelated.ts"),
    "export const unrelated = true;\n",
    "utf8"
  );
}

async function implementCheck(ruleId: string): Promise<{
  passed: boolean | undefined;
  evidence: string | undefined;
  allowed: boolean;
}> {
  const result = expectOk(
    await evaluateGate({
      targetPath: tempDir,
      stage: "implement",
      taskId: "T001",
      strictness: "strict",
      dryRun: true,
      now: NOW
    })
  );
  // A rule that failed anywhere in the evaluation is a failure, even if
  // another check carrying the same id passed.
  const failure = result.failedRules.find((item) => item.ruleId === ruleId);
  return {
    passed: failure === undefined && result.passedRules.includes(ruleId),
    evidence: failure?.evidence,
    allowed: result.allowed
  };
}

describe("VSP012 reports on scope that was actually declared", () => {
  it("blocks an edit outside a declared scope", async () => {
    // The premise for everything below: with a real scope, the rule works.
    await projectWithOutOfScopeEdit();
    await setTaskScope({ allowedFiles: ["src/notes.ts"] });

    const check = await implementCheck("VSP012");
    expect(
      check.passed,
      "Premise broken: VSP012 no longer blocks a genuine out-of-scope edit."
    ).toBe(false);
    expect(check.allowed).toBe(false);
  });

  it("does not turn the same edit into a pass when the whole scope is deleted", async () => {
    // Byte-for-byte the same edit as above. The ONLY difference is that the
    // task no longer declares which files it may touch. If that flips a block
    // into a pass, then deleting the constraint deletes the check — and the
    // gate reports success for work it never examined.
    await projectWithOutOfScopeEdit();
    await setTaskScope({ allowedFiles: [], expectedFiles: [] });

    const check = await implementCheck("VSP012");
    expect(
      check.passed,
      "Deleting the file scope converted a blocked edit into a passing one. Removing the declared " +
        "scope must never be a way to obtain permission."
    ).toBe(false);
    expect(
      check.evidence,
      "The evidence must say the scope was never declared, not that the files were outside it — " +
        "those are different problems with different repairs."
    ).toMatch(/declares no allowed or expected file paths/iu);
  });

  it("does not grant permission when only allowedFiles is emptied", async () => {
    // The narrower escalation: leave expectedFiles in place so a scope still
    // exists, and empty only the allow list. The block must survive; it is
    // simply reported as out-of-scope rather than undeclared.
    await projectWithOutOfScopeEdit();
    await setTaskScope({ allowedFiles: [] });

    const check = await implementCheck("VSP012");
    expect(check.passed, "Emptying allowedFiles alone granted permission for the edit.").toBe(
      false
    );
  });

  it("treats a scope that is still the TBD placeholder as undeclared", async () => {
    // What `visp-kit tasks` actually generates. It did block, but reported the
    // agent's file as out of scope — when the real problem is that nobody has
    // written the scope yet.
    await projectWithOutOfScopeEdit();
    await setTaskScope({ allowedFiles: ["TBD"], expectedFiles: ["TBD"] });

    const check = await implementCheck("VSP012");
    expect(check.passed).toBe(false);
    expect(check.evidence).toMatch(/declares no allowed or expected file paths/iu);
  });

  it("passes when the change is inside the declared scope", async () => {
    // The converse, so that 'fix' cannot mean 'block everything'.
    await createPhase8Fixture(tempDir);
    await gitBaseline(tempDir);

    const program = createCli({ writeOut: () => undefined });
    await program.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);
    await setTaskScope({ allowedFiles: ["src/notes.ts"] });
    await writeFile(
      path.join(tempDir, "src", "notes.ts"),
      `${await readFile(path.join(tempDir, "src", "notes.ts"), "utf8")}\n// in scope\n`,
      "utf8"
    );

    const check = await implementCheck("VSP012");
    expect(check.passed, "VSP012 blocked an edit that is inside the declared scope.").toBe(true);
  });

  it("passes with no declared scope when nothing has been changed", async () => {
    // An undeclared scope is only a problem once there is work to judge. A
    // task that has not touched anything must not be reported as a violation:
    // that would make the gate noisy exactly when it has nothing to say.
    await createPhase8Fixture(tempDir);
    await gitBaseline(tempDir);

    const program = createCli({ writeOut: () => undefined });
    await program.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);
    await setTaskScope({ allowedFiles: [], expectedFiles: [] });

    const check = await implementCheck("VSP012");
    expect(check.passed, "VSP012 reported a scope violation with no source changes at all.").toBe(
      true
    );
  });
});
