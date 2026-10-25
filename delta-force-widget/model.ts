// Shared data contracts; no Scripting runtime dependency.
export const OFFICIAL_HOME = "https://df.qq.com/cp/a20240906main/index.html"
export const AMS_URL = "https://dfm.ams.game.qq.com/ide/"
export const WX_GAME_APP = "wx39308a0a1bd83d22"
export const WX_PC_APP = "wxfa0c35392d06b82f"
export const HAFU_ITEM = "17020000010"
export const REFRESH_MS = 30 * 60 * 1000
export const RENEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
export const WECHAT_RENEW_URL = "https://api.weixin.qq.com/sns/oauth2/refresh_token"

export type Session = {
  openid: string; access_token: string; appid: string; acctype: "wx" | "mini"
  refresh_token?: string
  expiresAt?: number
  /** Fixed window from QR authorization; token refreshes must not extend it. */
  refreshUntil?: number
}
export type Metric = {
  value: string | null
  updatedAt: number | null
  status: "ok" | "missing" | "cached" | "error"
  message: string
}
export type ProfitPoint = { day: string; value: string }
export type Snapshot = {
  version: 3
  /** Actual date of the latest available report, never today's/yesterday's label. */
  day: string | null
  checkedAt: number | null
  balance: Metric
  profit: Metric
  history: ProfitPoint[]
  needsLogin: boolean
}
export type ProfitReport = { value: string | null; day: string | null; message: string }
export class QueryError extends Error {
  constructor(public readonly code: "auth" | "api" | "shape" | "network" | "storage", message: string) {
    super(message)
    this.name = "QueryError"
  }
}
export function safeMessage(error: unknown): string {
  return error instanceof QueryError ? error.message : "暂时无法刷新，请稍后再试"
}
export function normalizeDay(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null
  const m = /^(?:(\d{4})(\d{2})(\d{2})|(\d{4})[-/](\d{1,2})[-/](\d{1,2}))(?:[ T]00:00:00)?$/.exec(String(raw).trim())
  if (!m) return null
  const day = `${m[1] ?? m[4]}-${(m[2] ?? m[5]).padStart(2, "0")}-${(m[3] ?? m[6]).padStart(2, "0")}`
  const date = new Date(`${day}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null
}
export function amount(raw: unknown): string {
  if (typeof raw === "number" && !Number.isSafeInteger(raw)) throw new QueryError("shape", "接口金额超出安全精度")
  if ((typeof raw !== "string" && typeof raw !== "number") || !/^-?\d+$/.test(String(raw).trim())) {
    throw new QueryError("shape", "暂未取得有效金额")
  }
  const text = String(raw).trim()
  const negative = text.startsWith("-")
  const digits = text.replace(/^-/, "").replace(/^0+(?=\d)/, "")
  return negative && digits !== "0" ? `-${digits}` : digits
}
export function formatAmount(value: string | null, signed = false): string {
  if (value == null) return "--"
  const text = amount(value)
  const digits = text.replace(/^-/, "")
  return `${text.startsWith("-") ? "−" : signed && digits !== "0" ? "+" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
}
export function reportDate(day: string | null, compact = false): string {
  const normalized = normalizeDay(day)
  return normalized ? (compact ? normalized.slice(5).replace("-", ".") : normalized.replace(/-/g, ".")) : "暂无记录"
}
export function syncTime(at: number | null): string {
  return at == null ? "" : new Date(at + 8 * 3600000).toISOString().slice(11, 16)
}
export function showBalance(snapshot: Snapshot): boolean {
  return snapshot.balance.value !== null && snapshot.balance.status === "ok"
}
type Obj = Record<string, unknown>
export function object(value: unknown): Obj {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Obj : {}
}
export function assertAms(raw: unknown): Obj {
  const top = object(raw), jData = object(top.jData), inner = object(jData.data)
  for (const node of [top, jData, inner]) {
    const key = ["iRet", "ret", "code"].find(k => k in node && Number(node[k]) !== 0)
    if (!key) continue
    const text = [node.sMsg, node.msg, node.message].filter(x => typeof x === "string").join(" ")
    if (Number(node.iRet) === 101 || Number(node.ret) === 101 || /登录|login|token|授权过期|未授权/i.test(text)) {
      throw new QueryError("auth", "登录已过期，请重新扫码")
    }
    throw new QueryError("api", "暂时无法取得数据，请稍后刷新")
  }
  if (!("jData" in top)) throw new QueryError("shape", "数据格式已变化，请检查脚本更新")
  return jData
}
export function parseBalance(raw: unknown): string {
  const jData = assertAms(raw)
  if (!Array.isArray(jData.data)) throw new QueryError("shape", "暂未取得哈夫币余额")
  const rows = jData.data.map(object)
  const matches = rows.filter(item => {
    const id = item.itemId ?? item.itemID ?? item.id
    if (id != null) return String(id) === HAFU_ITEM
    if (item.name != null) return item.name === "哈夫币"
    return rows.length === 1
  })
  if (matches.length !== 1) throw new QueryError("shape", "暂未取得哈夫币余额")
  const value = amount(matches[0].totalMoney)
  if (value.startsWith("-")) throw new QueryError("shape", "哈夫币余额格式异常")
  return value
}
export function parseProfit(raw: unknown): ProfitReport {
  const jData = assertAms(raw)
  const detail = object(object(object(jData.data).data).solDetail)
  const day = normalizeDay(detail.recentGainDate)
  if (!day) return { value: null, day: null, message: "暂时没有可用的游戏日报" }
  return { value: amount(detail.recentGain), day, message: "最近一次游戏日报收益" }
}
export function emptySnapshot(): Snapshot {
  const metric: Metric = { value: null, updatedAt: null, status: "missing", message: "扫码后查看游戏收益" }
  return { version: 3, day: null, checkedAt: null, balance: { ...metric }, profit: { ...metric }, history: [], needsLogin: true }
}
export function validSession(raw: unknown): Session | null {
  const s = object(raw)
  const validToken = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_\-.]{6,2048}$/.test(v)
  if (!["wx", "mini"].includes(String(s.acctype)) || !/^wx[a-fA-F0-9]{16}$/.test(String(s.appid)) || !validToken(s.openid) || !validToken(s.access_token)) return null
  const session: Session = { openid: s.openid as string, access_token: s.access_token as string, appid: s.appid as string, acctype: s.acctype as Session["acctype"] }
  if (validToken(s.refresh_token)) session.refresh_token = s.refresh_token as string
  if (typeof s.expiresAt === "number" && Number.isFinite(s.expiresAt) && s.expiresAt > 0) session.expiresAt = s.expiresAt
  if (typeof s.refreshUntil === "number" && Number.isFinite(s.refreshUntil) && s.refreshUntil > 0) session.refreshUntil = s.refreshUntil
  return session
}
export function form(values: Record<string, string>): string {
  return Object.entries(values).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")
}
export function balanceForm(): string {
  return form({ iChartId: "319386", iSubChartId: "319386", sIdeToken: "zMemOt", type: "3", item: HAFU_ITEM })
}
export function authForm(session: Session): string {
  // Refresh credentials go only to WeChat's refresh endpoint, never game queries.
  return form({ openid: session.openid, access_token: session.access_token, appid: session.appid,
    acctype: session.acctype, needGopenid: "1", isPreengage: "1", ams_targetappid: WX_GAME_APP })
}
export function profitForm(): string {
  return form({ iChartId: "316969", iSubChartId: "316969", sIdeToken: "NoOapI", method: "dfm/center.recent.detail", source: "7", param: JSON.stringify({ resourceType: "sol" }) })
}
