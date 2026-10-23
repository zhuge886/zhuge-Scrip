import {
  Navigation, NavigationStack, List, Section, Text, HStack, VStack, Button,
  Toggle, Stepper, Spacer, Device, Widget, useState, useEffect, useRef,
} from "scripting"
import { DEFAULT_SETTINGS } from "./model"
import type { Settings, Snapshot, BatteryItem } from "./model"
import { loadSettings, saveSettings, loadSnapshot, saveSnapshot, clearSnapshot } from "./store"
import { buildPhoneItem, formatPercent } from "./battery"
import { buildSnapshotItems, composeItems } from "./snapshot"
import { BatteryGrid } from "./grid"
import { attempt, report, diagnosticText } from "./diagnostics"
import { canReadBle, BLE_UNAVAILABLE } from "./capabilities"
import { APP_TITLE, chargeText, timeText } from "./copy"

export function Dashboard({ stage = 6 }: { stage?: number }) {
  const dismiss = Navigation.useDismiss()
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS })
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [phone, setPhone] = useState<BatteryItem>({ id: "phone", name: "iPhone", kind: "phone", symbol: "iphone", level: null, charge: "unknown", connected: true, updatedAt: Date.now() })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [errors, setErrors] = useState("")
  const [bleAllowed, setBleAllowed] = useState(false)
  const [audioMsg, setAudioMsg] = useState("")
  const active = useRef(true)
  const working = useRef(false)
  const updateErrors = () => { if (active.current) setErrors(diagnosticText()) }
  const reload = () => { attempt("小组件刷新", () => Widget.reloadAll(), undefined); updateErrors() }
  const refreshPhone = () => { if (active.current) { setPhone(buildPhoneItem()); updateErrors() } }

  useEffect(() => {
    active.current = true
    if (stage >= 1) { setSettings(loadSettings()); setSnapshot(loadSnapshot()) }
    if (stage >= 2) refreshPhone()
    if (stage >= 6) setBleAllowed(canReadBle())
    updateErrors()
    return () => { active.current = false }
  }, [])
  useEffect(() => {
    if (stage < 5) return
    const levelAdded = attempt("电量变化监听", () => { Device.addBatteryLevelListener(refreshPhone); return true }, false)
    const stateAdded = attempt("充电变化监听", () => { Device.addBatteryStateListener(refreshPhone); return true }, false)
    updateErrors()
    return () => {
      if (levelAdded) attempt("移除电量监听", () => Device.removeBatteryLevelListener(refreshPhone), undefined)
      if (stateAdded) attempt("移除充电监听", () => Device.removeBatteryStateListener(refreshPhone), undefined)
    }
  }, [])
  const patch = (changes: Partial<Settings>) => {
    const next = { ...settings, ...changes }
    setSettings(next)
    if (saveSettings(next)) reload()
    updateErrors()
  }
  const items = stage >= 3 ? attempt("配件数据组合", () => composeItems(phone, snapshot, settings), [phone]) : [phone]
  // 独立于控件重绘的锁，防止连续点击启动多个蓝牙任务。
  const runAction = async (task: () => Promise<void>, scope = "配件读取") => {
    if (working.current) return
    working.current = true; setBusy(true)
    try { await task() }
    catch (error) { if (active.current) setMsg(report(scope, error)) }
    finally { working.current = false; if (active.current) { setBusy(false); refreshPhone(); updateErrors() } }
  }
  const readAccessories = () => runAction(async () => {
    if (!canReadBle()) { setBleAllowed(false); setMsg(BLE_UNAVAILABLE); return }
    if (!settings.enableBle || settings.maxItems <= 1) return
    setMsg("正在读取已连接配件…")
    const built = await buildSnapshotItems(settings)
    // 耳机音频输出只标明输出设备，不伪造电量；保留用户最近主动查询的结果。
    const audio = (snapshot?.items ?? []).filter(it => it.id.startsWith("audio-output:"))
    const saved = saveSnapshot([...built, ...audio])
    reload()
    if (!active.current) return
    setSnapshot(saved)
    const readable = built.filter(it => it.level != null).length
    setMsg(built.length ? `已更新 ${built.length} 个配件，其中 ${readable} 个返回电量。` : "未找到提供标准电池服务的已连接配件。AirPods 不在此读取范围内。")
  })
  const inspectAudio = () => runAction(async () => {
    setMsg("正在检查耳机音频输出…")
    const { readHeadphoneRoute } = await import("./audio")
    const audio = await readHeadphoneRoute()
    const rest = (snapshot?.items ?? []).filter(it => !it.id.startsWith("audio-output:"))
    const saved = saveSnapshot([...rest, ...audio])
    reload()
    if (!active.current) return
    setSnapshot(saved)
    const text = audio.length ? `当前耳机输出：${audio.map(it => it.name).join("、")}。当前接口未提供其电量，圆环显示 --。` : "当前音频路由未返回耳机输出；这不代表耳机未连接。可播放音频并选择耳机后重试。"
    setAudioMsg(text); setMsg(text)
  }, "耳机输出查询")
  const preview = async (family: "systemSmall" | "systemMedium") => {
    try { await Widget.preview({ family }) } catch (error) { if (active.current) setMsg(report("小组件预览", error)) }
  }
  const bleHint = !bleAllowed ? BLE_UNAVAILABLE : !settings.enableBle ? "已关闭配件读取，手机电量不受影响。" : settings.maxItems <= 1 ? "最多显示数量为 1 时，只显示手机电量。" : "PRO 已授权。仅在点击后读取标准电池服务配件，不会自动扫描。"
  return <NavigationStack><List navigationTitle={APP_TITLE}
    toolbar={{ cancellationAction: <Button title="完成" action={dismiss} /> }}>
    <Section header={<Text>小组件预览</Text>} footer={<Text>空圆环表示空位；-- 表示无法读取，均不代表虚构的电量。</Text>}>
      <VStack padding={8}>
        {stage >= 4 ? BatteryGrid({ items, settings, family: "systemSmall", widget: false, size: { width: 158, height: 158 } }) : <Text>{phone.name} {formatPercent(phone.level)} · {chargeText(phone.charge)}</Text>}
      </VStack>
    </Section>
    <Section header={<Text>当前状态</Text>}>
      <HStack><Text>{phone.name}</Text><Spacer /><Text foregroundStyle="secondaryLabel">{formatPercent(phone.level)} · {chargeText(phone.charge)}</Text></HStack>
      <HStack><Text>配件缓存更新</Text><Spacer /><Text foregroundStyle="secondaryLabel">{timeText(snapshot?.builtAt)}</Text></HStack>
    </Section>
    {stage >= 6 ? <Section header={<Text>操作</Text>} footer={<Text>{msg || bleHint}</Text>}>
      <Button title="刷新手机电量" action={() => { refreshPhone(); reload() }} />
      <Button title={busy ? "正在读取，请稍候…" : "读取已连接的蓝牙配件"} action={readAccessories}
        disabled={busy || !bleAllowed || !settings.enableBle || settings.maxItems <= 1} />
      <Button title="检查耳机音频输出" action={inspectAudio} disabled={busy} />
      <Button title="预览小尺寸小组件" action={() => preview("systemSmall")} />
      <Button title="预览中尺寸小组件" action={() => preview("systemMedium")} />
    </Section> : null}
    {stage >= 6 ? <Section header={<Text>显示与设置</Text>} footer={<Text>设置会自动保存并请求刷新小组件；桌面实际刷新时间由 iOS 决定。</Text>}>
      <Toggle title="读取标准蓝牙配件电量" value={settings.enableBle} onChanged={value => patch({ enableBle: value })} disabled={!bleAllowed || busy} />
      <Toggle title="显示设备名称" value={settings.showDeviceNames} onChanged={value => patch({ showDeviceNames: value })} disabled={busy} />
      <Toggle title="显示 AirPods 说明占位" value={settings.showAirpodsPlaceholder} onChanged={value => patch({ showAirpodsPlaceholder: value })} disabled={busy} />
      <Toggle title="隐藏离线和过期配件" value={settings.hideOffline} onChanged={value => patch({ hideOffline: value })} disabled={busy} />
      <Stepper title={`最多显示：${settings.maxItems} 台设备`} disabled={busy}
        onIncrement={() => patch({ maxItems: Math.min(4, settings.maxItems + 1) })}
        onDecrement={() => patch({ maxItems: Math.max(1, settings.maxItems - 1) })} />
      <Stepper title={`配件电量有效期：${settings.staleMinutes} 分钟`} disabled={busy}
        onIncrement={() => patch({ staleMinutes: Math.min(720, settings.staleMinutes + 15) })}
        onDecrement={() => patch({ staleMinutes: Math.max(15, settings.staleMinutes - 15) })} />
      <Button title="清除配件缓存" disabled={busy} action={() => { if (clearSnapshot()) { setSnapshot(null); setAudioMsg(""); setMsg("配件缓存已清除。"); reload() } updateErrors() }} />
      <Button title="恢复默认设置" disabled={busy} action={() => patch({ ...DEFAULT_SETTINGS })} />
    </Section> : null}
    <Section header={<Text>AirPods 与读取范围</Text>}>
      <Text font="footnote">手机电量来自系统公开接口；部分 iOS 版本会按约 5% 档位取整，可能与状态栏不同。桌面显示还受 iOS 刷新节奏影响。</Text>
      <Text font="footnote">标准蓝牙读取仅查询已连接、支持电池服务的配件。开启此开关不会获得系统电池组件的全部设备数据。</Text>
      <Text font="footnote">当前 Scripting 接口未提供 AirPods 左耳、右耳和充电盒的真实电量。系统电池组件能显示，也不代表脚本可以读取。</Text>
      <Text font="footnote">“检查耳机音频输出”可查询当前使用的耳机名称，但不能读取其电量。AirPods 说明占位默认关闭，开启后只显示 --，不表示检测到了耳机；隐藏离线配件时不显示说明占位。</Text>
      {audioMsg ? <Text font="footnote">{audioMsg}</Text> : null}
    </Section>
    {errors ? <Section header={<Text>运行提示</Text>} footer={<Text>详细技术错误已写入 Scripting 控制台，桌面不显示错误堆栈。</Text>}>
      <Text font="footnote">{errors}</Text>
    </Section> : null}
  </List></NavigationStack>
}
