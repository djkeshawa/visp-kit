export type CapturedOutput = {
  readonly value: string;
  readonly truncated: boolean;
};

export const defaultOutputLimit = 8000;

export function captureOutput(value: string, limit = defaultOutputLimit): CapturedOutput {
  if (value.length <= limit) {
    return { value, truncated: false };
  }

  return {
    value: value.slice(value.length - limit),
    truncated: true
  };
}
