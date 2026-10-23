// Contract fixtures are synthetic; they are not captured account responses.
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const assert = require('node:assert/strict')
const { test, beforeEach } = require('node:test')
const ts = require('typescript')
const root = path.resolve(__dirname, '../../delta-force-widget')
let transport, storage, keychain, views
const original = Module._load
Module._load = function(name, ...args) {
  if (name === 'scripting') return { fetch: (...args) => transport(...args) }
  return original.call(this, name, ...args)
}
require.extensions['.ts'] = (mod, filename) => {
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: filename,
  }).outputText
  mod._compile(js, filename)
}
const model = require(path.join(root, 'model.ts'))
const store = require(path.join(root, 'store.ts'))
const api = require(path.join(root, 'api.ts'))
const auth = require(path.join(root, 'auth.ts'))
const credentials = require(path.join(root, 'credentials.ts'))
const diagnostics = require(path.join(root, 'diagnostics.ts'))
const webSync = require(path.join(root, 'web-sync.ts'))
const now = Date.parse('2026-10-23T04:00:00Z')
const session = { acctype: 'wx', appid: model.WX_MOBILE_APP, openid: 'synthetic_openid_A', access_token: 'synthetic_token_A' }
const another = { ...session, openid: 'synthetic_openid_B', access_token: 'synthetic_token_B' }
const pending = { state: 'fixture_state_only', createdAt: now }
const money = value => ({ ret: 0, iRet: 0, jData: { data: [{ totalMoney: value }] } })
const profit = (date, value) => ({ ret: 0, iRet: 0, jData: { data: { code: 0, data: { solDetail: { recentGainDate: date, recentGain: value } } } } })
const response = payload => ({ ok: true, status: 200, json: async () => payload })
const success = async (_url, init) => response(init.body.includes('type=3') ? money('12000000') : profit('20261022', '345678'))
const callback = (changes = {}) => {
  const params = { acctype: 'wx', appid: model.WX_MOBILE_APP, code: 'syntheticCode123', state: pending.state, ...changes }
  return `https://iu.qq.com/comm-htdocs/login/milosdk/wx_mobile_redirect.html?${model.form(params)}`
}
function cookies(s = session) {
  return Object.entries(s).map(([name, value]) => ({ name, value, domain: 'df.qq.com', path: '/' }))
}
function mockWeb(options = {}) {
  global.WebViewController = class {
    constructor(init) { this.init = init; this.disposed = false; this.dismissed = false; views.push(this) }
    async loadURL(url) { this.url = url; if (options.throwLoad) throw Error('load failed'); return options.load !== false }
    async evaluateJavaScript(js) {
      this.lastJS = js
      if (js.startsWith('return window.__deltaData')) return { money: money('888'), daily: profit(model.yesterday().replaceAll('-', ''), '777') }
      if (js.startsWith('return ')) return options.sdkFail ? 'failed' : options.cancel ? 'pending' : 'success'
      return true
    }
    async setCookie(cookie) { this.seeded ??= []; this.seeded.push(cookie); return true }
    async getCookies(url) { assert.ok([model.OFFICIAL_HOME, model.RECORD_HOME].includes(url)); return options.cancel && !options.earlyCookie ? [] : cookies() }
    present() { return options.cancel || options.sync ? Promise.resolve() : new Promise(resolve => { this.resolve = resolve }) }
    dismiss() { this.dismissed = true; this.resolve?.() }
    dispose() { this.disposed = true }
  }
}
beforeEach(() => {
  storage = new Map(); keychain = new Map(); views = []; transport = success
  global.Storage = { get: k => storage.get(k) ?? null, set: (k, v) => { storage.set(k, structuredClone(v)); return true }, remove: k => storage.delete(k) }
  global.Keychain = { get: k => keychain.get(k) ?? null, set: (k, v) => { keychain.set(k, v); return true }, remove: k => { keychain.delete(k); return true }, contains: k => keychain.has(k) }
  global.UUID = { string: () => 'fixture_uuid_only' }
  mockWeb()
})

