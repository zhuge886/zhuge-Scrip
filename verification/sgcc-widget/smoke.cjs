const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '../../sgcc-widget')
let checks = 0
async function check(name, fn) {
  await fn()
  checks++
  process.stdout.write(`ok ${checks} - ${name}\n`)
}

function runtime() {
  const storage = new Map(), keychain = new Map(), modules = new Map()
  const widget = { family: 'systemSmall', parameter: '', displaySize: { width: 155, height: 155 },
    output: null, present(element) { this.output = element }, reloadAll() {}, async preview() {} }
  const context = vm.createContext({
    console: { log() {}, error() {} },
    Storage: { get: (k) => storage.get(k), set: (k, v) => storage.set(k, v), remove: (k) => storage.delete(k) },
    Keychain: { contains: (k) => keychain.has(k), get: (k) => keychain.get(k),
      set: (k, v) => keychain.set(k, v), remove: (k) => keychain.delete(k) },
    setTimeout: (callback, milliseconds) => { if (milliseconds <= 1000) queueMicrotask(callback); return 1 }, clearTimeout() {},
    createElement: (type, props, ...children) => typeof type === 'function'
      ? type({ ...props, children }) : { type, props: props ?? {}, children },
    Dialog: { async alert() {} }
  })
  const scripting = new Proxy({
    Widget: widget, AbortController,
    fetch: async () => { throw new Error('Unexpected live network request in tests') },
    useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
    useEffect() {},
    Navigation: { useDismiss: () => () => {}, async present() {} }, Script: { exit() {} }
  }, { get: (target, key) => key in target ? target[key] : String(key) })
  function load(name) {
    let file = path.resolve(root, name)
    if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx'
    if (modules.has(file)) return modules.get(file).exports
    const mod = { exports: {} }; modules.set(file, mod)
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React, jsxFactory: 'createElement' }, fileName: file
    }).outputText
    const req = (id) => id === 'scripting' ? scripting : load(path.resolve(path.dirname(file), id))
    vm.runInContext(`(function(require,module,exports){${output}\n})`, context, { filename: file })(req, mod, mod.exports)
    return mod.exports
  }
  return { load, storage, keychain, widget, context }
}

function fixture(r) {
  const store = r.load('store')
  return { ...store.defaultPreference, phone: '13800000000', consNo: '0001234567',
    provinceCode: '11102', orgNo: 'fixture01', elecType: '01' }
}
function manual(r) { return { ...fixture(r), orgNo: '1110201' } }
function account() { return { consNo: 'encrypted-fixture', src: '0001234567',
  pro: '11102', org: '1110201', elec: '01', name: '', orgName: '' } }
function balanceItem(value = '23.50') {
  return { userInfo: { consNo: '0001234567', consNo_dst: '0001234567' },
    availability: { balance: true, daily: false, monthly: false }, eleBill: { sumMoney: value } }
}
function textOf(node) {
  if (node == null || node === false) return ''
  if (typeof node !== 'object') return String(node)
  return (Array.isArray(node) ? node : [node.props?.title, node.props?.header, node.props?.footer, node.props?.label,
    ...(node.children ?? [])]).map(textOf).join(' ')
}
function configure(r) {
  const store = r.load('store'), p = manual(r)
  store.savePreference(p); store.setPassword('test-only-password')
  return { store, p, key: r.load('accounts').sourceKey(p) }
}
function mockSession(r, bound = []) {
  const vendor = r.load('vendor/sgcc_protocol')
  vendor.SgApp.prototype.ensure = async function () {
    this.sess = { userId: 'test-user', accounts: bound }; return this.sess
  }
  return vendor
}

async function officialPage(script, respond, options = {}) {
  const calls = []
  const component = { $store: { getters: { getToken: options.token ?? 'fixture-web-token', getUserId: 'fixture-user' } },
    $tools: { async apiPost(payload, endpoint) { calls.push({ payload, endpoint }); return respond(payload, endpoint) } } }
  const window = {}
  const page = { window, location: { protocol: options.protocol ?? 'https:', hostname: options.hostname ?? 'www.95598.cn' },
    document: { querySelector: () => ({ __vue__: { $children: [component] } }) },
    setTimeout: () => 1, clearTimeout() {} }
  const started = vm.runInNewContext(`(function(){${script}})()`, page)
  await new Promise(setImmediate)
  return { calls, started, result: window.__zhugeSgccMetadataV1, window,
    invoke: (payload, endpoint) => component.$tools.apiPost(payload, endpoint) }
}

