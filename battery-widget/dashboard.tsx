// ---------------------------------------------------------------------------
// Interactive app (main entry). Here hooks + async + Bluetooth all work.
// Responsibilities:
//   * show live iPhone battery + cached device snapshot
//   * "Scan & refresh" -> read BLE Battery-Service devices, save snapshot,
//     reload widgets
//   * edit settings
//   * preview the widget
//   * document the real iOS capability limits honestly
// ---------------------------------------------------------------------------
import {
  Navigation, NavigationStack, List, Section, Text, HStack, VStack, Button,
  Toggle, Stepper, Spacer, Device, Widget, useState, useEffect,
} from "scripting"
import { DEFAULT_SETTINGS, Settings, Snapshot, BatteryItem } from "./model"
import { loadSettings, saveSettings, loadSnapshot, saveSnapshot } from "./store"
import { buildPhoneItem } from "./battery"
import { buildSnapshotItems, composeItems } from "./snapshot"
import { DeviceCell } from "./ui"
import { attempt, report, diagnosticText } from "./diagnostics"
import { canReadBle, BLE_UNAVAILABLE } from "./capabilities"

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => (n < 10 ? "0" + n : "" + n)
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

export function Dashboard({ stage = 6 }: { stage?: number }) {
  const dismiss = Navigation.useDismiss()
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS })
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [phone, setPhone] = useState<BatteryItem>({ id: "phone", name: "iPhone", kind: "phone", symbol: "iphone", level: null, charge: "unknown", connected: true, updatedAt: Date.now() })
  const [scanning, setScanning] = useState(false)
  const [msg, setMsg] = useState<string>("")

  const [errors, setErrors] = useState("")
  const [bleAllowed, setBleAllowed] = useState(false)
  const updateErrors = () => setErrors(diagnosticText())

  // Concrete state values: do not rely on React lazy initializer semantics.
  // Restore data after the first, dependency-free UI has rendered.
  useEffect(() => {
    if (stage >= 1) { setSettings(loadSettings()); setSnapshot(loadSnapshot()) }
    if (stage >= 2) setPhone(buildPhoneItem())
    if (stage >= 6) setBleAllowed(canReadBle())
    updateErrors()
  }, [])

  // Live iPhone battery updates while the app is open.
  useEffect(() => {
    if (stage < 5) return
    const refresh = () => { setPhone(buildPhoneItem()); updateErrors() }
    const levelAdded = attempt("Battery level listener", () => { Device.addBatteryLevelListener(refresh); return true }, false)
    const stateAdded = attempt("Battery state listener", () => { Device.addBatteryStateListener(refresh); return true }, false)
    updateErrors()
    return () => {
      if (levelAdded) attempt("Remove level listener", () => Device.removeBatteryLevelListener(refresh), undefined)
      if (stateAdded) attempt("Remove state listener", () => Device.removeBatteryStateListener(refresh), undefined)
    }
  }, [])

  const patch = (p: Partial<Settings>) => {
    const next = { ...settings, ...p }
    setSettings(next)
    saveSettings(next)
    updateErrors()
  }

  const items = stage >= 3 ? attempt("Compose devices", () => composeItems(phone, snapshot, settings), [phone]) : [phone]

  const scan = async () => {
    if (scanning) return
    if (!canReadBle()) { setBleAllowed(false); setMsg(BLE_UNAVAILABLE); return }
    setScanning(true)
    setMsg("Scanning…")
    try {
      const built = await buildSnapshotItems(settings)
      const snap = saveSnapshot(built)
      setSnapshot(snap)
      Widget.reloadAll()
      const readable = built.filter(i => i.level != null).length
      setMsg(`Done. ${readable} device(s) reported a battery level.`)
    } catch (e) {
      setMsg(report("Scan failed", e))
    } finally {
      setScanning(false)
      updateErrors()
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="Battery Monitor"
        toolbar={{ cancellationAction: <Button title="Done" action={dismiss} /> }}
      >
        {errors ? <Section header={<Text>Diagnostics</Text>}><Text>{errors}</Text></Section> : null}
        <Section header={<Text>Preview</Text>}>
          <VStack spacing={10} padding={8} frame={{ maxWidth: "infinity" }}>
            {[items.slice(0, 2), items.slice(2, 4)].map((row, i) =>
              row.length ? (
                <HStack key={i} spacing={16} alignment="center">
                  {row.map(it => (
                    stage >= 4 ? DeviceCell({ item: it, settings, ringSize: 56 }) : <Text key={it.id}>{it.name}: {it.level == null ? "--" : Math.round(it.level * 100) + "%"} · {it.charge}</Text>
                  ))}
                </HStack>
              ) : null
            )}
          </VStack>
        </Section>

        {stage >= 6 ? <Section header={<Text>Actions</Text>} footer={<Text>{msg || (!bleAllowed ? BLE_UNAVAILABLE : "BLE ready (Scripting PRO). Reads connected standard Battery-Service devices on demand.")}</Text>}>
          <Button
            title={scanning ? "Scanning…" : "Scan & refresh now"}
            action={scan}
            disabled={scanning || !bleAllowed || !settings.enableBle}
          />
          <Button
            title="Preview widget (medium)"
            action={async () => { try { await Widget.preview({ family: "systemMedium" }) } catch (e) { setMsg(report("Widget preview", e)) } }}
          />
        </Section> : null}

        <Section header={<Text>Status</Text>}>
          <HStack>
            <Text>iPhone</Text><Spacer />
            <Text foregroundStyle="secondaryLabel">
              {phone.level == null ? "--" : Math.round(phone.level * 100) + "%"} · {phone.charge}
            </Text>
          </HStack>
          <HStack>
            <Text>Last snapshot</Text><Spacer />
            <Text foregroundStyle="secondaryLabel">
              {snapshot ? fmtTime(snapshot.builtAt) : "never"}
            </Text>
          </HStack>
        </Section>

        {stage >= 6 ? <Section header={<Text>Settings</Text>}>
          <Toggle
            title="Read BLE battery devices"
            value={settings.enableBle}
            disabled={!bleAllowed}
            onChanged={(v: boolean) => patch({ enableBle: v })}
          />
          <Toggle
            title="Show AirPods info cell (always --)"
            value={settings.showAirpodsPlaceholder}
            onChanged={(v: boolean) => patch({ showAirpodsPlaceholder: v })}
          />
          <Toggle
            title="Hide offline devices"
            value={settings.hideOffline}
            onChanged={(v: boolean) => patch({ hideOffline: v })}
          />
          <Stepper
            title={`Max items: ${settings.maxItems}`}
            onIncrement={() => patch({ maxItems: Math.min(4, settings.maxItems + 1) })}
            onDecrement={() => patch({ maxItems: Math.max(1, settings.maxItems - 1) })}
          />
          <Stepper
            title={`Stale after: ${settings.staleMinutes} min`}
            onIncrement={() => patch({ staleMinutes: Math.min(720, settings.staleMinutes + 15) })}
            onDecrement={() => patch({ staleMinutes: Math.max(15, settings.staleMinutes - 15) })}
          />
          <Button title="Reset settings" action={() => { setSettings(DEFAULT_SETTINGS); saveSettings(DEFAULT_SETTINGS); updateErrors() }} />
        </Section> : null}

        <Section header={<Text>What this can read</Text>}>
          <Text font="footnote">✅ iPhone battery % + charging state (live; -- when unavailable).</Text>
          <Text font="footnote">⚠️ BLE devices exposing the standard Battery Service (0x180F): read on demand here, then cached for the widget. Real-device only.</Text>
          <Text font="footnote">❌ AirPods L/R/case and classic Bluetooth audio: iOS gives no public API to third-party scripts, so they always show "--". No faked values.</Text>
        </Section>
      </List>
    </NavigationStack>
  )
}

