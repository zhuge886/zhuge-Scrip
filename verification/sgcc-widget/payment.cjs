const assert = require('node:assert/strict')

module.exports = async ({ check, runtime, configure, mockSession, account, textOf }) => {
  function response(patch = {}, code = 'MCA00000') {
    return { code: 0, message: '处理成功', data: { common: { repcd: code, repmsg: '处理成功' }, data: {
      POWER_USER_ID: '0001234567', PROVINCE_CODE: '11102', POWER_USER_TYPE: '01',
      PROMPT_STATUS: '0', AVALIABLE_BALANCE: '12345', TOTAL_PAY_BREACH: '0', LOCAL_RCV_FLAG: '0',
      POWER_COMPANY_CODE: '11401', POWER_COMPANY_NM: '城区供电公司',
      SENSITIVE_POWER_USER_ID: 'opaque-payment-id', POWER_USER_NAME: 'do-not-cache-name',
      POWER_USER_ADDR: 'do-not-cache-address', ...patch }
    } }
  }
  function setup(r, patch = {}, bound = []) {
    const { store, p } = configure(r)
    const pref = { ...p, queryChannel: 'auto', ...patch }
    store.savePreference(pref)
    const vendor = mockSession(r, bound), calls = []
    vendor.SgApp.prototype.authed = async (path, payload) => { calls.push({ path, payload: typeof payload === 'function' ? payload() : payload }); return response() }
    return { store, pref, vendor, calls, key: r.load('accounts').sourceKey(pref) }
  }
  await check('old preferences migrate to automatic routing and invalidate the old source key', () => {
    const r = runtime(), store = r.load('store')
    store.savePreference({ phone: '13800000000', consNo: '0001234567', provinceCode: '11102', orgNo: '11401' })
    assert.equal(store.loadPreference().queryChannel, 'auto')
    assert.match(r.load('accounts').sourceKey(store.loadPreference()), /sgcc-manual-v5/)
    assert.notEqual(r.load('accounts').sourceKey(store.loadPreference()), r.load('accounts').sourceKey({ ...store.loadPreference(), queryChannel: 'balance' }))
  })
  await check('payment selection ignores obsolete company/scene fields and preserves the typed household', () => {
    const r = runtime(), { pref } = setup(r, { orgNo: 'obsolete-field', elecType: 'obsolete-scene' })
    const a = r.load('accounts').selectAccounts(pref, [], { ...account(), consNo: 'old-encrypted-bound-id' })[0]
    assert.equal(a.consNo, pref.consNo); assert.equal(a.src, pref.consNo); assert.equal(a.org, ''); assert.equal(a.elec, '')
  })
  await check('payment refresh uses the SDK nested envelope with only the selected household and province', () => {
    const p = runtime().load('api/payment'), payload = p.paymentPayload(account(), 'fixture-session-token', 123456)
    assert.equal(p.PAYMENT_QUERY_PATH, 'emss-eaa-payelec-front/member/p1/f04')
    assert.equal(payload.serviceCode, 'f05'); assert.equal(payload.source, 'undefined'); assert.equal(payload.target, 'undefined')
    assert.equal(payload.data.common.TOKEN, 'fixture-session-token'); assert.equal(payload.data.common.channelPlat, 'QD0102')
    assert.equal(payload.data.common.timestamp, '123456')
    assert.deepEqual(JSON.parse(JSON.stringify(payload.data.data)), { TYPE: '3', PROVINCE_CODE: '11102', POWER_USER_ID: '0001234567', SENSITIVE_POWER_USER_ID: '', TOKEN: 'fixture-session-token' })
    assert.doesNotMatch(JSON.stringify(payload), /ADD_TYPE|orgNo|sceneType|encrypted-fixture/)
  })
  await check('payment requests require a session without logging it or accepting masked target numbers', () => {
    const p = runtime().load('api/payment')
    assert.throws(() => p.paymentPayload(account(), ''), (e) => e.code === 'auth')
    assert.throws(() => p.paymentPayload({ ...account(), src: '000***4567' }, 'fixture'), /完整户号/)
  })
  await check('integer fen is converted exactly once, including real zero and negative balance', () => {
    const p = runtime().load('api/payment')
    for (const [input, expected] of [['12345',123.45], ['0',0], [0,0], ['-250',-2.5], ['100.00',1]]) assert.equal(p.fenToYuan(input), expected)
    for (const input of ['', null, undefined, '23.50', '1e4', '***', {}, true, Infinity, '9007199254740992']) assert.equal(p.fenToYuan(input), null)
  })
  await check('prepaid payment balance matches the SDK amount field and strips personal details', () => {
    const r = runtime(), raw = r.load('api/payment').parsePaymentBalance(response(), account())
    const display = r.load('data').normalize(raw)
    assert.equal(raw.householdVerified, true); assert.equal(display.balance, '123.45'); assert.equal(display.balanceLabel, '电费余额')
    assert.equal(raw.resolvedAccount.paymentId, 'opaque-payment-id'); assert.equal(raw.resolvedAccount.org, '11401')
    assert.equal(display.availability.daily, false); assert.equal(display.availability.monthly, false)
    assert.doesNotMatch(JSON.stringify(raw), /do-not-cache|POWER_USER_NAME|POWER_USER_ADDR|TOKEN/)
  })
  await check('meter balance keeps its distinct label and the upstream timestamp', () => {
    const r = runtime(), raw = r.load('api/payment').parsePaymentBalance(response({ LOCAL_RCV_FLAG: '1', DEADLINE_TIME: '2026-01-02 08:00:00' }), account())
    const display = r.load('data').normalize(raw)
    assert.equal(display.balance, '123.45'); assert.equal(display.balanceLabel, '表内余额'); assert.equal(display.amountAsOf, '2026-01-02 08:00:00')
  })
  await check('postpaid payment uses the due amount rather than presenting it as account balance', () => {
    const r = runtime(), raw = r.load('api/payment').parsePaymentBalance(response({ POWER_USER_TYPE: '00', TOTAL_PAY_BREACH: '980', AVALIABLE_BALANCE: '70000' }), account())
    const display = r.load('data').normalize(raw)
    assert.equal(display.balance, '9.80'); assert.equal(display.balanceLabel, '应缴电费'); assert.equal(display.arrearsOfFees, false)
    assert.equal(raw.eleBill.accountBalance, undefined)
  })
  await check('missing/masked amounts and unknown billing types are rejected instead of guessed from other fields', () => {
    const { parsePaymentBalance } = runtime().load('api/payment')
    for (const patch of [{ AVALIABLE_BALANCE: '' }, { AVALIABLE_BALANCE: undefined, BALANCE: '300' }, { AVALIABLE_BALANCE: '***' },
      { POWER_USER_TYPE: '00', TOTAL_PAY_BREACH: '' }, { POWER_USER_TYPE: 'unknown' }]) {
      assert.throws(() => parsePaymentBalance(response(patch), account()), /金额|计费方式/)
    }
    assert.equal(parsePaymentBalance(response({ AVALIABLE_BALANCE: '0' }), account()).eleBill.sumMoney, 0)
  })
  await check('exact household and province checks reject other, masked or absent identities', () => {
    const { parsePaymentBalance } = runtime().load('api/payment')
    for (const patch of [{ POWER_USER_ID: '0007654321' }, { POWER_USER_ID: '000***4567' }, { POWER_USER_ID: '' }, { PROVINCE_CODE: '32101' }, { PROVINCE_CODE: '' }]) {
      assert.throws(() => parsePaymentBalance(response(patch), account()), (e) => e.code === 'identity_mismatch')
    }
  })
  await check('payment verification and confirmation states never expose the numeric fields they accompany', () => {
    const { parsePaymentBalance } = runtime().load('api/payment')
    for (const patch of [{ IS_REAL_NAME_DISPLAY: '1' }, { PROMPT_STATUS: '1' }, { PROMPT_STATUS: '2' }, { PROMPT_STATUS: '' }, { PROMPT_STATUS: 'new-state' }]) {
      assert.throws(() => parsePaymentBalance(response(patch), account()), (e) => e.code === 'payment_verification')
    }
  })
  await check('business errors and incomplete envelopes are rejected even when money is present', () => {
    const { parsePaymentBalance } = runtime().load('api/payment')
    assert.throws(() => parsePaymentBalance(response({}, 'AUTH_EXPIRED'), account()), (e) => e.code === 'payment_AUTH_EXPIRED')
    for (const value of [null, {}, { data: response().data }, { common: {} }, { code: 0, data: { common: { repcd: 'MCA00000' }, data: [response().data.data] } }]) {
      assert.throws(() => parsePaymentBalance(value, account()), /状态|资料|结构/)
    }
  })
  await check('ObjectApiResponse success uses the payment SDK status rather than the old balance checker', () => {
    const r = runtime(), { parsePaymentBalance } = r.load('api/payment')
    assert.equal(parsePaymentBalance(response(), account()).eleBill.sumMoney, 123.45)
    assert.equal(parsePaymentBalance(response({}, ''), account()).eleBill.sumMoney, 123.45)
    const alternate = response(); alternate.code = 1
    assert.equal(parsePaymentBalance(alternate, account()).eleBill.sumMoney, 123.45)
    for (const value of [response({}, '000000'), response({}, null), { ...response({}, ''), code: 1 }, { ...response(), code: -200 }]) {
      assert.throws(() => parsePaymentBalance(value, account()), /状态|未完成|结构/)
    }
    assert.throws(() => r.load('vendor/sgcc_protocol').SgApp.check(response()))
  })
  await check('payment transport preserves the SDK envelope and rebuilds its body token after login renewal', async () => {
    const r = runtime(), { SgApp } = r.load('vendor/sgcc_protocol'), calls = []
    const app = new SgApp({}, '13800000000', 'test-only-password')
    let session = 0
    app.ensure = async function () { this.sess = { token: `fixture-token-${++session}` }; return this.sess }
    app.post = async (path, payload, options) => {
      calls.push({ path, payload, options })
      return calls.length === 1 ? { code: -200, message: 'expired' } : response()
    }
    const raw = await r.load('api/payment').queryPaymentBalance(app, account())
    assert.equal(raw.eleBill.sumMoney, 123.45); assert.equal(calls.length, 2)
    assert.equal(calls[0].payload.data.data.TOKEN, 'fixture-token-1')
    assert.equal(calls[1].payload.data.data.TOKEN, 'fixture-token-2')
    assert.ok(calls.every((x) => x.options.authed === true && x.path.endsWith('/member/p1/f04')))
  })
  await check('payment query failures preserve the code, redact identifiers and make no fallback payment/action calls', async () => {
    const r = runtime(), calls = [], { queryPaymentBalance } = r.load('api/payment')
    const app = { sess: { token: 'test-token' }, async authed(path) { calls.push(path); throw Object.assign(new Error('0001234567 abcdefghijklmnopqrstuvwxyz123456 需要验证码'), { code: 'RK006' }) } }
    await assert.rejects(queryPaymentBalance(app, account()), (e) => e.code === 'RK006' && !/0001234567|abcdefghijklmnopqrstuvwxyz123456/.test(e.message))
    assert.equal(calls.length, 1); assert.ok(calls.every((path) => path.endsWith('/member/p1/f04')))
  })
  await check('automatic unbound routing uses one payment query, learns the opaque ID and widget reuses it', async () => {
    const r = runtime(), { store, calls } = setup(r)
    const first = await r.load('api/client').getData({ force: true, discover: true })
    assert.equal(calls.length, 1); assert.ok(calls[0].path.endsWith('/member/p1/f04')); assert.match(first.queryInfo, /其他户号交费/)
    assert.equal(store.loadResolution().account.paymentId, 'opaque-payment-id')
    calls.length = 0; store.clearCache()
    const second = await r.load('api/client').getData()
    assert.equal(calls.length, 1); assert.equal(calls[0].payload.data.data.SENSITIVE_POWER_USER_ID, 'opaque-payment-id')
    assert.equal(second.list[0].eleBill.sumMoney, 123.45)
  })
  await check('automatic bound routing retains the existing encrypted account and native detail protocol', async () => {
    const r = runtime(), { calls, vendor } = setup(r, {}, [account()])
    vendor.SgApp.prototype.authed = async (path, payload) => { calls.push({ path, payload }); return { list: [{ consType: '1', sumMoney: 23 }] } }
    await r.load('api/client').getData({ force: true, discover: true })
    assert.equal(calls.length, 1); assert.ok(calls[0].path.includes('emss-bia-balance-front'))
    assert.equal(calls[0].payload.data.list[0].consNo, 'encrypted-fixture')
  })
  await check('explicit payment routing is honored for a bound household as well', async () => {
    const r = runtime(), { calls } = setup(r, { queryChannel: 'payment' }, [account()])
    await r.load('api/client').getData({ force: true, discover: true })
    assert.equal(calls.length, 1); assert.ok(calls[0].path.endsWith('/member/p1/f04'))
  })
  await check('payment queries do not request unavailable daily/monthly detail when full scope is selected', async () => {
    const r = runtime(), { calls } = setup(r, { queryScope: 'full' })
    const out = await r.load('api/client').getData({ force: true, discover: true })
    assert.equal(calls.length, 1); assert.match(out.warnings.join(' '), /只返回金额/)
  })
  await check('changing channel cannot fall back to an old native balance cache', async () => {
    const r = runtime(), { store, pref, vendor } = setup(r)
    const oldKey = r.load('accounts').sourceKey({ ...pref, queryChannel: 'balance' })
    store.saveCache({ sourceKey: oldKey, fetchedAt: 1, list: [{ eleBill: { sumMoney: 999 } }], warnings: [] })
    vendor.SgApp.prototype.authed = async () => { throw Object.assign(new Error('network unavailable'), { code: 'net' }) }
    await assert.rejects(r.load('api/client').getData({ force: true, discover: true }), /network unavailable/)
    assert.equal(store.loadCache().sourceKey, oldKey)
  })
  await check('cancelling or changing the household during a payment request prevents cache and resolution writes', async () => {
    for (const change of [false, true]) {
      const r = runtime(), { store, pref, vendor } = setup(r); let cancelled = false
      vendor.SgApp.prototype.authed = async () => {
        if (change) store.savePreference({ ...pref, consNo: '0007654321' }); else cancelled = true
        return response()
      }
      await assert.rejects(r.load('api/client').getData({ force: true, discover: true, shouldContinue: () => !cancelled }), (e) => e.code === 'cancelled')
      assert.equal(store.loadCache(), null); assert.equal(store.loadResolution(), null)
    }
  })
  await check('legacy unbound errors direct the user to the payment channel without trying thirty companies', async () => {
    const r = runtime(), { vendor, calls } = setup(r, { queryChannel: 'balance', orgNo: '', elecType: '' })
    vendor.SgApp.prototype.authed = async (path) => { calls.push(path); throw new Error('户号未绑定') }
    await assert.rejects(r.load('api/client').getData({ force: true, discover: true }), (e) => e.code === 'bound_channel_required' && /其他户号交费/.test(e.message))
    assert.equal(calls.length, 1)
  })
  await check('observed anonymous gateway errors preserve their actual status and message without requiring common', () => {
    const fixtures = require('./payment-gateway-errors.json')
    const { parsePaymentBalance } = runtime().load('api/payment')
    for (const row of fixtures.observations) assert.throws(() => parsePaymentBalance(row.decryptedResponse, account()), (e) =>
      e.code === 'payment_101001' && /101001/.test(e.message) && /系统/.test(e.message) && !/未返回业务状态/.test(e.message))
  })
  await check('gateway business errors are reported before enforcing the SDK success schema', () => {
    const { parsePaymentBalance } = runtime().load('api/payment')
    assert.throws(() => parsePaymentBalance({ code: 1, data: { srvrt: { resultCode: 'RK006', resultMessage: '需要安全验证' } } }, account()), (e) =>
      e.code === 'payment_gateway_RK006' && /需要安全验证/.test(e.message))
  })
  await check('unknown success-shaped envelopes remain failures with useful server text and diagnostic guidance', () => {
    const { parsePaymentBalance } = runtime().load('api/payment')
    for (const value of [{ code: 0, message: 'upstream-shape-change', data: response().data.data }, { code: 1, data: { srvrt: { resultCode: '0000' }, bizrt: response().data } }]) {
      assert.throws(() => parsePaymentBalance(value, account()), (e) => e.code === 'payment_response' && /复制查询诊断|单户金额资料/.test(e.message))
    }
  })
  await check('diagnostic records fixed field types and status codes without arbitrary keys or personal values', () => {
    const r = runtime(), { paymentDiagnostic } = r.load('api/diagnostics')
    const value = response({ POWER_USER_NAME: 'private-name', POWER_USER_ADDR: 'private-address', TOKEN: 'short-secret' })
    value.message = 'private-name 0001234567 13800000000'; value['private-dynamic-key'] = 'short-secret'
    value.data.bizrt = { TOKEN: 'short-secret' }
    const report = paymentDiagnostic(value, 'error', 'payment_response'), parsed = JSON.parse(report)
    assert.equal(parsed.statuses.top, '0'); assert.equal(parsed.statuses.business, 'MCA00000')
    assert.equal(parsed.statuses.error, 'payment_response'); assert.equal(parsed.schema['data.common'], 'object')
    assert.doesNotMatch(report, /private-name|private-address|private-dynamic-key|0001234567|13800000000|short-secret|opaque-payment-id|12345/)
  })
  await check('diagnostic status filters hide long identifiers, arbitrary objects and token-like codes', () => {
    const { paymentDiagnostic } = runtime().load('api/diagnostics')
    for (const code of ['0001234567', 'abcdefghijklmnopqrstuvwxyz123456', { token: 'secret' }]) {
      const report = paymentDiagnostic({ code, data: { common: { repcd: code } } }, 'error', code)
      assert.doesNotMatch(report, /0001234567|abcdefghijklmnopqrstuvwxyz123456|secret/)
    }
  })
  await check('failed payment calls save a shareable diagnostic while leaving balance and resolution empty', async () => {
    const r = runtime(), { store, vendor } = setup(r)
    vendor.SgApp.prototype.authed = async () => ({ code: 101001, message: '系统正忙 S1001' })
    await assert.rejects(r.load('api/client').getData({ force: true, discover: true }), /101001.*系统正忙/)
    const report = JSON.parse(store.loadQueryDiagnostic())
    assert.equal(report.statuses.top, '101001'); assert.equal(report.statuses.error, 'payment_101001')
    assert.equal(report.schema['root.data'], 'undefined'); assert.equal(report.outcome, 'error')
    assert.equal(store.loadCache(), null); assert.equal(store.loadResolution(), null)
  })
  await check('transport failures produce a safe diagnostic without storing the error text or credentials', async () => {
    const r = runtime(), { store, vendor } = setup(r)
    vendor.SgApp.prototype.authed = async () => { throw Object.assign(new Error('network 13800000000 private-name short-token'), { code: 'net' }) }
    await assert.rejects(r.load('api/client').getData({ force: true, discover: true }))
    const report = store.loadQueryDiagnostic()
    assert.equal(JSON.parse(report).statuses.error, 'net')
    assert.doesNotMatch(report, /13800000000|private-name|short-token|0001234567/)
    store.clearQueryDiagnostic(); assert.equal(store.loadQueryDiagnostic(), '')
  })
  await check('gateway session expiration renews transport and SDK body tokens once', async () => {
    const r = runtime(), { SgApp } = r.load('vendor/sgcc_protocol'), app = new SgApp({}, '13800000000', 'test-only-password')
    let session = 0; const tokens = []
    app.ensure = async function () { this.sess = { token: `fixture-token-${++session}` }; return this.sess }
    app.post = async (path, payload) => {
      tokens.push(payload.data.data.TOKEN)
      return tokens.length === 1 ? { code: 1, data: { srvrt: { resultCode: '-201', resultMessage: 'expired' } } } : response()
    }
    await r.load('api/payment').queryPaymentBalance(app, account())
    assert.deepEqual(tokens, ['fixture-token-1','fixture-token-2'])
    assert.equal(JSON.parse(r.load('store').loadQueryDiagnostic()).outcome, 'success')
  })
  await check('settings copies the stored safe diagnostic through the explicit copy button', async () => {
    const r = runtime(), { store } = setup(r)
    const report = r.load('api/diagnostics').paymentDiagnostic({ code: 101001 }, 'error', 'payment_101001')
    store.saveQueryDiagnostic(report); let copied = ''
    r.context.Pasteboard = { async setString(value) { copied = value } }
    const view = r.load('views/Settings.tsx').Settings()
    function find(node) {
      if (!node || typeof node !== 'object') return null
      if (node.props?.title === '复制查询诊断') return node
      for (const child of Array.isArray(node) ? node : node.children ?? []) { const found = find(child); if (found) return found }
      return null
    }
    const button = find(view); assert.ok(button)
    await button.props.action(); assert.equal(copied, report)
  })
  await check('the observed code-zero/null-common shape accepts verified synthetic money including real zero', () => {
    const r = runtime(), { parsePaymentBalance } = r.load('api/payment')
    for (const [amount, expected] of [['12345',123.45],['0',0]]) {
      const value = response({ AVALIABLE_BALANCE: amount }); value.data.common = null
      const raw = parsePaymentBalance(value, account())
      assert.equal(raw.eleBill.sumMoney, expected); assert.equal(raw.householdVerified, true)
      assert.equal(r.load('data').normalize(raw).balanceLabel, '电费余额')
    }
  })
  await check('omitted common also uses explicit outer zero while the nested success protocol remains valid', () => {
    const { parsePaymentBalance } = runtime().load('api/payment'), value = response()
    delete value.data.common
    assert.equal(parsePaymentBalance(value, account()).eleBill.sumMoney, 123.45)
    value.code = '0'; assert.equal(parsePaymentBalance(value, account()).eleBill.sumMoney, 123.45)
    assert.equal(parsePaymentBalance(response(), account()).eleBill.sumMoney, 123.45)
  })
  await check('absent common cannot authorize a nonzero, missing or malformed outer status', () => {
    const { parsePaymentBalance } = runtime().load('api/payment')
    for (const code of [1,101001,-200,undefined,null,true,{},'']) {
      const value = response(); value.data.common = null; value.code = code
      assert.throws(() => parsePaymentBalance(value, account()))
    }
    for (const common of [{},'MCA00000',[],{ repcd: null },{ repcd: 0 }]) {
      const value = response(); value.data.common = common
      assert.throws(() => parsePaymentBalance(value, account()), (e) => e.code === 'payment_response')
    }
  })
  await check('null common still requires matching identity, clear verification and valid money fields', () => {
    const { parsePaymentBalance } = runtime().load('api/payment')
    for (const [patch,code] of [[{ POWER_USER_ID: '0007654321' },'identity_mismatch'],
      [{ PROVINCE_CODE: '32101' },'identity_mismatch'],[{ POWER_USER_ID: '000***4567' },'identity_mismatch'],
      [{ PROMPT_STATUS: '2' },'payment_verification'],[{ IS_REAL_NAME_DISPLAY: '1' },'payment_verification'],
      [{ AVALIABLE_BALANCE: '' },'empty_balance'],[{ POWER_USER_TYPE: 'unknown' },'payment_response']]) {
      const value = response(patch); value.data.common = null
      assert.throws(() => parsePaymentBalance(value, account()), (e) => e.code === code)
    }
    const error = response({}, 'AUTH_EXPIRED')
    assert.throws(() => parsePaymentBalance(error, account()), (e) => e.code === 'payment_AUTH_EXPIRED')
  })
  await check('automatic manual query saves a null-common response only after matching its complete target', async () => {
    const r = runtime(), { store, vendor, key } = setup(r)
    vendor.SgApp.prototype.authed = async () => { const value = response(); value.data.common = null; return value }
    const out = await r.load('api/client').getData({ force: true, discover: true })
    assert.equal(out.list[0].eleBill.sumMoney, 123.45); assert.equal(store.loadCache().sourceKey, key)
    assert.equal(store.loadResolution().account.src, '0001234567')
    const report = JSON.parse(store.loadQueryDiagnostic())
    assert.equal(report.schema['data.common'], 'null'); assert.equal(report.outcome, 'success')
    assert.equal(report.checks.household, 'match'); assert.equal(report.checks.province, 'match')
  })
  await check('extended row diagnostics expose field types and identity checks without their private values', () => {
    const r = runtime(), { paymentDiagnostic } = r.load('api/diagnostics')
    const value = response({ POWER_USER_NAME: 'private-name', POWER_USER_ADDR: 'private-address' }); value.data.common = null
    const report = paymentDiagnostic(value, 'success', undefined, account()), parsed = JSON.parse(report)
    assert.equal(parsed.version, '1.5.2'); assert.equal(parsed.schema['row.POWER_USER_ID'], 'string')
    assert.equal(parsed.schema['row.AVALIABLE_BALANCE'], 'string'); assert.equal(parsed.checks.billingType, 'prepaid')
    assert.equal(parsed.checks.household, 'match'); assert.equal(parsed.checks.province, 'match')
    assert.equal(parsed.checks.prompt, 'ready')
    assert.doesNotMatch(report, /0001234567|11102|12345|opaque-payment-id|private-name|private-address/)
    const empty = JSON.parse(paymentDiagnostic({ code: 0, data: { common: null, data: {} } }, 'error', 'payment_response', account()))
    assert.equal(empty.checks.household, 'missing'); assert.equal(empty.checks.billingType, 'unknown')
    assert.equal(empty.schema['row.TOTAL_PAY_BREACH'], 'undefined')
  })
  for (const family of ['systemSmall','systemMedium','accessoryRectangular','accessoryCircular','accessoryInline']) {
    await check(`payment amount labels and fen conversion are retained in ${family}`, async () => {
      for (const [patch,label,amount] of [[{},'电费余额','123.45'], [{ LOCAL_RCV_FLAG: '1' },'表内余额','123.45'], [{ POWER_USER_TYPE: '00', TOTAL_PAY_BREACH: '980' },'应缴电费','9.80']]) {
        const r = runtime(), { store, key } = setup(r)
        const raw = r.load('api/payment').parsePaymentBalance(response(patch), account())
        store.saveCache({ sourceKey: key, fetchedAt: Date.now(), list: [raw], warnings: [] })
        r.widget.family = family; r.load('widget.tsx'); await new Promise(setImmediate)
        const text = textOf(r.widget.output)
        assert.ok(text.includes(label), text); assert.ok(text.includes(amount), text)
        assert.doesNotMatch(text, /年度.*0|第.*梯度/)
      }
    })
  }
}
