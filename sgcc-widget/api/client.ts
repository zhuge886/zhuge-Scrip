import { AbortController, fetch } from 'scripting'
import { K, SgApp, queryAccount } from '../vendor/sgcc_protocol'
import {
  KEYCHAIN_PREFIX,
  getPassword,
  loadCache,
  loadPreference,
  loadResolution,
  loadMetadata,
  saveCache,
  saveResolution
} from '../store'
import type { Cache } from '../store'
import type { RawAccount } from '../data'
import type { Preference } from '../store'
import { normalizePhone, selectAccounts, sourceKey, metadataKey } from '../accounts'
import type { PowerAccount } from '../accounts'
import { probeBalance } from './probe'
import { organizationsFor } from '../organizations'
import { queryPaymentBalance } from './payment'
import type { PaymentApp } from './payment'

/** Same as the Scriptable version: at most one round of requests every 4 hours. */
export const MIN_FETCH_INTERVAL_MS = 4 * 60 * 60 * 1000

/**
 * Storage and network adapters `SgApp` runs on.
 * @param smsCode new-device SMS code, consumed once by `SgApp.ensure`
 */
function createCtx(smsCode = '') {
  return {
    env: { SGCC_SMS: smsCode },
    storage: {
      getJSON: (k: string) => {
        const key = KEYCHAIN_PREFIX + k
        return Keychain.contains(key) ? JSON.parse(Keychain.get(key) ?? 'null') : null
      },
      setJSON: (k: string, v: unknown) =>
        Keychain.set(KEYCHAIN_PREFIX + k, JSON.stringify(v))
    },
    http: {
      post: async (
        url: string,
        {
          headers = {},
          body = '',
          timeout = 20000
        }: { headers?: Record<string, unknown>; body?: string; timeout?: number }
      ) => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeout)
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: Object.fromEntries(
              Object.entries(headers).map(([k, v]) => [k, v == null ? '' : String(v)])
            ),
            body,
            signal: controller.signal,
            timeout: timeout / 1000
          })
          const text = await response.text()
          return { status: response.status, text: async () => text }
        } finally {
          clearTimeout(timer)
        }
      }
    }
  }
}

function createApp(preference = loadPreference()) {
  const { phone, smsCode } = preference
  const password = getPassword()
  if (!phone || !password) {
    throw new Error('请先在设置中填写网上国网手机号和密码')
  }
  return new SgApp(createCtx(String(smsCode || '').trim()), normalizePhone(phone), password)
}

