import { amount, normalizeDay, object, ProfitPoint } from "./model"

const DAY_MS = 86400000
export function historyWindow(now = Date.now()): { from: string; to: string } {
  const to = new Date(now + 8 * 3600000).toISOString().slice(0, 10)
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10)
  return { from, to }
}
/** Actual report dates only; missing days remain absent, never synthetic zeroes. */
export function mergeHistory(raw: unknown, point: ProfitPoint | null, now = Date.now()): ProfitPoint[] {
  const { from, to } = historyWindow(now)
  const days = new Map<string, ProfitPoint>()
  for (const entry of [...(Array.isArray(raw) ? raw : []), ...(point ? [point] : [])]) {
    const row = object(entry), day = normalizeDay(row.day)
    if (!day || day < from || day > to) continue
    try { days.set(day, { day, value: amount(row.value) }) } catch { /* Ignore an invalid cache row. */ }
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day))
}
/** Normalize only chart geometry; retain exact integer text for monetary labels. */
export function trendSeries(raw: unknown, now = Date.now()) {
  const points = mergeHistory(raw, null, now)
  if (!points.length) return []
  const values = points.map(point => BigInt(point.value))
  const min = values.reduce((a, b) => a < b ? a : b)
  const max = values.reduce((a, b) => a > b ? a : b)
  const span = max - min
  return points.map((point, index) => ({
    day: point.day,
    date: new Date(`${point.day}T00:00:00+08:00`),
    y: span === 0n ? 0.5 : Number((values[index] - min) * 1000000n / span) / 1000000,
  }))
}
