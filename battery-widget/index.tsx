// Keep this bootstrap free of Storage, Device, UI and PRO module imports.
import { Navigation, NavigationStack, VStack, Text, Script, useState, useEffect } from "scripting"
import { APP_TITLE, chargeText } from "./copy"
import type { Dashboard } from "./dashboard"

type Loaded = { Dashboard: typeof Dashboard }

function Bootstrap() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState("")
  const [phoneText, setPhoneText] = useState("iPhone -- · 状态未知")
  const raw = Number(Script.queryParameters.stage ?? 6)
  const stage = Number.isInteger(raw) && raw >= 0 && raw <= 6 ? raw : 6
  useEffect(() => {
    if (stage === 0) return
    let active = true
    const load = async () => {
      if (stage >= 2) {
        const { buildPhoneItem, formatPercent } = await import("./battery")
        const phone = buildPhoneItem()
        if (active) setPhoneText(`iPhone ${formatPercent(phone.level)} · ${chargeText(phone.charge)}`)
      }
      return import("./dashboard")
    }
    load().then(module => {
      if (active) setLoaded({ Dashboard: module.Dashboard })
    }).catch(e => {
      console.error("[电量监控] Dashboard import", e)
      if (active) setError("界面加载失败，手机电量仍可查看。详细原因请查看控制台。")
    })
    return () => { active = false }
  }, [])
  if (loaded) return <GuardedDashboard module={loaded} stage={stage} phoneText={phoneText} />
  // Official minimal Navigation.present + VStack + Text baseline.
  return <NavigationStack><VStack navigationTitle={APP_TITLE} padding>
    <Text>你好，Scripting！</Text>
    {stage > 0 ? <Text>{phoneText}</Text> : null}
    <Text>{error || (stage === 0 ? "最简界面验证（阶段 0）" : "正在加载电量监控…")}</Text>
  </VStack></NavigationStack>
}

function GuardedDashboard({ module, stage, phoneText }: { module: Loaded; stage: number; phoneText: string }) {
  try { return module.Dashboard({ stage }) }
  catch (error) {
    console.error("[电量监控] Dashboard render", error)
    return <NavigationStack><VStack padding>
      <Text>{phoneText}</Text>
      <Text>界面暂时无法显示，已保留手机电量。</Text><Text>详细原因已记录在控制台。</Text>
    </VStack></NavigationStack>
  }
}

async function run() {
  try {
    // stage=0 is the official sample with no hooks or local runtime imports.
    const minimal = String(Script.queryParameters.stage) === "0"
    await Navigation.present({ element: minimal
      ? <NavigationStack><VStack navigationTitle={APP_TITLE}><Text>你好，Scripting！</Text></VStack></NavigationStack>
      : <Bootstrap /> })
  } catch (error) {
    console.error("[电量监控] Navigation.present", error)
    try {
      let phoneText = "iPhone -- · 状态未知"
      try {
        const { buildPhoneItem, formatPercent } = await import("./battery")
        const phone = buildPhoneItem()
        phoneText = `iPhone ${formatPercent(phone.level)} · ${chargeText(phone.charge)}`
      } catch (batteryError) { console.error("[电量监控] 备用电量读取", batteryError) }
      await Navigation.present({ element: <VStack padding>
        <Text>{phoneText}</Text>
        <Text>界面暂时无法显示，请查看控制台。</Text>
      </VStack> })
    } catch (fallbackError) { console.error("[电量监控] Fallback presentation", fallbackError) }
  } finally { Script.exit() }
}
run()
