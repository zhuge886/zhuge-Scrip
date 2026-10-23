import { queryAccount } from '../vendor/sgcc_protocol'
import { ELEC_TYPES, regionName, typeName } from '../regions'
import type { PowerAccount } from '../accounts'
import type { RawAccount } from '../data'

export const MAX_PROBE_ATTEMPTS = ELEC_TYPES.length

/** Only retry errors a scene change might fix; transport/auth/permission errors stop. */
export function canTryAnotherType(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown }
  const code = String(e?.code ?? '')
  const message = String(e?.message ?? error)
  if (/^(?:net|identity_mismatch|auth|sms|sms_fail|rate_limit|-200|-201|4006|429|RK\d+)$/i.test(code)) return false
  if (/验证码|短信|安全验证|频繁|限流|过多|稍后|繁忙|超时|网络|连不上|绑定|权限|禁止|身份|登录|HTTP\s*(?:401|403|429|5\d\d)/i.test(message)) return false
  if (/(?:orgNo|供电单位|机构代码).*(?:必填|为空|不能为空|缺失|不正确|无效|有误|错误)/i.test(message)) return false
  if (code === 'empty_balance') return true
  return /类型|sceneType|elecType|户号.*(?:不存在|不匹配|错误|有误)|未找到.*(?:户号|用户)|参数.*(?:错误|不匹配|无效|有误)/i.test(message)
}

export type ProbeOptions = {
  preferred?: PowerAccount
  onProgress?: (message: string) => void
  pause?: () => Promise<void>
}

export async function probeBalance(
  app: Parameters<typeof queryAccount>[0], account: PowerAccount, options: ProbeOptions = {}
): Promise<{ account: PowerAccount; data: RawAccount; queryInfo: string }> {
  const base = { ...account, org: account.org || options.preferred?.org || '' }
  const types: string[] = account.elec ? [account.elec] : ELEC_TYPES.map((item) => item.code)
  const preferred = options.preferred?.elec
  if (!account.elec && preferred && types.includes(preferred)) {
    types.splice(types.indexOf(preferred), 1)
    types.unshift(preferred)
  }
  const attempts: string[] = []
  for (let i = 0; i < types.length; i++) {
    const candidate = { ...base, elec: types[i] }
    const label = typeName(candidate.elec)
    options.onProgress?.(`正在查询 ${regionName(candidate.pro)} · ${label}（${i + 1}/${types.length}）`)
    try {
      const data: RawAccount = await queryAccount(app, candidate, { scope: 'balance' })
      const resolved = data.resolvedAccount ?? candidate
      const queryInfo = `可用查询组合：${regionName(resolved.pro)} · ${typeName(resolved.elec)}；${resolved.org ? '已保存供电单位资料' : '供电单位未指定，服务端已接受'}。${data.householdVerified ? '已核对返回户号。' : '接口未返回可核对的完整户号，请与官方 App 核对金额。'}`
      options.onProgress?.(queryInfo)
      return { account: resolved, data, queryInfo }
    } catch (error) {
      const e = error as { code?: unknown; message?: unknown }
      attempts.push(`${label}：${e?.message ?? String(error)}`)
      if (!canTryAnotherType(error) || i === types.length - 1) {
        const prefix = canTryAnotherType(error)
          ? '已尝试全部候选类型，仍未查到余额。'
          : '已停止自动尝试。'
        throw Object.assign(new Error(`${prefix}\n${attempts.join('\n')}\n供电单位留空是否可用由服务端决定；若提示需绑定或缺少资料，更换类型不能解决。`), { code: e?.code })
      }
      await (options.pause?.() ?? new Promise<void>((resolve) => setTimeout(resolve, 750)))
    }
  }
  throw new Error('没有可尝试的用电类型')
}
