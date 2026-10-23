// ---------------------------------------------------------------------------
// Shared data model + constants.
// No Scripting API calls here, so this file is safe to import from every
// environment (index.tsx / widget.tsx / app_intents.tsx).
// ---------------------------------------------------------------------------

/** How a device connects / how its battery is sourced. */
export type DeviceKind = "phone" | "ble" | "airpods" | "other"

/** Charging state, aligned with Device.BatteryState plus an "unknown". */
export type ChargeState = "full" | "charging" | "unplugged" | "unknown"

/**
 * A single battery item shown in the widget.
 * `level` is 0..1, or `null` when it is genuinely unreadable (never faked).
 */
export interface BatteryItem {
  id: string
  name: string
  kind: DeviceKind
  /** SF Symbol name used in the ring center. */
  symbol: string
  /** 0..1, or null when unknown / offline / unsupported. */
  level: number | null
  charge: ChargeState
  connected: boolean
  /** epoch ms when this reading was produced. */
  updatedAt: number
  /** Optional human note, e.g. "not supported by iOS". */
  note?: string
}

/** The snapshot the interactive app / app-intent writes for the widget. */
export interface Snapshot {
  version: number
  /** epoch ms when the whole snapshot was built. */
  builtAt: number
  /** Non-phone items only (phone battery is always read live in the widget). */
  items: BatteryItem[]
}

export interface Settings {
  /** Max number of cells shown in the widget (phone counts as one). */
  maxItems: number
  /** Hide an item instead of showing it as offline once disconnected. */
  hideOffline: boolean
  /** Minutes before a cached BLE reading is considered stale. */
  staleMinutes: number
  /** Try to read standard BLE Battery-Service (0x180F) devices. */
  enableBle: boolean
  /** Battery thresholds (percent) for ring color. */
  lowPercent: number
  midPercent: number
  /**
   * Show an informational AirPods cell that always reads "--".
   * iOS does not expose AirPods battery to third-party scripts, so this cell
   * documents the limitation honestly rather than hiding it.
   */
  showAirpodsPlaceholder: boolean
}

export const SNAPSHOT_VERSION = 1

/** Storage keys (private domain is shared across files of the same project). */
export const STORAGE_KEYS = {
  snapshot: "battery.snapshot.v1",
  settings: "battery.settings.v1",
} as const

export const DEFAULT_SETTINGS: Settings = {
  maxItems: 4,
  hideOffline: false,
  staleMinutes: 60,
  enableBle: true,
  lowPercent: 20,
  midPercent: 40,
  showAirpodsPlaceholder: true,
}

/** Standard GATT UUIDs for the Battery Service. */
export const BATTERY_SERVICE_UUID = "180F"
export const BATTERY_LEVEL_CHAR_UUID = "2A19"
