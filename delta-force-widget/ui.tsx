import { VStack, HStack, Text, Spacer, Chart, LineChart, AreaChart } from "scripting"
import type { DynamicShapeStyle, ShapeStyle } from "scripting"
import { formatAmount, object, reportDate, showBalance, Snapshot } from "./model"
import { historyWindow, trendSeries } from "./history"

export const palette = {
  ink: "#1D2C3A", muted: "#63717D", accent: "#176BAE", line: "#2789D3",
  soft: "#EDF6FE", panel: "#F7FAFD", border: "#E8EFF5", page: "#FFFFFF", loss: "#B44557",
} as const

export function usesTransparentBackground(context: unknown): boolean {
  const flags = object(context)
  return flags.isTransparentMode === true || flags.isBlurMode === true || flags.isTransparentBackground === true
}
function colors(transparent: boolean) {
  return {
    text: transparent ? { light: palette.ink, dark: "#F3F8FE" } as const : palette.ink,
    secondary: transparent ? { light: palette.muted, dark: "#D4E5F5" } as const : palette.muted,
    accent: transparent ? { light: palette.accent, dark: "#A4D8FF" } as const : palette.accent,
    loss: transparent ? { light: palette.loss, dark: "#FFB8C6" } as const : palette.loss,
    line: transparent ? { light: palette.line, dark: "#9DD4FF" } as const : palette.line,
  }
}
export function ProfitTrend({ snapshot, small = false, transparent = false, height, now = Date.now() }: {
  snapshot: Snapshot; small?: boolean; transparent?: boolean; height?: number; now?: number
}) {
  const theme = colors(transparent)
  const series = trendSeries(snapshot.history, now)
  const window = historyWindow(now)
  const frame = height != null ? { maxWidth: "infinity" as const, height }
    : { maxWidth: "infinity" as const, minHeight: small ? 26 : 32, maxHeight: "infinity" as const }
  const fade: ShapeStyle | DynamicShapeStyle = transparent ? {
    light: { colors: ["rgba(39,137,211,0.18)", "rgba(39,137,211,0)"], startPoint: "top", endPoint: "bottom" },
    dark: { colors: ["rgba(157,212,255,0.20)", "rgba(157,212,255,0)"], startPoint: "top", endPoint: "bottom" },
  } : { colors: ["rgba(64,163,239,0.20)", "rgba(64,163,239,0)"], startPoint: "top", endPoint: "bottom" }
  if (!series.length) return <VStack frame={{ ...frame, alignment: "center" }} spacing={4}>
    <Text font={small ? 10 : 12} foregroundStyle={theme.secondary}>等待收益记录</Text>
  </VStack>
  return <Chart frame={frame} chartXAxis="hidden" chartYAxis="hidden" chartLegend="hidden"
    chartXScale={{ from: new Date(`${window.from}T00:00:00+08:00`), to: new Date(`${window.to}T00:00:00+08:00`) }}
    chartYScale={{ from: -0.22, to: 1.24 }}>
    {series.length > 1 ? <AreaChart marks={series.map(point => ({
      label: point.date, value: point.y, foregroundStyle: fade, interpolationMethod: "monotone",
    }))} /> : null}
    <LineChart marks={series.map((point, index) => ({
      label: point.date, value: point.y, foregroundStyle: theme.line,
      interpolationMethod: "monotone", symbol: index === series.length - 1 ? "circle" : undefined,
      symbolSize: index === series.length - 1 ? (small ? 9 : 13) : undefined,
      lineStyle: { lineWidth: small ? 1.35 : 1.6, lineCap: "round", lineJoin: "round" },
    }))} />
  </Chart>
}
export function WalletCard({ snapshot, small = false, url, transparent = false, now = Date.now() }: {
  snapshot: Snapshot; small?: boolean; url?: string; transparent?: boolean; now?: number
}) {
  const theme = colors(transparent)
  const hasProfit = snapshot.profit.value !== null
  const hasBalance = showBalance(snapshot)
  const amountColor = !hasProfit || snapshot.profit.value === "0" ? theme.text
    : snapshot.profit.value!.startsWith("-") ? theme.loss : theme.accent
  return <VStack alignment="leading" spacing={small ? 7 : 9} padding={small ? 10 : 14}
    widgetBackground={transparent ? undefined : "#FFFFFF"}
    widgetURL={url} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "leading" }}>
    <Text font={small ? 9 : 10} fontWeight="medium" foregroundStyle={theme.secondary}>近7天</Text>
    <ProfitTrend snapshot={snapshot} small={small} transparent={transparent} now={now} />
    <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack spacing={4} frame={{ maxWidth: "infinity" }}>
        <Text font={small ? 9 : 10} foregroundStyle={theme.secondary}>最近收益</Text>
        <Spacer minLength={0} />
        <Text font={small ? 8 : 10} foregroundStyle={theme.secondary} lineLimit={1}>{reportDate(snapshot.day)}</Text>
      </HStack>
      <Text font={small ? 27 : 33} fontWeight="semibold" monospacedDigit kerning={-0.5} foregroundStyle={amountColor}
        frame={{ maxWidth: "infinity", alignment: "leading" }} lineLimit={1} minScaleFactor={0.4}>
        {hasProfit ? formatAmount(snapshot.profit.value, true) : "待同步"}
      </Text>
    </VStack>
    {hasBalance ? <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
      <Text font={small ? 8 : 10} foregroundStyle={theme.secondary}>余额</Text>
      <Spacer minLength={0} />
      <Text font={small ? 10 : 12} monospacedDigit foregroundStyle={theme.text}
        lineLimit={1} minScaleFactor={0.5}>{formatAmount(snapshot.balance.value)}</Text>
    </HStack> : null}
  </VStack>
}
export function IncomeSummary({ snapshot }: { snapshot: Snapshot }) {
  return <VStack alignment="leading" spacing={13} padding={20}
    frame={{ maxWidth: "infinity", alignment: "leading" }}
    background={{ colors: ["#DBF1FF", "#B8DEFB"], startPoint: "topLeading", endPoint: "bottomTrailing" }}
    clipShape={{ type: "rect", cornerRadius: 24 }}>
    <HStack>
      <Text font={12} foregroundStyle={palette.ink}>最近收益</Text>
    </HStack>
    <Text font={35} fontWeight="semibold" monospacedDigit kerning={-0.6}
      foregroundStyle={snapshot.profit.value?.startsWith("-") ? palette.loss : palette.accent}
      lineLimit={1} minScaleFactor={0.45}>{snapshot.profit.value !== null ? formatAmount(snapshot.profit.value, true) : "待同步"}</Text>
    <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
      <Text font={11} foregroundStyle="#34546E">{reportDate(snapshot.day)}</Text>
      <Spacer minLength={0} />
      <Text font={10} foregroundStyle="#34546E">最新一份日报</Text>
    </HStack>
  </VStack>
}
export function TrendPanel({ snapshot, now = Date.now() }: { snapshot: Snapshot; now?: number }) {
  const window = historyWindow(now)
  return <VStack alignment="leading" spacing={14} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <HStack frame={{ maxWidth: "infinity" }}>
      <Text font={16} fontWeight="semibold" foregroundStyle={palette.ink}>收益走势</Text>
      <Spacer />
      <Text font={11} fontWeight="medium" foregroundStyle={palette.accent}
        padding={{ horizontal: 10, vertical: 5 }} background={palette.soft} clipShape={{ type: "rect", cornerRadius: 8 }}>近7天</Text>
    </HStack>
    <ProfitTrend snapshot={snapshot} height={142} now={now} />
    <HStack frame={{ maxWidth: "infinity" }}>
      <Text font={10} foregroundStyle={palette.muted}>{reportDate(window.from, true)}</Text>
      <Spacer />
      <Text font={10} foregroundStyle={palette.muted}>{reportDate(window.to, true)}</Text>
    </HStack>
    {showBalance(snapshot) ? <HStack padding={14} background={palette.panel} clipShape={{ type: "rect", cornerRadius: 14 }}>
      <Text font={12} foregroundStyle={palette.muted}>余额</Text>
      <Spacer />
      <Text font={15} fontWeight="semibold" monospacedDigit foregroundStyle={palette.ink}>{formatAmount(snapshot.balance.value)}</Text>
    </HStack> : null}
  </VStack>
}
