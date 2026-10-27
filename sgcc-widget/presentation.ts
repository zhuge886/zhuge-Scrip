/** Display-only helpers; preserve request routing and the successful account cache. */
export const LEGACY_PAYMENT_SCOPE_NOTE = '交费查询只返回金额；用电明细需要在支持该权限的绑定户号接口查询'

export function visibleWarnings(warnings: string[] = []): string[] {
  return warnings.filter((message) => message !== LEGACY_PAYMENT_SCOPE_NOTE)
}

/** Read the upstream calendar date without timezone conversion or truncating text. */
export function amountDate(value: string | undefined): string | null {
  const match = value?.match(/^\s*(\d{4})(?:年|[-/.])(\d{1,2})(?:月|[-/.])(\d{1,2})(?:日|(?=$|[ T]))/)
  if (!match) return null
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3])
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}年${m}月${d}日`
}

export function amountDateLabel(value: string | undefined, fetchedAt: number): string {
  const upstream = amountDate(value)
  if (upstream) return `截至 ${upstream}`
  const date = new Date(fetchedAt)
  return `更新于 ${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}
