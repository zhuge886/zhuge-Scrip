import { fetch } from "scripting"
import { AMS_URL, authForm, assertAms, balanceForm, bindingForm, Metric, parseBalance, parseProfit, profitForm, QueryError, safeMessage, Session, Snapshot, yesterday } from "./model"
import { loadSession, loadSnapshot, saveSnapshot } from "./store"
import { emptySnapshot } from "./model"
import { recordDiagnostic } from "./diagnostics"

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
export async function queryBinding(): Promise<boolean> {
  const session = loadSession()
  if (!session) throw new QueryError("auth", "请先保存微信登录")
  try {
    const result = assertAms(await ams(session, bindingForm()))
    recordDiagnostic("角色")
    return result.bindarea != null && result.bindarea !== "" && result.bindarea !== "0" && result.bindarea !== false &&
      (typeof result.bindarea !== "object" || Object.keys(result.bindarea as object).length > 0)
  } catch (error) { recordDiagnostic("角色", error); throw error }
}
function failedMetric(previous: Metric, error: unknown): Metric {
  return {
    ...previous,
    status: previous.value === null ? "error" : "cached",
    message: `${safeMessage(error)}${previous.value !== null ? "；显示缓存" : ""}`,
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
  return storeQueryResults(session, previous, money, daily, now)
}
export function storeQueryResults(session: Session, previous: Snapshot,
  money: PromiseSettledResult<string>, daily: PromiseSettledResult<ReturnType<typeof parseProfit>>, now = Date.now()): Snapshot {
  const needsLogin = [money, daily].some(r => r.status === "rejected" && r.reason instanceof QueryError && r.reason.code === "auth")
  const next: Snapshot = {
    version: 1, day: yesterday(now), needsLogin,
    balance: money.status === "fulfilled"
      ? { value: money.value, updatedAt: now, status: "ok", message: "当前哈夫币余额" }
      : failedMetric(previous.balance, money.reason),
    profit: daily.status === "fulfilled"
      ? { value: daily.value.value, updatedAt: now, status: daily.value.value === null ? "missing" : "ok", message: daily.value.message }
      : failedMetric(previous.profit, daily.reason),
  }
  // Discard results from an in-flight query if the user changed or removed the account.
  const current = loadSession()
  if (!current || current.openid !== session.openid || current.appid !== session.appid || current.access_token !== session.access_token) return emptySnapshot(now)
  recordDiagnostic("余额", money.status === "rejected" ? money.reason : undefined)
  recordDiagnostic("日报", daily.status === "rejected" ? daily.reason : undefined)
  saveSnapshot(session, next)
  return next
}
