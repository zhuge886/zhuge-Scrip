import { ZStack, Rectangle, VStack, HStack, Text, Spacer, Widget, gradient } from "scripting"
import { formatAmount, object, reportDate, showBalance, Snapshot } from "./model"
import { trendSeries } from "./history"
import { palette, ProfitTrend, quoteColor } from "./ui"

export const WIDGET_RELEASE = "1.6.0"
const CARD = "#F8FAFC"
const SURFACE = gradient("linear", {
  colors: ["#FFFFFF", "#F4F6FA"], startPoint: "topLeading", endPoint: "bottomTrailing",
})

/** The card is explicitly painted; transparency is enabled only by parameter. */
export function transparentParameter(raw: unknown): boolean {
  if (typeof raw !== "string") return false
  const text = raw.trim()
  if (text.toLowerCase() === "transparent") return true
  try { return object(JSON.parse(text)).background === "transparent" } catch { return false }
}
export function previewWidget(): Promise<void> {
  Widget.reloadAll()
  return Widget.preview({ family: "systemSmall", parameters: {
    options: { "默认": JSON.stringify({ background: "stock" }) }, default: "默认",
  } })
}
export function WidgetCard({ snapshot, small = false, url, transparent = false, size, now = Date.now() }: {
  snapshot: Snapshot; small?: boolean; url?: string; transparent?: boolean
  size?: { width: number; height: number }; now?: number
}) {
  const series = trendSeries(snapshot.history, now)
  const hasTrend = series.length >= 2
  const hasBalance = showBalance(snapshot)
  const text = transparent ? { light: palette.ink, dark: "#F3F5F9" } as const : palette.ink
  const secondary = transparent ? { light: palette.muted, dark: "#D6DCE6" } as const : palette.muted
  const amountColor = quoteColor(snapshot.profit.value, transparent)
  const frame = size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
    ? { width: size.width, height: size.height }
    : { maxWidth: "infinity" as const, maxHeight: "infinity" as const }
  return <ZStack frame={frame} background={transparent ? undefined : CARD}
    widgetBackground={transparent ? undefined : CARD} widgetURL={url}>
    {/* A normal shape in the content tree remains visible even when the host
        ignores widgetBackground. The root also has a neutral fallback. */}
    {!transparent ? <Rectangle fill={SURFACE} ignoresSafeArea
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }} /> : null}
    <VStack alignment="leading" spacing={small ? 7 : 8} padding={small ? 14 : 18}
      frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
      <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
        <Text font={small ? 10 : 11} fontWeight="semibold" foregroundStyle={text}>7日收益</Text>
        <Spacer minLength={0} />
        <Text font={small ? 8 : 9} foregroundStyle={secondary}>{`${series.length}天记录`}</Text>
      </HStack>
      {hasTrend ? <ProfitTrend snapshot={snapshot} small={small} transparent={transparent}
        height={small ? hasBalance ? 22 : 34 : hasBalance ? 30 : 44} now={now} /> : null}
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
      {!hasTrend ? <Spacer minLength={0} /> : null}
      {hasBalance ? <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
        <Text font={small ? 8 : 10} foregroundStyle={secondary}>余额</Text>
        <Spacer minLength={0} />
        <Text font={small ? 10 : 12} monospacedDigit foregroundStyle={text}>{formatAmount(snapshot.balance.value)}</Text>
      </HStack> : null}
    </VStack>
  </ZStack>
}
