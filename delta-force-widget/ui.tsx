import { VStack, HStack, Text, Spacer } from "scripting"
import { formatAmount, reportDate, showBalance, Snapshot } from "./model"

export const palette = { ink: "#FFFFFF", mint: "#80EDB0", muted: "#CBD4CE", panel: "#14251D", page: "#0C1511", loss: "#FFA391" } as const

/** Content only. Native transparent / blur widget backgrounds belong to Scripting. */
export function WalletCard({ snapshot, small = false, url }: { snapshot: Snapshot; small?: boolean; url?: string }) {
  const hasProfit = snapshot.profit.value !== null
  return <VStack alignment="leading" spacing={6} padding={small ? 8 : 12}
    widgetURL={url} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "leading" }}>
    <Text font={small ? 12 : 14} fontWeight="semibold" foregroundStyle={palette.ink}>三角洲行动</Text>
    <Spacer minLength={0} />
    <VStack alignment="leading" spacing={5} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Text font={small ? 10 : 12} foregroundStyle={palette.ink} opacity={0.8} lineLimit={1}>{reportDate(snapshot.day)}</Text>
      <Text font={small ? 32 : 42} fontWeight="semibold" monospacedDigit foregroundStyle={palette.ink}
        lineLimit={1} minScaleFactor={0.4}>{hasProfit ? formatAmount(snapshot.profit.value, true) : "待同步"}</Text>
      <Text font={small ? 10 : 11} foregroundStyle={palette.ink} opacity={0.75}>哈夫币 · 最近收益</Text>
    </VStack>
    <Spacer minLength={0} />
    {showBalance(snapshot) ? <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
      <Text font={small ? 9 : 11} foregroundStyle={palette.ink} opacity={0.75}>总哈夫币</Text>
      <Spacer minLength={0} />
      <Text font={small ? 11 : 14} monospacedDigit foregroundStyle={palette.ink}
        lineLimit={1} minScaleFactor={0.5}>{formatAmount(snapshot.balance.value)}</Text>
    </HStack> : null}
  </VStack>
}
