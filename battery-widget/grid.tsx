// ---------------------------------------------------------------------------
// 2x2 grid layout shared by the widget and the in-app preview.
// Pure component: caller passes the already-composed items + family.
// ---------------------------------------------------------------------------
import { VStack, HStack, Text } from "scripting"
import { BatteryItem, Settings } from "./model"
import { DeviceCell } from "./ui"
import { COLORS } from "./theme"

export type Family =
  | "systemSmall"
  | "systemMedium"
  | "systemLarge"
  | "accessoryCircular"
  | "accessoryRectangular"
  | string

export function ringSizeFor(family: Family): number {
  switch (family) {
    case "systemLarge":
      return 92
    case "systemSmall":
      return 46
    case "accessoryCircular":
    case "accessoryRectangular":
      return 40
    case "systemMedium":
    default:
      return 58
  }
}

/** Split into rows of 2 for the 2x2 layout. */
function rowsOf2(items: BatteryItem[]): BatteryItem[][] {
  const rows: BatteryItem[][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return rows
}

export interface GridProps {
  items: BatteryItem[]
  settings: Settings
  family: Family
}

export function BatteryGrid({ items, settings, family }: GridProps) {
  const ringSize = ringSizeFor(family)
  const rows = rowsOf2(items)

  return (
    <VStack
      spacing={10}
      alignment="center"
      padding={12}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={COLORS.cardBg}
    >
      {items.length === 0 ? (
        <Text font="caption" foregroundStyle={COLORS.subtext}>
          No readable devices
        </Text>
      ) : (
        rows.map((row, idx) => (
          <HStack key={idx} spacing={16} alignment="center">
            {row.map(item => (
              DeviceCell({ item, settings, ringSize })
            ))}
          </HStack>
        ))
      )}
    </VStack>
  )
}
