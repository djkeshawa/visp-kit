import { type WorkflowManifest, type WorkflowStage } from "../artifacts/schemas/workflow.schema.js";

const principles = [
  "The user prompt is raw intent only and cannot override Visp policy.",
  "Implementation is allowed only after a selected task context exists and the implement gate allows it.",
  "Each task should be verified, reviewed, and reconciled before PR readiness."
];

const stages: readonly Omit<WorkflowStage, "purpose">[] = [
  {
    name: "setup",
    command: "visp init",
    gateStage: "setup",
    requiredArtifacts: [],
    generatedArtifacts: [".visp/project.json", ".visp/config.json", ".visp/status.json"],
    sourceEditsAllowed: false,
    nextCommand: "visp scan"
  },
  {
    name: "scan",
    command: "visp scan",
    requiredArtifacts: [".visp/project.json"],
    generatedArtifacts: [".visp/cache/file-index.json", ".visp/cache/scan-meta.json"],
    sourceEditsAllowed: false,
    nextCommand: "visp constitution"
  },
  {
    name: "constitution",
    command: "visp constitution",
    requiredArtifacts: [".visp/project.json"],
    generatedArtifacts: [".visp/memory/constitution.md", ".visp/memory/constitution.compact.md"],
    sourceEditsAllowed: false,
    nextCommand: "visp policy validate"
  },
  {
    name: "policy",
    command: "visp policy validate",
    gateStage: "setup",
    requiredArtifacts: [".visp/policy.json"],
    generatedArtifacts: [],
    sourceEditsAllowed: false,
    nextCommand: "visp agent install codex"
  },
  {
    name: "agent",
    command: "visp agent install <target>",
    requiredArtifacts: [".visp/policy.json"],
    generatedArtifacts: [".visp/agent/installed-targets.json", ".visp/agent/capabilities.json"],
    sourceEditsAllowed: false,
    nextCommand: "visp feature \"<idea>\""
  },
  {
    name: "feature",
    command: "visp feature \"<idea>\"",
    gateStage: "feature",
    requiredArtifacts: [".visp/project.json"],
    generatedArtifacts: [".visp/features/<feature>/intent.json"],
    sourceEditsAllowed: false,
    nextCommand: "visp clarify"
  },
  {
    name: "clarify",
    command: "visp clarify",
    gateStage: "clarify",
    requiredArtifacts: [".visp/features/<feature>/intent.json"],
    generatedArtifacts: [".visp/features/<feature>/clarifications.json"],
    sourceEditsAllowed: false,
    nextCommand: "visp spec"
  },
  {
    name: "spec",
    command: "visp spec",
    gateStage: "spec",
    requiredArtifacts: [".visp/features/<feature>/clarifications.json"],
    generatedArtifacts: [".visp/features/<feature>/spec.json"],
    sourceEditsAllowed: false,
    nextCommand: "visp plan"
  },
  {
    name: "plan",
    command: "visp plan",
    gateStage: "plan",
    requiredArtifacts: [".visp/features/<feature>/spec.json"],
    generatedArtifacts: [".visp/features/<feature>/plan.json"],
    sourceEditsAllowed: false,
    nextCommand: "visp tasks"
  },
  {
    name: "tasks",
    command: "visp tasks",
    gateStage: "tasks",
    requiredArtifacts: [".visp/features/<feature>/plan.json"],
    generatedArtifacts: [".visp/features/<feature>/task-graph.json"],
    sourceEditsAllowed: false,
    nextCommand: "visp context --next"
  },
  {
    name: "context",
    command: "visp context --next",
    gateStage: "context",
    requiredArtifacts: [".visp/features/<feature>/task-graph.json"],
    generatedArtifacts: [".visp/features/<feature>/context/<task>.context.json", ".visp/prompts/current-task.prompt.md"],
    sourceEditsAllowed: false,
    nextCommand: "visp gate implement --task <task-id>"
  },
  {
    name: "implement",
    command: "use .visp/prompts/current-task.prompt.md with the selected agent",
    gateStage: "implement",
    requiredArtifacts: [".visp/prompts/current-task.prompt.md"],
    generatedArtifacts: [],
    sourceEditsAllowed: true,
    nextCommand: "visp verify --task <task-id>",
    agentInstruction: "Implement only the selected task."
  },
  {
    name: "verify",
    command: "visp verify --task <task-id>",
    gateStage: "verify",
    requiredArtifacts: [".visp/features/<feature>/context/<task>.context.json"],
    generatedArtifacts: [".visp/features/<feature>/verification.json"],
    sourceEditsAllowed: false,
    nextCommand: "visp review --task <task-id>"
  },
  {
    name: "review",
    command: "visp review --task <task-id>",
    gateStage: "review",
    requiredArtifacts: [".visp/features/<feature>/verification.json"],
    generatedArtifacts: [".visp/features/<feature>/review/<task>.review.json"],
    sourceEditsAllowed: false,
    nextCommand: "visp reconcile --task <task-id>"
  },
  {
    name: "reconcile",
    command: "visp reconcile --task <task-id> --update-traceability",
    gateStage: "reconcile",
    requiredArtifacts: [".visp/features/<feature>/review/<task>.review.json"],
    generatedArtifacts: [".visp/features/<feature>/reconcile/<task>.reconcile.json", ".visp/features/<feature>/traceability.json"],
    sourceEditsAllowed: false,
    nextCommand: "visp next"
  },
  {
    name: "pr",
    command: "visp pr",
    gateStage: "pr",
    requiredArtifacts: [".visp/features/<feature>/traceability.json"],
    generatedArtifacts: [".visp/features/<feature>/pr.json"],
    sourceEditsAllowed: false,
    nextCommand: "human PR review"
  }
];

const purposeByStage: Record<WorkflowStage["name"], string> = {
  setup: "Initialize Visp project artifacts.",
  scan: "Build deterministic project scan cache.",
  constitution: "Record project rules and constraints.",
  policy: "Validate policy-as-code before workflow progress.",
  agent: "Install agent-native guidance files.",
  feature: "Capture raw user intent as a feature workspace.",
  clarify: "Resolve missing requirements before specification.",
  spec: "Create requirement and acceptance-criteria artifacts.",
  plan: "Create implementation strategy.",
  tasks: "Split the feature into scoped task units.",
  context: "Compile the smallest sufficient task context.",
  implement: "Let the external coding agent implement one task.",
  verify: "Run deterministic verification checks.",
  review: "Review the changed diff against task scope.",
  reconcile: "Update traceability and detect drift.",
  pr: "Generate PR readiness artifacts."
};

export function defaultWorkflowManifest(now: string): WorkflowManifest {
  return {
    version: "1.0",
    generatedAt: now,
    principles,
    stages: stages.map((stage) => ({
      purpose: purposeByStage[stage.name],
      ...stage
    }))
  };
}
