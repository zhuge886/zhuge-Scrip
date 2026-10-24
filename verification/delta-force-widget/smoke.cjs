// Contract fixtures are synthetic; no captured credentials or private account responses.
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const assert = require('node:assert/strict')
const { test, beforeEach } = require('node:test')
const ts = require('typescript')
const root = path.resolve(__dirname, '../../delta-force-widget')
let transport, storage, keychain, views
const original = Module._load
const elements = Object.fromEntries(['VStack', 'HStack', 'Text', 'Spacer', 'Image'].map(name => [name, name]))
Module._load = function(name, ...args) {
  if (name === 'scripting') return { ...elements, fetch: (...args) => transport(...args) }
  return original.call(this, name, ...args)
}
global.__deltaJSX = (type, props, ...children) => {
  const all = { ...props, children }
  return typeof type === 'function' ? type(all) : { type, props: all }
}
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (mod, filename) => {
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, jsxFactory: 'global.__deltaJSX' },
    fileName: filename,
  }).outputText
  mod._compile(js, filename)
}
const model = require(path.join(root, 'model.ts'))
const store = require(path.join(root, 'store.ts'))
const api = require(path.join(root, 'api.ts'))
const auth = require(path.join(root, 'auth.ts'))
const renewal = require(path.join(root, 'renew.ts'))
const ui = require(path.join(root, 'ui.tsx'))
const now = Date.parse('2026-10-23T04:00:00Z')
const session = { acctype: 'wx', appid: model.WX_PC_APP, openid: 'synthetic_openid_A', access_token: 'synthetic_token_A' }
const another = { ...session, openid: 'synthetic_openid_B', access_token: 'synthetic_token_B' }
const money = value => ({ ret: 0, iRet: 0, jData: { data: [{ totalMoney: value }] } })
const profit = (date, value) => ({ ret: 0, iRet: 0, jData: { data: { code: 0, data: { solDetail: { recentGainDate: date, recentGain: value } } } } })
const response = payload => ({ ok: true, status: 200, json: async () => payload })
const success = async (_url, init) => response(init.body.includes('type=3') ? money('12000000') : profit('20261021', '5285832'))
function cookies(s = session) {
  return Object.entries(s).map(([name, value]) => ({ name, value, domain: 'df.qq.com', path: '/' }))
}
function mockWeb(options = {}) {
  global.WebViewController = class {
    constructor(init) { this.init = init; this.disposed = false; views.push(this) }
    async loadURL(url) { this.url = url; if (options.throwLoad) throw Error('load failed'); return options.load !== false }
    async evaluateJavaScript(js) {
      this.lastJS = js
      if (js.startsWith('return ')) return options.sdkFail ? 'failed' : options.cancel ? 'pending' : 'success'
      return true
    }
    async getCookies(url) { assert.equal(url, model.OFFICIAL_HOME); return options.cancel && !options.earlyCookie ? [] : options.cookies ?? cookies() }
    present() { return options.cancel ? Promise.resolve() : new Promise(resolve => { this.resolve = resolve }) }
    dismiss() { this.resolve?.() }
    dispose() { this.disposed = true }
  }
}
function texts(node) {
  if (node == null || typeof node === 'boolean') return []
  if (Array.isArray(node)) return node.flatMap(texts)
  if (typeof node !== 'object') return [String(node)]
  return texts(node.props.children)
}
async function seed() { store.saveSession(session); return api.refreshSnapshot(true, now) }
beforeEach(() => {
  storage = new Map(); keychain = new Map(); views = []; transport = success
  global.Storage = { get: k => structuredClone(storage.get(k) ?? null), set: (k, v) => { storage.set(k, structuredClone(v)); return true }, remove: k => storage.delete(k) }
  global.Keychain = { get: k => keychain.get(k) ?? null, set: (k, v) => { keychain.set(k, v); return true }, remove: k => { keychain.delete(k); return true }, contains: k => keychain.has(k) }
  mockWeb()
})

