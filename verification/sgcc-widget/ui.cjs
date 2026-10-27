const assert = require('node:assert/strict')

module.exports = async ({ check, runtime, configure, textOf }) => {
  const sample = () => ({ moneyKind: 'meter_balance', amountAsOf: '2026年1月2日 08:09:10',
    availability: { balance: true, daily: false, monthly: false },
    userInfo: { consNo: '0001234567', consNo_dst: '0001234567' }, eleBill: { sumMoney: 128.56 } })
  function all(node) {
    if (!node || typeof node !== 'object') return []
    return [node, ...(Array.isArray(node) ? node : node.children ?? []).flatMap(all)]
  }
  await check('display dates retain the upstream calendar day and use a clearly named refresh fallback', () => {
    const { amountDate, amountDateLabel } = runtime().load('presentation')
    for (const source of ['2026年1月2日 08:09:10','2026-01-02 08:09:10','2026-01-02T08:09:10+08:00','2026/1/2']) {
      assert.equal(amountDate(source), '2026年1月2日')
      assert.equal(amountDateLabel(source, 1), '截至 2026年1月2日')
    }
    for (const source of [undefined,'','2026-02-30','2026-13-1','2026-01-023','not-a-date']) assert.equal(amountDate(source), null)
    assert.match(amountDateLabel('', new Date(2026,0,2).getTime()), /^更新于 2026年1月2日$/)
  })
  await check('only the obsolete amount-only information notice is filtered while real warnings remain', () => {
    const { LEGACY_PAYMENT_SCOPE_NOTE, visibleWarnings } = runtime().load('presentation')
    const warnings = [LEGACY_PAYMENT_SCOPE_NOTE, '网络失败，部分户号未更新', '用电明细查询失败']
    assert.deepEqual(Array.from(visibleWarnings(warnings)), warnings.slice(1))
    assert.equal(warnings.length, 3)
  })
  await check('the balance widget removes old informational alerts and clearly marks actual cached fallback', async () => {
    for (const state of ['fresh','cache','warning']) {
      const r = runtime(), { store, key } = configure(r), { LEGACY_PAYMENT_SCOPE_NOTE } = r.load('presentation')
      const cached = { sourceKey: key, fetchedAt: Date.now(), list: [sample()], warnings: [LEGACY_PAYMENT_SCOPE_NOTE],
        ...(state === 'cache' ? { error: 'network timeout' } : {}) }
      if (state === 'warning') cached.warnings.push('另一个户号查询失败')
      store.saveCache(cached)
      r.load('api/client').getData = async () => cached
      r.load('widget.tsx'); await new Promise(setImmediate)
      const text = textOf(r.widget.output)
      assert.match(text, /128\.56/); assert.match(text, /表内余额/); assert.match(text, /截至 2026年1月2日/)
      assert.doesNotMatch(text, /未提供用电明细|只返回金额|08:09:10/)
      if (state === 'fresh') assert.doesNotMatch(text, /缓存|提示/)
      if (state === 'cache') assert.match(text, /缓存/)
      if (state === 'warning') { assert.match(text, /提示/); assert.doesNotMatch(text, /缓存/) }
    }
  })
  await check('settings immediately shows only the cache belonging to the configured household', () => {
    for (const matching of [false,true]) {
      const r = runtime(), { store, key } = configure(r)
      store.saveCache({ sourceKey: matching ? key : 'different-household', fetchedAt: Date.now(), list: [sample()], warnings: [] })
      const text = textOf(r.load('views/Settings.tsx').Settings())
      assert.equal(text.includes('128.56'), matching)
    }
  })
  await check('successful amount refresh is silent while genuine cached errors or warnings remain visible', async () => {
    for (const state of ['success','warning','cache']) {
      const r = runtime(), { key } = configure(r), alerts = []
      const { LEGACY_PAYMENT_SCOPE_NOTE } = r.load('presentation')
      r.context.Dialog.alert = async (options) => alerts.push(options)
      const data = { sourceKey: key, fetchedAt: Date.now(), list: [sample()], warnings: [LEGACY_PAYMENT_SCOPE_NOTE],
        ...(state === 'cache' ? { error: 'network timeout' } : {}) }
      if (state === 'warning') data.warnings.push('其他户号查询失败')
      r.load('api/client').getData = async () => data
      const tree = r.load('views/Settings.tsx').Settings()
      const refresh = all(tree).find((node) => node.type === 'Button' && textOf(node).replace(/\s+/g,' ').trim() === '刷新余额')
      assert.ok(refresh); await refresh.props.action()
      assert.equal(alerts.length, state === 'success' ? 0 : 1)
      if (state === 'cache') assert.equal(alerts[0].message, 'network timeout')
      if (state === 'warning') assert.equal(alerts[0].message, '其他户号查询失败')
      assert.ok(r.stateWrites.some((value) => value?.list?.[0]?.eleBill?.sumMoney === 128.56))
    }
  })
}
