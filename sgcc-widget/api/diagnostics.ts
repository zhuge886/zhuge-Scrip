/** Deliberately records only fixed protocol paths, types and short status codes. */
type Dict = Record<string, unknown>
const object = (v: unknown): Dict | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Dict : null
const kind = (v: unknown) => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v

export function diagnosticCode(value: unknown): string {
  if (typeof value !== 'number' && typeof value !== 'string') return ''
  const s = String(value).trim()
  return /^-?\d{1,6}$|^[A-Z][A-Z_]{0,18}$|^[A-Z]{1,8}\d{1,6}$/.test(s) ? s : '[hidden]'
}

function errorCategory(value: unknown): string {
  const s = typeof value === 'string' ? value : ''
  if (/^(?:auth|net|cancelled|rate_limit|empty_balance|identity_mismatch|payment_(?:response|query|parameters|verification))$/.test(s)) return s
  if (s.startsWith('payment_gateway_')) return `payment_gateway_${diagnosticCode(s.slice(16))}`
  if (s.startsWith('payment_')) return `payment_${diagnosticCode(s.slice(8))}`
  return diagnosticCode(value)
}

export function paymentDiagnostic(value: unknown, outcome: 'success' | 'error', errorCode?: unknown): string {
  const root = object(value), data = object(root?.data), common = object(data?.common)
  const srvrt = object(data?.srvrt), bizrt = object(data?.bizrt)
  const values: Record<string, unknown> = {
    root: value, 'root.code': root?.code, 'root.message': root?.message,
    'root.data': root?.data, 'data.common': data?.common, 'common.repcd': common?.repcd,
    'common.repmsg': common?.repmsg, 'data.data': data?.data, 'data.srvrt': data?.srvrt,
    'srvrt.resultCode': srvrt?.resultCode, 'data.bizrt': data?.bizrt,
    'bizrt.common': bizrt?.common, 'bizrt.data': bizrt?.data
  }
  return JSON.stringify({
    version: '1.5.1', interface: 'payment-single-refresh', time: new Date().toISOString(), outcome,
    statuses: { top: diagnosticCode(root?.code), business: diagnosticCode(common?.repcd),
      gateway: diagnosticCode(srvrt?.resultCode), error: errorCategory(errorCode) },
    schema: Object.fromEntries(Object.entries(values).map(([path, v]) => [path, kind(v)]))
  }, null, 2)
}
