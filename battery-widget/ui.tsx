// ---------------------------------------------------------------------------
// Shared presentational components. No data access here.
// The ring is drawn with two Circle shapes (track + trimmed arc) so we get
// full control over color, thickness and the "-- when unknown" behavior.
// ---------------------------------------------------------------------------
import { report } from "./diagnostics"
import { ZStack, VStack, HStack, Text, Image, Circle } from "scripting"
import { BatteryItem, Settings } from "./model"
import { formatPercent } from "./battery"
import { COLORS, levelColor, ColorValue } from "./theme"

export interface RingProps {
  item: BatteryItem
  settings: Settings
  size: number
  lineWidth?: number
}

export function BatteryRing({ item, settings, size, lineWidth = 7 }: RingProps) {
  const color: ColorValue = levelColor(item.level, item.charge, settings)
  const to = item.level == null ? 0 : Math.max(0, Math.min(1, item.level))
  const iconSize = Math.round(size * 0.3)

  return (
    <ZStack frame={{ width: size, height: size }}>
      {/* Track */}
      <Circle
        stroke={{ shapeStyle: COLORS.track, strokeStyle: { lineWidth, lineCap: "round" } }}
        frame={{ width: size, height: size }}
      />
      {/* Progress arc (hidden when level is unknown, so we never fake a fill) */}
      {item.level != null ? (
        <Circle
          trim={{ from: 0, to }}
          stroke={{ shapeStyle: color, strokeStyle: { lineWidth, lineCap: "round" } }}
          rotationEffect={-90}
          frame={{ width: size, height: size }}
        />
      ) : null}
      {/* Center: device icon + percentage (with a bolt when charging) */}
      <VStack spacing={1} alignment="center">
        <Image
          systemName={item.symbol}
          resizable
          scaleToFit
          foregroundStyle={color}
          frame={{ width: iconSize, height: iconSize }}
        />
        <HStack spacing={1} alignment="center">
          {item.charge === "charging" ? (
            <Image
              systemName="bolt.fill"
              resizable
              scaleToFit
              foregroundStyle={COLORS.charging}
              frame={{ width: Math.round(size * 0.12), height: Math.round(size * 0.12) }}
            />
          ) : null}
          <Text font="caption" fontWeight="bold" foregroundStyle={COLORS.text}>
            {formatPercent(item.level)}
          </Text>
        </HStack>
      </VStack>
    </ZStack>
  )
}

export interface CellProps {
  item: BatteryItem
  settings: Settings
  ringSize: number
}

function FullDeviceCell({ item, settings, ringSize }: CellProps) {
  const faded = !item.connected && item.kind !== "phone"
  return (
    <VStack key={item.id} spacing={4} alignment="center" opacity={faded ? 0.55 : 1}>
      {BatteryRing({ item, settings, size: ringSize })}
      <Text
        font="caption"
        foregroundStyle={COLORS.subtext}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {item.name}
      </Text>
    </VStack>
  )
}

// Both components are pure (no hooks). Eager construction catches JS render
// errors here; merely wrapping <DeviceCell /> in try/catch would not catch them.
export function DeviceCell(props: CellProps) {
  try { return FullDeviceCell(props) }
  catch (error) {
    report("DeviceCell", error)
    return <VStack key={props.item.id}><Text>{props.item.name}</Text>
      <Text>{formatPercent(props.item.level)} · {props.item.charge}</Text>
      <Text>DeviceCell error: {String(error)}</Text>
    </VStack>
  }
}
