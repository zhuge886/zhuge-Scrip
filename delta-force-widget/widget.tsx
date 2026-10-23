import { Widget, VStack, Text, Script } from "scripting"
import { REFRESH_MS } from "./model"
import { refreshSnapshot } from "./api"
import { WalletCard } from "./ui"

async function run() {
  try {
    const snapshot = await refreshSnapshot()
    const url = Script.createRunURLScheme(Script.name)
    const card = WalletCard({ snapshot, small: Widget.family === "systemSmall", url })
    Widget.present(card, { policy: "after", date: new Date(Date.now() + REFRESH_MS) })
  } catch {
    Widget.present(<VStack padding widgetURL={Script.createRunURLScheme(Script.name)}>
      <Text>三角洲收益</Text>
      <Text font="caption">数据暂不可用，点按打开查看</Text>
    </VStack>, { policy: "after", date: new Date(Date.now() + REFRESH_MS) })
  }
}
run()
