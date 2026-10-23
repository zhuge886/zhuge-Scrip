// ---------------------------------------------------------------------------
// Persistence helpers built on the Storage API (synchronous get/set).
// Storage is per-project-private, so index.tsx, widget.tsx and
// app_intents.tsx of THIS project all read/write the same values.
// ---------------------------------------------------------------------------
import { attempt, report } from "./diagnostics"
import { Storage } from "scripting"
import {
  DEFAULT_SETTINGS,
  Settings,
  Snapshot,
  SNAPSHOT_VERSION,
  STORAGE_KEYS,
} from "./model"

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value))) : fallback
}

export function loadSettings(): Settings {
  return attempt("Storage settings", () => {
    const saved = Storage.get<Partial<Settings>>(STORAGE_KEYS.settings)
    if (saved == null) return { ...DEFAULT_SETTINGS }
    if (typeof saved !== "object" || Array.isArray(saved)) throw new Error("Invalid settings")
    const next = { ...DEFAULT_SETTINGS }
    for (const key of ["enableBle", "hideOffline", "showAirpodsPlaceholder"] as const) {
      if (typeof saved[key] === "boolean") next[key] = saved[key]
    }
    next.maxItems = bounded(saved.maxItems, next.maxItems, 1, 4)
    next.staleMinutes = bounded(saved.staleMinutes, next.staleMinutes, 15, 720)
    next.lowPercent = bounded(saved.lowPercent, next.lowPercent, 0, 100)
    next.midPercent = bounded(saved.midPercent, next.midPercent, next.lowPercent, 100)
    return next
  }, { ...DEFAULT_SETTINGS })
}

function write<T>(key: string, value: T): void {
  // Storage.set returns false on failure as well as potentially throwing.
  attempt("Storage write", () => {
    if (!Storage.set(key, value)) throw new Error(`Could not save ${key}`)
  }, undefined)
}
export function saveSettings(settings: Settings): void { write(STORAGE_KEYS.settings, settings) }

export function loadSnapshot(): Snapshot | null {
  return attempt("Storage snapshot", () => {
    const snap = Storage.get<Snapshot>(STORAGE_KEYS.snapshot)
    if (snap == null) return null
    if (snap.version !== SNAPSHOT_VERSION || !Number.isFinite(snap.builtAt) || !Array.isArray(snap.items)) {
      throw new Error("Invalid snapshot")
    }
    const items = snap.items.filter(it => {
      const valid = it != null && typeof it === "object" &&
        typeof it.id === "string" && typeof it.name === "string" && typeof it.symbol === "string" &&
        ["ble", "airpods", "other"].includes(it.kind) &&
        ["unknown", "full", "charging", "unplugged"].includes(it.charge) &&
        typeof it.connected === "boolean" && Number.isFinite(it.updatedAt) &&
        (it.level === null || (typeof it.level === "number" && Number.isFinite(it.level) && it.level >= 0 && it.level <= 1))
      if (!valid) report("Storage snapshot", "Ignored malformed cached device")
      return valid
    })
    return { ...snap, items }
  }, null)
}

export function saveSnapshot(items: Snapshot["items"]): Snapshot {
  const snap: Snapshot = { version: SNAPSHOT_VERSION, builtAt: Date.now(), items }
  write(STORAGE_KEYS.snapshot, snap)
  return snap
}
