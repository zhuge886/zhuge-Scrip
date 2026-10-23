import type { Cookie } from "scripting"
import { form, OFFICIAL_HOME, QueryError, Session, validSession, WX_MOBILE_APP, WX_PC_APP } from "./model"
import { PENDING_KEY, saveSession } from "./store"
import { verifySession } from "./api"

export type PendingAuth = { state: string; createdAt: number }
const REDIRECT = "https://iu.qq.com/comm-htdocs/login/milosdk/wx_mobile_redirect.html"
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export function mobileAuthURL(pending: PendingAuth): string {
  // No s_url: the Tencent redirect page keeps the one-use code unconsumed so it
  // can be exchanged on this device inside the official df.qq.com WebView.
  const redirect = `${REDIRECT}?${form({ acctype: "wx", appid: WX_MOBILE_APP })}`
  return `https://open.weixin.qq.com/connect/oauth2/authorize?${form({
    appid: WX_MOBILE_APP, redirect_uri: redirect, response_type: "code",
    scope: "snsapi_userinfo", state: pending.state,
  })}#wechat_redirect`
}
export function parseAuthCallback(input: string, pending: PendingAuth | null, now = Date.now()): string {
  if (!pending || now < pending.createdAt || now - pending.createdAt > 10 * 60000) {
    throw new QueryError("auth", "授权链接已过期，请重新复制微信授权链接")
  }
  const match = /^https:\/\/iu\.qq\.com\/comm-htdocs\/login\/milosdk\/wx_mobile_redirect\.html\?([^#]*)(?:#.*)?$/.exec(input.trim())
  if (!match) throw new QueryError("auth", "请粘贴本次微信授权后腾讯中转页的完整链接")
  const params: Record<string, string> = {}
  try {
    for (const part of match[1].split("&")) {
      const at = part.indexOf("=")
      if (at < 0) continue
      const key = decodeURIComponent(part.slice(0, at))
      if (key in params) throw new Error("duplicate")
      params[key] = decodeURIComponent(part.slice(at + 1))
    }
  } catch { throw new QueryError("auth", "授权链接格式无效，请重新复制完整链接") }
  if (params.state !== pending.state || params.appid !== WX_MOBILE_APP || params.acctype !== "wx") {
    throw new QueryError("auth", "授权链接与本次登录不匹配，请使用刚刚生成的链接")
  }
  if (!params.code || !/^[a-zA-Z0-9_-]{6,256}$/.test(params.code)) throw new QueryError("auth", "授权尚未完成，链接中没有有效授权码")
  return params.code
}
export function sessionFromCookies(cookies: Cookie[]): Session | null {
  const values: Record<string, string> = {}
  // getCookies(OFFICIAL_HOME) supplies only cookies applicable to that page.
  for (const cookie of cookies) {
    if (!["df.qq.com", ".df.qq.com", "qq.com", ".qq.com"].includes(cookie.domain)) continue
    if (["openid", "access_token", "appid", "acctype"].includes(cookie.name)) values[cookie.name] = cookie.value
  }
  return validSession(values)
}
export function createMobileAuth(): string {
  const pending: PendingAuth = { state: UUID.string(), createdAt: Date.now() }
  if (!Storage.set(PENDING_KEY, pending)) throw new QueryError("storage", "无法保存本次授权状态，请检查存储权限")
  return mobileAuthURL(pending)
}

async function officialWebLogin(code?: string): Promise<Session | null> {
  const web = new WebViewController({ ephemeral: true })
  let closed = false
  let timedOut = false
  let candidate: Session | null = null
  let sdkError = false
  let polling: Promise<void> | null = null
  // Always released in finally, including page-load and presentation failures.
  const timeout = setTimeout(() => { timedOut = true; web.dismiss() }, 180000)
  try {
    let loadTimer: ReturnType<typeof setTimeout> | undefined
    const loaded = await Promise.race([
      web.loadURL(OFFICIAL_HOME),
      new Promise<never>((_, reject) => { loadTimer = setTimeout(() => reject(new QueryError("network", "腾讯登录页面加载超时，请稍后重试")), 20000) }),
    ]).finally(() => { if (loadTimer != null) clearTimeout(loadTimer) })
    if (!loaded) throw new QueryError("network", "腾讯登录页面加载失败，请检查网络后重试")
    const started = await web.evaluateJavaScript<boolean>(code
      ? `if (!window.Milo || !Milo.Login || !Milo.Login.wxCodeToOpenid) return false;
         Milo.Login.wxCodeToOpenid({appid:${JSON.stringify(WX_MOBILE_APP)},code:${JSON.stringify(code)}},function(r){window.__deltaLoginFailed = Number(r.iRet)!==0;}); return true;`
      : `if (!window.Milo || !Milo.loginByWX) return false;
         Milo.loginByWX({appId:${JSON.stringify(WX_PC_APP)},gameDomain:"iu.qq.com",sUrl:${JSON.stringify(OFFICIAL_HOME)},callback:function(r){window.__deltaLoginFailed = !r.isLogin;}}); return true;`)
    if (!started) throw new QueryError("api", "腾讯登录入口已变化，请检查脚本更新")
    const presentation = web.present({ fullscreen: true, navigationTitle: code ? "完成微信授权" : "使用微信扫描二维码" })
    polling = (async () => {
      while (!closed && !timedOut) {
        try {
          candidate = sessionFromCookies(await web.getCookies(OFFICIAL_HOME))
          if (candidate) { web.dismiss(); return }
          if (await web.evaluateJavaScript<boolean>("return window.__deltaLoginFailed === true")) {
            sdkError = true; web.dismiss(); return
          }
        } catch { if (closed) return }
        await wait(1000)
      }
    })()
    await presentation
    closed = true
    await polling
    if (timedOut) throw new QueryError("auth", "微信登录等待超时，请重新登录")
    if (sdkError) throw new QueryError("auth", "腾讯微信授权未完成或授权码已使用，请重新授权")
    if (!candidate) return null
    // Authentication is considered successful only after the account query works.
    await verifySession(candidate)
    saveSession(candidate)
    Storage.remove(PENDING_KEY)
    return candidate
  } finally {
    closed = true
    clearTimeout(timeout)
    if (polling) await polling.catch(() => {})
    web.dispose()
  }
}
export function loginByWeChatQR(): Promise<Session | null> { return officialWebLogin() }
export async function completeMobileAuth(input: string): Promise<Session | null> {
  const pending = Storage.get<PendingAuth>(PENDING_KEY)
  const code = parseAuthCallback(input, pending)
  return officialWebLogin(code)
}
