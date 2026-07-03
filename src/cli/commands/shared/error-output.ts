import { type VispError } from "../../../core/errors.js";
import { formatError } from "../../../theme/terminal.js";

export type ErrorOutputInput = {
  readonly error: VispError;
  readonly json: boolean;
  readonly writeOut: (value: string) => void;
  readonly writeErr: (value: string) => void;
};

export function writeWorkflowError(input: ErrorOutputInput): void {
  if (input.json) {
    input.writeOut(
      `${JSON.stringify(
        {
          success: false,
          error: input.error.message,
          ...(input.error.recovery === undefined ? {} : { recovery: input.error.recovery })
        },
        null,
        2
      )}\n`
    );
    return;
  }

  const recovery =
    input.error.recovery === undefined ? "" : `\nRecover: run \`${input.error.recovery}\``;

  input.writeErr(`${formatError(input.error.message)}${recovery}\n`);
}
