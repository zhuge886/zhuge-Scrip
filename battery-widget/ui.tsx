// 共享纯 UI：系统风格的设备图标、细圆环与百分比；不访问数据或权限。
import { ZStack, VStack, HStack, Text, Image, Circle } from "scripting"
import type { BatteryItem, Settings } from "./model"
import { formatPercent } from "./battery"
import { chargeText } from "./copy"
import { report } from "./diagnostics"
import { COLORS, levelColor } from "./theme"

export interface RingProps { item: BatteryItem; settings: Settings; size: number; lineWidth?: number }
export function BatteryRing({ item, settings, size, lineWidth = Math.max(4, Math.round(size * 0.08)) }: RingProps) {
  const color = levelColor(item.level, item.charge, settings)
  const progress = item.level == null ? 0 : Math.max(0, Math.min(1, item.level))
  const iconSize = Math.max(12, Math.min(30, Math.round(size * 0.32)))
  const percentSize = Math.max(10, Math.min(20, Math.round(size * 0.25)))
  return <ZStack frame={{ width: size, height: size }}>
    <Circle stroke={{ shapeStyle: COLORS.track, strokeStyle: { lineWidth, lineCap: "round" } }} />
    {item.level != null ? <Circle
      trim={{ from: 0, to: progress }}
      stroke={{ shapeStyle: color, strokeStyle: { lineWidth, lineCap: "round" } }}
      rotationEffect={-90} widgetAccentable
    /> : null}
    <VStack spacing={1}>
      <Image systemName={item.symbol} resizable scaleToFit foregroundStyle={COLORS.text}
        frame={{ width: iconSize, height: iconSize }} />
      <HStack spacing={1}>
        {item.charge === "charging" ? <Image systemName="bolt.fill" resizable scaleToFit
          foregroundStyle={color} frame={{ width: 8, height: 10 }} widgetAccentable /> : null}
        <Text font={percentSize} fontWeight="semibold" foregroundStyle={COLORS.text} lineLimit={1} minScaleFactor={0.7}>
          {formatPercent(item.level)}
        </Text>
      </HStack>
    </VStack>
  </ZStack>
}

export interface CellProps { item: BatteryItem; settings: Settings; ringSize: number }
export function DeviceCell({ item, settings, ringSize }: CellProps) {
  try {
    return <VStack key={item.id} spacing={3} opacity={!item.connected && item.kind !== "phone" ? 0.5 : 1}>
      {BatteryRing({ item, settings, size: ringSize })}
      {settings.showDeviceNames ? <Text font={11} foregroundStyle={COLORS.subtext} lineLimit={1} minScaleFactor={0.7}>
        {item.name}
      </Text> : null}
    </VStack>
  } catch (error) {
    report("设备圆环绘制", error)
    return <VStack key={item.id}>
      <Text font="caption">{formatPercent(item.level)}</Text>
      <Text font="caption">{chargeText(item.charge)}</Text>
    </VStack>
  }
}

// 空槽仅画轨道，不代表已发现配件，也不填充或伪造百分比。
export function EmptyCell({ size }: { size: number }) {
  return <Circle stroke={{ shapeStyle: COLORS.track, strokeStyle: { lineWidth: Math.max(4, Math.round(size * 0.08)), lineCap: "round" } }}
    frame={{ width: size, height: size }} />
}
