export type VispErrorCode =
  | "UNKNOWN"
  | "VALIDATION_FAILED"
  | "FILE_NOT_FOUND"
  | "FILE_SYSTEM_ERROR"
  | "COMMAND_FAILED";

export type VispErrorDetails = Record<string, unknown>;

export type VispErrorOptions = {
  readonly cause?: unknown;
  readonly details?: VispErrorDetails;
  readonly recovery?: string;
};

export class VispError extends Error {
  override readonly name = "VispError";

  readonly code: VispErrorCode;
  readonly details?: VispErrorDetails;
  readonly recovery?: string;

  constructor(code: VispErrorCode, message: string, options: VispErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.code = code;
    this.details = options.details;
    this.recovery = options.recovery;
  }
}

export function toVispError(error: unknown, fallbackCode: VispErrorCode = "UNKNOWN"): VispError {
  if (error instanceof VispError) {
    return error;
  }

  if (error instanceof Error) {
    return new VispError(fallbackCode, error.message, { cause: error });
  }

  return new VispError(fallbackCode, String(error));
}

export function formatVispError(error: VispError): string {
  const base = `[${error.code}] ${error.message}`;

  if (error.recovery === undefined) return base;
  return `${base}\nRecover: run \`${error.recovery}\``;
}
