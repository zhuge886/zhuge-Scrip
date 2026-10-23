// Independent of Scripting so date / response parsing can be checked on Node.
export const OFFICIAL_HOME = "https://df.qq.com/cp/a20240906main/index.html"
export const AMS_URL = "https://comm.ams.game.qq.com/ide/"
export const WX_MOBILE_APP = "wx1cd4fbe9335888fe"
export const WX_PC_APP = "wxfa0c35392d06b82f"
export const HAFU_ITEM = "17020000010"
export const REFRESH_MS = 30 * 60 * 1000

export type Session = {
  openid: string
  access_token: string
  appid: string
  acctype: "wx"
}
export type Metric = {
  value: string | null
  updatedAt: number | null
  status: "ok" | "missing" | "cached" | "error"
  message: string
}
export type Snapshot = {
  version: 1
  day: string
  balance: Metric
  profit: Metric
  needsLogin: boolean
}
export class QueryError extends Error {
  constructor(public readonly code: "auth" | "api" | "shape" | "network" | "storage", message: string) {
    super(message)
    this.name = "QueryError"
  }
}
export function safeMessage(error: unknown): string {
  return error instanceof QueryError ? error.message : "请求未完成，请检查网络后重试"
}

// UTC+8 has no DST. Do not use the device's timezone for the game's calendar.
export function yesterday(now = Date.now()): string {
  return new Date(now + 8 * 3600000 - 86400000).toISOString().slice(0, 10)
}
export function normalizeDay(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null
  const text = String(raw).trim()
  const m = /^(?:(\d{4})(\d{2})(\d{2})|(\d{4})[-/](\d{1,2})[-/](\d{1,2}))(?:[ T]00:00:00)?$/.exec(text)
  if (!m) return null
  const day = `${m[1] ?? m[4]}-${(m[2] ?? m[5]).padStart(2, "0")}-${(m[3] ?? m[6]).padStart(2, "0")}`
  const date = new Date(`${day}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null
}
export function amount(raw: unknown): string {
  if (typeof raw === "number" && !Number.isSafeInteger(raw)) {
    throw new QueryError("shape", "接口金额超出安全精度，暂不展示")
  }
  if ((typeof raw !== "string" && typeof raw !== "number") || !/^-?\d+$/.test(String(raw).trim())) {
    throw new QueryError("shape", "接口缺少有效金额，请稍后重试")
  }
  const text = String(raw).trim()
  const negative = text.startsWith("-")
  const digits = text.replace(/^-/, "").replace(/^0+(?=\d)/, "")
  return negative && digits !== "0" ? `-${digits}` : digits
}
export function formatAmount(value: string | null, signed = false): string {
  if (value == null) return "--"
  const normalized = amount(value)
  const negative = normalized.startsWith("-")
  const digits = normalized.replace(/^-/, "")
  return `${negative ? "−" : signed && digits !== "0" ? "+" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
}

type Obj = Record<string, unknown>
export function object(value: unknown): Obj {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Obj : {}
}
export function assertAms(raw: unknown): Obj {
  const top = object(raw)
  const jData = object(top.jData)
  const inner = object(jData.data)
  for (const node of [top, jData, inner]) {
    const failed = ["iRet", "ret", "code"].some(key => key in node && Number(node[key]) !== 0)
    if (!failed) continue
    const text = [node.sMsg, node.msg, node.message].filter(x => typeof x === "string").join(" ")
    if (Number(node.iRet) === 101 || Number(node.ret) === 101 || /登录|登陸|登錄|login|token|登录态|授权过期|未授权/i.test(text)) {
      throw new QueryError("auth", "微信登录已失效，请重新登录")
    }
    // Never display the server's raw error: it can include account credentials.
    throw new QueryError("api", "腾讯接口暂不可用，请稍后重试；首次使用请在官方小程序绑定角色")
  }
  if (!("jData" in top)) throw new QueryError("shape", "接口响应格式已变化，请检查脚本更新")
  return jData
}
export function parseBalance(raw: unknown): string {
  const jData = assertAms(raw)
  if (!Array.isArray(jData.data)) throw new QueryError("shape", "货币数据格式已变化")
  const rows = jData.data.map(object)
  const matches = rows.filter(item => {
    const id = item.itemId ?? item.itemID ?? item.id
    if (id != null) return String(id) === HAFU_ITEM
    if (item.name != null) return item.name === "哈夫币"
    // The request filters exactly one currency. Anonymous singleton is known upstream shape.
    return rows.length === 1
  })
  if (matches.length !== 1) throw new QueryError("shape", "未找到唯一的哈夫币余额，请先在官方小程序确认角色")
  const value = amount(matches[0].totalMoney)
  if (value.startsWith("-")) throw new QueryError("shape", "哈夫币余额格式异常")
  return value
}
export function parseProfit(raw: unknown, day: string): { value: string | null; message: string } {
  const jData = assertAms(raw)
  const detail = object(object(object(jData.data).data).solDetail)
  const actualDay = normalizeDay(detail.recentGainDate)
  if (!actualDay) return { value: null, message: "昨日数据尚未同步或无对局" }
  if (actualDay !== day) return { value: null, message: `昨日无可用数据（最近 ${actualDay.slice(5)}）` }
  return { value: amount(detail.recentGain), message: "烽火地带日报收益" }
}
export function emptySnapshot(now = Date.now()): Snapshot {
  const metric: Metric = { value: null, updatedAt: null, status: "missing", message: "请先微信登录" }
  return { version: 1, day: yesterday(now), balance: { ...metric }, profit: { ...metric }, needsLogin: true }
}
export function validSession(raw: unknown): Session | null {
  const s = object(raw)
  const validToken = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_\-.]{6,2048}$/.test(v)
  if (s.acctype !== "wx" || ![WX_MOBILE_APP, WX_PC_APP].includes(String(s.appid)) || !validToken(s.openid) || !validToken(s.access_token)) return null
  return { openid: s.openid as string, access_token: s.access_token as string, appid: s.appid as string, acctype: "wx" }
}

export function form(values: Record<string, string>): string {
  return Object.entries(values).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")
}
export function balanceForm(): string {
  return form({ iChartId: "319386", sIdeToken: "zMemOt", type: "3", item: HAFU_ITEM })
}
export function profitForm(): string {
  // This endpoint returns the most recent report; the response date is always checked.
  return form({ iChartId: "316969", sIdeToken: "NoOapI", method: "dfm/center.recent.detail", source: "2", param: JSON.stringify({ resourceType: "sol" }) })
}
