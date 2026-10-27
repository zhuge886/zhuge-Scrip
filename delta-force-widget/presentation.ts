import { object } from "./model"
import { trendSeries } from "./history"
import type { Color } from "scripting"

export type ThemeMode = "system" | "light" | "dark" | "transparent"
export function themeParameter(raw: unknown): ThemeMode {
  if (typeof raw !== "string") return "system"
  const text = raw.trim().toLowerCase()
  const valid = (v: unknown): v is ThemeMode => ["system", "light", "dark", "transparent"].includes(String(v))
  if (valid(text)) return text
  try {
    const p = object(JSON.parse(raw))
    if (p.background === "transparent") return "transparent"
    return valid(p.theme) ? p.theme : valid(p.background) ? p.background : "system"
  } catch { return "system" }
}
export function widgetTheme(mode: ThemeMode = "system", appearance: "light" | "dark" = "light") {
  const dark = mode === "dark" || mode !== "light" && appearance === "dark"
  return {
    dark, transparent: mode === "transparent",
    text: dark ? "#F2F4F8" : "#181D27",
    muted: dark ? "#AFB8C8" : "#606B7C",
    gain: dark ? "#FF7E87" : "#CF2538",
    loss: dark ? "#6CD4A2" : "#18794F",
    neutral: dark ? "#B1BAC9" : "#59677C",
    base: dark ? "#202733" : "#F0F3F9",
    surface: (dark ? ["#2B3341", "#222A38"] : ["#FAFBFE", "#EAF0F9"]) as Color[],
    highlight: (dark ? ["rgba(255,255,255,0.13)", "rgba(255,255,255,0.025)"]
      : ["rgba(255,255,255,0.90)", "rgba(255,255,255,0.20)"]) as Color[],
    grid: dark ? "rgba(180,195,220,0.10)" : "rgba(110,132,164,0.10)",
  } as const
}
export type WidgetTheme = ReturnType<typeof widgetTheme>
export type TrendPoint = ReturnType<typeof trendSeries>[number]
export function trendStats(series: TrendPoint[]) {
  return { count: series.length, up: series.filter(p => p.sign > 0).length,
    down: series.filter(p => p.sign < 0).length, zero: series.filter(p => p.sign === 0).length }
}
export function signColor(sign: number, theme: WidgetTheme) {
  return sign > 0 ? theme.gain : sign < 0 ? theme.loss : theme.neutral
}
/** Shared, testable native-canvas geometry. Only real observations have dates/bars. */
export function trendGeometry(series: TrendPoint[], width: number, height: number, small = false) {
  const w = Math.max(16, Number.isFinite(width) ? width : 16)
  const h = Math.max(24, Number.isFinite(height) ? height : 24)
  const left = 4, right = w - 5, top = 5
  const labelHeight = h >= 64 ? 13 : 0
  const barHalf = Math.max(3, Math.min(small ? 6 : 9, h * 0.10))
  const barZero = h - labelHeight - barHalf - 3
  const plotBottom = Math.max(top + 2, barZero - barHalf - 8)
  if (!series.length) return { points: [], origin: { x: left, y: plotBottom / 2 }, plotBottom, barZero, labelHeight, barHalf }
  const first = series[0].date.getTime(), last = series[series.length - 1].date.getTime()
  const days = (last - first) / 86400000
  const y = (value: number) => plotBottom - value * (plotBottom - top)
  const points = series.map(point => ({ ...point,
    x: left + (right - left) * (((point.date.getTime() - first) / 86400000 + 1) / (days + 1)),
    cy: y(point.y), barHeight: Math.abs(point.bar) * barHalf,
  }))
  return { points, origin: { x: left, y: y(series[0].originY) }, plotBottom, barZero, labelHeight, barHalf }
}
/** SF digits fit without ellipses; full exact amounts are still passed to Text. */
export function amountFont(text: string, width: number, preferred: number) {
  const units = [...text].reduce((n, ch) => n + (ch === "," ? 0.26 : ch === "+" || ch === "−" ? 0.6 : 0.59), 0)
  return Math.max(1, Math.min(preferred, width / Math.max(units, 1)))
}
