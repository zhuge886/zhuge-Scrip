// ---------------------------------------------------------------------------
// Widget entry point. Runs once, renders once (hooks do NOT work here).
//   * iPhone battery  -> read LIVE every render (always real).
//   * Other devices   -> read from the cached snapshot written by index.tsx
//                        or the Refresh app-intent. Never scans BLE here
//                        (widgets are too short-lived to scan reliably).
// Reload cadence is a request to WidgetKit, not a guarantee (iOS decides).
// ---------------------------------------------------------------------------
import { Widget } from "scripting"
import { loadSettings, loadSnapshot } from "./store"
import { buildPhoneItem } from "./battery"
import { composeItems } from "./snapshot"
import { BatteryGrid, Family } from "./grid"

const settings = loadSettings()
const phone = buildPhoneItem()
const snapshot = loadSnapshot()
const items = composeItems(phone, snapshot, settings)
const family = (Widget.family ?? "systemMedium") as Family

// Ask iOS to refresh in ~15 minutes so the live iPhone level stays current
// without high-frequency polling.
const nextReload = new Date(Date.now() + 15 * 60 * 1000)

Widget.present(<BatteryGrid items={items} settings={settings} family={family} />, {
  policy: "after",
  date: nextReload,
})
