import type { PowerAccount } from '../accounts'
import type { RawAccount } from '../data'
import { saveQueryDiagnostic } from '../store'
import { diagnosticCode, paymentDiagnostic } from './diagnostics'

/** Official Android 3.2.3: IService.queryEleInfoSingle, SingleElecIndexPresenter. */
export const PAYMENT_QUERY_PATH = 'emss-eaa-payelec-front/member/p1/f04'
const SDK_VERSION = '1.2024.09.25.01'

type Dict = Record<string, unknown>
const object = (value: unknown): Dict | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Dict : null
const text = (value: unknown) => value == null ? '' : String(value).trim()
function fail(code: string, message: string): never { throw Object.assign(new Error(message), { code }) }

/** Error text is safe to show: no tokens, long identifiers, or raw response dump. */
export function paymentErrorMessage(value: unknown): string {
  return text(value).replace(/[A-Za-z0-9_+\/=.-]{24,}/g, '[已隐藏]')
    .replace(/\d{7,}/g, (s) => `***${s.slice(-4)}`).slice(0, 240)
}

/** Use the SDK's read-only refresh form; no ADD_TYPE, order or binding request. */
export function paymentPayload(account: PowerAccount, token: string, now = Date.now()) {
  if (!/^\d+$/.test(account.src) || !/^\d+$/.test(account.pro)) fail('payment_parameters', '请填写完整户号并选择地区')
  if (!token) fail('auth', '交费查询缺少登录凭证，请重新登录')
  return {
    serviceCode: 'f05', source: 'undefined', target: 'undefined',
    data: {
      common: {
        PLAT: '3', TOKEN: token, CHANNEL_RESOURCE: '5', REQTYPE: '99', ENCRYPTTYPE: '0',
        APPVERSION: '3.2.3', SDKVERSION: SDK_VERSION, ACCESS_MERCHANT_NO: '1000000022',
        REQUEST_SOURCE: '10', WSGW_PLAT: '3', RISK_CHECK: '1qaz@WSX3edc$RFV',
        channelPlat: 'QD0102', timestamp: String(now)
      },
      data: { TYPE: '3', PROVINCE_CODE: account.pro, POWER_USER_ID: account.src,
        SENSITIVE_POWER_USER_ID: account.paymentId || '', TOKEN: token }
    }
  }
}

