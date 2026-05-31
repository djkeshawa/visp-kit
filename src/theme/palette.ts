export const palette = {
  ink: "#1F2937",
  muted: "#6B7280",
  surface: "#FFFFFF",
  surfaceSoft: "#FBFBFF",
  sky: "#BFD7FF",
  lavender: "#D7C7FF",
  rose: "#FFD0DC",
  mint: "#BDEAD7",
  amber: "#FFE6B3",
  success: "#7DD6B4",
  warning: "#F6D58A",
  danger: "#F3A6B5"
} as const;

export type Palette = typeof palette;
export type PaletteKey = keyof Palette;
