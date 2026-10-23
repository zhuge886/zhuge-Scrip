// One-shot widget: prepare all data before Widget.present. No hooks or BLE scans.
// Only minimal native views are static imports, so optional module failures can
// fall back independently of the interactive entry point.
import { Widget, VStack, Text, Script } from "scripting"

async function run() {
  let phoneText = "iPhone -- · 状态未知"
  try {
    const { buildPhoneItem, formatPercent } = await import("./battery")
    const { chargeText } = await import("./copy")
    const phone = buildPhoneItem()
    phoneText = `iPhone ${formatPercent(phone.level)} · ${chargeText(phone.charge)}`
    const { loadSettings, loadSnapshot } = await import("./store")
    const { composeItems } = await import("./snapshot")
    const { BatteryGrid } = await import("./grid")
    const settings = loadSettings()
    const items = composeItems(phone, loadSnapshot(), settings)
    // Eagerly build pure children so synchronous component errors reach catch.
    const grid = BatteryGrid({ items, settings, family: Widget.family ?? "systemMedium",
      size: Widget.displaySize, transparent: Widget.isTransparentBackground === true,
      url: Script.createRunURLScheme(Script.name),
    })
    // 降级信息已在应用与控制台保留；桌面只展示电量，不输出技术堆栈。
    Widget.present(grid, {
      policy: "after", date: new Date(Date.now() + 15 * 60 * 1000),
    })
  } catch (error) {
    console.error("[电量监控] 小组件", error)
    Widget.present(<VStack padding>
      <Text>{phoneText}</Text>
      <Text font="caption" lineLimit={1}>配件暂不可用，可点按查看</Text>
    </VStack>)
  }
}
run()
