import { Canvas, VStack, Text, Chart, LineChart, AreaChart, BarChart } from "scripting"
import type { CanvasRenderingContext, CanvasSize, Color } from "scripting"
import { Snapshot, reportDate } from "./model"
import { trendSeries } from "./history"
import { signColor, trendGeometry, TrendPoint, WidgetTheme, widgetTheme } from "./presentation"

function alpha(hex: string, opacity: number): Color {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${rgb.join(",")},${opacity})` as Color
}
/** Native drawing commands only; no remote images, screenshots or invented samples. */
export function paintTrend(ctx: CanvasRenderingContext, size: CanvasSize, series: TrendPoint[], theme: WidgetTheme, small: boolean) {
  const g = trendGeometry(series, size.width, size.height, small)
  if (!g.points.length) return
  ctx.lineWidth = 0.5; ctx.strokeStyle = theme.grid
  for (const p of g.points) {
    ctx.beginPath(); ctx.moveTo(p.x, 4); ctx.lineTo(p.x, g.barZero + g.barHalf); ctx.stroke()
  }
  ctx.beginPath(); ctx.moveTo(4, g.barZero); ctx.lineTo(size.width - 4, g.barZero); ctx.stroke()
  let previous = g.origin
  for (const point of g.points) {
    const color = signColor(point.sign, theme), mid = (previous.x + point.x) / 2
    const curve = () => {
      ctx.moveTo(previous.x, previous.y)
      // Horizontal endpoint tangents: bounded by true adjacent values, never overshoot.
      ctx.bezierCurveTo(mid, previous.y, mid, point.cy, point.x, point.cy)
    }
    const fade = ctx.createLinearGradient(0, 4, 0, g.plotBottom)
    fade.addColorStop(0, alpha(color, theme.dark ? 0.18 : 0.13))
    fade.addColorStop(1, alpha(color, 0))
    ctx.fillStyle = fade; ctx.beginPath(); curve()
    ctx.lineTo(point.x, g.plotBottom); ctx.lineTo(previous.x, g.plotBottom); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = color; ctx.lineWidth = small ? 1.65 : 1.9; ctx.lineCap = "round"; ctx.lineJoin = "round"
    ctx.beginPath(); curve(); ctx.stroke()
    previous = { x: point.x, y: point.cy }
  }
  for (const [index, point] of g.points.entries()) {
    const color = signColor(point.sign, theme), latest = index === g.points.length - 1
    ctx.fillStyle = color; ctx.strokeStyle = theme.dark ? "#293240" : "#F9FBFF"; ctx.lineWidth = 1.25
    ctx.beginPath(); ctx.arc(point.x, point.cy, latest ? 3 : 2.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    const barWidth = small ? 4 : 5
    ctx.fillStyle = alpha(color, theme.dark ? 0.65 : 0.55)
    if (point.sign === 0) ctx.fillRect(point.x - barWidth / 2, g.barZero - 0.6, barWidth, 1.2)
    else ctx.fillRect(point.x - barWidth / 2, point.sign > 0 ? g.barZero - point.barHeight : g.barZero,
      barWidth, point.barHeight)
  }
  if (g.labelHeight) {
    const indices = g.points.length <= 3 ? g.points.map((_, i) => i)
      : [0, Math.floor((g.points.length - 1) / 2), g.points.length - 1]
    // Skip labels that would overlap; point/date spacing remains calendar-based.
    let lastLabelX = -100
    ctx.font = small ? 7 : 8; ctx.fillStyle = theme.muted; ctx.textBaseline = "bottom"
    for (const index of indices) {
      const point = g.points[index], last = index === g.points.length - 1
      const x = Math.max(16, Math.min(size.width - 16, point.x))
      if (x - lastLabelX < 30 && !last) continue
      if (last && x - lastLabelX < 30) continue
      ctx.textAlign = "center"; ctx.fillText(reportDate(point.day, true), x, size.height, 32)
      lastLabelX = x
    }
  }
}

export function ProfitTrend({ snapshot, small = false, height = 92, now = Date.now(), theme = widgetTheme() }: {
  snapshot: Snapshot; small?: boolean; height?: number; now?: number; theme?: WidgetTheme
}) {
  const series = trendSeries(snapshot.history, now)
  if (!series.length) return <VStack frame={{ maxWidth: "infinity", height, alignment: "center" }}>
    <Text font={small ? 9 : 11} foregroundStyle={theme.muted}>暂无近7日记录</Text>
  </VStack>
  if (Canvas) return <Canvas opaque={false} frame={{ maxWidth: "infinity", height }}
    draw={(ctx, size) => paintTrend(ctx, size, series, theme, small)} />
  // Older Scripting versions retain native, data-driven charts if Canvas is absent.
  return <VStack spacing={3} frame={{ maxWidth: "infinity", height }}>
    <Chart frame={{ maxWidth: "infinity", height: height * 0.76 }}
      chartXAxis="hidden" chartYAxis="hidden" chartLegend="hidden" chartYScale={{ from: -0.1, to: 1.1 }}>
      {series.length > 1 ? <AreaChart marks={series.map(p => ({ label: p.date, value: p.y,
        foregroundStyle: alpha(signColor(series[series.length - 1].sign, theme), 0.07), interpolationMethod: "monotone" }))} /> : null}
      <LineChart marks={series.map(p => ({ label: p.date, value: p.y,
        foregroundStyle: signColor(series[series.length - 1].sign, theme), interpolationMethod: "monotone",
        symbol: "circle", symbolSize: 10, lineStyle: { lineWidth: 1.6 } }))} />
    </Chart>
    <Chart frame={{ maxWidth: "infinity", height: height * 0.20 }}
      chartXAxis="hidden" chartYAxis="hidden" chartLegend="hidden" chartYScale={{ from: -1.1, to: 1.1 }}>
      <BarChart marks={series.map(p => ({ label: p.date, value: p.bar, width: { type: "fixed", value: 4 }, foregroundStyle: signColor(p.sign, theme) }))} />
    </Chart>
  </VStack>
}
