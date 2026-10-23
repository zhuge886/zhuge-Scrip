import { emptySnapshot, Metric, QueryError, Session, Snapshot, validSession } from "./model"
import { clearDiagnostics } from "./diagnostics"

const SESSION_KEY = "zhuge886.delta-force.session.v1"
const CACHE_KEY = "delta-force.snapshot.v1"
const OWNER_KEY = "delta-force.cache-owner.v1"
export const PENDING_KEY = "delta-force.wechat-pending.v1"

export function loadSession(): Session | null {
  const value = Keychain.get(SESSION_KEY)
  if (!value) return null
  try { return validSession(JSON.parse(value)) } catch { return null }
}
export function saveSession(session: Session): void {
  if (!validSession(session)) throw new QueryError("storage", "登录凭据无效，未保存")
  if (!Keychain.set(SESSION_KEY, JSON.stringify(session), { accessibility: "first_unlock_this_device", synchronizable: false })) {
    throw new QueryError("storage", "无法保存微信登录，请检查钥匙串权限")
  }
  // A cache never crosses accounts. Owner metadata is kept inside the Keychain.
  Storage.remove(CACHE_KEY)
  Keychain.remove(OWNER_KEY)
}
export function logout(): void {
  if (Keychain.contains(SESSION_KEY) && !Keychain.remove(SESSION_KEY)) throw new QueryError("storage", "无法清除登录，请检查钥匙串权限")
  Keychain.remove(OWNER_KEY)
  Storage.remove(CACHE_KEY)
  Storage.remove(PENDING_KEY)
  clearDiagnostics()
}
function validMetric(raw: unknown): raw is Metric {
  if (!raw || typeof raw !== "object") return false
  const m = raw as Metric
  return (m.value === null || typeof m.value === "string" && /^-?\d+$/.test(m.value)) &&
    (m.updatedAt === null || Number.isFinite(m.updatedAt)) &&
    ["ok", "missing", "cached", "error"].includes(m.status) && typeof m.message === "string"
}
export function loadSnapshot(session: Session, now = Date.now()): Snapshot {
  const base = emptySnapshot(now)
  base.needsLogin = false
  base.balance.message = "微信凭据已保存，等待查询余额"
  base.profit.message = "微信凭据已保存，等待查询日报"
  if (Keychain.get(OWNER_KEY) !== `${session.appid}:${session.openid}`) return base
  const raw = Storage.get<Snapshot>(CACHE_KEY)
  if (raw?.version !== 1 || !validMetric(raw.balance) || !validMetric(raw.profit) || typeof raw.day !== "string" || typeof raw.needsLogin !== "boolean") return base
  return {
    ...raw, day: base.day,
    balance: { ...raw.balance },
    // Yesterday changes at midnight in Shanghai. Do not relabel yesterday's cache.
    profit: raw.day === base.day ? { ...raw.profit } : { ...base.profit, message: "新一天，等待昨日数据" },
  }
}
export function saveSnapshot(session: Session, snapshot: Snapshot): void {
  if (!Storage.set(CACHE_KEY, snapshot) || !Keychain.set(OWNER_KEY, `${session.appid}:${session.openid}`, { synchronizable: false })) {
    throw new QueryError("storage", "查询已完成，但缓存保存失败")
  }
}
