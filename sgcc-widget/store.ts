/**
 * Persistence layer. Business code calls these functions, never `Storage` /
 * `Keychain` directly.
 *
 * Plain `Storage` (no `{ shared: true }`): index.tsx and widget.tsx belong to
 * this one script and share its private domain. The password lives in the
 * Keychain; the protocol's device seed and session token also go there, under
 * the same `zhuge.sgcc.` prefix (see `api/client.ts`).
 */
import type { RawAccount } from './data'
import type { PowerAccount } from './accounts'

export type Dimension = 'daily' | 'monthly'
export type QueryMode = 'manual' | 'bound'
export type QueryScope = 'balance' | 'full'
export type QueryChannel = 'auto' | 'payment' | 'balance'

export type Preference = {
  phone: string
  smsCode: string
  queryMode: QueryMode
  queryScope: QueryScope
  queryChannel: QueryChannel
  consNo: string
  provinceCode: string
  orgNo: string
  elecType: string
  metadataRevision: number
  dimension: Dimension
  barCount: number
  showStepProgress: boolean
  oneLevelPq: number
  twoLevelPq: number
}

export type Cache = {
  /** Includes the login identity, selected account and query scope. */
  sourceKey: string
  fetchedAt: number
  /** Index-aligned with the account list; `null` marks an account whose query failed. */
  list: (RawAccount | null)[]
  warnings: string[]
  queryInfo?: string
}

export type Resolution = { sourceKey: string; account: PowerAccount; savedAt: number }
export type AccountMetadata = { key: string; account: PowerAccount; fetchedAt: number }

export const defaultPreference: Preference = {
  phone: '',
  smsCode: '',
  queryMode: 'manual',
  queryScope: 'balance',
  queryChannel: 'auto',
  consNo: '',
  provinceCode: '',
  orgNo: '',
  elecType: '',
  metadataRevision: 0,
  dimension: 'daily',
  barCount: 7,
  showStepProgress: true,
  oneLevelPq: 2160,
  twoLevelPq: 4800
}

export const KEYCHAIN_PREFIX = 'zhuge.sgcc.'

const KEY_PREFERENCE = 'preference'
const KEY_DATA = 'data'
const KEY_PASSWORD = `${KEYCHAIN_PREFIX}password`
const KEY_RESOLUTION = 'resolved-account-v2'
const KEY_METADATA = 'official-account-metadata-v1'
const KEY_QUERY_DIAGNOSTIC = 'payment-query-diagnostic-v1'

/** Only api/diagnostics' field types and status codes, never a response dump. */
export function saveQueryDiagnostic(report: string) {
  try { Storage.set(KEY_QUERY_DIAGNOSTIC, report) } catch { /* Diagnostics never block a query. */ }
}

export function loadQueryDiagnostic(): string {
  try { return Storage.get<string>(KEY_QUERY_DIAGNOSTIC) ?? '' } catch { return '' }
}

export function clearQueryDiagnostic() {
  try { Storage.remove(KEY_QUERY_DIAGNOSTIC) } catch { /* Optional diagnostic only. */ }
}

export function loadPreference(): Preference {
  const stored = Storage.get<Partial<Preference>>(KEY_PREFERENCE) ?? {}
  return { ...defaultPreference, ...stored }
}

export function savePreference(preference: Preference) {
  Storage.set(KEY_PREFERENCE, preference)
}

export function getPassword(): string {
  try {
    return Keychain.get(KEY_PASSWORD) ?? ''
  } catch {
    return ''
  }
}

export function setPassword(password: string) {
  if (password !== getPassword()) { clearCache(); clearResolution() }
  if (password === '') {
    Keychain.remove(KEY_PASSWORD)
  } else {
    Keychain.set(KEY_PASSWORD, password)
  }
}

export function loadCache(): Cache | null {
  return Storage.get<Cache>(KEY_DATA) ?? null
}

export function saveCache(cache: Cache) {
  Storage.set(KEY_DATA, cache)
}

export function clearCache() {
  Storage.remove(KEY_DATA)
}

export function loadResolution(): Resolution | null {
  return Storage.get<Resolution>(KEY_RESOLUTION) ?? null
}

export function saveResolution(resolution: Resolution) {
  Storage.set(KEY_RESOLUTION, resolution)
}

export function clearResolution() {
  Storage.remove(KEY_RESOLUTION)
}

export function loadMetadata(): AccountMetadata | null {
  return Storage.get<AccountMetadata>(KEY_METADATA) ?? null
}

export function saveMetadata(metadata: AccountMetadata) {
  Storage.set(KEY_METADATA, metadata)
}

export function clearMetadata() {
  Storage.remove(KEY_METADATA)
}

