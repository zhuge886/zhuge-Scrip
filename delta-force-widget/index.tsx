import { Navigation, NavigationStack, List, Section, Button, Text, VStack, Script, Widget, useState, useEffect, useRef } from "scripting"
import { emptySnapshot, formatAmount, Metric, safeMessage, Snapshot } from "./model"
import { refreshSnapshot } from "./api"
import { createMobileAuth, completeMobileAuth, loginByWeChatQR } from "./auth"
import { loadSession, loadSnapshot, logout } from "./store"
import { WalletCard } from "./ui"

function initialSnapshot(): Snapshot {
  try { const session = loadSession(); return session ? loadSnapshot(session) : emptySnapshot() }
  catch { return emptySnapshot() }
}
function MetricDetails({ title, metric }: { title: string; metric: Metric }) {
  return <VStack alignment="leading" spacing={4}>
    <Text font="headline">{`${title}：${formatAmount(metric.value, title === "昨日收益")}`}</Text>
    <Text font="footnote" foregroundStyle="secondaryLabel">{metric.message}</Text>
    <Text font="caption" foregroundStyle="secondaryLabel">{metric.updatedAt
      ? `查询时间：${new Date(metric.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（北京时间）`
      : "尚未取得数据"}</Text>
  </VStack>
}
function Dashboard() {
  const dismiss = Navigation.useDismiss()
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const running = useRef(false)
  const mounted = useRef(true)
  const run = async (job: () => Promise<void>) => {
    if (running.current) return
    running.current = true; setBusy(true); setMessage("")
    try { await job() }
    catch (error) { if (mounted.current) setMessage(safeMessage(error)) }
    finally { running.current = false; if (mounted.current) setBusy(false) }
  }
  const refresh = async () => {
    const next = await refreshSnapshot(true)
    if (mounted.current) setSnapshot(next)
    Widget.reloadAll()
  }
  useEffect(() => {
    mounted.current = true
    run(refresh)
    return () => { mounted.current = false }
  }, [])
  const signIn = async (kind: "qr" | "paste") => {
    if (kind === "qr") {
      await Dialog.alert("请将腾讯登录二维码显示在另一台设备上，再用本人微信扫一扫。登录完成后会自动返回。也可以选择本机微信授权。")
      if (!await loginByWeChatQR()) { setMessage("已取消微信登录"); return }
    } else {
      const input = await Dialog.prompt({ title: "完成微信授权", message: "粘贴微信授权后腾讯中转页的完整链接（含 code 和 state）。", placeholder: "https://iu.qq.com/…", obscureText: true })
      if (input == null) return
      if (!await completeMobileAuth(input)) { setMessage("已取消微信授权"); return }
    }
    // The old account's data is hidden immediately after a successful replacement.
    setSnapshot(initialSnapshot())
    await refresh()
    setMessage("已登录本人微信账号")
  }
  const copyMobile = async () => {
    await Pasteboard.setString(createMobileAuth())
    setMessage("授权链接已复制，请在微信中打开")
    await Dialog.alert({ title: "本机微信授权", message: "1. 将复制的链接发送到微信文件传输助手并打开。\n2. 确认微信授权后，腾讯中转页可能提示“s_url不在合法地址范围内”，这是保留授权码的中间步骤。\n3. 在微信右上角复制该页完整链接，返回这里点“粘贴授权链接完成登录”。\n请在 10 分钟内完成，不要把返回链接发给他人。" })
  }
  return <NavigationStack><List navigationTitle="三角洲收益"
    toolbar={{ cancellationAction: <Button title="完成" action={dismiss} /> }}>
    <Section><VStack frame={{ height: 170 }}><WalletCard snapshot={snapshot} /></VStack></Section>
    <Section header={<Text>账号与刷新</Text>} footer={<Text>仅查询本人账号。登录凭据保存在本机钥匙串；接口请求直接发送到腾讯。</Text>}>
      <Button title={busy ? "处理中…" : "刷新收益与余额"} action={() => run(refresh)} disabled={busy} />
      <Button title="微信扫码登录 / 更换账号" action={() => run(() => signIn("qr"))} disabled={busy} />
      <Button title="复制本机微信授权链接" action={() => run(copyMobile)} disabled={busy} />
      <Button title="粘贴授权链接完成登录" action={() => run(() => signIn("paste"))} disabled={busy} />
      <Button title="退出并清除本机数据" role="destructive" action={() => run(async () => {
        if (!await Dialog.confirm("退出当前账号，并清除登录凭据和缓存？")) return
        logout(); setSnapshot(emptySnapshot()); Widget.reloadAll(); setMessage("已清除本机登录和缓存")
      })} disabled={busy} />
      {message ? <Text font="footnote">{message}</Text> : null}
    </Section>
    <Section header={<Text>{`数据详情 · ${snapshot.day}`}</Text>}>
      <MetricDetails title="昨日收益" metric={snapshot.profit} />
      <MetricDetails title="总哈夫币" metric={snapshot.balance} />
    </Section>
    <Section header={<Text>桌面小组件</Text>}>
      <Text font="footnote">长按桌面 → 添加 Scripting 小组件 → 编辑小组件 → 选择“三角洲收益”。支持小号与中号，点击组件可打开本页。</Text>
      <Text font="footnote" foregroundStyle="secondaryLabel">昨日按北京时间计算。收益采用腾讯日报字段；总哈夫币为当前余额。系统决定桌面刷新时间，脚本建议每 30 分钟刷新。</Text>
    </Section>
  </List></NavigationStack>
}
Navigation.present({ element: <Dashboard /> }).catch(() => Dialog.alert("界面加载失败，请更新 Scripting 后重试。")).finally(() => Script.exit())
