import { Navigation, NavigationStack, ScrollView, Button, Text, VStack, HStack, Image, Spacer, Script, Widget, useState, useEffect, useRef } from "scripting"
import { emptySnapshot, safeMessage, Snapshot } from "./model"
import { refreshSnapshot } from "./api"
import { loginByWeChatQR } from "./auth"
import { loadSession, loadSnapshot, logout } from "./store"
import { IncomeSummary, palette, TrendPanel } from "./ui"
import { previewWidget, WIDGET_RELEASE } from "./widget-view"

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
      setSnapshot(next); setSignedIn(hasSession())
      if (next.profit.status === "error" || next.profit.status === "cached" ||
        next.profit.value === null && !next.needsLogin) setMessage(next.profit.message)
    }
    Widget.reloadAll()
  }
  useEffect(() => {
    mounted.current = true
    run(refresh)
    return () => { mounted.current = false }
  }, [])
  const signIn = async () => {
    await Dialog.alert({ title: "微信扫码登录", message: "将腾讯登录二维码显示在另一台设备上，再用本人微信扫一扫。授权后自动返回，并在有效期内自动续期。" })
    if (!await loginByWeChatQR()) { if (mounted.current) setMessage("已取消登录"); return }
    if (mounted.current) { setSignedIn(true); setSnapshot(initialSnapshot()) }
    await refresh()
  }
  return <NavigationStack tint={palette.accent}>
    <ScrollView background={palette.page} navigationTitle="三角洲收益" navigationBarTitleDisplayMode="inline"
      toolbar={{ cancellationAction: <Button title="完成" action={dismiss} /> }}>
      <VStack alignment="leading" spacing={26} padding={{ horizontal: 22, top: 16, bottom: 28 }}
        frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <HStack spacing={12} frame={{ maxWidth: "infinity" }}>
          <Text font={27} fontWeight="semibold" foregroundStyle={palette.ink}>收益总览</Text>
          <Spacer />
          <Text font={11} fontWeight="medium" foregroundStyle={palette.accent}
            padding={{ horizontal: 10, vertical: 6 }} background={palette.soft} clipShape={{ type: "rect", cornerRadius: 8 }}>7日</Text>
        </HStack>
        <IncomeSummary snapshot={snapshot} />
        <TrendPanel snapshot={snapshot} />
        <VStack alignment="leading" spacing={13} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
            <Image systemName={signedIn && !snapshot.needsLogin ? "checkmark.circle" : "person.crop.circle"} font={12} foregroundStyle={palette.accent} />
            <Text font={11} foregroundStyle={palette.muted}>{signedIn
              ? snapshot.needsLogin ? "请重新扫码登录" : hasRenewal() ? "微信已登录 · 自动续期" : "微信登录已保存"
              : "登录后查看本人收益"}</Text>
            <Spacer minLength={0} />
            <Button action={() => run(signIn)} disabled={busy} buttonStyle="plain">
              <Text font={12} fontWeight="medium" foregroundStyle={palette.accent}>{signedIn
                ? snapshot.needsLogin || !hasRenewal() ? "重新扫码" : "更换账号" : "微信扫码"}</Text>
            </Button>
          </HStack>
          <Button action={() => run(refresh)} disabled={busy} buttonStyle="plain" frame={{ maxWidth: "infinity" }}>
            <HStack spacing={7} frame={{ maxWidth: "infinity", height: 50 }} background={palette.accent}
              foregroundStyle="#FFFFFF" clipShape={{ type: "rect", cornerRadius: 14 }}>
              <Image systemName="arrow.clockwise" font={13} />
              <Text font={14} fontWeight="semibold">{busy ? "正在刷新…" : "刷新收益"}</Text>
            </HStack>
          </Button>
          {message ? <Text font={11} foregroundStyle={palette.muted}>{message}</Text> : null}
          {signedIn && !hasRenewal() ? <Text font={11} foregroundStyle={palette.muted}>重新扫码一次，启用自动续期。</Text> : null}
        </VStack>
        <Button action={() => run(previewWidget)} buttonStyle="plain" disabled={busy} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={12} padding={15} frame={{ maxWidth: "infinity" }} background={palette.panel} clipShape={{ type: "rect", cornerRadius: 17 }}>
            <Image systemName="square.grid.2x2" font={16} foregroundStyle={palette.accent} />
            <VStack alignment="leading" spacing={4}>
              <Text font={13} fontWeight="medium" foregroundStyle={palette.ink}>预览小号组件</Text>
              <Text font={10} foregroundStyle={palette.muted}>{`原生预览 · ${WIDGET_RELEASE}`}</Text>
            </VStack>
            <Spacer />
            <Image systemName="chevron.right" font={10} foregroundStyle={palette.muted} />
          </HStack>
        </Button>
        <Button title="预览中号组件" font={12} foregroundStyle={palette.accent}
          action={() => run(() => previewWidget("systemMedium"))} disabled={busy} />
        <Button title="添加与更新说明" font={11} foregroundStyle={palette.accent} action={() => Dialog.alert({
          title: "桌面组件", message: "覆盖更新原项目后运行“刷新收益”，登录与历史保留。\n\n小号纵向排版，中号左右分栏。折线为近7个自然日有效记录的累计收益，柱形为单日盈亏；大字仍显示最新单日收益。没有记录的日期不补零。\n\n默认跟随系统。小组件参数可填 light、dark 或 transparent；原生预览也可切换主题。系统未提供桌面模糊时使用冷白或深灰底板。\n\n若桌面仍是旧版，长按组件 → 编辑 → 重新选择更新后的脚本。先用小号 / 中号原生预览确认版本。",
        })} />
        <HStack>
          <Text font={9} foregroundStyle={palette.muted}>本人账号 · 数据保存在本机</Text>
          <Spacer />
          {signedIn ? <Button title="退出登录" role="destructive" font={11} action={() => run(async () => {
            if (!await Dialog.confirm("退出当前账号，并清除登录和缓存？")) return
            logout()
            if (mounted.current) { setSignedIn(false); setSnapshot(emptySnapshot()); setMessage("已退出登录") }
            Widget.reloadAll()
          })} disabled={busy} /> : null}
        </HStack>
      </VStack>
    </ScrollView>
  </NavigationStack>
}
Navigation.present({ element: <Dashboard /> }).catch(() => Dialog.alert("界面加载失败，请更新 Scripting 后重试。")).finally(() => Script.exit())
