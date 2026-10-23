import type { Preference } from './store'

/** Exact shape consumed by the existing App protocol. Never infer routing codes from a household number. */
export type PowerAccount = {
  consNo: string
  src: string
  pro: string
  org: string
  elec: string
  name: string
  orgName: string
}

export const MAX_ACCOUNTS = 6

export function normalizePhone(value: string): string {
  return value.trim().replace(/^(\+86|0086)/, '').replace(/\D/g, '')
}

export function sourceKey(preference: Preference): string {
  const p = preference
  return JSON.stringify([
    'sgcc-manual-v1', normalizePhone(p.phone), p.queryMode, p.queryScope,
    ...(p.queryMode === 'manual'
      ? [p.consNo.trim(), p.provinceCode.trim(), p.orgNo.trim(), p.elecType.trim()]
      : [])
  ])
}

export function selectAccounts(preference: Preference, bound: PowerAccount[]): PowerAccount[] {
  if (preference.queryMode === 'bound') {
    if (!bound.length) throw new Error('当前账号没有绑定户号，请切换「手动户号」并填写查询资料')
    return bound.slice(0, MAX_ACCOUNTS)
  }
  const consNo = preference.consNo.trim()
  if (!/^\d+$/.test(consNo)) throw new Error('请输入完整的数字户号，保留开头的 0')
  const existing = bound.find((a) => a.src === consNo || a.consNo === consNo)
  // For bound accounts retain the server's encrypted/original account representations.
  if (existing) return [existing]

  const pro = preference.provinceCode.trim()
  const org = preference.orgNo.trim()
  const elec = preference.elecType.trim()
  if (!pro || !org || !elec) {
    throw new Error('未绑定户号还需填写省份、供电单位及用电类型代码；目前不能仅凭户号自动取得这些资料。请在「手动户号」中补全，不能用手机号或户号前几位代替。')
  }
  if (![pro, org, elec].every((value) => /^\d+$/.test(value))) {
    throw new Error('省份、供电单位及用电类型代码应为原查询返回的数字代码')
  }
  return [{ consNo, src: consNo, pro, org, elec, name: '', orgName: '' }]
}

export function selectResult<T extends { userInfo?: { consNo?: string; consNo_dst?: string } }>(
  list: (T | null)[], parameter: string
): T | null {
  const value = parameter.split(';')[0].trim()
  if (!value) return list[0] ?? null
  // Exact account number wins over interpreting the parameter as an array index.
  const found = list.find((item) => item &&
    (item.userInfo?.consNo_dst === value || item.userInfo?.consNo === value))
  if (found) return found
  if (!/^\d+$/.test(value)) return null
  const index = Number(value)
  return Number.isSafeInteger(index) ? list[index] ?? null : null
}
