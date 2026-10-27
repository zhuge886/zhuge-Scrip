import { ZStack, Rectangle, RoundedRectangle, VStack, HStack, Image, Text, Spacer, Widget, gradient, EnvironmentValuesReader } from "scripting"
import { formatAmount, reportDate, showBalance, Snapshot } from "./model"
import { trendSeries } from "./history"
import { ProfitTrend } from "./trend-view"
import { amountFont, signColor, themeParameter, ThemeMode, trendStats, widgetTheme, WidgetTheme } from "./presentation"

export const WIDGET_RELEASE = "1.7.0"
export { themeParameter } from "./presentation"
export function transparentParameter(raw: unknown): boolean { return themeParameter(raw) === "transparent" }
export function previewWidget(family: "systemSmall" | "systemMedium" = "systemSmall"): Promise<void> {
  Widget.reloadAll()
  return Widget.preview<string>({ family, parameters: {
    options: { "跟随系统": '{"theme":"system"}', "浅色": '{"theme":"light"}',
      "深色": '{"theme":"dark"}', "透明": "transparent" }, default: "跟随系统",
  } })
}
function Stats({ series, theme, small }: { series: ReturnType<typeof trendSeries>; theme: WidgetTheme; small: boolean }) {
  const s = trendStats(series), font = small ? 9 : 10
  return <HStack spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <Text font={font} foregroundStyle={theme.muted} lineLimit={1}>{`近${s.count}天记录${s.count ? " ·" : ""}`}</Text>
    {s.up ? <Text font={font} fontWeight="medium" foregroundStyle={theme.gain}>{`${s.up}涨`}</Text> : null}
    {s.down ? <Text font={font} fontWeight="medium" foregroundStyle={theme.loss}>{`${s.down}跌`}</Text> : null}
    {s.zero ? <Text font={font} foregroundStyle={theme.neutral}>{`${s.zero}平`}</Text> : null}
  </HStack>
}
function Title({ theme, small }: { theme: WidgetTheme; small: boolean }) {
  return <HStack spacing={small ? 5 : 7}>
    <Image systemName="chart.bar.fill" font={small ? 11 : 13} foregroundStyle={theme.gain}
      frame={{ width: small ? 19 : 24, height: small ? 19 : 24 }}
      background={theme.transparent ? undefined : theme.dark ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.55)"}
      clipShape={{ type: "rect", cornerRadius: 6 }} />
    <Text font={small ? 12 : 14} fontWeight="semibold" foregroundStyle={theme.text} lineLimit={1}>7日收益</Text>
  </HStack>
}
function Amount({ snapshot, theme, width, preferred }: { snapshot: Snapshot; theme: WidgetTheme; width: number; preferred: number }) {
  const value = snapshot.profit.value
  const label = value !== null ? formatAmount(value, true) : "待同步"
  return <Text font={amountFont(label, width, preferred)} fontWeight="semibold" monospacedDigit kerning={-0.6}
    foregroundStyle={value === null ? theme.muted : signColor(value === "0" ? 0 : value.startsWith("-") ? -1 : 1, theme)}
    lineLimit={1} minScaleFactor={0.05} frame={{ maxWidth: "infinity", alignment: "leading" }}>{label}</Text>
}
function LastDate({ snapshot, theme, small }: { snapshot: Snapshot; theme: WidgetTheme; small: boolean }) {
  return <HStack spacing={4} frame={{ maxWidth: "infinity" }}>
    <Text font={small ? 9 : 10} foregroundStyle={theme.muted} lineLimit={1}>最近收益</Text>
    <Spacer minLength={0} />
    <Text font={small ? 8 : 9} foregroundStyle={theme.muted} lineLimit={1}>{reportDate(snapshot.day)}</Text>
  </HStack>
}
function Balance({ snapshot, theme }: { snapshot: Snapshot; theme: WidgetTheme }) {
  return showBalance(snapshot) ? <HStack spacing={4} frame={{ maxWidth: "infinity" }}>
    <Text font={8} foregroundStyle={theme.muted}>余额</Text><Spacer minLength={0} />
    <Text font={9} foregroundStyle={theme.text} monospacedDigit lineLimit={1} minScaleFactor={0.3}>{formatAmount(snapshot.balance.value)}</Text>
  </HStack> : null
}
type CardProps = {
  snapshot: Snapshot; small?: boolean; url?: string; transparent?: boolean
  theme?: ThemeMode; appearance?: "light" | "dark"; size?: { width: number; height: number }; now?: number
}
/** The environment reader updates native text AND canvas when the system theme changes. */
export function AdaptiveWidgetCard(props: CardProps) {
  if (EnvironmentValuesReader) return <EnvironmentValuesReader keys={["colorScheme"]}>
    {values => <WidgetCard {...props} appearance={values.colorScheme} />}
  </EnvironmentValuesReader>
  return <WidgetCard {...props} appearance={typeof Device !== "undefined" ? Device.colorScheme : "light"} />
}
export function WidgetCard({ snapshot, small = false, url, transparent = false, theme: mode = "system", appearance = "light", size, now = Date.now() }: CardProps) {
  const theme = widgetTheme(transparent ? "transparent" : mode, appearance)
  const series = trendSeries(snapshot.history, now)
  const validSize = size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
  const width = validSize ? size.width : small ? 158 : 338
  const height = validSize ? size.height : 158
  const pad = small ? 12 : 14, inner = width - pad * 2, radius = small ? 24 : 26
  const leftWidth = (inner - 14) * 0.48
  const chartHeight = small ? Math.max(20, height - pad * 2 - 90 - (showBalance(snapshot) ? 14 : 0))
    : Math.max(56, height - pad * 2 - 23)
  const frame = validSize ? { width, height } : { maxWidth: "infinity" as const, maxHeight: "infinity" as const }
  return <ZStack frame={frame} background={theme.transparent ? undefined : theme.base}
    widgetBackground={theme.transparent ? undefined : theme.base} widgetURL={url}
    preferredColorScheme={mode === "light" || mode === "dark" ? mode : undefined}>
    {!theme.transparent ? <ZStack ignoresSafeArea frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      shadow={{ color: theme.dark ? "rgba(0,0,0,0.12)" : "rgba(43,67,100,0.06)", radius: 6, y: 2 }}>
      {/* Material is native; the gradient remains a readable fallback if the host cannot blur. */}
      <Rectangle fill="regularMaterial" background={theme.base} />
      <Rectangle fill={gradient("linear", { colors: theme.surface, startPoint: "topLeading", endPoint: "bottomTrailing" })}
        opacity={0.94} />
      <RoundedRectangle cornerRadius={radius} fill="clear"
        stroke={{ shapeStyle: gradient("linear", { colors: theme.highlight, startPoint: "top", endPoint: "bottom" }),
          strokeStyle: { lineWidth: 0.65 } }} padding={0.5} />
    </ZStack> : null}
    {small ? <VStack alignment="leading" spacing={3} padding={pad}
      frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
      <HStack spacing={3} frame={{ maxWidth: "infinity" }}>
        <Title theme={theme} small /><Spacer minLength={0} />
        <Text font={8} foregroundStyle={theme.muted} lineLimit={1}>{`${series.length}天记录`}</Text>
      </HStack>
      <Stats series={series} theme={theme} small />
      <ProfitTrend snapshot={snapshot} small height={chartHeight} now={now} theme={theme} />
      <Spacer minLength={0} />
      <LastDate snapshot={snapshot} theme={theme} small />
      <Amount snapshot={snapshot} theme={theme} width={inner} preferred={28} />
      <Balance snapshot={snapshot} theme={theme} />
    </VStack> : <HStack alignment="top" spacing={14} padding={pad}
      frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
      <VStack alignment="leading" spacing={6} frame={{ width: leftWidth, maxHeight: "infinity" }}>
        <Title theme={theme} small={false} />
        <Stats series={series} theme={theme} small={false} />
        <Spacer minLength={0} />
        <Amount snapshot={snapshot} theme={theme} width={leftWidth} preferred={32} />
        <Spacer minLength={0} />
        <LastDate snapshot={snapshot} theme={theme} small={false} />
        <Balance snapshot={snapshot} theme={theme} />
      </VStack>
      <VStack alignment="trailing" spacing={5} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <Text font={10} foregroundStyle={theme.muted}>{`${series.length}天记录`}</Text>
        <ProfitTrend snapshot={snapshot} height={chartHeight} now={now} theme={theme} />
      </VStack>
    </HStack>}
  </ZStack>
}
