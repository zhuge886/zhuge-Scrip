// 小尺寸 2×2、中尺寸横排、大尺寸 2×2；根据可用空间调整圆环。
import { VStack, HStack, Text } from "scripting"
import type { BatteryItem, Settings } from "./model"
import { DeviceCell, EmptyCell } from "./ui"
import { COLORS } from "./theme"
import { formatPercent } from "./battery"
import { chargeText } from "./copy"

export type Family = string
export interface GridProps {
  items: BatteryItem[]; settings: Settings; family: Family;
  size?: { width: number; height: number }; widget?: boolean; transparent?: boolean; url?: string
}
export function gridLayout(family: Family, size: { width: number; height: number }, names: boolean) {
  const accessory = family.startsWith("accessory")
  const columns = accessory ? 1 : family === "systemMedium" ? 4 : 2
  const rows = accessory || family === "systemMedium" ? 1 : 2
  const gap = accessory ? 0 : 8
  // 系统桌面内边距保守预留 16pt；内部只留 4pt，避免双重大留白。
  const width = Number.isFinite(size.width) ? Math.max(44, size.width) : 158
  const height = Number.isFinite(size.height) ? Math.max(36, size.height) : 158
  const inset = accessory ? 0 : 40
  const nameHeight = names ? 16 : 0
  const ringSize = Math.max(20, Math.min(accessory ? 56 : 110, Math.floor(Math.min(
    (width - inset - gap * (columns - 1)) / columns,
    (height - inset - gap * (rows - 1)) / rows - nameHeight))))
  return { columns, rows, gap, ringSize }
}
export function BatteryGrid({ items, settings, family, size = { width: 158, height: 158 }, widget = true, transparent = false, url }: GridProps) {
  const first = items[0]
  if (family === "accessoryInline") return <Text>{first ? `${first.name} ${formatPercent(first.level)} · ${chargeText(first.charge)}` : "暂无电量"}</Text>
  if (family === "accessoryRectangular") return <HStack spacing={6}>
    {first ? DeviceCell({ item: first, settings: { ...settings, showDeviceNames: false }, ringSize: 32 }) : EmptyCell({ size: 32 })}
    <VStack alignment="leading" spacing={2}><Text font="caption">{first?.name ?? "电量"}</Text>
      <Text font="caption">{first ? chargeText(first.charge) : "暂不可用"}</Text></VStack>
  </HStack>
  const layout = gridLayout(family, size, settings.showDeviceNames && family !== "accessoryCircular")
  const count = layout.rows * layout.columns
  const slots = Array.from({ length: count }, (_, index) => items[index] ?? null)
  return <VStack spacing={layout.gap} padding={family.startsWith("accessory") ? 0 : 4}
    frame={widget ? { maxWidth: "infinity", maxHeight: "infinity" } : { width: size.width - 32, height: size.height - 32 }}
    widgetBackground={widget && !transparent ? COLORS.cardBg : undefined} widgetURL={url}>
    {Array.from({ length: layout.rows }, (_, row) => <HStack key={row} spacing={layout.gap}>
      {slots.slice(row * layout.columns, (row + 1) * layout.columns).map((item, index) =>
        <VStack key={item?.id ?? `empty-${row}-${index}`}>
          {item ? DeviceCell({ item, settings: family === "accessoryCircular" ? { ...settings, showDeviceNames: false } : settings, ringSize: layout.ringSize }) : EmptyCell({ size: layout.ringSize })}
        </VStack>)}
    </HStack>)}
  </VStack>
}
