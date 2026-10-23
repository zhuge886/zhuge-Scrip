// Keep this bootstrap free of Storage, Device, UI and PRO module imports.
import { Navigation, NavigationStack, VStack, Text, Script, useState, useEffect } from "scripting"
import type { Dashboard } from "./dashboard"

type Loaded = { Dashboard: typeof Dashboard }

function Bootstrap() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState("")
  const [phoneText, setPhoneText] = useState("iPhone -- · unknown")
  const raw = Number(Script.queryParameters.stage ?? 6)
  const stage = Number.isInteger(raw) && raw >= 0 && raw <= 6 ? raw : 6
  useEffect(() => {
    if (stage === 0) return
    let active = true
    const load = async () => {
      if (stage >= 2) {
        const { buildPhoneItem, formatPercent } = await import("./battery")
        const phone = buildPhoneItem()
        if (active) setPhoneText(`iPhone ${formatPercent(phone.level)} · ${phone.charge}`)
      }
      return import("./dashboard")
    }
    load().then(module => {
      if (active) setLoaded({ Dashboard: module.Dashboard })
    }).catch(e => {
      console.error("[Battery Monitor] Dashboard import", e)
      if (active) setError(`Dashboard import: ${String(e)}`)
    })
    return () => { active = false }
  }, [])
  if (loaded) return <GuardedDashboard module={loaded} stage={stage} phoneText={phoneText} />
  // Official minimal Navigation.present + VStack + Text baseline.
  return <NavigationStack><VStack navigationTitle="Battery Monitor" padding>
    <Text>Hello Scripting!</Text>
    {stage > 0 ? <Text>{phoneText}</Text> : null}
    <Text>{error || (stage === 0 ? "Minimal render check (stage 0)" : "Loading Battery Monitor…")}</Text>
  </VStack></NavigationStack>
}

function GuardedDashboard({ module, stage, phoneText }: { module: Loaded; stage: number; phoneText: string }) {
  try { return module.Dashboard({ stage }) }
  catch (error) {
    console.error("[Battery Monitor] Dashboard render", error)
    return <NavigationStack><VStack padding>
      <Text>{phoneText}</Text>
      <Text>Battery Monitor could not render.</Text><Text>{String(error)}</Text>
    </VStack></NavigationStack>
  }
}

async function run() {
  try {
    // stage=0 is the official sample with no hooks or local runtime imports.
    const minimal = String(Script.queryParameters.stage) === "0"
    await Navigation.present({ element: minimal
      ? <NavigationStack><VStack navigationTitle="Battery Monitor"><Text>Hello Scripting!</Text></VStack></NavigationStack>
      : <Bootstrap /> })
  } catch (error) {
    console.error("[Battery Monitor] Navigation.present", error)
    try {
      // Native presentation errors get an independent minimal fallback.
      const { buildPhoneItem, formatPercent } = await import("./battery")
      const phone = buildPhoneItem()
      await Navigation.present({ element: <VStack padding>
        <Text>iPhone {formatPercent(phone.level)} · {phone.charge}</Text>
        <Text>Battery Monitor error: {String(error)}</Text>
      </VStack> })
    } catch (fallbackError) { console.error("[Battery Monitor] Fallback presentation", fallbackError) }
  } finally { Script.exit() }
}
run()
