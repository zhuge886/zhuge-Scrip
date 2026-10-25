import type { PowerAccount } from './accounts'

export type Organization = { provinceCode: string; code: string; name: string }

/** Official public directory c13/f05, read 2026-10-25. See API.md. */
export const ORGANIZATIONS: Organization[] = [
  { provinceCode: '11102', code: '11401', name: '国网北京城区供电公司' },
  { provinceCode: '11102', code: '11402', name: '国网北京朝阳供电公司' },
  { provinceCode: '11102', code: '11403', name: '国网北京海淀供电公司' },
  { provinceCode: '11102', code: '11404', name: '国网北京丰台供电公司' },
  { provinceCode: '11102', code: '11405', name: '国网北京石景山供电公司' },
  { provinceCode: '11102', code: '11406', name: '国网北京通州供电公司' },
  { provinceCode: '11102', code: '11407', name: '国网北京昌平供电公司' },
  { provinceCode: '11102', code: '11408', name: '国网北京门头沟供电公司' },
  { provinceCode: '11102', code: '11409', name: '国网北京房山供电公司' },
  { provinceCode: '11102', code: '11410', name: '国网北京大兴供电公司' },
  { provinceCode: '11102', code: '11411', name: '国网北京平谷供电公司' },
  { provinceCode: '11102', code: '11412', name: '国网北京怀柔供电公司' },
  { provinceCode: '11102', code: '11413', name: '国网北京密云供电公司' },
  { provinceCode: '11102', code: '11414', name: '国网北京顺义供电公司' },
  { provinceCode: '11102', code: '11415', name: '国网北京延庆供电公司' }
]

/** Bound accounts can contribute actual codes, only within the selected province. */
export function organizationsFor(provinceCode: string, known: PowerAccount[] = []): Organization[] {
  const result = ORGANIZATIONS.filter((o) => o.provinceCode === provinceCode).map((o) => ({ ...o }))
  for (const a of known) {
    if (a.pro !== provinceCode || !/^\d+$/.test(a.org) || result.some((o) => o.code === a.org)) continue
    result.push({ provinceCode, code: a.org, name: a.orgName || `供电单位 ${a.org}` })
  }
  return result
}

export function organizationName(provinceCode: string, code: string, catalog: Organization[] = ORGANIZATIONS): string {
  return catalog.find((o) => o.provinceCode === provinceCode && o.code === code)?.name ||
    ORGANIZATIONS.find((o) => o.provinceCode === provinceCode && o.code === code)?.name || `供电单位 ${code}`
}