test('report dates validate calendar days and render the actual full date', () => {
  for (const value of ['20261021', '2026-10-21', '2026/10/21']) assert.equal(model.normalizeDay(value), '2026-10-21')
  assert.equal(model.normalizeDay('2026/2/3'), '2026-02-03')
  for (const value of ['2026-02-29', '2026-13-01', '', null]) assert.equal(model.normalizeDay(value), null)
  assert.equal(model.reportDate('2026-10-21'), '2026.10.21')
  assert.equal(model.reportDate(null), '暂无记录')
  assert.equal(model.syncTime(Date.parse('2026-10-22T16:05:00Z')), '00:05')
})
test('zero, negative income and large integer strings preserve precision', () => {
  assert.equal(model.parseBalance(money('0')), '0')
  assert.equal(model.parseBalance(money('999999999999999999')), '999999999999999999')
  assert.equal(model.parseProfit(profit('20261021', '-120')).value, '-120')
  assert.equal(model.parseProfit(profit('20261021', '0')).value, '0')
  assert.equal(model.formatAmount('-1234567', true), '−1,234,567')
  assert.equal(model.formatAmount('0', true), '0')
  for (const v of [null, '', 'NaN', false, '12.5', 2 ** 60]) assert.throws(() => model.amount(v))
})
test('a rest day shows the most recent report with its own date', async () => {
  const result = await seed()
  assert.equal(result.day, '2026-10-21')
  assert.equal(result.profit.value, '5285832')
  assert.equal(result.profit.status, 'ok')
  assert.equal(model.parseProfit(profit('', '999')).value, null)
  assert.throws(() => model.parseProfit(profit('20261021', undefined)))
})
test('currency selection excludes other currencies and ambiguous arrays', () => {
  const envelope = rows => ({ iRet: 0, jData: { data: rows } })
  assert.equal(model.parseBalance(envelope([{ itemId: '17888808888', totalMoney: 100 }, { itemId: model.HAFU_ITEM, totalMoney: 200 }])), '200')
  assert.throws(() => model.parseBalance(envelope([{ name: '三角币', totalMoney: 100 }])))
  assert.throws(() => model.parseBalance(envelope([{ totalMoney: 100 }, { totalMoney: 200 }])))
  assert.throws(() => model.parseBalance(money('-1')))
})
test('Tencent unauthenticated envelopes become safe auth errors', () => {
  assert.throws(() => model.parseBalance({ ret: 101, iRet: 101, sMsg: '请先登录' }), e => e.code === 'auth')
  assert.throws(() => model.parseProfit({ iRet: 0, jData: { data: { code: 401, msg: 'token expired' } } }), e => e.code === 'auth')
  assert.throws(() => model.parseBalance({ iRet: -1, sMsg: session.access_token }), e => !e.message.includes(session.access_token))
})
test('only permitted WeChat cookies form a session', () => {
  assert.deepEqual(auth.sessionFromCookies(cookies()), session)
  assert.equal(auth.sessionFromCookies(cookies().map(c => ({ ...c, domain: 'evil.example' }))), null)
  assert.equal(auth.sessionFromCookies(cookies({ ...session, acctype: 'qc' })), null)
  assert.equal(model.validSession({ ...session, access_token: 'x; injected=value' }), null)
})
test('requests retain the working Tencent route and identity, block redirects and redact errors', async () => {
  const requests = []
  transport = async (url, init) => { requests.push({ url, init }); return success(url, init) }
  await seed()
  assert.equal(requests.length, 2)
  for (const { url, init } of requests) {
    assert.equal(url, 'https://dfm.ams.game.qq.com/ide/')
    assert.equal(init.timeout, 10)
    assert.equal(await init.handleRedirect(), null)
    const form = new URLSearchParams(init.body)
    for (const [key, value] of Object.entries(session)) assert.equal(form.get(key), value)
    assert.equal(form.get('needGopenid'), '1')
    assert.equal(form.get('isPreengage'), '1')
    assert.equal(form.get('ams_targetappid'), model.WX_GAME_APP)
  }
  assert.equal(new URLSearchParams(requests[0].init.body).get('item'), model.HAFU_ITEM)
  const daily = new URLSearchParams(requests[1].init.body)
  assert.equal(daily.get('method'), 'dfm/center.recent.detail')
  assert.equal(daily.get('source'), '7')
  transport = async () => { throw Error(session.access_token) }
  await assert.rejects(api.ams(session, ''), e => !e.message.includes(session.access_token))
})
test('QR authorization saves only in Keychain and always disposes its WebView', async () => {
  assert.deepEqual(await auth.loginByWeChatQR(), session)
  assert.deepEqual(store.loadSession(), session)
  assert.equal(views[0].init.ephemeral, true)
  assert.equal(views[0].disposed, true)
  assert.ok(!JSON.stringify([...storage]).includes(session.access_token))
})
test('authorization remains saved when game queries fail', async () => {
  store.saveSession(another)
  transport = async () => response({ ret: 101, iRet: 101, sMsg: '请先登录' })
  await auth.loginByWeChatQR()
  const failed = await api.refreshSnapshot(true, now)
  assert.equal(failed.needsLogin, true)
  assert.deepEqual(store.loadSession(), session)
  assert.equal(views[0].disposed, true)
})
test('SDK rejection and premature cookies cannot replace the account', async () => {
  store.saveSession(another)
  mockWeb({ sdkFail: true })
  await assert.rejects(auth.loginByWeChatQR())
  assert.deepEqual(store.loadSession(), another)
  mockWeb({ cancel: true, earlyCookie: true })
  assert.equal(await auth.loginByWeChatQR(), null)
  assert.deepEqual(store.loadSession(), another)
})
test('page failures and cancellation release the controller without saving', async () => {
  mockWeb({ load: false })
  await assert.rejects(auth.loginByWeChatQR())
  assert.equal(views[0].disposed, true)
  mockWeb({ throwLoad: true })
  await assert.rejects(auth.loginByWeChatQR())
  assert.equal(views[1].disposed, true)
  mockWeb({ cancel: true })
  assert.equal(await auth.loginByWeChatQR(), null)
  assert.equal(views[2].disposed, true)
  assert.equal(store.loadSession(), null)
})
test('missing balance never hides available income or asks for needless login', async () => {
  store.saveSession(session)
  transport = async (url, init) => init.body.includes('type=3')
    ? response({ ret: 101, iRet: 101 }) : success(url, init)
  const result = await api.refreshSnapshot(true, now)
  assert.equal(result.needsLogin, false)
  assert.equal(result.balance.value, null)
  assert.equal(result.profit.value, '5285832')
  assert.equal(model.showBalance(result), false)
})
test('balance failure retains its timestamp but hides its stale display', async () => {
  await seed()
  transport = async (_url, init) => {
    if (init.body.includes('type=3')) throw Error('offline')
    return response(profit('20261021', '-456'))
  }
  const result = await api.refreshSnapshot(true, now + 60000)
  assert.equal(result.balance.value, '12000000')
  assert.equal(result.balance.status, 'cached')
  assert.equal(result.balance.updatedAt, now)
  assert.equal(model.showBalance(result), false)
  assert.equal(result.profit.value, '-456')
  assert.equal(result.profit.status, 'ok')
})
test('midnight and a week offline retain the actual income date and value', async () => {
  await seed()
  transport = async () => { throw Error('offline') }
  const result = await api.refreshSnapshot(true, now + 7 * 86400000)
  assert.equal(result.day, '2026-10-21')
  assert.equal(result.profit.value, '5285832')
  assert.equal(result.profit.updatedAt, now)
  assert.equal(result.profit.status, 'cached')
  assert.equal(model.showBalance(result), false)
})
test('older or empty responses cannot erase a newer cached report', async () => {
  await seed()
  for (const [date, value] of [['20261020', '8'], ['', null]]) {
    transport = async (_url, init) => response(init.body.includes('type=3') ? money('1') : profit(date, value))
    const result = await api.refreshSnapshot(true, now + 60000)
    assert.equal(result.day, '2026-10-21')
    assert.equal(result.profit.value, '5285832')
    assert.equal(result.profit.status, 'cached')
  }
})
test('new reports and same-date corrections update both income and date', async () => {
  await seed()
  for (const [date, value] of [['20261022', '0'], ['20261022', '-38']]) {
    transport = async (_url, init) => response(init.body.includes('type=3') ? money('0') : profit(date, value))
    const result = await api.refreshSnapshot(true, now + 60000)
    assert.equal(result.day, '2026-10-22')
    assert.equal(result.profit.value, value)
    assert.equal(result.profit.status, 'ok')
    assert.equal(model.showBalance(result), true)
  }
})
test('version 1 rest-day cache migrates the dated income previously buried in its message', () => {
  store.saveSession(session)
  const old = model.emptySnapshot()
  old.version = 1; old.day = '2026-10-22'; delete old.checkedAt
  old.profit = { value: null, updatedAt: now, status: 'missing', message: '昨日暂无日报。最近 2026-10-21 收益 +5,285,832 哈夫币' }
  store.saveSnapshot(session, old)
  const upgraded = store.loadSnapshot(session, now + 86400000)
  assert.equal(upgraded.day, '2026-10-21')
  assert.equal(upgraded.profit.value, '5285832')
  assert.equal(upgraded.profit.status, 'cached')
  assert.deepEqual(store.loadSession(), session)
})
test('version 1 dated nonempty income survives upgrades and clock changes', () => {
  store.saveSession(session)
  const old = model.emptySnapshot()
  old.version = 1; old.day = '2026-10-21'
  old.profit = { value: '0', updatedAt: now, status: 'ok', message: '昨日收益' }
  store.saveSnapshot(session, old)
  const upgraded = store.loadSnapshot(session, now - 1000)
  assert.equal(upgraded.day, '2026-10-21')
  assert.equal(upgraded.profit.value, '0')
  assert.equal(upgraded.profit.status, 'cached')
})
test('successful attempts are reused for five minutes even if balance is unavailable', async () => {
  store.saveSession(session)
  let calls = 0
  transport = async (url, init) => { calls++; return init.body.includes('type=3') ? response({ ret: 101 }) : success(url, init) }
  await api.refreshSnapshot(true, now)
  await api.refreshSnapshot(false, now + 299999)
  assert.equal(calls, 2)
  await api.refreshSnapshot(false, now + 300000)
  assert.equal(calls, 4)
})
test('account switch isolates snapshots and rejects old in-flight results', async () => {
  await seed()
  const resolvers = []
  transport = (_url, init) => new Promise(resolve => resolvers.push(() => resolve(response(init.body.includes('type=3') ? money('1') : profit('20261022', '2')))))
  const request = api.refreshSnapshot(true, now)
  store.saveSession(another)
  assert.equal(store.loadSnapshot(another, now).profit.value, null)
  resolvers.forEach(resolve => resolve())
  await request
  assert.equal(store.loadSnapshot(another, now).profit.value, null)
  assert.deepEqual(store.loadSession(), another)
})
test('expired login keeps the last income and logout removes all legacy local data', async () => {
  await seed()
  transport = async () => response({ ret: 101, iRet: 101, sMsg: '请先登录' })
  const result = await api.refreshSnapshot(true, now + 60000)
  assert.equal(result.needsLogin, true)
  assert.equal(result.profit.value, '5285832')
  storage.set('delta-force.wechat-pending.v1', { state: 'legacy' })
  storage.set('delta-force.diagnostics.v1', [])
  store.logout()
  assert.equal(store.loadSession(), null)
  assert.equal(storage.size, 0)
  assert.equal(keychain.size, 0)
})
test('an in-flight request cannot resurrect data after logout', async () => {
  store.saveSession(session)
  const resolvers = []
  transport = (_url, init) => new Promise(resolve => resolvers.push(() => resolve(response(init.body.includes('type=3') ? money('1') : profit('20261021', '2')))))
  const request = api.refreshSnapshot(true, now)
  store.logout()
  resolvers.forEach(resolve => resolve())
  assert.equal((await request).needsLogin, true)
  assert.equal(storage.size, 0)
})
test('small and medium widgets show dated income and omit unavailable balance entirely', async () => {
  const snapshot = await seed()
  for (const small of [true, false]) {
    for (const status of ['missing', 'cached', 'error']) {
      const missing = { ...snapshot, balance: { ...snapshot.balance, status } }
      const labels = texts(ui.WalletCard({ snapshot: missing, small }))
      assert.ok(labels.includes('+5,285,832'))
      assert.ok(labels.includes('2026.10.21'))
      assert.ok(!labels.includes('总哈夫币'))
      assert.ok(!labels.join(' ').includes('昨日'))
    }
    const zeroBalance = { ...snapshot, balance: { ...snapshot.balance, value: '0' } }
    assert.ok(texts(ui.WalletCard({ snapshot: zeroBalance, small })).includes('总哈夫币'))
  }
})
test('empty widgets never invent an income amount or report date', () => {
  const labels = texts(ui.WalletCard({ snapshot: model.emptySnapshot(), small: true }))
  assert.ok(labels.includes('待同步'))
  assert.ok(labels.includes('暂无记录'))
  assert.ok(!labels.includes('总哈夫币'))
  assert.ok(!labels.includes('0'))
})

