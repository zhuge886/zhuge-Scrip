import { fetch } from "scripting"
import { form, object, QueryError, Session, validSession, WECHAT_RENEW_URL } from "./model"
import { replaceSession } from "./store"

export function canRenew(session: Session, now = Date.now()): boolean {
  return session.acctype === "wx" && !!session.refresh_token &&
    session.refreshUntil != null && now <= session.refreshUntil
}
export function parseRenewal(raw: unknown, previous: Session, now: number): Session {
  const data = object(raw)
  if (data.errcode != null && Number(data.errcode) !== 0) {
    if ([40030, 42002].includes(Number(data.errcode))) throw new QueryError("auth", "微信续期已失效，请重新扫码")
    throw new QueryError("api", "微信会话暂时无法续期，请稍后刷新")
  }
  const seconds = Number(data.expires_in)
  const next = validSession({ ...previous, access_token: data.access_token, openid: data.openid,
    refresh_token: data.refresh_token ?? previous.refresh_token })
  if (!next || next.openid !== previous.openid || data.appid != null && data.appid !== previous.appid ||
    data.refresh_token != null && next.refresh_token !== data.refresh_token ||
    !Number.isFinite(seconds) || seconds <= 0 || seconds > 31 * 86400) {
    throw new QueryError("shape", "微信续期数据无效，已保留原登录")
  }
  next.expiresAt = now + seconds * 1000
  // Keep the original authorization deadline even if WeChat rotates the token.
  next.refreshUntil = previous.refreshUntil
  return next
}
const pending = new Map<string, Promise<Session | null>>()
export function renewSession(session: Session, now = Date.now()): Promise<Session | null> {
  if (!canRenew(session, now)) return Promise.resolve(null)
  const key = `${session.appid}:${session.openid}:${session.access_token}`
  const running = pending.get(key)
  if (running) return running
  const job = (async () => {
    try {
      const response = await fetch(`${WECHAT_RENEW_URL}?${form({ appid: session.appid,
        grant_type: "refresh_token", refresh_token: session.refresh_token! })}`, {
        method: "GET", timeout: 10, handleRedirect: async () => null,
      })
      if (!response.ok) throw new QueryError("network", "微信会话暂时无法续期，请稍后刷新")
      const next = parseRenewal(await response.json(), session, now)
      return replaceSession(session, next)
    } catch (error) {
      if (error instanceof QueryError) throw error
      throw new QueryError("network", "微信会话暂时无法续期，已保留上次收益")
    }
  })().finally(() => pending.delete(key))
  pending.set(key, job)
  return job
}
