// Contract fixtures are synthetic; no captured credentials or private account responses.
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const assert = require('node:assert/strict')
const { test, beforeEach } = require('node:test')
const ts = require('typescript')
const root = path.resolve(__dirname, '../../delta-force-widget')
let transport, storage, keychain, views, nativeAppearance = 'light'
const nativeWidget = {}
const original = Module._load
const elements = Object.fromEntries(['VStack', 'HStack', 'Text', 'Spacer', 'Image', 'Chart', 'LineChart', 'AreaChart', 'ZStack', 'Rectangle', 'RoundedRectangle', 'Canvas', 'BarChart'].map(name => [name, name]))
const scriptingRuntime = { ...elements, fetch: (...args) => transport(...args), Widget: nativeWidget,
  gradient: (_type, value) => value, Script: { name: '三角洲收益', createRunURLScheme: () => 'scripting://synthetic' },
  EnvironmentValuesReader: props => (Array.isArray(props.children) ? props.children[0] : props.children)({colorScheme:nativeAppearance}) }
Module._load = function(name, ...args) {
  if (name === 'scripting') return scriptingRuntime
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
const widgetUI = require(path.join(root, 'widget-view.tsx'))
const history = require(path.join(root, 'history.ts'))
const presentation = require(path.join(root, 'presentation.ts'))
const trendUI = require(path.join(root, 'trend-view.tsx'))
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
  nativeAppearance = 'light'; scriptingRuntime.Canvas = elements.Canvas
  for (const key of Object.keys(nativeWidget)) delete nativeWidget[key]
  Object.assign(nativeWidget,{ family:'systemSmall', displaySize:{width:158,height:158}, parameter:'',
    reloadAll() {}, preview:async()=>{}, present(){} })
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
      const labels = texts(widgetUI.WidgetCard({ snapshot: missing, small }))
      assert.ok(labels.includes('+5,285,832'))
      assert.ok(labels.includes('2026.10.21'))
      assert.ok(!labels.includes('余额'))
      assert.ok(!labels.join(' ').includes('昨日'))
    }
    const zeroBalance = { ...snapshot, balance: { ...snapshot.balance, value: '0' } }
    assert.ok(texts(widgetUI.WidgetCard({ snapshot: zeroBalance, small })).includes('余额'))
  }
})
test('empty widgets never invent an income amount or report date', () => {
  const labels = texts(widgetUI.WidgetCard({ snapshot: model.emptySnapshot(), small: true }))
  assert.ok(labels.includes('待同步'))
  assert.ok(labels.includes('暂无记录'))
  assert.ok(!labels.includes('余额'))
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
test('transparent widgets retain content and tap URL without a painted card', async () => {
  const snapshot = await seed()
  for (const small of [true,false]) {
    const card = widgetUI.WidgetCard({snapshot,small,transparent:true,url:'scripting://synthetic',now})
    assert.equal(card.props.background,undefined)
    assert.equal(card.props.widgetBackground,undefined)
    assert.equal(card.props.widgetURL,'scripting://synthetic')
    assert.equal(nodesOfType(card,'Rectangle').length,0)
    assert.equal(nodesOfType(card,'RoundedRectangle').length,0)
    assert.ok(!texts(card).join(' ').match(/登录|扫码|三角洲行动|哈夫币|哈弗币/))
    assert.ok(texts(card).includes('+5,285,832'))
  }
})

function textNodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(textNodes)
  return [...(node.type === 'Text' ? [node] : []), ...textNodes(node.props.children)]
}
function contrast(first, second) {
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4)
    return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2]
  }
  const a = luminance(first), b = luminance(second)
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)
}
test('light and dark glass themes keep readable text and domestic profit colors', async () => {
  const original = await seed()
  for (const small of [true,false]) for (const mode of ['light','dark']) for (const value of ['5285832','-1814421','0',null]) {
    const theme = presentation.widgetTheme(mode)
    const card = widgetUI.WidgetCard({snapshot:{...original,profit:{...original.profit,value}},small,theme:mode,now})
    assert.equal(card.props.background,theme.base)
    const rects = nodesOfType(card,'Rectangle')
    assert.equal(rects[0].props.fill,'regularMaterial')
    assert.deepEqual(rects[1].props.fill.colors,theme.surface)
    assert.ok(nodesOfType(card,'RoundedRectangle')[0].props.stroke.strokeStyle.lineWidth < 1)
    for (const node of textNodes(card)) for (const background of theme.surface) {
      assert.ok(contrast(node.props.foregroundStyle,background) >= 4.5, texts(node).join(' '))
    }
    const amount = textNodes(card).find(n=>texts(n).includes(value===null?'待同步':model.formatAmount(value,true)))
    assert.ok(amount)
    assert.equal(amount.props.foregroundStyle, value===null?theme.muted:value==='0'?theme.neutral:value.startsWith('-')?theme.loss:theme.gain)
  }
})
test('theme parsing preserves legacy transparent and stock parameters', () => {
  for (const raw of [undefined,null,'','blue','{}','{"background":"stock"}','{"theme":"unknown"}',{isTransparentMode:true}]) {
    assert.equal(presentation.themeParameter(raw),'system')
  }
  for (const mode of ['system','light','dark','transparent']) {
    assert.equal(presentation.themeParameter(mode),mode)
    assert.equal(presentation.themeParameter(JSON.stringify({theme:mode})),mode)
  }
  for (const raw of ['transparent',' TRANSPARENT ','{"background":"transparent"}']) assert.equal(widgetUI.transparentParameter(raw),true)
  assert.equal(presentation.themeParameter('{"theme":"dark","background":"transparent"}'),'transparent')
})
test('system and transparent themes read the actual native environment appearance', async () => {
  const snapshot = await seed()
  for (const appearance of ['light','dark']) {
    nativeAppearance=appearance
    for (const mode of ['system','transparent']) {
      const card = widgetUI.AdaptiveWidgetCard({snapshot,small:true,theme:mode,now})
      const theme = presentation.widgetTheme(mode,appearance)
      assert.equal(textNodes(card).find(n=>texts(n).includes('7日收益')).props.foregroundStyle,theme.text)
      assert.equal(card.props.background,mode==='transparent'?undefined:theme.base)
      assert.equal(nodesOfType(card,'Canvas').length,1)
    }
    const forced = widgetUI.AdaptiveWidgetCard({snapshot,theme:appearance==='light'?'dark':'light',now})
    assert.equal(forced.props.preferredColorScheme,appearance==='light'?'dark':'light')
  }
})

