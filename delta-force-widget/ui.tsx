import { VStack, HStack, Text, Spacer } from "scripting"
import { formatAmount, object, reportDate, showBalance, Snapshot } from "./model"

export const palette = { ink: "#FFFFFF", mint: "#80EDB0", muted: "#CBD4CE", panel: "#14251D", page: "#0C1511", loss: "#FFA391" } as const

/** New native transparent/blur widgets and older wallpaper-image mode are distinct. */
export function usesTransparentBackground(context: unknown): boolean {
  const flags = object(context)
  return flags.isTransparentMode === true || flags.isBlurMode === true || flags.isTransparentBackground === true
}
export function WalletCard({ snapshot, small = false, url, transparent = false }: {
  snapshot: Snapshot; small?: boolean; url?: string; transparent?: boolean
}) {
  const hasProfit = snapshot.profit.value !== null
  const text = transparent ? { light: "#17231C", dark: "#F7FBF8" } as const : "#17231C"
  const secondary = transparent ? { light: "#34493C", dark: "#DFEAE3" } as const : "#536158"
  const positive = transparent ? { light: "#087446", dark: "#8BF2BD" } as const : "#087446"
  const negative = transparent ? { light: "#AD2639", dark: "#FFB9C1" } as const : "#AD2639"
  const amountColor = !hasProfit || snapshot.profit.value === "0" ? text
    : snapshot.profit.value!.startsWith("-") ? negative : positive
  return <VStack alignment="leading" spacing={6} padding={small ? 8 : 12}
    widgetBackground={transparent ? undefined : "#FFFFFF"}
    widgetURL={url} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "leading" }}>
    <Text font={small ? 12 : 14} fontWeight="semibold" foregroundStyle={text}>三角洲行动</Text>
    <Spacer minLength={0} />
    <VStack alignment="leading" spacing={5} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack spacing={6}>
        <Text font={small ? 10 : 12} foregroundStyle={text}>最近收益</Text>
        <Text font={small ? 10 : 12} foregroundStyle={secondary} lineLimit={1}>{reportDate(snapshot.day)}</Text>
      </HStack>
      <Text font={small ? 32 : 42} fontWeight="semibold" monospacedDigit foregroundStyle={amountColor}
        lineLimit={1} minScaleFactor={0.4}>{hasProfit ? formatAmount(snapshot.profit.value, true) : "待同步"}</Text>
      <Text font={small ? 10 : 11} foregroundStyle={secondary}>哈夫币</Text>
    </VStack>
    <Spacer minLength={0} />
    {showBalance(snapshot) ? <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
      <Text font={small ? 9 : 11} foregroundStyle={secondary}>总哈夫币</Text>
      <Spacer minLength={0} />
      <Text font={small ? 11 : 14} monospacedDigit foregroundStyle={text}
        lineLimit={1} minScaleFactor={0.5}>{formatAmount(snapshot.balance.value)}</Text>
    </HStack> : null}
  </VStack>
}
