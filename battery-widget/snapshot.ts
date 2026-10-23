// ---------------------------------------------------------------------------
// Builds the cached snapshot (interactive / app-intent side) and composes the
// final ordered list the widget renders. Keeps the "phone is live, others are
// cached" split, and never invents levels.
// ---------------------------------------------------------------------------
import { BatteryItem, Settings, Snapshot } from "./model"
import { canReadBle, BLE_UNAVAILABLE } from "./capabilities"
import { report } from "./diagnostics"

/** Informational AirPods cell — permanently "--" (iOS limitation). */
export function airpodsPlaceholder(): BatteryItem {
  return {
    id: "airpods-info",
    name: "AirPods",
    kind: "airpods",
    symbol: "airpods",
    level: null,
    charge: "unknown",
    connected: false,
    updatedAt: Date.now(),
    note: "iOS doesn't expose AirPods battery to third-party scripts",
  }
}

/** Collect everything except the phone (phone is read live in the widget). */
export async function buildSnapshotItems(settings: Settings): Promise<BatteryItem[]> {
  const items: BatteryItem[] = []
  if (settings.showAirpodsPlaceholder) items.push(airpodsPlaceholder())
  if (!settings.enableBle) return items
  if (!canReadBle()) throw new Error(BLE_UNAVAILABLE)
  try {
    const { readBleBatteries } = await import("./bluetooth")
    const ble = await readBleBatteries(settings)
    items.push(...ble)
  } catch (error) {
    report("BLE snapshot", error)
    throw error
  }
  return items
}

const KIND_ORDER: Record<BatteryItem["kind"], number> = {
  phone: 0,
  airpods: 1,
  ble: 2,
  other: 3,
}

function isStale(item: BatteryItem, settings: Settings): boolean {
  return Date.now() - item.updatedAt > settings.staleMinutes * 60_000
}

/**
 * Merge the live phone item with cached snapshot items, apply ordering,
 * staleness and offline rules, and cap to settings.maxItems.
 */
export function composeItems(
  phone: BatteryItem,
  snapshot: Snapshot | null,
  settings: Settings
): BatteryItem[] {
  const cached = snapshot?.items ?? []
  const normalized = cached.map(it => {
    // A stale cached reading is shown as unknown rather than as a fresh value.
    if (it.level != null && isStale(it, settings)) {
      return { ...it, level: null, connected: false, note: "stale" }
    }
    return it
  })

  let all = [phone, ...normalized]

  if (settings.hideOffline) {
    all = all.filter(it => it.kind === "phone" || it.connected)
  }

  all.sort((a, b) => {
    const k = KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    if (k !== 0) return k
    const la = a.level ?? -1
    const lb = b.level ?? -1
    return lb - la
  })

  return all.slice(0, Math.max(1, settings.maxItems))
}
