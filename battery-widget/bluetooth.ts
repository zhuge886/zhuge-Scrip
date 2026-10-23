// ---------------------------------------------------------------------------
// LIMITED support: standard BLE Battery Service (0x180F / 0x2A19).
//
// IMPORTANT SCOPE / iOS LIMITS (verified against Scripting's Bluetooth docs,
// which wrap Core Bluetooth = BLE central only):
//   * This can ONLY read devices that expose the *standard* GATT Battery
//     Service and are reachable by a third-party BLE central
//     (some bands / watches / BLE mice-keyboards / certain BLE headphones).
//   * It CANNOT read AirPods (Apple proprietary, not a public GATT service)
//     or classic (non-BLE) Bluetooth audio devices. Those simply won't appear.
//   * Must run in an interactive context (index.tsx) or an app-intent, never
//     inside widget.tsx (widgets are one-shot and can't reliably scan).
//   * First use triggers the system Bluetooth permission prompt.
// Any failure degrades to "no items" — it never fabricates a level.
// ---------------------------------------------------------------------------
import { BluetoothCentralManager } from "scripting"
import {
  BATTERY_LEVEL_CHAR_UUID,
  BATTERY_SERVICE_UUID,
  BatteryItem,
  Settings,
} from "./model"

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)
    ),
  ])
}

function symbolForName(name: string): string {
  const n = name.toLowerCase()
  if (n.includes("watch")) return "applewatch"
  if (n.includes("pods") || n.includes("buds") || n.includes("head") || n.includes("phone"))
    return "headphones"
  if (n.includes("key")) return "keyboard"
  if (n.includes("mouse") || n.includes("trackpad")) return "magicmouse"
  if (n.includes("pencil")) return "applepencil"
  return "antenna.radiowaves.left.and.right"
}

/** 0x2A19 is a single uint8 0..100. Returns 0..1 or null. */
function parseBatteryLevel(bytes: number[] | null | undefined): number | null {
  if (!bytes || bytes.length === 0) return null
  const pct = bytes[0]
  if (typeof pct !== "number" || pct < 0 || pct > 100) return null
  return pct / 100
}

/**
 * Read battery from already system-connected BLE peripherals that publish the
 * standard Battery Service. Safe to call from index.tsx / app_intents.tsx.
 */
export async function readBleBatteries(settings: Settings): Promise<BatteryItem[]> {
  if (!settings.enableBle) return []
  const out: BatteryItem[] = []

  let peripherals: Awaited<ReturnType<typeof BluetoothCentralManager.retrieveConnectedPeripherals>>
  try {
    peripherals = await withTimeout(
      BluetoothCentralManager.retrieveConnectedPeripherals([BATTERY_SERVICE_UUID]),
      6000,
      "retrieveConnectedPeripherals"
    )
  } catch {
    return []
  }

  for (const p of peripherals ?? []) {
    const name = p.name ?? "BLE Device"
    try {
      await withTimeout(BluetoothCentralManager.connect(p), 6000, "connect")
      await withTimeout(p.discoverServices([BATTERY_SERVICE_UUID]), 6000, "discoverServices")
      const service = (p.services ?? []).find(
        (s: any) => s.uuid.toUpperCase().includes(BATTERY_SERVICE_UUID)
      )
      if (!service) throw new Error("no battery service")

      await withTimeout(
        p.discoverCharacteristics(service, [BATTERY_LEVEL_CHAR_UUID]),
        6000,
        "discoverCharacteristics"
      )
      const char = (service.characteristics ?? []).find(
        (c: any) => c.uuid.toUpperCase().includes(BATTERY_LEVEL_CHAR_UUID)
      )
      if (!char || !char.properties.includes("read")) throw new Error("no readable 0x2A19")

      const value: any = await withTimeout(p.readValue(char), 6000, "readValue")
      const level = parseBatteryLevel(value?.toIntArray())

      out.push({
        id: p.id,
        name,
        kind: "ble",
        symbol: symbolForName(name),
        level,
        charge: "unknown",
        connected: true,
        updatedAt: Date.now(),
        note: level == null ? "battery level unreadable" : undefined,
      })
    } catch (e) {
      // Device is connected but we couldn't read a level — record honestly.
      out.push({
        id: p.id,
        name,
        kind: "ble",
        symbol: symbolForName(name),
        level: null,
        charge: "unknown",
        connected: true,
        updatedAt: Date.now(),
        note: "no standard battery service",
      })
    } finally {
      try {
        await BluetoothCentralManager.disconnect(p)
      } catch {
        /* ignore */
      }
    }
  }

  return out
}