test('Shanghai midnight, month/year rollover and leap day', () => {
  assert.equal(model.yesterday(Date.parse('2026-10-22T15:59:59Z')), '2026-10-21')
  assert.equal(model.yesterday(Date.parse('2026-10-22T16:00:00Z')), '2026-10-22')
  assert.equal(model.yesterday(Date.parse('2026-01-01T00:00:00Z')), '2025-12-31')
  assert.equal(model.yesterday(Date.parse('2024-03-01T00:00:00Z')), '2024-02-29')
})
test('date normalization rejects impossible dates', () => {
  for (const value of ['20261022', '2026-10-22', '2026/10/22']) assert.equal(model.normalizeDay(value), '2026-10-22')
  assert.equal(model.normalizeDay('2026/2/3'), '2026-02-03')
  for (const value of ['2026-02-29', '2026-13-01', '', null]) assert.equal(model.normalizeDay(value), null)
})
test('zero, negative profits and large integer strings preserve precision', () => {
  assert.equal(model.parseBalance(money('0')), '0')
  assert.equal(model.parseBalance(money('999999999999999999')), '999999999999999999')
  assert.equal(model.parseProfit(profit('20261022', '-120'), '2026-10-22').value, '-120')
  assert.equal(model.parseProfit(profit('20261022', '0'), '2026-10-22').value, '0')
  assert.equal(model.formatAmount('-1234567', true), '−1,234,567')
  assert.equal(model.formatAmount('0', true), '0')
  for (const v of [null, '', 'NaN', false, '12.5', 2 ** 60]) assert.throws(() => model.amount(v))
})
test('old or absent report is never labeled yesterday nor coerced to zero', () => {
  assert.equal(model.parseProfit(profit('20261021', '999'), '2026-10-22').value, null)
  assert.equal(model.parseProfit(profit('', '999'), '2026-10-22').value, null)
  assert.throws(() => model.parseProfit(profit('20261022', undefined), '2026-10-22'))
})
test('currency selection excludes other currencies and ambiguous arrays', () => {
  const envelope = rows => ({ iRet: 0, jData: { data: rows } })
  assert.equal(model.parseBalance(envelope([{ itemId: '17888808888', totalMoney: 100 }, { itemId: model.HAFU_ITEM, totalMoney: 200 }])), '200')
  assert.throws(() => model.parseBalance(envelope([{ name: '三角币', totalMoney: 100 }])))
  assert.throws(() => model.parseBalance(envelope([{ totalMoney: 100 }, { totalMoney: 200 }])))
  assert.throws(() => model.parseBalance(money('-1')))
})
test('real unauthenticated Tencent response has no jData and is an auth error', () => {
  assert.throws(() => model.parseBalance({ ret: 101, iRet: 101, sMsg: '非常抱歉，请先登录！' }), e => e.code === 'auth')
  assert.throws(() => model.parseProfit({ iRet: 0, jData: { data: { code: 401, msg: 'token expired' } } }, '2026-10-22'), e => e.code === 'auth')
  assert.throws(() => model.parseBalance({ iRet: -1, sMsg: 'synthetic_token_should_not_leak' }), e => !e.message.includes('synthetic_token'))
})
test('mobile OAuth checks exact Tencent host, app, state, duplicates and expiry', () => {
  assert.equal(auth.parseAuthCallback(callback(), pending, now), 'syntheticCode123')
  assert.match(auth.mobileAuthURL(pending), /^https:\/\/open\.weixin\.qq\.com\/connect\/oauth2\/authorize\?/)
  for (const input of [callback({ state: 'wrong' }), callback({ appid: 'wrong' }), callback({ code: '' }), callback().replace('iu.qq.com', 'iu.qq.com.evil.example'), callback() + '&state=duplicate']) {
    assert.throws(() => auth.parseAuthCallback(input, pending, now))
  }
  assert.throws(() => auth.parseAuthCallback(callback(), pending, now + 600001))
  assert.throws(() => auth.parseAuthCallback(callback(), null, now))
})
test('only permitted WeChat cookies form a session', () => {
  assert.deepEqual(auth.sessionFromCookies(cookies()), session)
  assert.equal(auth.sessionFromCookies(cookies().map(c => ({ ...c, domain: 'evil.example' }))), null)
  assert.equal(auth.sessionFromCookies(cookies({ ...session, acctype: 'qc' })), null)
  assert.equal(model.validSession({ ...session, access_token: 'x; injected=value' }), null)
})
test('request targets Tencent, filters Hafu currency, blocks redirects, and redacts errors', async () => {
  const requests = []
  transport = async (url, init) => { requests.push({ url, init }); return response(money('1')) }
  await api.verifySession(session)
  const { url, init } = requests[0]
  assert.equal(url, model.AMS_URL)
  assert.equal(new URLSearchParams(init.body).get('item'), model.HAFU_ITEM)
  assert.equal(init.timeout, 10)
  assert.equal(await init.handleRedirect(), null)
  const form = new URLSearchParams(init.body)
  assert.equal(form.get('access_token'), session.access_token)
  assert.equal(form.get('appid'), session.appid)
  assert.equal(form.get('needGopenid'), '1')
  assert.equal(form.get('isPreengage'), '1')
  assert.equal(form.get('ams_targetappid'), model.WX_GAME_APP)
  transport = async () => { throw Error(session.access_token) }
  await assert.rejects(api.ams(session, ''), e => !e.message.includes(session.access_token))
})
test('QR login confirms SDK authorization, stores credentials only in Keychain, disposes WebView', async () => {
  assert.deepEqual(await auth.loginByWeChatQR(), session)
  assert.deepEqual(store.loadSession(), session)
  assert.equal(views[0].init.ephemeral, true)
  assert.equal(views[0].disposed, true)
  assert.ok(!JSON.stringify([...storage]).includes(session.access_token))
})
test('successful authorization remains saved even if game queries are rejected', async () => {
  store.saveSession(another)
  transport = async () => response({ ret: 101, iRet: 101, sMsg: '请先登录' })
  await auth.loginByWeChatQR()
  assert.deepEqual(store.loadSession(), session)
  const failed = await api.refreshSnapshot(true, now)
  assert.equal(failed.needsLogin, true)
  assert.equal(failed.balance.status, 'error')
  assert.deepEqual(store.loadSession(), session)
  assert.equal(views[0].disposed, true)
})
test('SDK failure or premature cookies cannot replace the current account', async () => {
  store.saveSession(another)
  mockWeb({ sdkFail: true })
  await assert.rejects(auth.loginByWeChatQR())
  assert.deepEqual(store.loadSession(), another)
  mockWeb({ cancel: true, earlyCookie: true })
  assert.equal(await auth.loginByWeChatQR(), null)
  assert.deepEqual(store.loadSession(), another)
})
test('official page SDK sync stores results for desktop cache', async () => {
  store.saveSession(session)
  mockWeb({ sync: true })
  const result = await webSync.syncThroughOfficialPage()
  assert.equal(result.balance.value, '888')
  assert.equal(result.profit.value, '777')
  assert.equal(views[0].url, model.RECORD_HOME)
  assert.equal(views[0].seeded.length, 4)
  assert.equal(views[0].disposed, true)
})
test('own mini-program credentials import preserves the actual appid and account type', () => {
  const mini = { ...session, appid: 'wx1c36464bbea2507a', acctype: 'mini' }
  assert.deepEqual(credentials.parseOwnCredentials(JSON.stringify(mini)), mini)
  assert.deepEqual(credentials.parseOwnCredentials(model.form(mini)), mini)
  const cookie = Object.entries(mini).map(([k, v]) => `${k}=${v}`).join('; ')
  assert.deepEqual(credentials.parseOwnCredentials(`Cookie: ${cookie}`), mini)
  assert.deepEqual(credentials.parseOwnCredentials(JSON.stringify({ headers: { Cookie: cookie } })), mini)
  assert.throws(() => credentials.parseOwnCredentials(JSON.stringify({ ...mini, headers: { Cookie: cookie.replace(session.openid, another.openid) } })))
  for (const text of ['', '{', 'openid=fake', JSON.stringify({ ...mini, acctype: 'qc' })]) assert.throws(() => credentials.parseOwnCredentials(text))
})
test('diagnostic report excludes raw errors, identities, amounts and tokens', async () => {
  store.saveSession(session)
  transport = async () => response({ ret: -4000, sMsg: session.access_token, jData: {} })
  await api.refreshSnapshot(true, now)
  const report = diagnostics.diagnosticReport(session)
  assert.match(report, /AMS\.ret=-4000/)
  assert.ok(!report.includes(session.openid))
  assert.ok(!report.includes(session.access_token))
  assert.ok(!JSON.stringify([...storage]).includes(session.access_token))
  diagnostics.recordDiagnostic('官网同步', new model.QueryError('api', session.access_token, session.access_token))
  assert.ok(!diagnostics.diagnosticReport(session).includes(session.access_token))
})
test('binding diagnostics distinguish an unbound role from a query failure', async () => {
  store.saveSession(session)
  transport = async () => response({ iRet: 0, jData: { bindarea: null } })
  assert.equal(await api.queryBinding(), false)
  transport = async () => response({ iRet: 0, jData: { bindarea: { area: '3' } } })
  assert.equal(await api.queryBinding(), true)
  transport = async () => response({ iRet: 101 })
  await assert.rejects(api.queryBinding(), e => e.code === 'auth')
})
test('page failure and cancellation release native controller without saving session', async () => {
  mockWeb({ load: false })
  await assert.rejects(auth.loginByWeChatQR())
  assert.equal(views[0].disposed, true)
  mockWeb({ cancel: true })
  assert.equal(await auth.loginByWeChatQR(), null)
  assert.equal(views[1].disposed, true)
  assert.equal(store.loadSession(), null)
})
test('partial failure retains only the failed metric cache and its original time', async () => {
  store.saveSession(session)
  await api.refreshSnapshot(true, now)
  transport = async (_url, init) => {
    if (init.body.includes('type=3')) throw Error('offline')
    return response(profit('20261022', '-456'))
  }
  const result = await api.refreshSnapshot(true, now + 60000)
  assert.equal(result.balance.value, '12000000')
  assert.equal(result.balance.status, 'cached')
  assert.equal(result.balance.updatedAt, now)
  assert.equal(result.profit.value, '-456')
  assert.equal(result.profit.status, 'ok')
})
test('midnight drops old profit cache, preserves dated balance, and isolates new accounts', async () => {
  store.saveSession(session)
  await api.refreshSnapshot(true, now)
  transport = async () => { throw Error('offline') }
  const result = await api.refreshSnapshot(true, now + 86400000)
  assert.equal(result.day, '2026-10-23')
  assert.equal(result.profit.value, null)
  assert.equal(result.balance.status, 'cached')
  store.saveSession(another)
  assert.equal(store.loadSnapshot(another, now).balance.value, null)
})
test('expired login marks caches and logout clears credentials, snapshots and pending state', async () => {
  store.saveSession(session)
  await api.refreshSnapshot(true, now)
  transport = async () => response({ ret: 101, iRet: 101, sMsg: '请先登录' })
  const result = await api.refreshSnapshot(true, now + 60000)
  assert.equal(result.needsLogin, true)
  assert.equal(result.balance.status, 'cached')
  auth.createMobileAuth()
  store.logout()
  assert.equal(store.loadSession(), null)
  assert.equal(storage.size, 0)
  assert.equal(keychain.size, 0)
  assert.equal((await api.refreshSnapshot()).needsLogin, true)
})
test('an in-flight request cannot resurrect data after logout', async () => {
  store.saveSession(session)
  const resolvers = []
  transport = (_url, init) => new Promise(resolve => resolvers.push(() => resolve(response(init.body.includes('type=3') ? money('1') : profit('20261022', '2')))))
  const request = api.refreshSnapshot(true, now)
  store.logout()
  resolvers.forEach(resolve => resolve())
  assert.equal((await request).needsLogin, true)
  assert.equal(storage.size, 0)
})
