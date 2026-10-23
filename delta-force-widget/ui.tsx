import { VStack, HStack, Text, Spacer, Image } from "scripting"
import { formatAmount, Metric, Snapshot } from "./model"

const INK = "#DCE8E1"
const MINT = "#72E5AB"
const MUTED = "#93A79A"
function AmountView({ title, metric, signed, small }: { title: string; metric: Metric; signed?: boolean; small: boolean }) {
  const color = metric.value?.startsWith("-") ? "#FF9588" : signed ? MINT : INK
  return <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <Text font={small ? 10 : 11} foregroundStyle={MUTED}>{title}</Text>
    <Text font={small ? 22 : 29} fontWeight="bold" monospacedDigit foregroundStyle={color}
      lineLimit={1} minScaleFactor={0.45}>{formatAmount(metric.value, signed)}</Text>
    <Text font={9} foregroundStyle={MUTED} lineLimit={1}>{metric.status === "cached" ? "缓存 · 哈夫币" : "哈夫币"}</Text>
  </VStack>
}
export function WalletCard({ snapshot, small = false, url }: { snapshot: Snapshot; small?: boolean; url?: string }) {
  const info = snapshot.needsLogin ? "点按查看授权与查询状态"
    : snapshot.balance.status === "cached" || snapshot.profit.status === "cached" ? "离线或授权失效 · 显示缓存"
    : snapshot.profit.value === null ? snapshot.profit.message
    : "腾讯日报 · 北京时间"
  return <VStack alignment="leading" spacing={small ? 6 : 12} padding={small ? 12 : 16}
    background="#101F18" widgetURL={url} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "leading" }}>
    <HStack spacing={5}>
      <Image systemName="triangle.fill" font={10} foregroundStyle={MINT} />
      <Text font={small ? 11 : 13} fontWeight="semibold" foregroundStyle={INK}>三角洲行动</Text>
      <Spacer />
      {!small ? <Text font={10} foregroundStyle={MUTED}>烽火地带</Text> : null}
    </HStack>
    {small ? <VStack alignment="leading" spacing={5}>
      <AmountView title={`昨日收益 · ${snapshot.day.slice(5)}`} metric={snapshot.profit} signed small />
      <AmountView title="总哈夫币" metric={snapshot.balance} small />
    </VStack> : <HStack spacing={18}>
      <AmountView title={`昨日收益 · ${snapshot.day.slice(5)}`} metric={snapshot.profit} signed small={false} />
      <AmountView title="总哈夫币" metric={snapshot.balance} small={false} />
    </HStack>}
    <Spacer minLength={0} />
    <Text font={small ? 8 : 10} foregroundStyle={MUTED} lineLimit={1}>{info}</Text>
  </VStack>
}