const renewable = (changes = {}) => ({ ...session, refresh_token: 'synthetic_refresh_A',
  expiresAt: now - 1, refreshUntil: now + model.RENEW_WINDOW_MS, ...changes })
const renewed = (changes = {}) => ({ access_token: 'synthetic_new_token_A', refresh_token: 'synthetic_new_refresh_A',
  openid: session.openid, expires_in: 7200, ...changes })
const isRenewal = url => url.startsWith(model.WECHAT_RENEW_URL + '?')

test('QR captures the refresh credential and original access expiration in Keychain only', async () => {
  const expiresAt = now + 7200000
  const input = cookies(renewable()).filter(c => ['openid','access_token','appid','acctype','refresh_token'].includes(c.name))
    .map(c => c.name === 'access_token' ? { ...c, expiresDate: new Date(expiresAt) } : c)
  const parsed = auth.sessionFromCookies(input, now)
  assert.equal(parsed.refresh_token, 'synthetic_refresh_A')
  assert.equal(parsed.expiresAt, expiresAt)
  assert.equal(parsed.refreshUntil, now + 30 * 86400000)
  mockWeb({ cookies: input })
  const saved = await auth.loginByWeChatQR()
  assert.equal(store.loadSession().refresh_token, 'synthetic_refresh_A')
  assert.ok(saved.refreshUntil > Date.now() + 29 * 86400000)
  assert.ok(!JSON.stringify([...storage]).includes('synthetic_refresh_A'))
})
test('near-expiry login renews before querying and never sends refresh credentials to game APIs', async () => {
  store.saveSession(renewable())
  const calls = []
  transport = async (url, init) => {
    calls.push({ url, init })
    if (isRenewal(url)) {
      const params = new URL(url).searchParams
      assert.equal(params.get('appid'), session.appid)
      assert.equal(params.get('grant_type'), 'refresh_token')
      assert.equal(params.get('refresh_token'), 'synthetic_refresh_A')
      assert.equal(init.method, 'GET')
      assert.equal(init.timeout, 10)
      assert.equal(await init.handleRedirect(), null)
      return response(renewed())
    }
    assert.equal(new URLSearchParams(init.body).get('access_token'), 'synthetic_new_token_A')
    assert.ok(!init.body.includes('refresh_token'))
    assert.ok(!init.headers.Cookie.includes('refresh'))
    assert.ok(!init.body.includes('expiresAt'))
    return success(url, init)
  }
  const result = await api.refreshSnapshot(true, now)
  assert.equal(calls.length, 3)
  assert.ok(isRenewal(calls[0].url))
  assert.equal(result.profit.value, '5285832')
  assert.equal(result.needsLogin, false)
  assert.equal(store.loadSession().access_token, 'synthetic_new_token_A')
  assert.equal(store.loadSession().refresh_token, 'synthetic_new_refresh_A')
  assert.ok(!JSON.stringify([...storage]).includes('synthetic_new_refresh_A'))
})
test('income auth rejection triggers one automatic renewal and one retry', async () => {
  store.saveSession(renewable({ expiresAt: undefined }))
  let renewalCalls = 0, gameCalls = 0
  transport = async (url, init) => {
    if (isRenewal(url)) { renewalCalls++; return response(renewed()) }
    gameCalls++
    return new URLSearchParams(init.body).get('access_token') === session.access_token
      ? response({ iRet: 101 }) : success(url, init)
  }
  const result = await api.refreshSnapshot(true, now)
  assert.equal(renewalCalls, 1)
  assert.equal(gameCalls, 4)
  assert.equal(result.needsLogin, false)
  assert.equal(result.profit.value, '5285832')
})
test('balance-only auth rejection does not trigger renewal', async () => {
  store.saveSession(renewable({ expiresAt: undefined }))
  let renewalCalls = 0
  transport = async (url, init) => {
    if (isRenewal(url)) { renewalCalls++; return response(renewed()) }
    return init.body.includes('type=3') ? response({ iRet: 101 }) : success(url, init)
  }
  const result = await api.refreshSnapshot(true, now)
  assert.equal(renewalCalls, 0)
  assert.equal(result.needsLogin, false)
})
test('renewal cannot turn into a repeated auth retry loop', async () => {
  store.saveSession(renewable())
  let renewalCalls = 0, gameCalls = 0
  transport = async (url) => {
    if (isRenewal(url)) { renewalCalls++; return response(renewed()) }
    gameCalls++; return response({ iRet: 101 })
  }
  const result = await api.refreshSnapshot(true, now)
  assert.equal(renewalCalls, 1)
  assert.equal(gameCalls, 2)
  assert.equal(result.needsLogin, true)
})
test('temporary renewal failure preserves the last income without declaring login expired', async () => {
  await seed()
  store.replaceSession(session, renewable())
  transport = async (url) => {
    if (isRenewal(url)) throw Error('temporary network issue')
    return response({ iRet: 101 })
  }
  const result = await api.refreshSnapshot(true, now)
  assert.equal(result.needsLogin, false)
  assert.equal(result.day, '2026-10-21')
  assert.equal(result.profit.value, '5285832')
  assert.equal(result.profit.status, 'cached')
  assert.equal(store.loadSession().access_token, session.access_token)
})
test('30-day renewal window is fixed and is not extended by token rotation', async () => {
  const original = renewable()
  assert.equal(renewal.canRenew(original, now + 29 * 86400000), true)
  assert.equal(renewal.canRenew(original, now + 31 * 86400000), false)
  const next = renewal.parseRenewal(renewed(), original, now + 29 * 86400000)
  assert.equal(next.refreshUntil, original.refreshUntil)
  assert.equal(next.expiresAt, now + 29 * 86400000 + 7200000)
  assert.equal(renewal.canRenew({ ...original, acctype: 'mini' }, now), false)
})
test('an expired refresh credential neither deletes saved data nor invents a longer login', async () => {
  await seed()
  store.replaceSession(session, renewable())
  transport = async url => isRenewal(url)
    ? response({ errcode: 42002, errmsg: 'expired ' + session.access_token }) : response({ iRet: 101 })
  const result = await api.refreshSnapshot(true, now)
  assert.equal(result.needsLogin, true)
  assert.equal(result.profit.value, '5285832')
  assert.equal(store.loadSession().access_token, session.access_token)
  assert.ok(!result.profit.message.includes(session.access_token))
})
test('renewal rejects another identity, malformed tokens and unsafe responses', () => {
  const before = renewable()
  for (const payload of [renewed({ openid: another.openid }), renewed({ appid: 'wx1111111111111111' }),
    renewed({ access_token: 'bad; cookie' }), renewed({ refresh_token: 'bad; cookie' }), renewed({ expires_in: -1 }), {}]) {
    assert.throws(() => renewal.parseRenewal(payload, before, now))
  }
  assert.throws(() => renewal.parseRenewal({ errcode: -1, errmsg: session.access_token }, before, now), e => !e.message.includes(session.access_token))
})
test('renewal preserves account cache and cannot overwrite a newer token', async () => {
  const cached = await seed()
  const old = renewable()
  store.replaceSession(session, old)
  const newer = { ...old, access_token: 'synthetic_concurrent_token' }
  store.replaceSession(old, newer)
  const refused = store.replaceSession(old, { ...old, access_token: 'synthetic_stale_token' })
  assert.equal(refused.access_token, newer.access_token)
  assert.equal(store.loadSnapshot(newer, now).profit.value, cached.profit.value)
})
test('concurrent renewal requests share one network request', async () => {
  const before = renewable()
  store.saveSession(before)
  let complete, calls = 0
  transport = () => { calls++; return new Promise(resolve => { complete = resolve }) }
  const a = renewal.renewSession(before, now), b = renewal.renewSession(before, now)
  complete(response(renewed()))
  const [first, second] = await Promise.all([a,b])
  assert.equal(calls, 1)
  assert.deepEqual(first, second)
})
test('logout or account switch during renewal cannot restore old credentials', async () => {
  for (const change of [() => store.logout(), () => store.saveSession(another)]) {
    const before = renewable()
    store.saveSession(before)
    let complete
    transport = () => new Promise(resolve => { complete = resolve })
    const pending = renewal.renewSession(before, now)
    change()
    complete(response(renewed()))
    assert.equal(await pending, null)
    assert.notEqual(store.loadSession()?.access_token, 'synthetic_new_token_A')
  }
})
test('widget content has no background, icons, update footer or login banner', async () => {
  const snapshot = await seed()
  const visit = node => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(visit); return }
    assert.equal(node.props.background, undefined)
    assert.equal(node.props.widgetBackground, undefined)
    assert.notEqual(node.type, 'Image')
    visit(node.props.children)
  }
  for (const small of [true,false]) {
    const card = ui.WalletCard({ snapshot: { ...snapshot, needsLogin: true }, small })
    visit(card)
    assert.ok(!texts(card).join(' ').match(/登录|更新于|上次同步|扫码|最近一份/))
    assert.ok(texts(card).includes('+5,285,832'))
  }
})
