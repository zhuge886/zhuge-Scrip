import { VStack, HStack, Text, Spacer, Image } from "scripting"
import { formatAmount, reportDate, showBalance, Snapshot, syncTime } from "./model"

export const palette = { ink: "#EDF5EE", mint: "#80EDB0", muted: "#91A99B", panel: "#14251D", page: "#0C1511", loss: "#FFA391" } as const
export function WalletCard({ snapshot, small = false, url }: { snapshot: Snapshot; small?: boolean; url?: string }) {
  const hasProfit = snapshot.profit.value !== null
  const balanceVisible = showBalance(snapshot)
  const color = snapshot.profit.value?.startsWith("-") ? palette.loss : palette.mint
  const saved = snapshot.profit.status === "cached"
  const footer = snapshot.needsLogin ? (hasProfit ? "登录过期 · 点按重新扫码" : "点按打开 · 微信扫码")
    : !hasProfit ? "暂无日报 · 点按刷新"
    : `${saved ? "上次同步" : "更新于"} ${syncTime(snapshot.profit.updatedAt)}`
  return <VStack alignment="leading" spacing={small ? 4 : 6} padding={small ? 12 : 16}
    background={{ colors: ["#1C3D2C", "#0D1B14"], startPoint: "topLeading", endPoint: "bottomTrailing" }}
    widgetURL={url} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "leading" }}>
    <HStack spacing={5} frame={{ maxWidth: "infinity" }}>
      <Image systemName="triangle.fill" font={small ? 9 : 11} foregroundStyle={palette.mint} />
      <Text font={small ? 11 : 13} fontWeight="semibold" foregroundStyle={palette.ink}>三角洲行动</Text>
      <Spacer minLength={0} />
      {!small ? <Text font={10} foregroundStyle={palette.muted}>烽火地带</Text> : null}
    </HStack>
    <Spacer minLength={0} />
    <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack spacing={small ? 5 : 8}>
        <Text font={small ? 10 : 12} foregroundStyle={palette.muted}>最近收益</Text>
        <Text font={small ? 10 : 12} fontWeight="medium" foregroundStyle={palette.ink}>{reportDate(snapshot.day)}</Text>
      </HStack>
      <Text font={small ? 30 : 36} fontWeight="bold" monospacedDigit foregroundStyle={color}
        lineLimit={1} minScaleFactor={0.45}>
        {hasProfit ? formatAmount(snapshot.profit.value, true) : "待同步"}
      </Text>
      {!balanceVisible ? <Text font={small ? 9 : 10} foregroundStyle={palette.muted}>哈夫币 · 最近一份游戏日报</Text> : null}
    </VStack>
    <Spacer minLength={0} />
    {balanceVisible ? <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
      <Text font={small ? 9 : 11} foregroundStyle={palette.muted}>总哈夫币</Text>
      <Spacer minLength={0} />
      <Text font={small ? 11 : 14} fontWeight="semibold" monospacedDigit foregroundStyle={palette.ink}
        lineLimit={1} minScaleFactor={0.5}>{formatAmount(snapshot.balance.value)}</Text>
    </HStack> : null}
    <HStack spacing={4}>
      <Image systemName={saved || snapshot.needsLogin ? "clock" : "arrow.clockwise"} font={8} foregroundStyle={palette.muted} />
      <Text font={small ? 8 : 10} foregroundStyle={palette.muted} lineLimit={1}>{footer}</Text>
    </HStack>
  </VStack>
}
