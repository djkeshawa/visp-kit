export type CompactValidationResult = {
  readonly passed: boolean;
  readonly ruleCount: number;
  readonly errors: readonly string[];
};

const compactRulePattern = /^(C\d{3}):\s*(.*)$/;

function expectedId(index: number): string {
  return `C${String(index + 1).padStart(3, "0")}`;
}

export function validateCompactConstitution(
  contents: string
): CompactValidationResult {
  const lines = contents.split(/\r?\n/);
  const ids = new Set<string>();
  const texts = new Set<string>();
  const errors: string[] = [];
  let ruleCount = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();

    if (line.length === 0) {
      continue;
    }

    const expected = expectedId(ruleCount);
    const match = compactRulePattern.exec(line);

    if (match === null || match[1] !== expected) {
      errors.push(
        `Invalid rule ID at line ${lineIndex + 1}. Expected format ${expected}: <rule text>.`
      );

      if (match === null) {
        continue;
      }
    }

    const id = match[1];
    const text = match[2].trim();

    if (ids.has(id)) {
      errors.push(`Duplicate rule ID ${id}.`);
    }

    if (text.length === 0) {
      errors.push(`Rule ${id} has empty text.`);
    }

    if (texts.has(text)) {
      errors.push(`Duplicate rule text at ${id}.`);
    }

    ids.add(id);
    texts.add(text);
    ruleCount += 1;
  }

  if (ruleCount === 0) {
    errors.push("Compact constitution must contain at least one rule.");
  }

  return {
    passed: errors.length === 0,
    ruleCount,
    errors
  };
}
