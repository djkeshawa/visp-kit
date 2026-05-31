import { palette } from "./palette.js";

export type TerminalFormatOptions = {
  readonly color?: boolean;
};

function shouldUseColor(options: TerminalFormatOptions = {}): boolean {
  if (options.color !== undefined) {
    return options.color;
  }

  return process.env.NO_COLOR === undefined && Boolean(process.stdout.isTTY);
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = hex.replace("#", "");

  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}

function colorText(
  value: string,
  hex: string,
  options: TerminalFormatOptions = {}
): string {
  if (!shouldUseColor(options)) {
    return value;
  }

  const [red, green, blue] = hexToRgb(hex);
  return `\u001B[38;2;${red};${green};${blue}m${value}\u001B[0m`;
}

function statusLabel(label: string): string {
  const normalized = label.trim().toLowerCase().replaceAll(/\s+/g, "-");
  return normalized.length > 0 ? normalized : "status";
}

export function formatHeader(
  title = "Visp Kit",
  options: TerminalFormatOptions = {}
): string {
  return colorText(`∞ ${title}`, palette.lavender, options);
}

export function formatKeyValue(
  label: string,
  value: string,
  options: TerminalFormatOptions = {}
): string {
  return `${colorText(label, palette.muted, options)}: ${value}`;
}

export function formatStatus(
  label: string,
  options: TerminalFormatOptions = {}
): string {
  return colorText(`[${statusLabel(label)}]`, palette.sky, options);
}

export function formatSuccess(
  message: string,
  options: TerminalFormatOptions = {}
): string {
  return `${colorText("[ready]", palette.success, options)} ${message}`;
}

export function formatWarning(
  message: string,
  options: TerminalFormatOptions = {}
): string {
  return `${colorText("[needs-clarification]", palette.warning, options)} ${message}`;
}

export function formatError(
  message: string,
  options: TerminalFormatOptions = {}
): string {
  return `${colorText("[error]", palette.danger, options)} ${message}`;
}

export function formatMuted(
  message: string,
  options: TerminalFormatOptions = {}
): string {
  return colorText(message, palette.muted, options);
}
