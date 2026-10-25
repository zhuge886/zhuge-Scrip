import { Widget, Script } from "scripting"
import { emptySnapshot, REFRESH_MS } from "./model"
import { refreshSnapshot } from "./api"
import { loadSession, loadSnapshot } from "./store"
import { transparentParameter, WidgetCard } from "./widget-view"

async function run() {
  let snapshot = emptySnapshot()
  try {
    const session = loadSession()
    if (session) snapshot = loadSnapshot(session)
    snapshot = await refreshSnapshot()
  } catch { /* Keep the last available report when a refresh or cache write fails. */ }
  const card = WidgetCard({
    snapshot, small: Widget.family === "systemSmall", url: Script.createRunURLScheme(Script.name),
    size: Widget.displaySize,
    transparent: transparentParameter(Widget.parameter ?? ""),
  })
  Widget.present(card, { policy: "after", date: new Date(Date.now() + REFRESH_MS) })
}
run()