test('history keeps only the current seven Beijing calendar days, not seven arbitrary records', () => {
  const at = Date.parse('2026-10-25T03:00:00Z')
  const rows = [{day:'2026-10-18',value:'1'},{day:'2026-10-19',value:'2'},
    {day:'2026-10-23',value:'-4'},{day:'2026-10-25',value:'0'},{day:'2026-10-26',value:'9'}]
  assert.deepEqual(history.mergeHistory(rows,null,at), rows.slice(1,4))
  assert.deepEqual(history.historyWindow(Date.parse('2026-10-24T15:59:59Z')), {from:'2026-10-18',to:'2026-10-24'})
  assert.deepEqual(history.historyWindow(Date.parse('2026-10-24T16:00:00Z')), {from:'2026-10-19',to:'2026-10-25'})
  assert.deepEqual(history.historyWindow(Date.parse('2026-01-01T00:00:00Z')), {from:'2025-12-26',to:'2026-01-01'})
})
test('daily history deduplicates corrections and never invents records for absent days', () => {
  const rows = [{day:'20261021',value:'100'}, {day:'2026-10-23',value:'0'},
    {day:'2026-10-21',value:'200'},{day:'bad',value:'1'},{day:'2026-10-22',value:null}]
  const result = history.mergeHistory(rows,{day:'2026-10-21',value:'-123'},now)
  assert.deepEqual(result,[{day:'2026-10-21',value:'-123'},{day:'2026-10-23',value:'0'}])
})
test('each successful query accumulates report dates while same-day changes replace its point', async () => {
  store.saveSession(session)
  const at = Date.parse('2026-10-25T03:00:00Z')
  for (const [date,value] of [['20261021','5285832'],['20261023','-1814421'],['20261023','-1700000'],['20261024','0']]) {
    transport = async (_url,init) => response(init.body.includes('type=3') ? money('0') : profit(date,value))
    await api.refreshSnapshot(true,at)
  }
  const snapshot = store.loadSnapshot(session,at)
  assert.deepEqual(snapshot.history,[{day:'2026-10-21',value:'5285832'},{day:'2026-10-23',value:'-1700000'},{day:'2026-10-24',value:'0'}])
  assert.equal(snapshot.day,'2026-10-24')
  assert.equal(snapshot.profit.value,'0')
})
test('version 2 migrates its latest dated report into history without replacing login', async () => {
  const old = await seed()
  old.version = 2; delete old.history
  store.saveSnapshot(session,old)
  const upgraded = store.loadSnapshot(session,now)
  assert.equal(upgraded.version,3)
  assert.deepEqual(upgraded.history,[{day:'2026-10-21',value:'5285832'}])
  assert.deepEqual(store.loadSession(),session)
})
test('history failure and week-long inactivity keep the latest amount but age points out of the chart', async () => {
  await seed()
  transport = async () => { throw Error('offline') }
  const cached = await api.refreshSnapshot(true,now+60000)
  assert.deepEqual(cached.history,[{day:'2026-10-21',value:'5285832'}])
  const later = await api.refreshSnapshot(true,now+7*86400000)
  assert.equal(later.profit.value,'5285832')
  assert.equal(later.day,'2026-10-21')
  assert.deepEqual(later.history,[])
})
test('a valid older report can fill a historical day without displacing the newest report', async () => {
  await seed()
  transport = async (_url,init) => response(init.body.includes('type=3') ? money('0') : profit('20261020','-50'))
  const result = await api.refreshSnapshot(true,now)
  assert.equal(result.day,'2026-10-21')
  assert.equal(result.profit.value,'5285832')
  assert.deepEqual(result.history,[{day:'2026-10-20',value:'-50'},{day:'2026-10-21',value:'5285832'}])
})
test('session renewal retains accumulated history and an account switch clears it', async () => {
  await seed()
  const next = renewable()
  store.replaceSession(session,next)
  assert.equal(store.loadSnapshot(next,now).history.length,1)
  store.saveSession(another)
  assert.deepEqual(store.loadSnapshot(another,now).history,[])
  assert.deepEqual(store.loadSnapshot(next,now).history,[])
})
test('cumulative amounts retain exact integer precision, including cancellation and zero', () => {
  const base = 10n ** 60n
  const series = history.trendSeries([{day:'2026-10-20',value:String(base)},
    {day:'2026-10-21',value:String(-base+1n)},{day:'2026-10-23',value:'2'}],now)
  assert.deepEqual(series.map(p=>p.cumulative),[String(base),'1','3'])
  assert.equal(series[2].date-series[1].date,2*86400000)
  assert.ok(series.every(p=>Number.isFinite(p.y)&&p.y>=0&&p.y<=1))
  const flat = history.trendSeries([{day:'2026-10-21',value:'0'},{day:'2026-10-23',value:'0'}],now)
  assert.deepEqual(flat.map(p=>p.y),[0.5,0.5])
  assert.deepEqual(flat.map(p=>p.bar),[0,0])
})
function nodesOfType(node,type) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(n=>nodesOfType(n,type))
  return [...(node.type === type ? [node] : []),...nodesOfType(node.props.children,type)]
}
function scenario(values,days=values.map((_,i)=>`2026-10-${String(17+i).padStart(2,'0')}`)) {
  const snapshot=model.emptySnapshot()
  snapshot.history=values.map((value,i)=>({day:days[i],value:String(value)}))
  snapshot.day=days[days.length-1]??null
  snapshot.profit={value:values.length?String(values[values.length-1]):null,status:'ok',updatedAt:now,message:''}
  return snapshot
}
test('small and medium use independent layouts and the latest daily amount, not the cumulative sum', () => {
  const snapshot=scenario(['50000','-20000','80000'],['2026-10-20','2026-10-21','2026-10-23'])
  for (const small of [true,false]) {
    const card=widgetUI.WidgetCard({snapshot,small,now,size:{width:small?158:338,height:158}})
    const root=card.props.children.flat().filter(Boolean).at(-1)
    assert.equal(root.type,small?'VStack':'HStack')
    assert.equal(nodesOfType(card,'Canvas').length,1)
    assert.ok(texts(card).includes('+80,000'))
    assert.ok(!texts(card).includes('+110,000'))
    assert.ok(texts(card).includes('2026.10.23'))
    assert.ok(texts(card).includes('2涨')&&texts(card).includes('1跌'))
    assert.ok(texts(card).includes('3天记录'))
    assert.ok(!texts(card).join(' ').match(/三角洲行动|哈夫币|哈弗币/))
    if (small) {
      const children=root.props.children.flat().filter(Boolean)
      assert.ok(children.findIndex(n=>n.type==='Canvas')<children.findIndex(n=>texts(n).includes('+80,000')))
    } else assert.equal(root.props.children.flat().filter(Boolean).length,2)
  }
})
test('zero, one, two, three and seven records never fabricate daily bars or dates', () => {
  for (const count of [0,1,2,3,7]) for (const small of [true,false]) {
    const snapshot=scenario(['50000','-20000','80000','0','-30000','40000','-5000'].slice(0,count))
    const series=history.trendSeries(snapshot.history,now)
    const card=widgetUI.WidgetCard({snapshot,small,now})
    assert.equal(series.length,count)
    assert.equal(presentation.trendGeometry(series,small?134:154,small?44:107,small).points.length,count)
    assert.equal(nodesOfType(card,'Canvas').length,count?1:0)
    assert.ok(texts(card).includes(`${count}天记录`))
    if (count) assert.ok(texts(card).includes(model.formatAmount(snapshot.profit.value,true)))
    else assert.ok(texts(card).includes('暂无近7日记录'))
  }
})
test('overlapping widget and foreground queries merge history without reverting the latest day', async () => {
  await seed()
  const replies = []
  transport = (_url,init) => new Promise(resolve => replies.push(() => resolve(response(
    init.body.includes('type=3') ? money('0') : profit('20261020','-5')))))
  const slow = api.refreshSnapshot(true,now)
  transport = async (_url,init) => response(init.body.includes('type=3') ? money('0') : profit('20261023','9'))
  await api.refreshSnapshot(true,now+1000)
  replies.forEach(reply=>reply())
  const last = await slow
  assert.equal(last.day,'2026-10-23')
  assert.equal(last.profit.value,'9')
  assert.deepEqual(last.history.map(p=>p.day),['2026-10-20','2026-10-21','2026-10-23'])
})
test('rescanning the same account preserves its seven-day history', async () => {
  await seed()
  const signedIn = {...session,access_token:'synthetic_reauthorized_token'}
  store.saveSession(signedIn)
  const restored = store.loadSnapshot(signedIn,now)
  assert.deepEqual(restored.history,[{day:'2026-10-21',value:'5285832'}])
  assert.equal(restored.profit.value,'5285832')
})

