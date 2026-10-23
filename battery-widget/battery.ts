// ---------------------------------------------------------------------------
// iPhone battery, read synchronously. Native getter failures become unknown.
// Uses the verified Device API:
//   Device.batteryLevel  -> number 0.0..1.0  (or -1 if undetermined)
//   Device.batteryState  -> "full" | "charging" | "unplugged" | "unknown"
// ---------------------------------------------------------------------------
import { attempt } from "./diagnostics"
import { Device } from "scripting"
import { BatteryItem, ChargeState, DeviceKind } from "./model"

export function readPhoneLevel(): number | null {
  const lvl = attempt("电量读取", () => Device.batteryLevel, -1)
  // iOS returns -1 when the level cannot be determined (e.g. Simulator).
  if (typeof lvl !== "number" || !Number.isFinite(lvl) || lvl < 0) return null
  return Math.max(0, Math.min(1, lvl))
}

export function readPhoneCharge(): ChargeState {
  const s = attempt("充电状态读取", () => Device.batteryState, "unknown")
  if (s === "full" || s === "charging" || s === "unplugged") return s
  return "unknown"
}

/** Pick an SF Symbol that mirrors iOS's own battery glyphs. */
export function phoneSymbol(level: number | null, charge: ChargeState): string {
  if (charge === "charging") return "battery.100.bolt"
  if (level == null) return "battery.0"
  if (level >= 0.9) return "battery.100"
  if (level >= 0.6) return "battery.75"
  if (level >= 0.35) return "battery.50"
  if (level >= 0.1) return "battery.25"
  return "battery.0"
}

export function buildPhoneItem(): BatteryItem {
  const level = readPhoneLevel()
  const charge = readPhoneCharge()
  const kind: DeviceKind = "phone"
  const isiPad = attempt("设备类型读取", () => Device.isiPad, false)
  return {
    id: "phone",
    name: isiPad ? "iPad" : "iPhone",
    kind,
    symbol: isiPad ? "ipad" : "iphone",
    level,
    charge,
    connected: true,
    updatedAt: Date.now(),
  }
}

/** "87%" or "--" — never fabricates a value. */
export function formatPercent(level: number | null): string {
  if (level == null) return "--"
  return `${Math.round(level * 100)}%`
}