async function fetchAccounts(preference: Preference, discover: boolean, onProgress?: (message: string) => void, shouldContinue?: () => boolean) {
  onProgress?.('正在登录网上国网…')
  const app = createApp(preference)
  const { accounts: bound = [] } = await app.ensure()
  const metadata = loadMetadata()
  const accounts = selectAccounts(preference, bound, metadata?.key === metadataKey(preference) ? metadata.account : undefined)

  const list: (RawAccount | null)[] = []
  const warnings: string[] = []
  let queryInfo: string | undefined
  let error: unknown
  for (const account of accounts) {
    try {
      let item: RawAccount
      const isUnboundManual = preference.queryMode === 'manual' &&
        !bound.some((entry: PowerAccount) => entry.src === account.src || entry.consNo === account.consNo)
      const usePayment = preference.queryMode === 'manual' &&
        (preference.queryChannel === 'payment' || isUnboundManual && preference.queryChannel !== 'balance')
      if (usePayment) {
        const key = sourceKey(preference)
        const current = () => {
          if (sourceKey(loadPreference()) !== key || shouldContinue?.() === false) {
            throw Object.assign(new Error('查询已停止或配置已改变，未保存本次结果'), { code: 'cancelled' })
          }
        }
        current()
        const saved = loadResolution()
        const paymentId = saved?.sourceKey === key ? saved.account.paymentId : undefined
        onProgress?.('正在通过其他户号交费入口查询金额…')
        item = await queryPaymentBalance(app as unknown as PaymentApp, { ...account, paymentId })
        current()
        saveResolution({ sourceKey: key, account: item.resolvedAccount ?? account, savedAt: Date.now() })
        queryInfo = `来源：其他户号交费查询。已核对返回户号和地区。${item.amountAsOf ? `金额截至 ${item.amountAsOf}。` : ''}`
      } else if (isUnboundManual) {
        const key = sourceKey(preference)
        const saved = loadResolution()
        const preferred = saved?.sourceKey === key ? saved.account : undefined
        if (discover) {
          const resolved = await probeBalance(app, account, { preferred, onProgress,
            organizations: organizationsFor(account.pro, bound),
            shouldContinue: () => sourceKey(loadPreference()) === key && shouldContinue?.() !== false })
          queryInfo = resolved.queryInfo
          item = resolved.data
          if (sourceKey(loadPreference()) === key) {
            saveResolution({ sourceKey: key, account: resolved.account, savedAt: Date.now() })
          }
          if (preference.queryScope === 'full') {
            onProgress?.('余额已取得，正在查询用电明细…')
            try {
              const full: RawAccount = await queryAccount(app, resolved.account, { scope: 'full' })
              item = { ...full, eleBill: resolved.data.eleBill,
                arrearsOfFees: resolved.data.arrearsOfFees,
                availability: { balance: true, daily: !!full.availability?.daily, monthly: !!full.availability?.monthly } }
            } catch (error) {
              item = { ...item, warnings: [...(item.warnings ?? []), `余额已取得，用电明细查询失败：${errorMessage(error)}`] }
            }
          }
        } else if (preferred) {
          // Widgets reuse one proven combination; discovery is user initiated.
          item = await queryAccount(app, preferred, { scope: preference.queryScope })
          queryInfo = '使用上次成功保存的户号查询组合'
        } else {
          throw new Error('请先在脚本中选择地区并点「刷新余额」；小组件不会自动轮试类型')
        }
      } else {
        item = await queryAccount(app, account, { scope: preference.queryScope })
        if (preference.queryMode === 'manual' && sourceKey(loadPreference()) === sourceKey(preference)) {
          saveResolution({ sourceKey: sourceKey(preference), account, savedAt: Date.now() })
        }
      }
      list.push(item)
      warnings.push(...(item.warnings ?? []))
    } catch (e) {
      error = e
      warnings.push(`户号末四位 ${account.src.slice(-4)}：${errorMessage(e)}`)
      // 占位保证小组件参数下标与户号顺序一致
      list.push(null)
    }
  }
  if (list.every((item) => !item)) throw error
  return { list, warnings, queryInfo }
}

export type DataResult = Cache & {
  /** Set when a refresh failed and the cache was served instead. */
  error?: string
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

/**
 * Cached data when it is younger than 4 hours, otherwise a fresh fetch. A
 * failed fetch falls back to the cache; only with no cache at all does it throw.
 */
export async function getData({ force = false, discover = false, onProgress, shouldContinue }: {
  force?: boolean; discover?: boolean; onProgress?: (message: string) => void; shouldContinue?: () => boolean
} = {}): Promise<DataResult> {
  const cache = loadCache()
  const preference = loadPreference()
  const key = sourceKey(preference)
  const matchingCache = cache?.sourceKey === key ? cache : null
  if (!force && matchingCache && Date.now() - matchingCache.fetchedAt < MIN_FETCH_INTERVAL_MS) {
    return matchingCache
  }
  try {
    const saved = loadResolution()
    if (preference.queryMode === 'manual' && !discover && saved?.sourceKey !== key) {
      throw new Error('请先在脚本中选择地区并点「刷新余额」；小组件不会自动轮试类型')
    }
    const result = await fetchAccounts(preference, discover, onProgress, shouldContinue)
    const next: Cache = { sourceKey: key, fetchedAt: Date.now(), ...result }
    // A settings change during the request must not overwrite the new account's cache.
    if (sourceKey(loadPreference()) === key && shouldContinue?.() !== false) saveCache(next)
    return next
  } catch (e) {
    if (!matchingCache) throw e
    return { ...matchingCache, error: errorMessage(e) }
  }
}

/** Sends the new-device SMS code; resolves to the masked phone number. */
export async function sendSms(): Promise<string> {
  // `user` is set in the vendored constructor, which TS cannot see through @ts-nocheck.
  const app = createApp() as SgApp & { user: string }
  const codeKey = await app.sendDeviceSms()
  app.st(app.sk(K.sms), { user: app.user, codeKey, ts: Date.now(), used: '' })
  return `${app.user.slice(0, 3)}****${app.user.slice(-4)}`
}

