import { AbortController, fetch } from 'scripting'
import { K, SgApp, queryAccount } from '../vendor/sgcc_protocol'
import {
  KEYCHAIN_PREFIX,
  getPassword,
  loadCache,
  loadPreference,
  saveCache
} from '../store'
import type { Cache } from '../store'
import type { RawAccount } from '../data'
import type { Preference } from '../store'
import { normalizePhone, selectAccounts, sourceKey } from '../accounts'

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

async function fetchAccounts(preference: Preference) {
  const app = createApp(preference)
  const { accounts: bound = [] } = await app.ensure()
  const accounts = selectAccounts(preference, bound)

  const list: (RawAccount | null)[] = []
  const warnings: string[] = []
  let error: unknown
  for (const account of accounts) {
    try {
      const item = await queryAccount(app, account, { scope: preference.queryScope })
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
  return { list, warnings }
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
export async function getData({ force = false } = {}): Promise<DataResult> {
  const cache = loadCache()
  const preference = loadPreference()
  const key = sourceKey(preference)
  const matchingCache = cache?.sourceKey === key ? cache : null
  if (!force && matchingCache && Date.now() - matchingCache.fetchedAt < MIN_FETCH_INTERVAL_MS) {
    return matchingCache
  }
  try {
    const result = await fetchAccounts(preference)
    const next: Cache = { sourceKey: key, fetchedAt: Date.now(), ...result }
    // A settings change during the request must not overwrite the new account's cache.
    if (sourceKey(loadPreference()) === key) saveCache(next)
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

