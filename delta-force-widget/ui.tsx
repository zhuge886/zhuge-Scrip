import { VStack, HStack, Text, Spacer } from "scripting"
import { formatAmount, reportDate, showBalance, Snapshot } from "./model"
import { trendSeries } from "./history"
import { trendStats } from "./presentation"
import { ProfitTrend } from "./trend-view"
export { ProfitTrend } from "./trend-view"

export const palette = {
  ink: "#161B22", muted: "#5F6876", accent: "#316BFA", gain: "#D9252D",
  soft: "#ECEFF4", panel: "#FFFFFF", border: "#E7EBF1", page: "#F5F7FB", loss: "#147D42",
} as const

function colors(transparent: boolean) {
  return {
    text: transparent ? { light: palette.ink, dark: "#F3F5F9" } as const : palette.ink,
    secondary: transparent ? { light: palette.muted, dark: "#D6DCE6" } as const : palette.muted,
  } as const
}
export function quoteColor(value: string | null, transparent = false) {
  if (value === null || value === "0") return colors(transparent).text
  if (value.startsWith("-")) return transparent
    ? { light: palette.loss, dark: "#79DE9B" } as const : palette.loss
  return transparent ? { light: palette.gain, dark: "#FF939A" } as const : palette.gain
}
export function IncomeSummary({ snapshot }: { snapshot: Snapshot }) {
  return <VStack alignment="leading" spacing={13} padding={20}
    frame={{ maxWidth: "infinity", alignment: "leading" }}
    background={palette.panel} border={{ style: palette.border, width: 0.6 }}
    clipShape={{ type: "rect", cornerRadius: 20 }}>
    <HStack>
      <Text font={12} foregroundStyle={palette.ink}>最近收益</Text>
    </HStack>
    <Text font={35} fontWeight="semibold" monospacedDigit kerning={-0.6}
      foregroundStyle={quoteColor(snapshot.profit.value)}
      lineLimit={1} minScaleFactor={0.45}>{snapshot.profit.value !== null ? formatAmount(snapshot.profit.value, true) : "待同步"}</Text>
    <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
      <Text font={11} foregroundStyle={palette.muted}>{reportDate(snapshot.day)}</Text>
      <Spacer minLength={0} />
      <Text font={10} foregroundStyle={palette.muted}>最新一份日报</Text>
    </HStack>
  </VStack>
}
export function TrendPanel({ snapshot, now = Date.now() }: { snapshot: Snapshot; now?: number }) {
  const stats = trendStats(trendSeries(snapshot.history, now))
  return <VStack alignment="leading" spacing={14} padding={18} background={palette.panel}
    clipShape={{ type: "rect", cornerRadius: 20 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <HStack frame={{ maxWidth: "infinity" }}>
      <Text font={16} fontWeight="semibold" foregroundStyle={palette.ink}>累计收益走势</Text>
      <Spacer />
      <Text font={11} fontWeight="medium" foregroundStyle={palette.muted}
        padding={{ horizontal: 10, vertical: 5 }} background={palette.soft} clipShape={{ type: "rect", cornerRadius: 8 }}>近7天</Text>
    </HStack>
    <HStack spacing={5}>
      <Text font={11} foregroundStyle={palette.muted}>{`近${stats.count}天记录 ·`}</Text>
      <Text font={11} foregroundStyle={palette.gain}>{`${stats.up}涨`}</Text>
      <Text font={11} foregroundStyle={palette.loss}>{`${stats.down}跌`}</Text>
      {stats.zero ? <Text font={11} foregroundStyle={palette.muted}>{`${stats.zero}平`}</Text> : null}
    </HStack>
    <ProfitTrend snapshot={snapshot} height={142} now={now} />
    {showBalance(snapshot) ? <HStack padding={14} background={palette.panel} clipShape={{ type: "rect", cornerRadius: 14 }}>
      <Text font={12} foregroundStyle={palette.muted}>余额</Text>
      <Spacer />
      <Text font={15} fontWeight="semibold" monospacedDigit foregroundStyle={palette.ink}>{formatAmount(snapshot.balance.value)}</Text>
    </HStack> : null}
  </VStack>
}
