import { HAFU_ITEM, object, parseBalance, parseProfit, QueryError, RECORD_HOME, Session, Snapshot, yesterday } from "./model"
import { loadSession, loadSnapshot } from "./store"
import { storeQueryResults } from "./api"
import { recordDiagnostic } from "./diagnostics"

type SDKResult = { money: unknown; daily: unknown }
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
function sameAccount(a: Session | null, b: Session): boolean {
  return a?.openid === b.openid && a.appid === b.appid && a.access_token === b.access_token
}
export async function syncThroughOfficialPage(): Promise<Snapshot> {
  const session = loadSession()
  if (!session) throw new QueryError("auth", "请先微信登录或导入本人小程序凭据")
  const web = new WebViewController({ ephemeral: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    for (const [name, value] of Object.entries(session)) {
      if (!await web.setCookie({ name, value, domain: "df.qq.com", path: "/", isSecure: true, isHTTPOnly: false, isSessionOnly: true })) {
        throw new QueryError("auth", "无法将本机登录同步到官网")
      }
    }
    const loaded = await Promise.race([web.loadURL(RECORD_HOME), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new QueryError("network", "官方战绩页加载超时")), 20000)
    })]).finally(() => { if (timer != null) clearTimeout(timer) })
    if (!loaded) throw new QueryError("network", "官方战绩页加载失败")
    await web.present({ fullscreen: true, navigationTitle: "确认本人角色后点完成，同步数据" })
    // Fail closed if the user signed into a different account inside the page.
    const pageAccount = await web.getCookies(RECORD_HOME)
    const currentId = pageAccount.find(c => c.name === "openid" && ["df.qq.com", ".df.qq.com"].includes(c.domain))?.value
    if (currentId && currentId !== session.openid) throw new QueryError("auth", "官网账号发生变化，请使用脚本更换账号后再同步")
    const started = await web.evaluateJavaScript<boolean>(`
      if (location.hostname !== "df.qq.com" || !window.Milo || !Milo.emit) return false;
      window.__deltaData = null;
      function result(r) {
        if (Number(r.iRet) !== 0) return {iRet: Number(r.iRet) || -1};
        return {iRet: 0, jData: r.details && r.details.jData};
      }
      function query(token, data) {
        return Milo.emit({actId:"21_3LXYAj", token:token, sData:data})
          .then(result, function(r){return {iRet:Number(r && r.iRet) || -1};});
      }
      Promise.all([
        query("zMemOt", {type:3,item:${JSON.stringify(HAFU_ITEM)}}),
        query("NoOapI", {method:"dfm/center.recent.detail",source:"7",param:JSON.stringify({resourceType:"sol"})})
      ]).then(function(r){window.__deltaData={money:r[0],daily:r[1]};});
      return true;`)
    if (!started) throw new QueryError("api", "请在官方战绩页完成角色确认后重试")
    let data: SDKResult | null = null
    const until = Date.now() + 18000
    while (Date.now() < until && !data) {
      data = await web.evaluateJavaScript<SDKResult | null>("return window.__deltaData || null")
      if (!data) await wait(400)
    }
    if (!data) throw new QueryError("network", "官网查询等待超时，请重试")
    if (!sameAccount(loadSession(), session)) throw new QueryError("auth", "本机账号已更换，请重试")
    const now = Date.now()
    const [money, daily] = await Promise.allSettled([
      Promise.resolve().then(() => parseBalance(object(data).money)),
      Promise.resolve().then(() => parseProfit(object(data).daily, yesterday(now))),
    ])
    const snapshot = storeQueryResults(session, loadSnapshot(session, now), money, daily, now)
    if (money.status === "rejected" && daily.status === "rejected") throw money.reason
    recordDiagnostic("官网同步")
    return snapshot
  } catch (error) { recordDiagnostic("官网同步", error); throw error }
  finally { web.dispose() }
}
