import { queryAccount } from '../vendor/sgcc_protocol'
import { ELEC_TYPES, regionName, typeName } from '../regions'
import { organizationName } from '../organizations'
import type { Organization } from '../organizations'
import type { PowerAccount } from '../accounts'
import type { RawAccount } from '../data'

export const MAX_PROBE_ATTEMPTS = 30
export const MAX_ORGANIZATIONS = 20

export function needsOrganizationInfo(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown }
  return e?.code === 'org_required' || /(?:orgNo|供电单位|机构代码).*(?:必填|不能为空|不能为?空|为空|缺失)/i.test(String(e?.message ?? error))
}

function mustStop(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown }
  return /^(?:net|cancelled|identity_mismatch|unverified_balance|auth|sms|sms_fail|rate_limit|401|403|429|-200|-201|4006|RK\d+)$/i.test(String(e?.code ?? '')) ||
    /验证码|短信|安全验证|人机|频繁|限流|过多|稍后|繁忙|正忙|超时|网络|连不上|绑定|权限|禁止|身份|登录|HTTP\s*(?:401|403|429|5\d\d)/i.test(String(e?.message ?? error)) || needsOrganizationInfo(error)
}

export function canTryAnotherType(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown }, message = String(e?.message ?? error)
  if (mustStop(error) || /(?:orgNo|供电单位|机构代码).*(?:不正确|无效|有误|错误|不存在|不匹配)/i.test(message)) return false
  return e?.code === 'empty_balance' || /类型|sceneType|elecType|户号.*(?:不存在|不匹配|错误|有误)|未找到.*(?:户号|用户)|参数.*(?:错误|不匹配|无效|有误)/i.test(message)
}

export function canTryAnotherOrganization(error: unknown): boolean {
  if (mustStop(error)) return false
  const e = error as { message?: unknown }
  return canTryAnotherType(error) || /(?:orgNo|供电单位|机构代码).*(?:不正确|无效|有误|错误|不存在|不匹配)/i.test(String(e?.message ?? error))
}

export type ProbeOptions = {
  organizations?: Organization[]
  preferred?: PowerAccount
  onProgress?: (message: string) => void
  shouldContinue?: () => boolean
  pause?: () => Promise<void>
}

export async function probeBalance(
  app: Parameters<typeof queryAccount>[0], account: PowerAccount, options: ProbeOptions = {}
): Promise<{ account: PowerAccount; data: RawAccount; queryInfo: string }> {
  const automaticOrg = !account.org
  const preferred = options.preferred?.pro === account.pro && options.preferred.src === account.src ? options.preferred : undefined
  const orgs: string[] = account.org ? [account.org] : []
  if (automaticOrg) {
    // Only returned/catalogued codes for this province; no generated numeric ranges.
    if (preferred && /^\d+$/.test(preferred.org)) orgs.push(preferred.org)
    for (const item of options.organizations ?? []) {
      if (item.provinceCode === account.pro && /^\d+$/.test(item.code) && !orgs.includes(item.code)) orgs.push(item.code)
      if (orgs.length >= MAX_ORGANIZATIONS) break
    }
  }
  if (!orgs.length || !orgs.every((org) => /^\d+$/.test(org))) {
    throw Object.assign(new Error('该地区还没有可用的供电公司编码目录，请选择已列出的公司，或在高级设置填写真实单位代码。官网查询未绑定户号不能补齐此资料。'), { code: 'org_catalog_missing' })
  }
  const types: string[] = account.elec ? [account.elec] : ELEC_TYPES.map((item) => item.code)
  if (!account.elec && preferred && types.includes(preferred.elec)) {
    types.splice(types.indexOf(preferred.elec), 1); types.unshift(preferred.elec)
  }
  // Try residential across companies before moving to another scene.
  const combinations = types.flatMap((elec) => orgs.map((org) => ({ org, elec })))
  if (preferred && orgs.includes(preferred.org) && types.includes(preferred.elec)) {
    const index = combinations.findIndex((c) => c.org === preferred.org && c.elec === preferred.elec)
    combinations.unshift(...combinations.splice(index, 1))
  }
  const total = Math.min(combinations.length, MAX_PROBE_ATTEMPTS)
  const attempts: string[] = [], invalidOrgs = new Set<string>()
  let count = 0, capped = false
  const current = () => {
    if (options.shouldContinue?.() === false) throw Object.assign(new Error('已停止查询；未保存未完成的组合。'), { code: 'cancelled' })
  }
  for (const combination of combinations) {
    if (invalidOrgs.has(combination.org)) continue
    if (count >= MAX_PROBE_ATTEMPTS) { capped = true; break }
    current()
    if (count) {
      await (options.pause?.() ?? new Promise<void>((resolve) => setTimeout(resolve, 1000)))
      current()
    }
    count++
    const candidate = { ...account, ...combination, orgName: organizationName(account.pro, combination.org, options.organizations) }
    const label = `${candidate.orgName} · ${typeName(candidate.elec)}`
    options.onProgress?.(`正在查询 ${regionName(candidate.pro)} · ${label}（${count}/${total}）`)
    try {
      const data: RawAccount = await queryAccount(app, candidate, { scope: 'balance' })
      current()
      if (automaticOrg && !data.householdVerified) {
        throw Object.assign(new Error('接口未返回完整户号，无法确认自动匹配结果。请明确选择供电公司后重试，并与官方 App 核对金额。'), { code: 'unverified_balance' })
      }
      const resolved = data.resolvedAccount ?? candidate
      const queryInfo = `可用查询组合：${regionName(resolved.pro)} · ${organizationName(resolved.pro, resolved.org, options.organizations)} · ${typeName(resolved.elec)}。${data.householdVerified ? '已核对返回户号并保存。' : '接口未返回完整户号，请与官方 App 核对金额。'}`
      options.onProgress?.(queryInfo)
      return { account: resolved, data, queryInfo }
    } catch (error) {
      const e = error as { code?: unknown; message?: unknown }
      const message = String(e?.message ?? error).replace(/\d{7,}/g, (s) => `***${s.slice(-4)}`).slice(0,180)
      attempts.push(`${label}：${message}`)
      if (/户号.*未绑定|未绑定.*户号/.test(message)) {
      throw Object.assign(new Error('原余额接口要求户号绑定。请把查询入口改为「自动」或「其他户号交费」；此错误不代表 App 的其他户号交费不可查询。'), { code: 'bound_channel_required' })
      }
      const retryType = canTryAnotherType(error), retryOrg = automaticOrg && canTryAnotherOrganization(error)
      if (!retryType && !retryOrg) throw Object.assign(new Error(`已停止自动尝试。\n${attempts.slice(-6).join('\n')}`), { code: e?.code })
      if (!retryType) invalidOrgs.add(candidate.org)
    }
  }
  throw Object.assign(new Error(`${capped ? `已达到本次 ${MAX_PROBE_ATTEMPTS} 次尝试上限，尚未遍历全部组合。可明确选择公司或用电类型以缩小范围。` : '已尝试全部候选类型和供电公司，仍未查到有效余额。'}\n最近结果：\n${attempts.slice(-6).join('\n')}\n若 App 的其他户号交费可用而此接口要求绑定，轮换单位代码也不能解除该限制。`), { code: capped ? 'probe_limit' : 'probe_exhausted' })
}
