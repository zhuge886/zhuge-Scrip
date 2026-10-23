// One-shot widget: prepare all data before Widget.present. No hooks or BLE scans.
// Only minimal native views are static imports, so optional module failures can
// fall back independently of the interactive entry point.
import { Widget, VStack, Text } from "scripting"

async function run() {
  let phoneText = "iPhone -- · unknown"
  try {
    const { buildPhoneItem, formatPercent } = await import("./battery")
    const phone = buildPhoneItem()
    phoneText = `iPhone ${formatPercent(phone.level)} · ${phone.charge}`
    const { loadSettings, loadSnapshot } = await import("./store")
    const { composeItems } = await import("./snapshot")
    const { BatteryGrid } = await import("./grid")
    const { diagnosticText } = await import("./diagnostics")
    const settings = loadSettings()
    const items = composeItems(phone, loadSnapshot(), settings)
    // Eagerly build pure children so synchronous component errors reach catch.
    const grid = BatteryGrid({ items, settings, family: Widget.family ?? "systemMedium" })
    const errors = diagnosticText()
    Widget.present(errors ? <VStack>{grid}<Text font="caption">{errors}</Text></VStack> : grid, {
      policy: "after", date: new Date(Date.now() + 15 * 60 * 1000),
    })
  } catch (error) {
    console.error("[Battery Monitor] Widget", error)
    Widget.present(<VStack padding>
      <Text>{phoneText}</Text>
      <Text font="caption">Widget error: {String(error)}</Text>
    </VStack>)
  }
}
run()
