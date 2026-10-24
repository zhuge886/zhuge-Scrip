import type { Cookie } from "scripting"
import { OFFICIAL_HOME, QueryError, RENEW_WINDOW_MS, Session, validSession, WX_PC_APP } from "./model"
import { saveSession } from "./store"

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
export function sessionFromCookies(cookies: Cookie[], now = Date.now()): Session | null {
  const values: Record<string, string> = {}
  let expiresAt: number | undefined
  for (const cookie of cookies) {
    if (!["df.qq.com", ".df.qq.com", "qq.com", ".qq.com"].includes(cookie.domain)) continue
    if (["openid", "access_token", "appid", "acctype", "refresh_token"].includes(cookie.name)) values[cookie.name] = cookie.value
    if (cookie.name === "access_token" && cookie.expiresDate instanceof Date) expiresAt = cookie.expiresDate.getTime()
  }
  const session = validSession({ ...values, expiresAt })
  if (session?.refresh_token) session.refreshUntil = now + RENEW_WINDOW_MS
  return session
}
export async function loginByWeChatQR(): Promise<Session | null> {
  const web = new WebViewController({ ephemeral: true })
  let closed = false
  let timedOut = false
  let candidate: Session | null = null
  let sdkError = false
  let sdkConfirmed = false
  let polling: Promise<void> | null = null
  const timeout = setTimeout(() => { timedOut = true; web.dismiss() }, 180000)
  try {
    let loadTimer: ReturnType<typeof setTimeout> | undefined
    const loaded = await Promise.race([
      web.loadURL(OFFICIAL_HOME),
      new Promise<never>((_, reject) => { loadTimer = setTimeout(() => reject(new QueryError("network", "登录页面加载超时，请稍后重试")), 20000) }),
    ]).finally(() => { if (loadTimer != null) clearTimeout(loadTimer) })
    if (!loaded) throw new QueryError("network", "登录页面加载失败，请检查网络")
    const started = await web.evaluateJavaScript<boolean>(
      `if (!window.Milo || !Milo.loginByWX) return false;
       Milo.loginByWX({appId:${JSON.stringify(WX_PC_APP)},gameDomain:"iu.qq.com",sUrl:${JSON.stringify(OFFICIAL_HOME)},callback:function(r){window.__deltaLoginState = r.isLogin ? "success" : "failed";}}); return true;`)
    if (!started) throw new QueryError("api", "腾讯登录入口已变化，请检查脚本更新")
    const presentation = web.present({ fullscreen: true, navigationTitle: "使用微信扫描二维码" })
    polling = (async () => {
      while (!closed && !timedOut) {
        try {
          candidate = sessionFromCookies(await web.getCookies(OFFICIAL_HOME))
          const state = await web.evaluateJavaScript<string>('return window.__deltaLoginState || "pending"')
          if (candidate && state === "success") { sdkConfirmed = true; web.dismiss(); return }
          if (state === "failed") { sdkError = true; web.dismiss(); return }
        } catch { if (closed) return }
        await wait(1000)
      }
    })()
    await presentation
    closed = true
    await polling
    if (timedOut) throw new QueryError("auth", "扫码等待超时，请重新登录")
    if (sdkError) throw new QueryError("auth", "微信授权未完成，请重新扫码")
    if (!candidate || !sdkConfirmed) return null
    // Keep the working QR flow independent of optional balance availability.
    saveSession(candidate)
    return candidate
  } finally {
    closed = true
    clearTimeout(timeout)
    if (polling) await polling.catch(() => {})
    web.dispose()
  }
}
