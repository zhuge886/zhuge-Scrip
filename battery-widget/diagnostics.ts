// 技术错误原文写入控制台；界面仅显示中文说明，小组件不展示错误堆栈。
const messages = new Map<string, string>()
const descriptions: Record<string, string> = {
  "设置读取": "设置暂时无法读取，已使用默认设置。",
  "配件缓存读取": "配件缓存暂时无法读取，手机电量不受影响。",
  "配件缓存校验": "已忽略损坏的配件缓存，手机电量不受影响。",
  "配件缓存保存": "配件数据已读取，但缓存未能保存，桌面仍会使用之前的数据。",
  "耳机输出查询": "暂时无法查询耳机音频输出，手机电量不受影响。",
  "设置保存": "设置未能保存，本次运行仍使用新设置。",
  "电量读取": "暂时无法读取手机电量，当前显示为 --。",
  "充电状态读取": "暂时无法读取充电状态，当前显示为未知。",
  "设备类型读取": "暂时无法识别设备型号。",
  "电量变化监听": "实时电量监听不可用，可点“刷新手机电量”手动更新。",
  "充电变化监听": "充电状态监听不可用，可点“刷新手机电量”手动更新。",
  "配件数据组合": "配件数据暂时不可用，已保留手机电量。",
  "设备圆环绘制": "圆环暂时不可用，已使用电量文字显示。",
  "PRO 授权检测": "暂时无法确认 PRO 授权，已停用配件读取。",
  "配件读取": "配件读取失败，请检查蓝牙权限与连接状态，手机电量不受影响。",
  "小组件预览": "暂时无法打开小组件预览，请稍后重试。",
  "小组件刷新": "暂时无法请求刷新桌面，小组件会按系统计划更新。",
}
export function report(scope: string, error: unknown): string {
  console.error(`[电量监控] ${scope}`, error)
  const message = descriptions[scope] ?? `${scope}未完成，请稍后重试。`
  messages.set(scope, message)
  if (messages.size > 12) messages.delete(messages.keys().next().value!)
  return message
}
export function diagnosticText(): string { return [...messages.values()].join("\n") }
export function resolveDiagnostic(scope: string): void { messages.delete(scope) }
export function attempt<T>(scope: string, read: () => T, fallback: T): T {
  try {
    const result = read()
    resolveDiagnostic(scope)
    return result
  } catch (error) { report(scope, error); return fallback }
}
