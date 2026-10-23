// ---------------------------------------------------------------------------
// Persistence helpers built on the Storage API (synchronous get/set).
// Storage is per-project-private, so index.tsx, widget.tsx and
// app_intents.tsx of THIS project all read/write the same values.
// ---------------------------------------------------------------------------
import { attempt, report, resolveDiagnostic } from "./diagnostics"
// Storage 是 Scripting 全局 API，不从 "scripting" 模块导入。
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
  return attempt("设置读取", () => {
    const saved = Storage.get<Partial<Settings>>(STORAGE_KEYS.settings)
    if (saved == null) return { ...DEFAULT_SETTINGS }
    if (typeof saved !== "object" || Array.isArray(saved)) throw new Error("设置数据格式无效")
    const next = { ...DEFAULT_SETTINGS }
    for (const key of ["enableBle", "hideOffline", "showAirpodsPlaceholder", "showDeviceNames"] as const) {
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
  if (!Storage.set(key, value)) throw new Error(`无法保存：${key}`)
}
export function saveSettings(settings: Settings): boolean {
  return attempt("设置保存", () => { write(STORAGE_KEYS.settings, settings); return true }, false)
}
export function clearSnapshot(): boolean {
  return attempt("清除配件缓存", () => { Storage.remove(STORAGE_KEYS.snapshot); resolveDiagnostic("配件缓存读取"); resolveDiagnostic("配件缓存校验"); return true }, false)
}

export function loadSnapshot(): Snapshot | null {
  return attempt("配件缓存读取", () => {
    const snap = Storage.get<Snapshot>(STORAGE_KEYS.snapshot)
    if (snap == null) return null
    if (snap.version !== SNAPSHOT_VERSION || !Number.isFinite(snap.builtAt) || !Array.isArray(snap.items)) {
      throw new Error("配件缓存格式无效")
    }
    resolveDiagnostic("配件缓存校验")
    const items = snap.items.slice(0, 64).filter(it => {
      const valid = it != null && typeof it === "object" &&
        typeof it.id === "string" && typeof it.name === "string" && typeof it.symbol === "string" &&
        ["ble", "airpods", "other"].includes(it.kind) &&
        ["unknown", "full", "charging", "unplugged"].includes(it.charge) &&
        typeof it.connected === "boolean" && Number.isFinite(it.updatedAt) &&
        (it.level === null || (typeof it.level === "number" && Number.isFinite(it.level) && it.level >= 0 && it.level <= 1))
      if (!valid) report("配件缓存校验", "缓存设备字段无效")
      return valid
    })
    return { ...snap, items }
  }, null)
}

export function saveSnapshot(items: Snapshot["items"]): Snapshot {
  const snap: Snapshot = { version: SNAPSHOT_VERSION, builtAt: Date.now(), items }
  try {
    write(STORAGE_KEYS.snapshot, snap)
    resolveDiagnostic("配件缓存保存")
    return snap
  } catch (error) { report("配件缓存保存", error); throw error }
}
