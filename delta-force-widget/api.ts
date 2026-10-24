import { fetch } from "scripting"
import { AMS_URL, authForm, balanceForm, emptySnapshot, Metric, parseBalance, parseProfit, profitForm, QueryError, safeMessage, Session, Snapshot } from "./model"
import { loadSession, loadSnapshot, saveSnapshot } from "./store"
import { canRenew, renewSession } from "./renew"

export async function ams(session: Session, body: string): Promise<unknown> {
  try {
    const response = await fetch(AMS_URL, {
      method: "POST", timeout: 10,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": `acctype=${session.acctype}; appid=${session.appid}; openid=${session.openid}; access_token=${session.access_token}`,
        "Referer": "https://df.qq.com/cp/record202410ver/",
      },
      body: `${body}&${authForm(session)}`,
      handleRedirect: async () => null,
    })
    if (response.status === 401 || response.status === 403) throw new QueryError("auth", "登录已过期，请重新扫码")
    if (!response.ok) throw new QueryError("api", "服务暂不可用，请稍后刷新")
    try { return await response.json() } catch { throw new QueryError("shape", "数据暂不可用，请稍后刷新") }
  } catch (error) {
    if (error instanceof QueryError) throw error
    throw new QueryError("network", "暂时无法连接，已保留上次收益")
  }
}
function failedMetric(previous: Metric, error: unknown): Metric {
  return { ...previous, status: previous.value === null ? "error" : "cached", message: safeMessage(error) }
}
export async function refreshSnapshot(force = false, now = Date.now()): Promise<Snapshot> {
  let session = loadSession()
  if (!session) return emptySnapshot()
  const previous = loadSnapshot(session, now)
  if (!force && previous.checkedAt != null && now >= previous.checkedAt && now - previous.checkedAt < 5 * 60000) return previous
  let attempted = false
  let renewalError: unknown
  const renew = async (): Promise<boolean> => {
    attempted = true
    try {
      const next = await renewSession(session!, now)
      if (!next) return false
      session = next
      return true
    } catch (error) { renewalError = error; return false }
  }
  if (canRenew(session, now) && session.expiresAt != null && now >= session.expiresAt - 2 * 60000) await renew()
  const query = () => Promise.allSettled([
    ams(session!, balanceForm()).then(parseBalance),
    ams(session!, profitForm()).then(parseProfit),
  ])
  let [money, daily] = await query()
  const authFailed = () => daily.status === "rejected" && daily.reason instanceof QueryError && daily.reason.code === "auth"
  // Retry only once, and only for a failed income authorization. Balance alone
  // may be unavailable even while the user's income authorization works.
  if (authFailed() && !attempted && canRenew(session, now) && await renew()) [money, daily] = await query()
  if (authFailed() && renewalError instanceof QueryError && renewalError.code !== "auth") {
    daily = { status: "rejected", reason: renewalError }
  }
  return storeQueryResults(session, previous, money, daily, now)
}
export function storeQueryResults(session: Session, previous: Snapshot,
  money: PromiseSettledResult<string>, daily: PromiseSettledResult<ReturnType<typeof parseProfit>>, now = Date.now()): Snapshot {
  const current = loadSession()
  if (!current || current.openid !== session.openid || current.appid !== session.appid || current.access_token !== session.access_token) return emptySnapshot()
  let day = previous.day
  let profit: Metric
  if (daily.status === "fulfilled" && daily.value.value !== null && daily.value.day &&
    (!previous.day || daily.value.day >= previous.day || previous.profit.value === null)) {
    day = daily.value.day
    profit = { value: daily.value.value, updatedAt: now, status: "ok", message: daily.value.message }
  } else if (daily.status === "fulfilled") {
    profit = previous.profit.value !== null
      ? { ...previous.profit, status: "cached", message: "暂无更新，保留最近一次日报" }
      : { value: null, updatedAt: now, status: "missing", message: daily.value.message }
  } else {
    profit = failedMetric(previous.profit, daily.reason)
  }
  const next: Snapshot = {
    version: 2, day: profit.value === null ? null : day, checkedAt: now,
    needsLogin: daily.status === "rejected" && daily.reason instanceof QueryError && daily.reason.code === "auth",
    balance: money.status === "fulfilled"
      ? { value: money.value, updatedAt: now, status: "ok", message: "当前哈夫币余额" }
      : failedMetric(previous.balance, money.reason),
    profit,
  }
  saveSnapshot(session, next)
  return next
}
