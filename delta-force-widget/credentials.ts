import { object, QueryError, Session, validSession } from "./model"
// Parse text locally. No shell / eval and no remote credential transfer.
export function parseOwnCredentials(input: string): Session {
  const text = input.trim()
  if (!text || text.length > 64000) throw new QueryError("auth", "请粘贴本人小程序的 Cookie、POST 表单或凭据 JSON")
  const values: Record<string, unknown> = {}
  const assign = (key: string, value: unknown) => {
    if (key in values && values[key] !== value) throw new QueryError("auth", "同一输入包含冲突的账号凭据，请只复制同一次成功查询请求")
    values[key] = value
  }
  const readPairs = (source: string, separator: string) => {
    for (const part of source.replace(/^cookie:\s*/i, "").split(separator)) {
      const at = part.indexOf("=")
      if (at < 0) continue
      const key = part.slice(0, at).trim()
      if (!["openid", "access_token", "appid", "acctype"].includes(key)) continue
      let decoded: string
      try { decoded = decodeURIComponent(part.slice(at + 1).trim()) }
      catch { throw new QueryError("auth", "凭据编码无效，请重新复制") }
      assign(key, decoded)
    }
  }
  if (text.startsWith("{")) {
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { throw new QueryError("auth", "凭据 JSON 格式无效") }
    const root = object(parsed)
    for (const source of [root, object(root.credentials), object(root.headers)]) {
      for (const [key, value] of Object.entries(source)) {
        if (["openid", "access_token", "appid", "acctype"].includes(key)) assign(key, value)
        if (key.toLowerCase() === "cookie" && typeof value === "string") readPairs(value, ";")
      }
    }
    if (typeof root.body === "string") readPairs(root.body, "&")
  } else {
    readPairs(text, text.includes(";") || /^cookie:/i.test(text) ? ";" : "&")
  }
  const session = validSession(values)
  if (!session) throw new QueryError("auth", "缺少有效的微信 openid、access_token、appid 或 acctype（wx / mini）；请复制同一次成功请求，勿手改 App ID")
  return session
}
