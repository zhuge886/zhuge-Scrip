// 统一中文文案。设备名称（如 iPhone / AirPods）保留品牌原名。
import type { ChargeState } from "./model"
export const APP_TITLE = "电量监控"
export function chargeText(charge: ChargeState): string {
  return { charging: "充电中", full: "已充满", unplugged: "未充电", unknown: "状态未知" }[charge]
}
export function timeText(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "暂无记录"
  const date = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export const BLE_UNAVAILABLE = "读取蓝牙配件需要 Scripting PRO 授权，手机电量仍可正常显示。"