/** Payment SDK money fields are integer fen, not yuan. Missing/hidden is never 0. */
export function fenToYuan(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const s = String(value).trim()
  if (!/^-?\d+(?:\.0+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isSafeInteger(n) ? n / 100 : null
}

/** Keep ObjectApiResponse intact: the payment SDK has its own success codes. */
export function parsePaymentBalance(envelope: unknown, account: PowerAccount): RawAccount {
  const outer = object(envelope), result = object(outer?.data), common = object(result?.common)
  const topCode = text(outer?.code)
  const gateway = object(result?.srvrt), gatewayCode = text(gateway?.resultCode)
  const code = text(common?.repcd)
  const message = paymentErrorMessage(common?.repmsg || gateway?.resultMessage || outer?.message)
  // Gateways may return an error with no SDK data/common envelope at all.
  // Inspect known error statuses before requiring the successful amount schema.
  if (gatewayCode && gatewayCode !== '0000') {
    fail(`payment_gateway_${diagnosticCode(gatewayCode)}`, `交费网关未完成查询（${paymentErrorMessage(gatewayCode)}）：${message || '服务端拒绝了本次请求'}`)
  }
  if (['-200', '-201'].includes(topCode) ||
      topCode && !['0', '1'].includes(topCode) && code !== 'MCA00000') {
    fail(`payment_${diagnosticCode(topCode)}`, `交费服务未完成查询（${paymentErrorMessage(topCode)}）：${message || '服务端未返回错误说明'}`)
  }
  if (common && typeof common.repcd === 'string' && code && code !== 'MCA00000') {
    fail(`payment_${diagnosticCode(code)}`, `交费查询未完成（${paymentErrorMessage(code)}）：${message || '请在官方 App 检查交费查询状态'}`)
  }
  const commonAbsent = !!result && result.common == null
  const commonValid = !!common && typeof common.repcd === 'string'
  if (!outer || !Object.prototype.hasOwnProperty.call(outer, 'code') ||
      !['number', 'string'].includes(typeof outer.code) || !result ||
      (!commonValid && !(commonAbsent && topCode === '0'))) {
    fail('payment_response', `交费响应结构不兼容，未保存本次结果。${message ? `服务端说明：${message}。` : ''}请点「复制查询诊断」反馈`)
  }
  // EleUtils.objectSuccess falls back to outer code 0 when getCommon() is null.
  // Null/absent common is valid only with explicit outer success, never by itself.
  if (code !== 'MCA00000' && !(topCode === '0' && (commonAbsent || code === ''))) {
    const status = code || topCode
    fail(`payment_${status}`, `交费查询未完成${status ? `（${paymentErrorMessage(status)}）` : ''}：${message || '请在官方 App 检查该户号的交费查询状态'}`)
  }
  const row = object(result.data)
  if (!row) fail('payment_response', '交费查询未返回单户金额资料')
  if (text(row.IS_REAL_NAME_DISPLAY) || text(row.PROMPT_STATUS) !== '0') {
    fail('payment_verification', `交费入口要求先完成验证或确认：${paymentErrorMessage(row.PROMPT_MESSAGE || row.POP_MESSAGE) || '请在国网 App 的其他户号交费页完成提示操作'}`)
  }
  const household = text(row.POWER_USER_ID), province = text(row.PROVINCE_CODE)
  if (household !== account.src || province !== account.pro) {
    fail('identity_mismatch', '交费查询没有返回与输入完全一致的户号和地区，未保存金额')
  }
  const kind = text(row.POWER_USER_TYPE)
  let amount: number | null, moneyKind: RawAccount['moneyKind']
  if (kind === '01') {
    amount = fenToYuan(row.AVALIABLE_BALANCE)
    moneyKind = account.pro === '11102' && text(row.LOCAL_RCV_FLAG) !== '0' ? 'meter_balance' : 'balance'
  } else if (kind === '00') {
    amount = fenToYuan(row.TOTAL_PAY_BREACH)
    moneyKind = 'amount_due'
  } else fail('payment_response', '交费查询未返回可识别的计费方式，无法区分余额和应缴金额')
  if (amount === null) fail('empty_balance', '交费入口未返回可显示的金额，可能需要在 App 完成验证；没有把空值当成零元')
  const org = text(row.POWER_COMPANY_CODE), paymentId = text(row.SENSITIVE_POWER_USER_ID)
  const resolvedAccount: PowerAccount = { ...account, consNo: account.src,
    org: /^\d+$/.test(org) ? org : account.org,
    orgName: text(row.POWER_COMPANY_NM).slice(0, 100),
    ...(paymentId && paymentId.length <= 2048 ? { paymentId } : {}) }
  return {
    householdVerified: true, resolvedAccount, moneyKind,
    amountAsOf: text(row.DEADLINE_TIME).slice(0, 80) || undefined,
    availability: { balance: true, daily: false, monthly: false }, warnings: [],
    userInfo: { consNo: account.src, consNo_dst: account.src, proNo: account.pro, orgName: resolvedAccount.orgName },
    arrearsOfFees: false, eleBill: { sumMoney: amount }
  }
}

export type PaymentApp = { sess?: { token?: string }; authed: (path: string, payload: () => unknown, options: { raw: true }) => Promise<unknown> }

export async function queryPaymentBalance(app: PaymentApp, account: PowerAccount): Promise<RawAccount> {
  let response: unknown
  try {
    // Rebuild after ensure/re-login so the SDK body TOKEN matches the transport token.
    response = await app.authed(PAYMENT_QUERY_PATH,
      () => paymentPayload(account, app.sess?.token || ''), { raw: true })
    const result = parsePaymentBalance(response, account)
    saveQueryDiagnostic(paymentDiagnostic(response, 'success', undefined, account))
    return result
  } catch (error) {
    const e = error as { code?: unknown; message?: unknown }
    saveQueryDiagnostic(paymentDiagnostic(response, 'error', e?.code, account))
    const message = paymentErrorMessage(e?.message || error)
    throw Object.assign(new Error(`其他户号交费查询失败：${message}`), { code: e?.code || 'payment_query' })
  }
}