function metadataResponse(overrides = {}) {
  return { code: '1', data: { data: { dataList: [{ consNo: 'encrypted-fixture', consNo_dst: '0001234567',
    orgNo: '1110209', proNo: '11102', elecTypeCode: '01', consName: 'do-not-copy', token: 'do-not-copy-token', ...overrides }] } } }
}

async function main() {
  await check('manual household works with an empty bound list and preserves leading zeroes', () => {
    const r = runtime(), result = r.load('accounts').selectAccounts(manual(r), [])
    assert.equal(result.length, 1); assert.equal(result[0].src, '0001234567')
    assert.equal(result[0].org, '1110201')
  })
  await check('bound metadata keeps the server account representation', () => {
    const r = runtime(), a = account()
    assert.equal(r.load('accounts').selectAccounts(manual(r), [a])[0], a)
  })
  await check('region is required while organization and scene can be left unspecified', () => {
    const r = runtime(), p = { ...manual(r), orgNo: '', elecType: '' }
    const selected = r.load('accounts').selectAccounts(p, [])[0]
    assert.equal(selected.org, ''); assert.equal(selected.elec, '')
    assert.throws(() => r.load('accounts').selectAccounts({ ...p, provinceCode: '' }, []), /选择/)
    assert.throws(() => r.load('accounts').selectAccounts(fixture(r), []), /数字/)
  })
  await check('rejects blank and masked household numbers', () => {
    const r = runtime()
    for (const consNo of ['', '12***34', '-1', '1e8']) {
      assert.throws(() => r.load('accounts').selectAccounts({ ...manual(r), consNo }, []), /完整的数字户号/)
    }
  })
  await check('bound mode retains the six-account limit and useful empty-list error', () => {
    const r = runtime(), p = { ...manual(r), queryMode: 'bound' }
    assert.equal(r.load('accounts').selectAccounts(p, Array.from({ length: 8 }, account)).length, 6)
    assert.throws(() => r.load('accounts').selectAccounts(p, []), /切换/)
  })
  await check('household parameters match exactly before zero-based indices', () => {
    const { selectResult } = runtime().load('accounts'), first = balanceItem(), second = balanceItem('10')
    second.userInfo.consNo_dst = '1'
    assert.equal(selectResult([first, second], '0001234567'), first)
    assert.equal(selectResult([first, second], '1'), second)
    assert.equal(selectResult([first, second], '0;display-option'), first)
    assert.equal(selectResult([first], '1234567'), null)
    assert.equal(selectResult([first], 'unknown'), null)
  })
  await check('cache identity changes with login, household, scope and routing metadata', () => {
    const r = runtime(), p = manual(r), { sourceKey } = r.load('accounts'), original = sourceKey(p)
    for (const patch of [{ phone: '13900000000' }, { consNo: '0007654321' },
      { queryMode: 'bound' }, { queryScope: 'full' }, { orgNo: '1110202' }, { elecType: '04' }, { metadataRevision: 1 }]) {
      assert.notEqual(sourceKey({ ...p, ...patch }), original)
    }
    assert.equal(sourceKey({ ...p, phone: '+86 13800000000' }), original)
    assert.equal(sourceKey({ ...p, barCount: 3 }), original)
  })
  await check('balance-only query sends exactly one request with manually supplied fields', async () => {
    const r = runtime(), calls = [], app = { sess: { userId: 'test-user' }, async authed(endpoint, payload) {
      calls.push({ endpoint, payload }); return { list: [{ consType: '1', sumMoney: '23.50' }] }
    } }
    const out = await r.load('vendor/sgcc_protocol').queryAccount(app, account(), { scope: 'balance' })
    assert.equal(calls.length, 1); assert.match(calls[0].endpoint, /balance-front/)
    assert.equal(calls[0].payload.data.list[0].consNoSrc, '0001234567')
    assert.equal(calls[0].payload.data.list[0].orgNo, '1110201')
    assert.equal(out.availability.daily, false); assert.equal(out.availability.monthly, false)
    assert.equal(r.load('data').normalize(out).balance, '23.50')
  })
  await check('unavailable daily and monthly detail does not block a valid balance', async () => {
    const r = runtime(), app = { sess: { userId: 'test-user' }, async authed(endpoint) {
      if (!endpoint.includes('balance-front')) throw new Error('明细需绑定')
      return { list: [{ consType: '1', sumMoney: 42 }] }
    } }
    const out = await r.load('vendor/sgcc_protocol').queryAccount(app, account(), { scope: 'full' })
    assert.equal(out.availability.balance, true); assert.equal(out.availability.daily, false)
    assert.equal(out.availability.monthly, false); assert.ok(out.warnings.length >= 2)
    assert.equal(r.load('data').normalize(out).balance, '42.00')
  })
  await check('empty or malformed balance response fails instead of showing zero', async () => {
    const r = runtime(), query = r.load('vendor/sgcc_protocol').queryAccount
    for (const response of [{ list: [] }, { list: [{}] }, { list: [{ sumMoney: '' }] }, { list: [{ historyOwe: 0 }] }]) {
      await assert.rejects(query({ sess: {}, authed: async () => response }, account(), { scope: 'balance' }), (e) => e.code === 'empty_balance')
    }
  })
  await check('a real zero balance is a successful result', async () => {
    const r = runtime(), out = await r.load('vendor/sgcc_protocol').queryAccount({ sess: {},
      authed: async () => ({ list: [{ consType: '1', sumMoney: 0 }] }) }, account(), { scope: 'balance' })
    assert.equal(out.availability.balance, true); assert.equal(out.eleBill.sumMoney, 0)
  })
  await check('SMS and expired-session failures propagate without being mistaken for missing detail', async () => {
    const r = runtime(), error = Object.assign(new Error('需安全验证'), { code: 'RK008' })
    await assert.rejects(r.load('vendor/sgcc_protocol').queryAccount({ sess: {}, authed: async () => { throw error } },
      account(), { scope: 'full' }), (e) => e === error)
  })
  await check('postpaid balance and current bill remain separate', async () => {
    const r = runtime(), out = await r.load('vendor/sgcc_protocol').queryAccount({ sess: {},
      authed: async () => ({ list: [{ consType: '2', accountBalance: 100, sumMoney: 20, historyOwe: 0 }] }) },
      account(), { scope: 'balance' })
    const data = r.load('data').normalize(out)
    assert.equal(data.balance, '100.00'); assert.equal(data.amountDue, '20.00'); assert.equal(data.arrearsOfFees, false)
  })
  await check('manual client can query without any bound accounts', async () => {
    const r = runtime(); configure(r); const vendor = mockSession(r)
    vendor.SgApp.prototype.authed = async () => ({ list: [{ consType: '1', sumMoney: 12 }] })
    const result = await r.load('api/client').getData({ force: true, discover: true })
    assert.equal(result.list.length, 1); assert.equal(result.list[0].userInfo.consNo_dst, '0001234567')
    assert.equal(result.list[0].eleBill.sumMoney, 12)
  })
  await check('fresh matching cache avoids login and network', async () => {
    const r = runtime(), { store, key } = configure(r)
    store.saveCache({ sourceKey: key, fetchedAt: Date.now(), list: [balanceItem()], warnings: [] })
    assert.equal((await r.load('api/client').getData()).list[0].eleBill.sumMoney, '23.50')
  })
  await check('failed refresh falls back only to the same household cache', async () => {
    const r = runtime(), { store, p, key } = configure(r), vendor = mockSession(r)
    vendor.SgApp.prototype.authed = async () => { throw new Error('测试网络失败') }
    store.saveCache({ sourceKey: key, fetchedAt: 1, list: [balanceItem()], warnings: [] })
    const cached = await r.load('api/client').getData({ force: true, discover: true })
    assert.ok(cached.error); assert.equal(cached.fetchedAt, 1)
    store.savePreference({ ...p, consNo: '0007654321' })
    await assert.rejects(r.load('api/client').getData({ force: true, discover: true }), /测试网络失败/)
  })
  await check('a configuration change during a request cannot overwrite another household cache', async () => {
    const r = runtime(), { store, p, key } = configure(r), vendor = mockSession(r)
    const sentinel = { sourceKey: 'new-household', fetchedAt: 9, list: [], warnings: [] }
    vendor.SgApp.prototype.authed = async () => {
      store.savePreference({ ...p, consNo: '0007654321' }); store.saveCache(sentinel)
      return { list: [{ consType: '1', sumMoney: 5 }] }
    }
    const result = await r.load('api/client').getData({ force: true, discover: true })
    assert.equal(result.sourceKey, key); assert.equal(store.loadCache(), sentinel)
  })
  await check('password changes invalidate cached data and use the isolated keychain prefix', () => {
    const r = runtime(), { store } = configure(r)
    store.saveCache({ sourceKey: 'old' }); store.setPassword('new-test-only-password')
    assert.equal(store.loadCache(), null)
    assert.ok(r.keychain.has('zhuge.sgcc.password')); assert.equal(r.keychain.has('sgcc.password'), false)
  })
  await check('automatic discovery changes only the scene and stops at the first valid zero balance', async () => {
    const r = runtime(), calls = [], progress = []
    const app = { sess: {}, async authed(endpoint, payload) {
      const a = payload.data.list[0]; calls.push(a)
      if (a.sceneType !== '02') return { list: [] }
      return { list: [{ consNoSrc: '0001234567', consType: '1', sumMoney: 0, orgNo: '1110209', elecTypeCode: '02' }] }
    } }
    const input = { ...account(), consNo: '0001234567', elec: '' }
    const out = await r.load('api/probe').probeBalance(app, input, { pause: async () => {}, onProgress: (v) => progress.push(v) })
    assert.equal(calls.length, 2); assert.equal(calls[0].sceneType, '01'); assert.equal(calls[1].sceneType, '02')
    assert.ok(calls.every((a) => a.orgNo === input.org && a.consNoSrc === input.src && a.proCode === input.pro))
    assert.equal(out.account.org, '1110209'); assert.equal(out.account.elec, '02')
    assert.equal(out.data.householdVerified, true); assert.equal(out.data.eleBill.sumMoney, 0)
    assert.match(progress[1], /店铺/)
  })
  await check('exhausted discovery is capped at five requests without scanning organizations or regions', async () => {
    const r = runtime(), calls = []
    const app = { sess: {}, authed: async (endpoint, payload) => { calls.push(payload.data.list[0]); return { list: [] } } }
    await assert.rejects(r.load('api/probe').probeBalance(app, { ...account(), elec: '' }, { pause: async () => {} }), /全部候选类型/)
    assert.equal(calls.length, 5); assert.equal(new Set(calls.map((a) => a.sceneType)).size, 5)
    assert.ok(calls.every((a) => a.orgNo === account().org && a.proCode === '11102' && a.consNoSrc === '0001234567'))
  })
  await check('an explicitly chosen scene makes one attempt and is never silently changed', async () => {
    const r = runtime(); let calls = 0
    const app = { sess: {}, authed: async () => { calls++; return { list: [] } } }
    await assert.rejects(r.load('api/probe').probeBalance(app, { ...account(), elec: '04' }, { pause: async () => {} }))
    assert.equal(calls, 1)
  })
  await check('authentication, rate limits, network failures and permissions stop discovery immediately', async () => {
    for (const [code, message] of [['RK006', '需人机验证'], ['rate_limit', '请求过于频繁'],
      ['net', '连不上国网服务器'], ['auth', '登录已失效'], ['403', '户号未绑定，无权限']]) {
      const r = runtime(); let calls = 0
      const app = { sess: {}, authed: async () => { calls++; throw Object.assign(new Error(message), { code }) } }
      await assert.rejects(r.load('api/probe').probeBalance(app, { ...account(), elec: '' }, { pause: async () => {} }), /已停止/)
      assert.equal(calls, 1, code)
    }
  })
  await check('missing organization triggers metadata acquisition before any balance request', async () => {
    const r = runtime(); let calls = 0
    const app = { sess: {}, authed: async () => { calls++; throw new Error('供电单位代码不能为空') } }
    await assert.rejects(r.load('api/probe').probeBalance(app, { ...account(), org: '', elec: '' }, { pause: async () => {} }), (e) => e.code === 'org_required')
    assert.equal(calls, 0)
  })
  await check('a mismatched household response is rejected before saving or trying another scene', async () => {
    const r = runtime(); let calls = 0
    const app = { sess: {}, authed: async () => { calls++; return { list: [{ consNoSrc: '0007654321', consType: '1', sumMoney: 88 }] } } }
    await assert.rejects(r.load('api/probe').probeBalance(app, { ...account(), elec: '' }, { pause: async () => {} }), /户号不匹配/)
    assert.equal(calls, 1); assert.equal(r.load('store').loadResolution(), null)
  })
  await check('a matching entry can be selected from a response containing multiple households', async () => {
    const r = runtime(), out = await r.load('vendor/sgcc_protocol').queryAccount({ sess: {},
      authed: async () => ({ list: [{ consNoSrc: '0007654321', sumMoney: 9, consType: '1' },
        { consNoSrc: '0001234567', sumMoney: 17, consType: '1' }] }) }, account(), { scope: 'balance' })
    assert.equal(out.eleBill.sumMoney, 17); assert.equal(out.householdVerified, true)
  })
  await check('ambiguous multi-entry responses without household identities are rejected', async () => {
    const r = runtime()
    await assert.rejects(r.load('vendor/sgcc_protocol').queryAccount({ sess: {},
      authed: async () => ({ list: [{ sumMoney: 9 }, { sumMoney: 17 }] }) }, account(), { scope: 'balance' }), /不匹配/)
  })
  await check('a saved scene is tried first while preserving the explicit household and province', async () => {
    const r = runtime(), calls = []
    const app = { sess: {}, authed: async (endpoint, payload) => { calls.push(payload.data.list[0]); return { list: [{ sumMoney: 4, consType: '1' }] } } }
    await r.load('api/probe').probeBalance(app, { ...account(), org: '', elec: '' }, {
      preferred: { ...account(), org: '1110209', elec: '03' }, pause: async () => {} })
    assert.equal(calls.length, 1); assert.equal(calls[0].sceneType, '03'); assert.equal(calls[0].orgNo, '1110209')
  })
  await check('the client learns a working combination and the widget reuses it with one request', async () => {
    const r = runtime(), { store, p } = configure(r), vendor = mockSession(r), scenes = []
    store.savePreference({ ...p, orgNo: '', elecType: '' })
    store.saveMetadata({ key: r.load('accounts').metadataKey(store.loadPreference()), account: { ...account(), elec: '' }, fetchedAt: 1 })
    vendor.SgApp.prototype.authed = async (endpoint, payload) => {
      const scene = payload.data.list[0].sceneType; scenes.push(scene)
      return scene === '02' ? { list: [{ consNoSrc: p.consNo, consType: '1', sumMoney: 3, orgNo: '1110209' }] } : { list: [] }
    }
    await r.load('api/client').getData({ force: true, discover: true })
    assert.equal(store.loadResolution().account.elec, '02'); assert.equal(store.loadResolution().account.org, '1110209')
    assert.equal(store.loadPreference().elecType, '')
    scenes.length = 0; store.clearCache()
    const out = await r.load('api/client').getData()
    assert.equal(scenes.length, 1); assert.equal(scenes[0], '02'); assert.equal(out.list[0].eleBill.sumMoney, 3)
  })
  await check('a fresh widget without a successful combination makes no login or probe requests', async () => {
    const r = runtime(); configure(r)
    let calls = 0; r.load('vendor/sgcc_protocol').SgApp.prototype.ensure = async () => { calls++; return { accounts: [] } }
    await assert.rejects(r.load('api/client').getData(), /自动识别并查询/)
    assert.equal(calls, 0)
  })
  await check('saved combinations are isolated from other household or province settings', async () => {
    const r = runtime(), { store, p, key } = configure(r)
    store.saveResolution({ sourceKey: key, account: account(), savedAt: Date.now() })
    for (const patch of [{ consNo: '0007654321' }, { provinceCode: '32101' }]) {
      store.savePreference({ ...p, ...patch })
      await assert.rejects(r.load('api/client').getData(), /自动识别并查询/)
    }
  })
  await check('supplementary detail failures retain the balance already obtained', async () => {
    const r = runtime(), { store, p } = configure(r), vendor = mockSession(r)
    store.savePreference({ ...p, queryScope: 'full' })
    vendor.SgApp.prototype.authed = async (endpoint) => {
      if (!endpoint.includes('balance-front')) throw Object.assign(new Error('网络超时'), { code: 'net' })
      return { list: [{ consNoSrc: p.consNo, sumMoney: 8, consType: '1' }] }
    }
    const result = await r.load('api/client').getData({ force: true, discover: true })
    assert.equal(result.list[0].eleBill.sumMoney, 8)
    assert.ok(result.warnings.some((message) => message.includes('用电明细查询失败')))
  })
  await check('a server orgNo-required response is converted into the official acquisition action', async () => {
    const r = runtime(); let calls = 0
    const app = { sess: {}, authed: async () => { calls++; throw new Error('orgNo不能为空') } }
    await assert.rejects(r.load('api/probe').probeBalance(app, { ...account(), elec: '' }),
      (e) => e.code === 'org_required' && /从官网获取供电单位/.test(e.message))
    assert.equal(calls, 1)
  })
  await check('the official page resolves the exact household and returns only minimal metadata', async () => {
    const r = runtime(), script = r.load('api/official').buildOfficialLookupScript('0001234567', '11102')
    const out = await officialPage(script, () => metadataResponse())
    assert.equal(out.started.started, true); assert.equal(out.result.ok, true); assert.equal(out.calls.length, 1)
    assert.equal(out.calls[0].endpoint, '/osg-open-uc0001/member/c9/f03')
    assert.equal(out.calls[0].payload.data.consNo, '0001234567')
    assert.equal(out.result.account.org, '1110209'); assert.equal(out.result.account.consNo, 'encrypted-fixture')
    assert.equal(out.result.account.name, ''); assert.equal(out.result.account.src, '0001234567')
    assert.doesNotMatch(JSON.stringify(out.result), /fixture-web-token|do-not-copy|elecAddr/)
  })
  await check('the official flow can fall back to the read-only payment-information query', async () => {
    const r = runtime(), script = r.load('api/official').buildOfficialLookupScript('0001234567', '11102')
    const out = await officialPage(script, (payload, endpoint) => endpoint.includes('/c9/f03')
      ? { code: '1', data: { dataList: [] } }
      : { code: '1', data: { consDetailLists: [{ consNo: '0001234567', orgNo: '1110208', elecTypeCode: '01' }] } })
    assert.equal(out.result.ok, true); assert.equal(out.calls.length, 2)
    assert.equal(out.calls[1].endpoint, '/osg-wp0002/member/charge/getElecUserChargeList')
    assert.equal(out.calls[1].payload.consLists[0].consNo, '0001234567')
    assert.equal(out.result.account.org, '1110208')
    for (const request of out.calls) {
      assert.doesNotMatch(request.endpoint, /bind|adFlag|submit|paymentSubmit/i)
      assert.doesNotMatch(JSON.stringify(request.payload), /bizAmount|payAmount|adFlag/)
    }
  })
  await check('the official observer sends no requests and captures only the users matching read query', async () => {
    const r = runtime(), script = r.load('api/official').buildOfficialLookupScript('0001234567', '11102', true)
    const out = await officialPage(script, () => metadataResponse(), { token: '' })
    assert.equal(out.started.observing, true); assert.equal(out.calls.length, 0)
    const response = await out.invoke({ data: { consNo: '0001234567', provCode: '11102' } }, '/osg-open-uc0001/member/c9/f03')
    assert.equal(response.code, '1'); assert.equal(out.window.__zhugeSgccObservedMetadataV1.account.org, '1110209')
    assert.doesNotMatch(JSON.stringify(out.window.__zhugeSgccObservedMetadataV1), /do-not-copy/)
  })
  await check('the official observer does not capture unrelated paths or households', async () => {
    for (const [payload, endpoint] of [
      [{ data: { consNo: '0007654321', provCode: '11102' } }, '/osg-open-uc0001/member/c9/f03'],
      [{ data: { consNo: '0001234567', provCode: '32101' } }, '/osg-open-uc0001/member/c9/f03'],
      [{ data: { consNo: '0001234567', provCode: '11102' } }, '/unrelated-endpoint']]) {
      const r = runtime(), script = r.load('api/official').buildOfficialLookupScript('0001234567', '11102', true)
      const out = await officialPage(script, () => metadataResponse())
      await out.invoke(payload, endpoint)
      assert.equal(out.window.__zhugeSgccObservedMetadataV1, undefined)
    }
  })
  await check('an accounting-unit code is never guessed to be the required organization', async () => {
    const r = runtime(), script = r.load('api/official').buildOfficialLookupScript('0001234567', '11102')
    const out = await officialPage(script, () => metadataResponse({ orgNo: '', acctOrgNo: '1110209' }))
    assert.equal(out.result.ok, false); assert.equal(out.result.code, 'metadata_missing')
    assert.equal(out.result.account, undefined)
  })
  await check('unrelated, masked or different-region household metadata is rejected', async () => {
    for (const patch of [{ consNo_dst: '0007654321' }, { consNo_dst: '000****567' }, { proNo: '32101' }]) {
      const r = runtime(), script = r.load('api/official').buildOfficialLookupScript('0001234567', '11102')
      const out = await officialPage(script, () => metadataResponse(patch))
      assert.equal(out.result.ok, false); assert.equal(out.result.account, undefined)
    }
  })
  await check('ambiguous official metadata is not selected or saved', async () => {
    const r = runtime(), script = r.load('api/official').buildOfficialLookupScript('0001234567', '11102')
    const response = metadataResponse(); response.data.data.dataList.push({ ...response.data.data.dataList[0], orgNo: '1110210' })
    const out = await officialPage(script, () => response)
    assert.equal(out.result.ok, false); assert.match(out.result.message, /多组/); assert.equal(out.calls.length, 1)
  })
  await check('official captcha and authentication failures stop without calling other endpoints', async () => {
    for (const code of ['RK006', '-200', '429']) {
      const r = runtime(), script = r.load('api/official').buildOfficialLookupScript('0001234567', '11102')
      const out = await officialPage(script, () => ({ code, message: '请在官网完成验证' }))
      assert.equal(out.result.ok, false); assert.equal(out.calls.length, 1)
    }
  })
  await check('a nonofficial or insecure page is never queried', async () => {
    for (const options of [{ hostname: 'example.com' }, { protocol: 'http:' }]) {
      const r = runtime(), script = r.load('api/official').buildOfficialLookupScript('0001234567', '11102')
      const out = await officialPage(script, () => metadataResponse(), options)
      assert.equal(out.started.started, false); assert.equal(out.calls.length, 0)
    }
  })
  await check('the official lookup requires a local website login without exporting a token', async () => {
    const r = runtime(), script = r.load('api/official').buildOfficialLookupScript('0001234567', '11102')
    const out = await officialPage(script, () => metadataResponse(), { token: '' })
    assert.equal(out.started.started, false); assert.equal(out.calls.length, 0)
    assert.match(out.started.message, /本人登录/)
  })
  await check('official errors redact long account identifiers and credential-like strings', async () => {
    const r = runtime(), script = r.load('api/official').buildOfficialLookupScript('0001234567', '11102')
    const out = await officialPage(script, () => ({ code: 'RK006', message: '0001234567 abcdefghijklmnopqrstuvwxyz123456 需要验证' }))
    assert.doesNotMatch(out.result.message, /0001234567|abcdefghijklmnopqrstuvwxyz/)
  })
  await check('native official-page metadata is validated again at the boundary', () => {
    const { validateOfficialAccount } = runtime().load('api/official')
    const good = { ...account(), token: 'do-not-copy', name: 'do-not-copy' }
    const sanitized = validateOfficialAccount(good, '0001234567', '11102')
    assert.equal(sanitized.name, ''); assert.equal(sanitized.token, undefined)
    for (const patch of [{ src: '0007654321' }, { pro: '32101' }, { org: '' }, { org: 'not-a-code' }]) {
      assert.throws(() => validateOfficialAccount({ ...good, ...patch }, '0001234567', '11102'), /不匹配/)
    }
  })
  await check('official acquisition stores metadata, preserves encrypted identifiers and invalidates old queries', async () => {
    const r = runtime(), { store, p, key } = configure(r)
    store.saveCache({ sourceKey: key }); store.saveResolution({ sourceKey: key, account: account(), savedAt: 1 })
    const next = await r.load('api/official').syncOfficialMetadata(p, async () => ({ ...account(), org: '1110209', elec: '02' }))
    assert.equal(next.orgNo, '1110209'); assert.equal(next.elecType, '02'); assert.ok(next.metadataRevision > 0)
    assert.notEqual(r.load('accounts').sourceKey(next), key)
    assert.equal(store.loadMetadata().account.consNo, 'encrypted-fixture')
    assert.equal(store.loadCache(), null); assert.equal(store.loadResolution(), null)
  })
  await check('switching households clears auto-imported fields while retaining explicit overrides', () => {
    const r = runtime(), { clearImportedFields } = r.load('accounts'), p = manual(r)
    const patch = clearImportedFields(p, { consNo: '0007654321' }, account())
    assert.equal(patch.orgNo, ''); assert.equal(patch.elecType, '')
    const override = clearImportedFields({ ...p, orgNo: '1110999', elecType: '05' }, { consNo: '0007654321' }, account())
    assert.equal(override.orgNo, undefined); assert.equal(override.elecType, undefined)
    assert.equal(clearImportedFields(p, { barCount: 3 }, account()).orgNo, undefined)
  })
  await check('configuration changes while the official page is open prevent metadata from being saved', async () => {
    const r = runtime(), { store, p } = configure(r)
    await assert.rejects(r.load('api/official').syncOfficialMetadata(p, async () => {
      store.savePreference({ ...p, consNo: '0007654321' }); return account()
    }), /配置已改变/)
    assert.equal(store.loadMetadata(), null)
  })
  await check('imported official metadata supplies orgNo and the encrypted household ID to the balance query', async () => {
    const r = runtime(), { store, p } = configure(r), vendor = mockSession(r), calls = []
    const selected = { ...p, orgNo: '', elecType: '' }; store.savePreference(selected)
    await r.load('api/official').syncOfficialMetadata(selected, async () => ({ ...account(), org: '1110209' }))
    vendor.SgApp.prototype.authed = async (endpoint, payload) => {
      calls.push(payload.data.list[0]); return { list: [{ consNoSrc: p.consNo, consType: '1', sumMoney: 6 }] }
    }
    const result = await r.load('api/client').getData({ force: true, discover: true })
    assert.equal(calls.length, 1); assert.equal(calls[0].orgNo, '1110209'); assert.equal(calls[0].consNo, 'encrypted-fixture')
    assert.equal(result.list[0].eleBill.sumMoney, 6)
  })
  await check('the native official WebView uses the official origin, disposes and exports no cookies', async () => {
    const r = runtime(), p = manual(r); let disposed = false
    r.context.WebViewController = class {
      constructor(options) { assert.equal(options.ephemeral, true) }
      setCustomUserAgent() { return true }
      async loadURL(url) { assert.equal(new URL(url).hostname, 'www.95598.cn'); return true }
      async present() {}
      async evaluateJavaScript(script) { return script.includes('var input =') ? { started: true } : { ok: true, account: account() } }
      dispose() { disposed = true }
    }
    const out = await r.load('api/official').readOfficialMetadata(p)
    assert.equal(out.org, account().org); assert.equal(disposed, true)
  })
  await check('a failed native official lookup still disposes the isolated WebView', async () => {
    const r = runtime(); let disposed = false
    r.context.WebViewController = class {
      setCustomUserAgent() { return true }
      async loadURL() { return true }
      async present() {}
      async evaluateJavaScript() { return { started: false, message: '请先在官网登录' } }
      dispose() { disposed = true }
    }
    await assert.rejects(r.load('api/official').readOfficialMetadata(manual(r)), /官网登录/)
    assert.equal(disposed, true)
  })
  for (const family of ['systemSmall', 'systemMedium', 'accessoryRectangular', 'accessoryCircular', 'accessoryInline']) {
    await check(`renders balance-only data without invented usage totals (${family})`, async () => {
      const r = runtime(), { store, key } = configure(r)
      store.saveCache({ sourceKey: key, fetchedAt: Date.now(), list: [balanceItem()], warnings: [] })
      r.widget.family = family; r.load('widget.tsx'); await new Promise(setImmediate)
      const text = textOf(r.widget.output)
      assert.match(text, /23\.50/); assert.doesNotMatch(text, /年度.*0|第.*梯度/)
    })
  }
  await check('the settings screen offers named regions and scenes with optional metadata', () => {
    const r = runtime(), tree = r.load('views/Settings.tsx').Settings(), text = textOf(tree)
    assert.match(text, /江苏/); assert.match(text, /住宅/); assert.match(text, /新能源/)
    assert.match(text, /从官网获取供电单位/); assert.match(text, /自动识别并查询/)
    assert.doesNotMatch(text, /原查询返回的省份代码|orgNo|constType/)
  })
  process.stdout.write(`Passed ${checks} offline checks; no real State Grid account or endpoint was used.\n`)
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