test('a real widget entry paints its own stock card even when old transparent flags are enabled',{timeout:2000},async()=>{
  await seed()
  nativeWidget.isTransparentMode=true
  nativeWidget.isTransparentBackground=true
  const shown=new Promise(resolve=>{nativeWidget.present=node=>resolve(node)})
  const entry=path.join(root,'widget.tsx')
  delete require.cache[require.resolve(entry)]
  require(entry)
  const card=await shown
  assert.equal(card.type,'ZStack')
  assert.equal(card.props.frame.width,158)
  assert.equal(card.props.frame.height,158)
  assert.equal(card.props.background,'#F0F3F9')
  assert.equal(nodesOfType(card,'Rectangle').length,2)
  assert.ok(texts(card).includes('7日收益'))
  assert.ok(!texts(card).includes('近7天'))
})
test('material and gradient remain if host background modifiers are stripped',async()=>{
  const card=widgetUI.WidgetCard({snapshot:await seed(),now})
  delete card.props.background; delete card.props.widgetBackground
  const layer=card.props.children.flat().filter(Boolean)[0]
  assert.ok(layer.props.ignoresSafeArea)
  const rects=nodesOfType(layer,'Rectangle')
  assert.equal(rects[0].props.fill,'regularMaterial')
  assert.deepEqual(rects[1].props.fill.colors,presentation.widgetTheme().surface)
})
test('both native preview families offer system, light, dark and transparent parameters',async()=>{
  const calls=[]
  nativeWidget.reloadAll=()=>calls.push('reload')
  nativeWidget.preview=async options=>calls.push(options)
  for (const family of ['systemSmall','systemMedium']) await widgetUI.previewWidget(family)
  assert.deepEqual([calls[0],calls[2]],['reload','reload'])
  for (const [index,family] of [[1,'systemSmall'],[3,'systemMedium']]) {
    assert.equal(calls[index].family,family)
    const config=calls[index].parameters
    assert.equal(presentation.themeParameter(config.options[config.default]),'system')
    assert.deepEqual(Object.values(config.options).map(presentation.themeParameter),['system','light','dark','transparent'])
  }
})

