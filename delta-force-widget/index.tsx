import { Navigation, NavigationStack, ScrollView, Button, Text, VStack, HStack, Image, Spacer, Script, Widget, useState, useEffect, useRef } from "scripting"
import { emptySnapshot, safeMessage, Snapshot } from "./model"
import { refreshSnapshot } from "./api"
import { loginByWeChatQR } from "./auth"
import { loadSession, loadSnapshot, logout } from "./store"
import { palette, WalletCard } from "./ui"

function initialSnapshot(): Snapshot {
  try { const session = loadSession(); return session ? loadSnapshot(session) : emptySnapshot() }
  catch { return emptySnapshot() }
}
function hasSession(): boolean { try { return loadSession() !== null } catch { return false } }
function hasRenewal(): boolean { try { return !!loadSession()?.refresh_token } catch { return false } }
function Dashboard() {
  const dismiss = Navigation.useDismiss()
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot)
  const [signedIn, setSignedIn] = useState(hasSession)
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
    if (mounted.current) {
      setSnapshot(next)
      setSignedIn(hasSession())
      if (next.profit.status === "error" || next.profit.status === "cached") setMessage(next.profit.message)
      else if (next.profit.value === null && !next.needsLogin) setMessage(next.profit.message)
    }
    Widget.reloadAll()
  }
  useEffect(() => {
    mounted.current = true
    run(refresh)
    return () => { mounted.current = false }
  }, [])
  const signIn = async () => {
    await Dialog.alert({ title: "微信扫码登录", message: "将腾讯登录二维码显示在另一台设备上，再用本人微信扫一扫。授权后自动返回，后续会在微信授权有效期内自动续期。" })
    if (!await loginByWeChatQR()) { if (mounted.current) setMessage("已取消登录"); return }
    if (mounted.current) { setSignedIn(true); setSnapshot(initialSnapshot()) }
    await refresh()
  }
  return <NavigationStack><ScrollView background={palette.page} navigationTitle="三角洲收益" navigationBarTitleDisplayMode="inline"
    toolbar={{ cancellationAction: <Button title="完成" action={dismiss} /> }}>
    <VStack alignment="leading" spacing={24} padding={{ horizontal: 20, top: 22, bottom: 28 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <VStack alignment="leading" spacing={6}>
        <Text font={30} fontWeight="bold" foregroundStyle={palette.ink}>你的烽火账本</Text>
        <Text font={13} foregroundStyle={palette.muted}>最近一份日报，随时看见。</Text>
      </VStack>
      <VStack frame={{ maxWidth: "infinity", height: 224 }} background="#FFFFFF" clipShape={{ type: "rect", cornerRadius: 26 }}>
        <WalletCard snapshot={snapshot} />
      </VStack>
      <VStack alignment="leading" spacing={14} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <HStack spacing={7}>
          <Image systemName={signedIn ? "checkmark.shield" : "person.crop.circle"} font={13} foregroundStyle={palette.mint} />
          <Text font={12} foregroundStyle={palette.muted}>{signedIn
            ? snapshot.needsLogin ? "请重新扫码登录" : hasRenewal() ? "微信已登录 · 自动续期" : "微信登录已保存"
            : "扫码后，查看你的游戏收益"}</Text>
          <Spacer />
        </HStack>
        <HStack spacing={12} frame={{ maxWidth: "infinity" }}>
          <Button action={() => run(refresh)} disabled={busy} buttonStyle="plain">
            <HStack spacing={7} frame={{ maxWidth: "infinity", height: 52 }} background={palette.mint} foregroundStyle={palette.page} clipShape={{ type: "rect", cornerRadius: 16 }}>
              <Image systemName="arrow.clockwise" font={14} />
              <Text font={14} fontWeight="semibold">{busy ? "正在处理…" : "刷新收益"}</Text>
            </HStack>
          </Button>
          <Button action={() => run(signIn)} disabled={busy} buttonStyle="plain">
            <HStack spacing={7} frame={{ maxWidth: "infinity", height: 52 }} background={palette.panel} clipShape={{ type: "rect", cornerRadius: 16 }} foregroundStyle={palette.ink}>
              <Image systemName="qrcode.viewfinder" font={15} />
              <Text font={14} fontWeight="semibold">{signedIn ? snapshot.needsLogin || !hasRenewal() ? "重新扫码" : "更换账号" : "微信扫码"}</Text>
            </HStack>
          </Button>
        </HStack>
        {message ? <Text font={12} foregroundStyle={palette.muted}>{message}</Text> : null}
        {signedIn && !hasRenewal() ? <Text font={12} foregroundStyle={palette.muted}>重新扫码一次，启用自动续期。</Text> : null}
      </VStack>
      <VStack alignment="leading" spacing={12} padding={18} frame={{ maxWidth: "infinity", alignment: "leading" }} background={palette.panel} clipShape={{ type: "rect", cornerRadius: 20 }}>
        <HStack spacing={7}>
          <Image systemName="square.grid.2x2" font={13} foregroundStyle={palette.mint} />
          <Text font={14} fontWeight="semibold" foregroundStyle={palette.ink}>把收益放在桌面</Text>
        </HStack>
        <Text font={12} foregroundStyle={palette.muted}>普通 Scripting 小组件显示白底与反差色收益；选择“透明背景小组件”可透出壁纸。两种都选择“三角洲收益”，支持小号与中号。</Text>
        <Text font={11} foregroundStyle={palette.muted}>金额旁是实际收益日期。休息日保留最近一份日报；余额可用时自动显示。桌面刷新由 iOS 调度。</Text>
      </VStack>
      <Text font={10} foregroundStyle={palette.muted}>仅查询本人账号 · 登录保存在本机钥匙串</Text>
      {signedIn ? <Button title="退出并清除本机数据" role="destructive" action={() => run(async () => {
        if (!await Dialog.confirm("退出当前账号，并清除登录和缓存？")) return
        logout()
        if (mounted.current) { setSignedIn(false); setSnapshot(emptySnapshot()); setMessage("已退出登录") }
        Widget.reloadAll()
      })} disabled={busy} font={12} /> : null}
    </VStack>
  </ScrollView></NavigationStack>
}
Navigation.present({ element: <Dashboard /> }).catch(() => Dialog.alert("界面加载失败，请更新 Scripting 后重试。")).finally(() => Script.exit())
