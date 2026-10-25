import { ZStack, Rectangle, VStack, HStack, Text, Spacer, Widget, gradient } from "scripting"
import { formatAmount, object, reportDate, showBalance, Snapshot } from "./model"
import { trendSeries } from "./history"
import { ProfitTrend } from "./ui"

export const WIDGET_RELEASE = "1.5.2"
const BLUE = "#A6D9FF"
const SKY = gradient("linear", {
  colors: ["#8CCBFA", "#C5E8FF"], startPoint: "topLeading", endPoint: "bottomTrailing",
})

/** Blue is explicit and is not suppressed by host transparent/blur flags. */
export function transparentParameter(raw: unknown): boolean {
  if (typeof raw !== "string") return false
  const text = raw.trim()
  if (text.toLowerCase() === "transparent") return true
  try { return object(JSON.parse(text)).background === "transparent" } catch { return false }
}
export function previewBlueWidget(): Promise<void> {
  Widget.reloadAll()
  return Widget.preview({ family: "systemSmall", parameters: {
    options: { "蓝色": JSON.stringify({ background: "blue" }) }, default: "蓝色",
  } })
}
export function WidgetCard({ snapshot, small = false, url, transparent = false, size, now = Date.now() }: {
  snapshot: Snapshot; small?: boolean; url?: string; transparent?: boolean
  size?: { width: number; height: number }; now?: number
}) {
  const series = trendSeries(snapshot.history, now)
  const hasTrend = series.length >= 2
  const hasBalance = showBalance(snapshot)
  const text = transparent ? { light: "#143650", dark: "#F3F8FE" } as const : "#143650"
  const secondary = transparent ? { light: "#2C506A", dark: "#D4E5F5" } as const : "#2C506A"
  const positive = transparent ? { light: "#0C4F87", dark: "#A4D8FF" } as const : "#0C4F87"
  const negative = transparent ? { light: "#8D2946", dark: "#FFB8C6" } as const : "#8D2946"
  const amountColor = snapshot.profit.value === null || snapshot.profit.value === "0" ? text
    : snapshot.profit.value.startsWith("-") ? negative : positive
  const frame = size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
    ? { width: size.width, height: size.height }
    : { maxWidth: "infinity" as const, maxHeight: "infinity" as const }
  return <ZStack frame={frame} background={transparent ? undefined : BLUE}
    widgetBackground={transparent ? undefined : BLUE} widgetURL={url}>
    {/* A normal shape in the content tree remains visible even when the host
        ignores widgetBackground. The solid root is a gradient fallback. */}
    {!transparent ? <Rectangle fill={SKY} ignoresSafeArea
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }} /> : null}
    <VStack alignment="leading" spacing={small ? 7 : 8} padding={small ? 14 : 18}
      frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "leading" }}>
      <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
        <Text font={small ? 10 : 11} fontWeight="medium" foregroundStyle={secondary}>7日收益</Text>
        <Spacer minLength={0} />
        <Text font={small ? 8 : 9} foregroundStyle={secondary}>{`${series.length}天记录`}</Text>
      </HStack>
      {hasTrend ? <ProfitTrend snapshot={snapshot} small={small} transparent={transparent} blueBackground={!transparent}
        height={small ? hasBalance ? 22 : 34 : hasBalance ? 30 : 44} now={now} /> : <Spacer minLength={0} />}
      <VStack alignment="leading" spacing={hasTrend ? 4 : 6} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
          <Text font={small ? 9 : 10} foregroundStyle={secondary}>最近收益</Text>
          <Spacer minLength={0} />
          {hasTrend ? <Text font={small ? 8 : 10} foregroundStyle={secondary}>{reportDate(snapshot.day)}</Text> : null}
        </HStack>
        <Text font={small ? hasBalance ? 27 : 30 : 34} fontWeight="semibold" monospacedDigit kerning={-0.5}
          foregroundStyle={amountColor} lineLimit={1} minScaleFactor={0.4}
          frame={{ maxWidth: "infinity", alignment: "leading" }}>
          {snapshot.profit.value !== null ? formatAmount(snapshot.profit.value, true) : "待同步"}
        </Text>
        {!hasTrend ? <Text font={small ? 10 : 11} foregroundStyle={secondary}>{reportDate(snapshot.day)}</Text> : null}
      </VStack>
      {hasBalance ? <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
        <Text font={small ? 8 : 10} foregroundStyle={secondary}>余额</Text>
        <Spacer minLength={0} />
        <Text font={small ? 10 : 12} monospacedDigit foregroundStyle={text}>{formatAmount(snapshot.balance.value)}</Text>
      </HStack> : null}
    </VStack>
  </ZStack>
}
