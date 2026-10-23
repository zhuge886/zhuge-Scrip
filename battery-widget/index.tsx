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
  Toggle, Stepper, Spacer, Script, Device, Widget, useState, useEffect,
} from "scripting"
import { DEFAULT_SETTINGS, Settings, Snapshot } from "./model"
import { loadSettings, saveSettings, loadSnapshot, saveSnapshot } from "./store"
import { buildPhoneItem } from "./battery"
import { buildSnapshotItems, composeItems } from "./snapshot"
import { DeviceCell } from "./ui"

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => (n < 10 ? "0" + n : "" + n)
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

function Dashboard() {
  const dismiss = Navigation.useDismiss()
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() => loadSnapshot())
  const [phone, setPhone] = useState(() => buildPhoneItem())
  const [scanning, setScanning] = useState(false)
  const [msg, setMsg] = useState<string>("")

  // Live iPhone battery updates while the app is open.
  useEffect(() => {
    const refresh = () => setPhone(buildPhoneItem())
    Device.addBatteryLevelListener(refresh)
    Device.addBatteryStateListener(refresh)
    return () => {
      Device.removeBatteryLevelListener(refresh)
      Device.removeBatteryStateListener(refresh)
    }
  }, [])

  const patch = (p: Partial<Settings>) => {
    const next = { ...settings, ...p }
    setSettings(next)
    saveSettings(next)
  }

  const items = composeItems(phone, snapshot, settings)

  const scan = async () => {
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
      setMsg("Scan failed: " + String(e))
    } finally {
      setScanning(false)
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="Battery Monitor"
        toolbar={{ cancellationAction: <Button title="Done" action={dismiss} /> }}
      >
        <Section header={<Text>Preview</Text>}>
          <VStack spacing={10} padding={8} frame={{ maxWidth: "infinity" }}>
            {[items.slice(0, 2), items.slice(2, 4)].map((row, i) =>
              row.length ? (
                <HStack key={i} spacing={16} alignment="center">
                  {row.map(it => (
                    <DeviceCell key={it.id} item={it} settings={settings} ringSize={56} />
                  ))}
                </HStack>
              ) : null
            )}
          </VStack>
        </Section>

        <Section header={<Text>Actions</Text>} footer={<Text>{msg}</Text>}>
          <Button
            title={scanning ? "Scanning…" : "Scan & refresh now"}
            action={scan}
          />
          <Button
            title="Preview widget (medium)"
            action={() => { Widget.preview({ family: "systemMedium" }) }}
          />
        </Section>

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

        <Section header={<Text>Settings</Text>}>
          <Toggle
            title="Read BLE battery devices"
            value={settings.enableBle}
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
          <Button title="Reset settings" action={() => { setSettings(DEFAULT_SETTINGS); saveSettings(DEFAULT_SETTINGS) }} />
        </Section>

        <Section header={<Text>What this can read</Text>}>
          <Text font="footnote">✅ iPhone battery % + charging state (live, always real).</Text>
          <Text font="footnote">⚠️ BLE devices exposing the standard Battery Service (0x180F): read on demand here, then cached for the widget. Real-device only.</Text>
          <Text font="footnote">❌ AirPods L/R/case and classic Bluetooth audio: iOS gives no public API to third-party scripts, so they always show "--". No faked values.</Text>
        </Section>
      </List>
    </NavigationStack>
  )
}

Navigation.present({ element: <Dashboard /> }).then(() => Script.exit())