test('the requested mixed example rises, falls, rises while the latest label remains daily', () => {
  const s=scenario(['50000','-20000','80000'],['2026-10-20','2026-10-21','2026-10-23'])
  const series=history.trendSeries(s.history,now)
  assert.deepEqual(series.map(p=>p.cumulative),['50000','30000','110000'])
  assert.deepEqual(presentation.trendStats(series),{count:3,up:2,down:1,zero:0})
  const g=presentation.trendGeometry(series,154,107)
  assert.ok(g.origin.y>g.points[0].cy)
  assert.ok(g.points[0].cy<g.points[1].cy)
  assert.ok(g.points[1].cy>g.points[2].cy)
  assert.equal(g.points[2].x-g.points[1].x,2*(g.points[1].x-g.points[0].x))
  assert.equal(g.points.filter(p=>p.day==='2026-10-22').length,0)
  assert.equal(s.profit.value,'80000')
})
test('all losses, zero days and extreme changes retain bounded finite geometry and truthful signs', () => {
  const cases=[['-10'],['-10','-20'],['0','0','0'],['10','0','-30'],
    ['1'+'0'.repeat(400),'-9','-1'+'0'.repeat(400)],['500','-200','800','-100','0','-5','20']]
  for (const values of cases) for (const small of [true,false]) {
    const series=history.trendSeries(scenario(values).history,now)
    const g=presentation.trendGeometry(series,small?134:154,small?44:107,small)
    let previous=g.origin
    for (const p of g.points) {
      assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.cy)&&Number.isFinite(p.barHeight))
      assert.ok(p.x>=4&&p.x<=(small?134:154)-5&&p.cy>=5&&p.cy<=g.plotBottom)
      assert.ok(p.sign>0?p.cy<=previous.y:p.sign<0?p.cy>=previous.y:p.cy===previous.y)
      previous={x:p.x,y:p.cy}
    }
    assert.equal(presentation.trendStats(series).zero,values.filter(v=>v==='0').length)
  }
})
function recordCanvas() {
  const commands=[], state={}
  const ctx=new Proxy({}, {
    set(_target,key,value){state[key]=value;return true},
    get(_target,key){
      if(key==='createLinearGradient')return (...args)=>({args,stops:[],addColorStop(...stop){this.stops.push(stop)}})
      return (...args)=>{commands.push({method:key,args,...state})}
    }
  })
  return {ctx,commands}
}
test('native canvas paints one honest segment, point and signed bar per real record without numeric labels', () => {
  for (const count of [1,2,3,7]) for (const small of [true,false]) for (const mode of ['light','dark','transparent']) {
    const s=scenario(['50000','-20000','80000','0','-30000','40000','-5000'].slice(0,count))
    const series=history.trendSeries(s.history,now), theme=presentation.widgetTheme(mode)
    const {ctx,commands}=recordCanvas()
    trendUI.paintTrend(ctx,{width:small?134:154,height:small?44:107},series,theme,small)
    assert.equal(commands.filter(c=>c.method==='arc').length,count)
    assert.equal(commands.filter(c=>c.method==='fillRect').length,count)
    const curves=commands.filter(c=>c.method==='bezierCurveTo')
    assert.equal(curves.length,count*2)
    assert.equal(commands.filter(c=>c.method==='fillText').length<=3,true)
    assert.ok(commands.filter(c=>c.method==='fillText').every(c=>series.some(p=>model.reportDate(p.day,true)===c.args[0])))
    for(const c of commands) for(const arg of c.args) if(typeof arg==='number')assert.ok(Number.isFinite(arg))
    for(const [i,c] of commands.filter(c=>c.method==='fillRect').entries()) {
      const p=series[i]
      const rgb=presentation.signColor(p.sign,theme).slice(1).match(/../g).map(v=>parseInt(v,16)).join(',')
      assert.ok(c.fillStyle.includes(rgb))
      if(p.sign===0)assert.equal(c.args[3],1.2)
    }
    for(const [i,p] of series.entries()) {
      // Cubic controls have the true endpoint Y values, so they cannot overshoot.
      const c=curves[i*2]
      assert.equal(c.args[1],i?curves[(i-1)*2].args[5]:presentation.trendGeometry(series,small?134:154,small?44:107,small).origin.y)
      assert.equal(c.args[3],c.args[5])
    }
  }
})
test('long signed amounts stay exact and use a measured font with scaling in both layouts', () => {
  for(const value of ['999999999999999999','-123456789012345678901234567890'])for(const small of [true,false]) {
    const s=scenario([value])
    const card=widgetUI.WidgetCard({snapshot:s,small,now,size:{width:small?158:338,height:158}})
    const node=textNodes(card).find(n=>texts(n).includes(model.formatAmount(value,true)))
    assert.ok(node)
    assert.equal(node.props.lineLimit,1)
    assert.ok(node.props.minScaleFactor<=0.1)
    const label=model.formatAmount(value,true), units=[...label].reduce((n,ch)=>n+(ch===','?0.26:ch==='+'||ch==='−'?0.6:0.59),0)
    assert.ok(node.props.font*units<=(small?134:(338-28-14)*0.48)+0.01)
  }
})
test('older hosts without Canvas keep native cumulative and signed daily charts', () => {
  scriptingRuntime.Canvas=undefined
  const s=scenario(['50000','-20000','80000'])
  const view=trendUI.ProfitTrend({snapshot:s,now})
  assert.equal(nodesOfType(view,'Canvas').length,0)
  assert.equal(nodesOfType(view,'LineChart')[0].props.marks.length,3)
  assert.deepEqual(nodesOfType(view,'LineChart')[0].props.marks.map(p=>p.value),history.trendSeries(s.history,now).map(p=>p.y))
  const bars=nodesOfType(view,'BarChart')[0].props.marks
  assert.ok(bars[0].value>0&&bars[1].value<0&&bars[2].value>0)
  assert.ok(nodesOfType(view,'Chart').every(n=>n.props.chartXAxis==='hidden'&&n.props.chartYAxis==='hidden'))
})
test('widget entry honors dark and transparent parameters through real entry execution', {timeout:2000}, async () => {
  await seed()
  const entry=path.join(root,'widget.tsx')
  for (const parameter of ['dark','transparent']) {
    nativeWidget.parameter=parameter
    nativeWidget.family='systemMedium';nativeWidget.displaySize={width:338,height:158}
    const shown=new Promise(resolve=>{nativeWidget.present=node=>resolve(node)})
    delete require.cache[require.resolve(entry)];require(entry)
    const card=await shown
    assert.equal(card.props.frame.width,338)
    assert.equal(card.props.background,parameter==='transparent'?undefined:presentation.widgetTheme('dark').base)
    assert.ok(texts(card).includes('+5,285,832'))
  }
})
test('offline widget renders the original cached amount and date without any GitHub image dependency', {timeout:2000}, async () => {
  await seed()
  const urls=[]
  transport=async url=>{urls.push(url);throw Error('offline')}
  const shown=new Promise(resolve=>{nativeWidget.present=node=>resolve(node)})
  const entry=path.join(root,'widget.tsx')
  delete require.cache[require.resolve(entry)];require(entry)
  const card=await shown
  assert.ok(texts(card).includes('+5,285,832'))
  assert.ok(texts(card).includes('2026.10.21'))
  assert.ok(nodesOfType(card,'Rectangle').length)
  assert.ok(!urls.some(url=>/github|\.png/.test(url)))
  assert.deepEqual(store.loadSession(),session)
})
