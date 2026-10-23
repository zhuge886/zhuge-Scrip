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
// Failures are reported to the caller; unknown levels are never fabricated.
// ---------------------------------------------------------------------------
import { canReadBle, BLE_UNAVAILABLE } from "./capabilities"
import { report, resolveDiagnostic } from "./diagnostics"
import { withTimeout } from "./async"
// BluetoothCentralManager 是宿主全局 API。
import {
  BATTERY_LEVEL_CHAR_UUID,
  BATTERY_SERVICE_UUID,
  BatteryItem,
  Settings,
} from "./model"

function matchesUuid(uuid: string, short: string): boolean {
  const value = uuid.replace(/-/g, "").toUpperCase()
  return value === short || value === `0000${short}00001000800000805F9B34FB`
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
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return null
  return pct / 100
}

/**
 * Read battery from already system-connected BLE peripherals that publish the
 * standard Battery Service. Safe to call from index.tsx / app_intents.tsx.
 */
export async function readBleBatteries(settings: Settings): Promise<BatteryItem[]> {
  if (!settings.enableBle || settings.maxItems <= 1) return []
  if (!canReadBle()) throw new Error(BLE_UNAVAILABLE)
  if (typeof BluetoothCentralManager === "undefined") throw new Error("当前版本未提供蓝牙读取接口")
  resolveDiagnostic("配件读取")
  const out: BatteryItem[] = []
  const deadline = Date.now() + 20_000
  const remaining = () => Math.max(1, Math.min(4000, deadline - Date.now()))

  let peripherals: Awaited<ReturnType<typeof BluetoothCentralManager.retrieveConnectedPeripherals>>
  try {
    peripherals = await withTimeout(
      BluetoothCentralManager.retrieveConnectedPeripherals([BATTERY_SERVICE_UUID]),
      remaining(),
      "获取已连接配件"
    )
  } catch (error) {
    report("配件读取", error)
    throw error
  }

  const unique = [...new Map((peripherals ?? []).map(p => [p.id, p])).values()]
  for (const p of unique.slice(0, Math.max(0, settings.maxItems - 1))) {
    if (Date.now() >= deadline) { report("配件读取", "已达到读取时间上限"); break }
    const name = p.name?.trim() || "蓝牙配件"
    try {
      await withTimeout(BluetoothCentralManager.connect(p), remaining(), "连接配件")
      await withTimeout(p.discoverServices([BATTERY_SERVICE_UUID]), remaining(), "发现电池服务")
      const service = (p.services ?? []).find(
        s => matchesUuid(s.uuid, BATTERY_SERVICE_UUID)
      )
      if (!service) throw new Error("配件未提供标准电池服务")

      await withTimeout(
        p.discoverCharacteristics(service, [BATTERY_LEVEL_CHAR_UUID]),
        remaining(),
        "发现电量特征"
      )
      const char = (service.characteristics ?? []).find(
        c => matchesUuid(c.uuid, BATTERY_LEVEL_CHAR_UUID)
      )
      if (!char || !char.properties.includes("read")) throw new Error("电量特征不支持读取")

      const value = await withTimeout(p.readValue(char), remaining(), "读取配件电量")
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
        note: level == null ? "配件电量不可读取" : undefined,
      })
    } catch (e) {
      report("配件读取", new Error(`${name}: ${String(e)}`))
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
        note: "配件电量读取失败",
      })
    } finally {
      try {
        await withTimeout(BluetoothCentralManager.disconnect(p), 2000, "断开脚本连接")
      } catch {
        /* ignore */
      }
    }
  }

  return out
}
