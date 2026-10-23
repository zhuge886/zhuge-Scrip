// ---------------------------------------------------------------------------
// Colors + thresholds. Colors use system color names and DynamicShapeStyle
// ({ light, dark }) so the widget adapts to light / dark mode automatically.
// ---------------------------------------------------------------------------
import { ChargeState, Settings } from "./model"

/** A value accepted by foregroundStyle / stroke / fill. */
export type ColorValue = string | { light: string; dark: string }

export const COLORS = {
  good: "systemGreen",
  mid: "systemYellow",
  low: "systemRed",
  charging: "systemGreen",
  // Faint ring track.
  track: { light: "systemGray5", dark: "systemGray5" } as ColorValue,
  // Primary / secondary text adapt to color scheme.
  text: { light: "black", dark: "white" } as ColorValue,
  subtext: "secondaryLabel",
  offline: "systemGray",
  cardBg: { light: "systemBackground", dark: "secondarySystemBackground" } as ColorValue,
}

/**
 * Ring / icon color from battery state.
 * charging -> green, else green/yellow/red by thresholds, unknown -> gray.
 */
export function levelColor(
  level: number | null,
  charge: ChargeState,
  settings: Settings
): ColorValue {
  if (charge === "charging") return COLORS.charging
  if (level == null) return COLORS.offline
  const pct = level * 100
  if (pct <= settings.lowPercent) return COLORS.low
  if (pct <= settings.midPercent) return COLORS.mid
  return COLORS.good
}
