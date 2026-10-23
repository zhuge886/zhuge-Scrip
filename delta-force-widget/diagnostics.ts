import { QueryError, Session } from "./model"

const KEY = "delta-force.diagnostics.v1"
type Diagnostic = { stage: string; at: number; result: string; code: string }
const stages = ["微信授权", "余额", "日报", "角色", "官网同步", "凭据导入"]
export function recordDiagnostic(stage: string, error?: unknown): void {
  if (!stages.includes(stage)) return
  const entries = loadDiagnostics().filter(entry => entry.stage !== stage)
  const detail = error instanceof QueryError && /^(AMS|jData|业务)\.(iRet|ret|code)=-?\d{1,10}$/.test(error.diagnostic) ? error.diagnostic : ""
  // Only locally generated error categories and numeric codes. Never server text,
  // response bodies, session fields, cookies, request URLs or request bodies.
  entries.push({ stage, at: Date.now(), result: error ? "失败" : "完成",
    code: error instanceof QueryError ? `${error.code}${detail ? ` (${detail})` : ""}` : error ? "unknown" : "ok" })
  Storage.set(KEY, entries.slice(-8))
}
function loadDiagnostics(): Diagnostic[] {
  const raw = Storage.get<Diagnostic[]>(KEY)
  return Array.isArray(raw) ? raw.filter(x => x && stages.includes(x.stage) && typeof x.result === "string" &&
    typeof x.code === "string" && /^[a-zA-Z0-9_ ()=.\u4e00-\u9fff-]{1,100}$/.test(x.code) && Number.isFinite(x.at)) : []
}
export function clearDiagnostics(): void { Storage.remove(KEY) }
export function diagnosticReport(session: Session | null): string {
  return ["三角洲收益 v1.1.0 · 脱敏诊断", `本机凭据：${session ? "已保存" : "未保存"}`,
    `登录类型：${session?.acctype ?? "无"}`, `查询域名：dfm.ams.game.qq.com`,
    ...loadDiagnostics().map(x => `${x.stage}：${x.result} ${x.code} · ${new Date(x.at).toISOString()}`),
    "报告不包含账号标识、Cookie、access_token 或金额。"].join("\n")
}
