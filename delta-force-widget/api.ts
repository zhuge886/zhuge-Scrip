import { fetch } from "scripting"
import { AMS_URL, balanceForm, Metric, parseBalance, parseProfit, profitForm, QueryError, safeMessage, Session, Snapshot, yesterday } from "./model"
import { loadSession, loadSnapshot, saveSnapshot } from "./store"
import { emptySnapshot } from "./model"

export async function ams(session: Session, body: string): Promise<unknown> {
  try {
    const response = await fetch(AMS_URL, {
      method: "POST", timeout: 10,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": `acctype=wx; appid=${session.appid}; openid=${session.openid}; access_token=${session.access_token}`,
        "Referer": "https://df.qq.com/",
      },
      body,
      // Credentials stay on the selected Tencent endpoint.
      handleRedirect: async () => null,
    })
    if (response.status === 401 || response.status === 403) throw new QueryError("auth", "微信登录已失效或授权被拒绝，请重新登录")
    if (!response.ok) throw new QueryError("api", `腾讯接口请求失败（HTTP ${response.status}）`)
    try { return await response.json() } catch { throw new QueryError("shape", "接口未返回有效 JSON，请稍后重试") }
  } catch (error) {
    if (error instanceof QueryError) throw error
    throw new QueryError("network", "网络连接失败或请求超时，请稍后重试")
  }
}
export async function verifySession(session: Session): Promise<void> {
  parseBalance(await ams(session, balanceForm()))
}
function failedMetric(previous: Metric, error: unknown, auth: boolean): Metric {
  return {
    ...previous,
    status: previous.value === null ? "error" : "cached",
    message: auth ? "登录失效，显示缓存；请重新登录" : `${safeMessage(error)}${previous.value !== null ? "；显示缓存" : ""}`,
  }
}
export async function refreshSnapshot(force = false, now = Date.now()): Promise<Snapshot> {
  const session = loadSession()
  if (!session) return emptySnapshot(now)
  const previous = loadSnapshot(session, now)
  const fresh = (m: Metric) => m.status === "ok" && m.updatedAt != null && now >= m.updatedAt && now - m.updatedAt < 5 * 60000
  if (!force && fresh(previous.balance) && fresh(previous.profit)) return previous
  const [money, daily] = await Promise.allSettled([
    ams(session, balanceForm()).then(parseBalance),
    ams(session, profitForm()).then(raw => parseProfit(raw, yesterday(now))),
  ])
  const needsLogin = [money, daily].some(r => r.status === "rejected" && r.reason instanceof QueryError && r.reason.code === "auth")
  const next: Snapshot = {
    version: 1, day: yesterday(now), needsLogin,
    balance: money.status === "fulfilled"
      ? { value: money.value, updatedAt: now, status: "ok", message: "当前哈夫币余额" }
      : failedMetric(previous.balance, money.reason, needsLogin),
    profit: daily.status === "fulfilled"
      ? { value: daily.value.value, updatedAt: now, status: daily.value.value === null ? "missing" : "ok", message: daily.value.message }
      : failedMetric(previous.profit, daily.reason, needsLogin),
  }
  // Discard results from an in-flight query if the user changed or removed the account.
  const current = loadSession()
  if (!current || current.openid !== session.openid || current.appid !== session.appid || current.access_token !== session.access_token) return emptySnapshot(now)
  saveSnapshot(session, next)
  return next
}
