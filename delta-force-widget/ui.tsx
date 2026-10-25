import { VStack, HStack, Text, Spacer, Chart, LineChart, AreaChart } from "scripting"
import type { DynamicShapeStyle, ShapeStyle } from "scripting"
import { formatAmount, reportDate, showBalance, Snapshot } from "./model"
import { historyWindow, trendSeries } from "./history"

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
export function ProfitTrend({ snapshot, small = false, transparent = false, height, now = Date.now() }: {
  snapshot: Snapshot; small?: boolean; transparent?: boolean; height?: number; now?: number
}) {
  const theme = colors(transparent)
  const lineColor = quoteColor(snapshot.profit.value, transparent)
  const series = trendSeries(snapshot.history, now)
  const window = historyWindow(now)
  const frame = height != null ? { maxWidth: "infinity" as const, height }
    : { maxWidth: "infinity" as const, minHeight: small ? 26 : 32, maxHeight: "infinity" as const }
  const rgb = snapshot.profit.value?.startsWith("-") ? "20,125,66" : snapshot.profit.value === "0" ? "95,104,118" : "217,37,45"
  const fade: ShapeStyle | DynamicShapeStyle = transparent ? {
    light: { colors: [`rgba(${rgb},0.14)`, `rgba(${rgb},0)`], startPoint: "top", endPoint: "bottom" },
    dark: { colors: [`rgba(${rgb},0.22)`, `rgba(${rgb},0)`], startPoint: "top", endPoint: "bottom" },
  } : { colors: [`rgba(${rgb},0.14)`, `rgba(${rgb},0)`], startPoint: "top", endPoint: "bottom" }
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
      label: point.date, value: point.y, foregroundStyle: lineColor,
      interpolationMethod: "monotone", symbol: index === series.length - 1 ? "circle" : undefined,
      symbolSize: index === series.length - 1 ? (small ? 9 : 13) : undefined,
      lineStyle: { lineWidth: small ? 1.35 : 1.6, lineCap: "round", lineJoin: "round" },
    }))} />
  </Chart>
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
  const window = historyWindow(now)
  return <VStack alignment="leading" spacing={14} padding={18} background={palette.panel}
    clipShape={{ type: "rect", cornerRadius: 20 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <HStack frame={{ maxWidth: "infinity" }}>
      <Text font={16} fontWeight="semibold" foregroundStyle={palette.ink}>收益走势</Text>
      <Spacer />
      <Text font={11} fontWeight="medium" foregroundStyle={palette.muted}
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
