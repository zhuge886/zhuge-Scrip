// ---------------------------------------------------------------------------
// App Intents (must live in app_intents.tsx). Runs in the "app_intents"
// environment, which may perform async work such as a BLE read.
//
// RefreshBatteryIntent rebuilds the cached snapshot and reloads widgets.
// Trigger it from:
//   * a <Button intent={RefreshBatteryIntent(undefined)} .../> inside widget.tsx
//   * a Shortcuts automation ("Run Script" / intent) for periodic updates
// ---------------------------------------------------------------------------
import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { report } from "./diagnostics"
import { loadSettings, loadSnapshot, saveSnapshot } from "./store"
import { buildSnapshotItems } from "./snapshot"

export const RefreshBatteryIntent = AppIntentManager.register<undefined>({
  name: "RefreshBatteryIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    try {
      const settings = loadSettings()
      const items = await buildSnapshotItems(settings)
      const audio = (loadSnapshot()?.items ?? []).filter(it => it.id.startsWith("audio-output:"))
      saveSnapshot([...items, ...audio])
      Widget.reloadAll()
    } catch (error) { report("配件刷新", error); throw error }
  },
})
