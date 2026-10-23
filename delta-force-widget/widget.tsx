import { Widget, Script } from "scripting"
import { emptySnapshot, REFRESH_MS } from "./model"
import { refreshSnapshot } from "./api"
import { loadSession, loadSnapshot } from "./store"
import { WalletCard } from "./ui"

async function run() {
  let snapshot = emptySnapshot()
  try {
    const session = loadSession()
    if (session) snapshot = loadSnapshot(session)
    snapshot = await refreshSnapshot()
  } catch { /* Keep the last available report when a refresh or cache write fails. */ }
  Widget.present(WalletCard({
    snapshot, small: Widget.family === "systemSmall", url: Script.createRunURLScheme(Script.name),
  }), { policy: "after", date: new Date(Date.now() + REFRESH_MS) })
}
run()
