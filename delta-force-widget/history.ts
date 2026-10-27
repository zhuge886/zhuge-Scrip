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
/** Cumulative geometry includes a zero origin, not a synthetic daily record. */
export function trendSeries(raw: unknown, now = Date.now()) {
  const points = mergeHistory(raw, null, now)
  if (!points.length) return []
  let total = 0n
  const daily = points.map(point => BigInt(point.value))
  const values = daily.map(value => total += value)
  const min = values.reduce((a, b) => a < b ? a : b, 0n)
  const max = values.reduce((a, b) => a > b ? a : b, 0n)
  const span = max - min
  const largest = daily.reduce((a, b) => a > (b < 0n ? -b : b) ? a : (b < 0n ? -b : b), 0n)
  const normalize = (value: bigint) => span === 0n ? 0.5 : Number((value - min) * 1000000n / span) / 1000000
  return points.map((point, index) => ({
    ...point,
    date: new Date(`${point.day}T00:00:00+08:00`),
    cumulative: String(values[index]),
    sign: daily[index] > 0n ? 1 : daily[index] < 0n ? -1 : 0,
    y: normalize(values[index]),
    originY: normalize(0n),
    bar: largest === 0n ? 0 : Number(daily[index] * 1000000n / largest) / 1000000,
  }))
}
