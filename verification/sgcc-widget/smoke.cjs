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
    setTimeout: () => 1, clearTimeout() {},
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
  return { load, storage, keychain, widget }
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
  return (Array.isArray(node) ? node : [node.props?.header, node.props?.footer, node.props?.label,
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
  await check('missing routing metadata is explicit and never fabricated', () => {
    const r = runtime(), p = manual(r); p.orgNo = ''
    assert.throws(() => r.load('accounts').selectAccounts(p, []), /不能仅凭户号/)
    assert.throws(() => r.load('accounts').selectAccounts(fixture(r), []), /数字代码/)
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
      { queryMode: 'bound' }, { queryScope: 'full' }, { orgNo: '1110202' }, { elecType: '04' }]) {
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
    for (const response of [{ list: [] }, { list: [{}] }, { list: [{ sumMoney: '' }] }]) {
      await assert.rejects(query({ sess: {}, authed: async () => response }, account(), { scope: 'balance' }), /未返回/)
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
    const result = await r.load('api/client').getData({ force: true })
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
    const cached = await r.load('api/client').getData({ force: true })
    assert.ok(cached.error); assert.equal(cached.fetchedAt, 1)
    store.savePreference({ ...p, consNo: '0007654321' })
    await assert.rejects(r.load('api/client').getData({ force: true }), /测试网络失败/)
  })
  await check('a configuration change during a request cannot overwrite another household cache', async () => {
    const r = runtime(), { store, p, key } = configure(r), vendor = mockSession(r)
    const sentinel = { sourceKey: 'new-household', fetchedAt: 9, list: [], warnings: [] }
    vendor.SgApp.prototype.authed = async () => {
      store.savePreference({ ...p, consNo: '0007654321' }); store.saveCache(sentinel)
      return { list: [{ consType: '1', sumMoney: 5 }] }
    }
    const result = await r.load('api/client').getData({ force: true })
    assert.equal(result.sourceKey, key); assert.equal(store.loadCache(), sentinel)
  })
  await check('password changes invalidate cached data and use the isolated keychain prefix', () => {
    const r = runtime(), { store } = configure(r)
    store.saveCache({ sourceKey: 'old' }); store.setPassword('new-test-only-password')
    assert.equal(store.loadCache(), null)
    assert.ok(r.keychain.has('zhuge.sgcc.password')); assert.equal(r.keychain.has('sgcc.password'), false)
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
  await check('the settings screen explains the unverified manual-query requirements', () => {
    const r = runtime(), tree = r.load('views/Settings.tsx').Settings(), text = textOf(tree)
    assert.match(text, /待验证/); assert.match(text, /不能仅填户号查询/)
  })
  process.stdout.write(`Passed ${checks} offline checks; no real State Grid account or endpoint was used.\n`)
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
