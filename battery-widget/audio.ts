import type { BatteryItem } from "./model"
import { withTimeout } from "./async"

// 只查询当前音频输出；不启动音频会话、不录音、不申请麦克风或运动权限。
// 当前音频路由不等于系统蓝牙配对列表，也不包含耳机电量。
export async function readHeadphoneRoute(): Promise<BatteryItem[]> {
  if (typeof SharedAudioSession === "undefined") throw new Error("当前版本未提供音频输出查询")
  const route = await withTimeout(SharedAudioSession.currentRoute, 4000, "耳机音频输出查询")
  const outputs = route.outputs.filter(port =>
    ["bluetoothA2DP", "bluetoothHFP", "bluetoothLE", "headphones"].includes(port.portType))
  return outputs.slice(0, 3).map(port => ({
    id: `audio-output:${port.uid}`,
    name: port.portName || "耳机",
    kind: "other",
    symbol: /airpods/i.test(port.portName) ? "airpods" : "headphones",
    level: null,
    charge: "unknown",
    connected: true,
    updatedAt: Date.now(),
    note: "当前耳机音频输出；音频接口不提供电量",
  }))
}
