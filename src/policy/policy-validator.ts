import { type ZodError } from "zod";

import {
  policyArtifactSchema,
  type PolicyArtifact
} from "../artifacts/schemas/policy.schema.js";

export type PolicyValidation = {
  readonly passed: boolean;
  readonly errors: readonly string[];
};

function issuePath(path: readonly (string | number)[]): string {
  return path.length > 0 ? path.map(String).join(".") : "(root)";
}

function zodErrors(error: ZodError): readonly string[] {
  return error.issues.map((issue) => `${issuePath(issue.path)}: ${issue.message}`);
}

export function validatePolicyArtifact(value: unknown): PolicyValidation & {
  readonly value?: PolicyArtifact;
} {
  const parsed = policyArtifactSchema.safeParse(value);

  if (!parsed.success) {
    return {
      passed: false,
      errors: zodErrors(parsed.error)
    };
  }

  return {
    passed: true,
    errors: [],
    value: parsed.data
  };
}
