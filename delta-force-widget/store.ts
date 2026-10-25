import { amount, emptySnapshot, Metric, normalizeDay, object, QueryError, Session, Snapshot, validSession } from "./model"
import { mergeHistory } from "./history"

const SESSION_KEY = "zhuge886.delta-force.session.v1"
const CACHE_KEY = "delta-force.snapshot.v1"
const OWNER_KEY = "delta-force.cache-owner.v1"
export function loadSession(): Session | null {
  const value = Keychain.get(SESSION_KEY)
  if (!value) return null
  try { return validSession(JSON.parse(value)) } catch { return null }
}
export function saveSession(session: Session): void {
  if (!validSession(session)) throw new QueryError("storage", "登录凭据无效，未保存")
  const previous = loadSession()
  if (!Keychain.set(SESSION_KEY, JSON.stringify(session), { accessibility: "first_unlock_this_device", synchronizable: false })) {
    throw new QueryError("storage", "无法保存登录，请检查钥匙串权限")
  }
  if (!previous || previous.appid !== session.appid || previous.openid !== session.openid || previous.acctype !== session.acctype) {
    Storage.remove(CACHE_KEY)
    Keychain.remove(OWNER_KEY)
  }
}
/** Rotate only the active account's token, keeping its dated income cache. */
export function replaceSession(expected: Session, next: Session): Session | null {
  const current = loadSession()
  if (!current || current.appid !== expected.appid || current.openid !== expected.openid || current.acctype !== expected.acctype) return null
  if (current.access_token !== expected.access_token || current.refresh_token !== expected.refresh_token) return current
  if (!validSession(next) || next.appid !== current.appid || next.openid !== current.openid || next.acctype !== current.acctype) {
    throw new QueryError("auth", "续期账号不匹配，请重新扫码")
  }
  if (!Keychain.set(SESSION_KEY, JSON.stringify(next), { accessibility: "first_unlock_this_device", synchronizable: false })) {
    throw new QueryError("storage", "暂时无法保存登录续期，请稍后刷新")
  }
  return next
}
export function logout(): void {
  if (Keychain.contains(SESSION_KEY) && !Keychain.remove(SESSION_KEY)) throw new QueryError("storage", "无法退出，请检查钥匙串权限")
  Keychain.remove(OWNER_KEY)
  Storage.remove(CACHE_KEY)
  Storage.remove("delta-force.wechat-pending.v1")
  Storage.remove("delta-force.diagnostics.v1")
}
function validMetric(raw: unknown): raw is Metric {
  if (!raw || typeof raw !== "object") return false
  const m = raw as Metric
  return (m.value === null || typeof m.value === "string" && /^-?\d+$/.test(m.value)) &&
    (m.updatedAt === null || typeof m.updatedAt === "number" && Number.isFinite(m.updatedAt)) &&
    ["ok", "missing", "cached", "error"].includes(m.status) && typeof m.message === "string"
}
export function loadSnapshot(session: Session, now = Date.now()): Snapshot {
  const base = emptySnapshot()
  base.needsLogin = false
  base.profit.message = "点击刷新，查看最近游戏收益"
  if (Keychain.get(OWNER_KEY) !== `${session.appid}:${session.openid}`) return base
  const raw = object(Storage.get<unknown>(CACHE_KEY))
  if (![1, 2, 3].includes(Number(raw.version)) || !validMetric(raw.balance) || !validMetric(raw.profit)) return base
  let day = normalizeDay(raw.day)
  let profit: Metric = { ...raw.profit }
  // Upgrade the 1.1 cache: older reports were stored in its locally generated message.
  // Recover the actual report date and amount instead of retaining an empty hero.
  if (raw.version === 1 && profit.value === null) {
    const m = /最近 (\d{4}-\d{2}-\d{2}) 收益 ([+−-]?[\d,]+) 哈夫币/.exec(profit.message)
    day = m ? normalizeDay(m[1]) : null
    if (m && day) profit = { ...profit, value: amount(m[2].replace(/[+,]/g, "").replace("−", "-")), status: "cached", message: "已保存的最近日报" }
  }
  if (!day || profit.value === null) { day = null; profit = { ...base.profit } }
  const cached = (metric: Metric): Metric => metric.value !== null && metric.status === "ok" &&
    (metric.updatedAt === null || now < metric.updatedAt || now - metric.updatedAt >= 5 * 60000)
      ? { ...metric, status: "cached" } : { ...metric }
  return {
    version: 3, day,
    checkedAt: typeof raw.checkedAt === "number" && Number.isFinite(raw.checkedAt) ? raw.checkedAt : null,
    profit: cached(profit), balance: cached(raw.balance),
    history: mergeHistory(raw.history, day && profit.value !== null ? { day, value: profit.value } : null, now),
    needsLogin: raw.needsLogin === true,
  }
}
export function saveSnapshot(session: Session, snapshot: Snapshot): void {
  if (!Storage.set(CACHE_KEY, snapshot) || !Keychain.set(OWNER_KEY, `${session.appid}:${session.openid}`, { synchronizable: false })) {
    throw new QueryError("storage", "数据已取得，但暂时无法保存缓存")
  }
}
