#!/usr/bin/env node
/**
 * Fill the generated planning artifacts of the benchmark/dogfood fixture with
 * concrete, validating content.
 *
 * WHY THIS EXISTS. `clarify`, `spec`, `plan` and `tasks` generate templates full
 * of `TBD` and then validate them hard — a template is not a plan, and since
 * "make clarify fail hard" the commands exit non-zero until a human or an agent
 * fills them in. That is correct behaviour and this script does not soften it:
 * it plays the part of the agent, deterministically and with no LLM, so a
 * reader can run the documented reproduction end to end.
 *
 * Before this existed both shell scripts ran `clarify` and marched on. Under
 * `set -e` they had been dead at the first stage for as long as the hard
 * validation has been in place, and nothing noticed because nothing ran them
 * from a clean clone.
 *
 * The content below mirrors `tests/integration/phase8-fixture.ts`, which the
 * integration suite exercises on every run — so when a schema gains a required
 * field, the suite fails there first and this file has a known-good model to
 * follow.
 *
 * Usage: node scripts/benchmark-fixture-artifacts.mjs <stage> <feature-dir>
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [, , stage, featureDir] = process.argv;

if (typeof stage !== "string" || typeof featureDir !== "string") {
  console.error("Usage: benchmark-fixture-artifacts.mjs <stage> <feature-dir>");
  process.exit(2);
}

function updateJson(fileName, update) {
  const filePath = path.join(featureDir, fileName);
  const value = JSON.parse(readFileSync(filePath, "utf8"));
  update(value);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const acceptanceCriterion = {
  id: "AC001",
  requirementId: "REQ001",
  description:
    "Pinning a note places it before unpinned notes and unpinning restores ordinary ordering.",
  testable: true,
  validationMethod: "unit"
};

const stages = {
  clarifications() {
    updateJson("clarifications.json", (artifact) => {
      artifact.questions[0].question = "Should pinned notes sort before unpinned notes?";
      artifact.questions[0].recommendedDefault = "Pinned notes sort first.";
      artifact.questions[0].reason = "Ordering affects observable behavior.";
    });
  },

  spec() {
    updateJson("spec.json", (spec) => {
      spec.status = "ready";
      spec.userStories[0] = {
        id: "US001",
        title: "Pin note",
        actor: "user",
        capability: "pin a note",
        outcome: "important notes appear first"
      };
      spec.requirements[0].title = "Persist note pin state";
      spec.requirements[0].description = "The note helper must preserve explicit pin state.";
      spec.requirements[0].acceptanceCriteria = [acceptanceCriterion];
      spec.acceptanceCriteria = [acceptanceCriterion];
      spec.businessRules = ["Pinned notes appear before unpinned notes."];
      spec.nonFunctionalRequirements = {
        performance: ["Pin operations remain constant time."],
        security: ["Pinning does not alter authorization."],
        accessibility: ["Pin state is represented as data."],
        reliability: ["Unpinning reverses pin state."],
        maintainability: ["Pin behavior has unit coverage."]
      };
      spec.edgeCases = ["Pinning an already pinned note is idempotent."];
      spec.outOfScope = ["Synchronizing pin state across devices."];
    });
  },

  plan() {
    updateJson("plan.json", (plan) => {
      plan.status = "ready";
      plan.evidence = {
        knownFromUser: ["Add note pinning."],
        knownFromSpecification: ["REQ001 and AC001 define pin state."],
        knownFromCodebase: ["src/notes.ts owns the note helper."],
        knownFromConstitution: ["Keep changes small and tested."],
        inferred: ["A boolean field fits the existing note shape."],
        assumed: ["Existing callers tolerate an optional field."],
        unknown: ["No persistence migration is needed for this fixture."]
      };
      plan.affectedModules[0] = {
        moduleOrFileArea: "src/notes.ts",
        reason: "Owns note pin behavior.",
        evidence: "Existing Note and pinNote exports."
      };
      plan.implementationApproach = "Update the note helper and add focused unit coverage.";
      plan.impacts = {
        dataModel: "Optional pinned boolean.",
        api: "Existing helper remains compatible.",
        ui: "No UI work.",
        securityPrivacy: "No access change.",
        performance: "Constant-time update."
      };
      plan.testingStrategy[0] = {
        level: "unit",
        whatToTest: "Pin and unpin behavior.",
        validationCommand: "pnpm test"
      };
      plan.rollbackStrategy = "Revert the optional field and helper change.";
      plan.alternatives[0] = {
        option: "Separate pin index.",
        decision: "rejected",
        reason: "Unnecessary state duplication."
      };
      plan.risks[0] = {
        id: "RISK001",
        description: "Old fixtures omit pinned state.",
        level: "medium",
        mitigation: "Keep the field optional.",
        requirementIds: ["REQ001"]
      };
      plan.decisions[0] = {
        id: "PD001",
        title: "Optional boolean pin state",
        decision: "Store pin state on Note.",
        reason: "Smallest compatible change.",
        evidence: "REQ001; src/notes.ts",
        impacts: "Note type and helper tests.",
        requirementIds: ["REQ001"]
      };
    });
  },

  tasks() {
    updateJson("task-graph.json", (graph) => {
      graph.status = "ready";
      graph.tasks[0] = {
        ...graph.tasks[0],
        title: "Implement note pinning helper",
        description: "Update the note helper and test coverage for pinning.",
        // The out-of-scope proof depends on this list: the benchmark stages an
        // edit to a file that is deliberately not named here.
        allowedFiles: ["src/notes.ts"],
        expectedFiles: ["tests/notes.test.ts"],
        validationCommands: ["pnpm test"],
        status: "ready",
        taskClass: "bounded_feature",
        riskFactors: []
      };
    });
  }
};

const run = stages[stage];

if (run === undefined) {
  console.error(`Unknown stage "${stage}". Expected one of: ${Object.keys(stages).join(", ")}.`);
  process.exit(2);
}

run();
console.log(`fixture: filled ${stage}`);
