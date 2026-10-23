// Fault-injection checks for the JS layer. This does not emulate SwiftUI/iOS.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../battery-widget')

function runtime(options = {}) {
  const cache = new Map(), states = new Map(), effects = [], cleanups = [], logs = [], frames = []
  let current = '', cursor = 0, dirty = false, scans = 0, exits = 0, reloads = 0, audioReads = 0, mounted = new Set()
  const listeners = new Map(), data = options.data || new Map(Object.entries(options.storage || {}))
  const h = (type, props, ...children) => ({ type, props: { ...props, children } })
  const api = Object.fromEntries(['Text','VStack','HStack','ZStack','List','Section','NavigationStack','Button','Toggle','Stepper','Spacer','Image','Circle'].map(n => [n, n]))
  Object.assign(api, {
    useState(initial) {
      // 完整宿主声明支持惰性初始化；模拟相同语义。
      const values = states.get(current) || []; states.set(current, values)
      const index = cursor++
      if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial
      return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; dirty = true }]
    },
    useRef(initial) { const values = states.get(current) || []; states.set(current, values); const index = cursor++; if (!(index in values)) values[index] = { current: initial }; return values[index] },
    useEffect(effect) { const key = current + ':' + cursor++; if (!mounted.has(key)) { mounted.add(key); effects.push(effect) } },
    Script: { name: '电量监控', createRunURLScheme: name => 'scripting://run/' + encodeURIComponent(name), queryParameters: options.stage === undefined ? {} : { stage: options.stage }, hasFullAccess() { if (options.proThrows) throw Error('entitlement unavailable'); return options.pro !== false }, exit() { exits++ } },
    Navigation: { useDismiss: () => () => {}, present({ element }) { frames.push(element); return new Promise(() => {}) } },
    Device: {
      get batteryLevel() { if (options.levelThrows) throw Error('level unavailable'); return options.level ?? 0.73 },
      get batteryState() { if (options.chargeThrows) throw Error('state unavailable'); return options.charge || 'charging' },
      get isiPad() { return false },
      addBatteryLevelListener(cb) { if (options.listenerThrows) throw Error('level listener unavailable'); listeners.set('level', cb) },
      addBatteryStateListener(cb) { if (options.listenerThrows) throw Error('state listener unavailable'); listeners.set('state', cb) },
      removeBatteryLevelListener() { listeners.delete('level') }, removeBatteryStateListener() { listeners.delete('state') },
    },
    Storage: { get(key) { if (options.storageThrows) throw Error('storage unavailable'); return data.get(key) ?? null }, set(key, value) { if (options.writeThrows) throw Error('write unavailable'); if (options.writeFalse) return false; data.set(key, value); return true }, remove(key) { data.delete(key) } },
    Widget: { family: options.family || 'systemMedium', displaySize: options.size || { width: 338, height: 158 }, isTransparentBackground: !!options.transparent, present(node) { frames.push(node) }, reloadAll() { reloads++ }, async preview() { if (options.previewThrows) throw Error('preview unavailable') } },
    AppIntentManager: { register: o => o.perform }, AppIntentProtocol: { AppIntent: 'AppIntent' },
  })
  // 宿主全局 API 与模块导出分开，重现截图里的 Storage 导入为 undefined。
  const globals = { Storage: options.storageMissing ? undefined : api.Storage }
  delete api.Storage
  Object.defineProperty(globals, 'BluetoothCentralManager', { enumerable: true, get() {
    if (options.bleImportThrows) throw Error('BLE module unavailable')
    return {
      async retrieveConnectedPeripherals() { scans++; if (options.scanThrows) throw Error('Bluetooth denied'); if (options.hangRetrieve) return new Promise(() => {}); return options.peripherals || [] },
      async connect() {}, async disconnect() {},
    }
  } })
  globals.SharedAudioSession = { get currentRoute() {
    audioReads++
    if (options.audioThrows) throw Error('audio route unavailable')
    return Promise.resolve({ inputs: [], outputs: options.audioOutputs || [] })
  } }
  function load(name) {
    const base = name.replace(/\.(tsx|ts)$/, '')
    if (base === 'dashboard' && options.dashboardImportThrows) throw Error('dashboard unavailable')
    if (cache.has(base)) return cache.get(base).exports
    const filename = ['.ts','.tsx'].map(ext => path.join(root, base + ext)).find(fs.existsSync)
    assert(filename, `Missing module ${name}`)
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: '__h' } }).outputText
    const module = { exports: {} }; cache.set(base, module)
    const requireLocal = id => id === 'scripting' ? api : load(id.replace(/^\.\//, ''))
    const context = { require: requireLocal, exports: module.exports, module, __h: h, console: { error: (...a) => logs.push(a.join(' ')), log() {} }, setTimeout: options.fastTimeout ? (fn, ms) => setTimeout(fn, Math.min(ms, 5)) : setTimeout, clearTimeout, Storage: globals.Storage, SharedAudioSession: globals.SharedAudioSession }
    Object.defineProperty(context, 'BluetoothCentralManager', Object.getOwnPropertyDescriptor(globals, 'BluetoothCentralManager'))
    vm.runInNewContext(code, context, { filename })
    return module.exports
  }
  function render(node, key = 'root') {
    if (node == null) return node
    if (Array.isArray(node)) return node.map((n, i) => render(n, `${key}/${i}`))
    if (typeof node !== 'object') return node
    if (typeof node.type === 'function') {
      current = key + '/' + node.type.name; cursor = 0
      return render(node.type(node.props), key + '/view')
    }
    return { ...node, props: { ...node.props, children: render(node.props.children, key + '/children'), header: render(node.props.header, key + '/header'), footer: render(node.props.footer, key + '/footer') } }
  }
  async function settle(node) {
    let output
    for (let i = 0; i < 12; i++) {
      dirty = false; output = render(node)
      while (effects.length) { const cleanup = effects.shift()(); if (cleanup) cleanups.push(cleanup) }
      await new Promise(resolve => setImmediate(resolve))
      if (!dirty) return output
    }
    throw Error('render did not settle')
  }
  const nodes = node => node == null ? [] : Array.isArray(node) ? node.flatMap(nodes) : typeof node === 'object' ? [node, ...nodes(node.props.children), ...nodes(node.props.header), ...nodes(node.props.footer)] : []
  const text = node => nodes(node).filter(n => n.type === 'Text').map(n => n.props.children.flat(Infinity).join('')).join('\n')
  return { api, globals, data, h, load, settle, nodes, text, frames, logs, cache, listeners, cleanups, get reloads() { return reloads }, get audioReads() { return audioReads }, get scans() { return scans }, get exits() { return exits } }
}

async function main() {
  let checks = 0
  const check = () => { checks++ }
  // Stage 0 executes only the official minimal shell; no local dependency loads.
  {
    const r = runtime({ stage: 0, storageThrows: true, levelThrows: true, bleImportThrows: true })
    r.load('index'); const view = await r.settle(r.frames[0])
    assert.match(r.text(view), /你好，Scripting！/)
    assert(!r.cache.has('battery')); assert(!r.cache.has('store')); assert.equal(r.scans, 0); check()
  }
  // Restore stages in order, verifying concrete states and actual phone output.
  for (let stage = 1; stage <= 6; stage++) {
    const r = runtime({ stage })
    r.load('index'); const view = await r.settle(r.frames[0])
    assert.match(r.text(view), /电量|iPhone|预览/)
    if (stage >= 2) assert.match(r.text(view), /73%.*充电中/)
    assert.equal(r.scans, 0); assert(!r.cache.has('bluetooth'))
    assert.equal(r.listeners.size, stage >= 5 ? 2 : 0)
    r.cleanups.forEach(f => f()); assert.equal(r.listeners.size, 0); check()
  }
  // Storage, listeners, entitlement and BLE module failures cannot hide phone status.
  for (const options of [{ storageThrows: true }, { listenerThrows: true }, { pro: false }, { proThrows: true }, { bleImportThrows: true }, { dashboardImportThrows: true }, { storage: { 'battery.snapshot.v1': { version: 1, builtAt: 1, items: [null, {}] }, 'battery.settings.v1': { maxItems: 'bad', enableBle: null } } }]) {
    const r = runtime(options); r.load('index'); const view = await r.settle(r.frames[0])
    assert.match(r.text(view), /73%.*充电中/); assert.equal(r.scans, 0)
    if (options.pro === false || options.proThrows) {
      const scan = r.nodes(view).find(n => n.type === 'Button' && /读取已连接/.test(n.props.title))
      assert.equal(scan.props.disabled, true); assert.match(r.text(view), /Scripting PRO/)
      await scan.props.action(); assert.equal(r.scans, 0)
    }
    check()
  }
  // Device getters fail independently, including non-finite/unknown levels.
  for (const options of [{ levelThrows: true }, { chargeThrows: true }, { level: NaN }, { level: -1 }]) {
    const r = runtime(options); const phone = r.load('battery').buildPhoneItem()
    if (options.chargeThrows) { assert.equal(phone.level, 0.73); assert.equal(phone.charge, 'unknown') }
    else { assert.equal(phone.level, null); assert.equal(phone.charge, 'charging') }
    check()
  }
  // User action is the first and only trigger for BLE loading; rejection stays visible.
  for (const options of [{}, { scanThrows: true }, { bleImportThrows: true }]) {
    const r = runtime(options); r.load('index'); let view = await r.settle(r.frames[0])
    const scan = r.nodes(view).find(n => n.type === 'Button' && /读取已连接/.test(n.props.title))
    await scan.props.action(); view = await r.settle(r.frames[0])
    assert.match(r.text(view), /73%.*充电中/)
    const sections = r.nodes(view).filter(n => n.type === 'Section')
    const footer = sections.map(s => s.props.footer).filter(Boolean).map(r.text).join('\n')
    if (options.scanThrows || options.bleImportThrows) assert.match(footer, /配件读取失败/)
    else assert.match(footer, /未找到提供标准电池服务/)
    assert.equal(r.scans, options.bleImportThrows ? 0 : 1); check()
  }
  // Storage write failure is reported and leaves the previous saved snapshot intact.
  {
    const r = runtime({ writeFalse: true, storage: { 'battery.snapshot.v1': { version: 1, builtAt: 1, items: [] } } }); assert.throws(() => r.load('store').saveSnapshot([]), /无法保存/);
    r.load('store').saveSettings(r.load('model').DEFAULT_SETTINGS); assert.match(r.logs.join('\n'), /无法保存/); check()
  }
  // The standalone widget never imports the BLE module, including non-PRO/fault cases.
  for (const options of [{ pro: false, bleImportThrows: true }, { storageThrows: true }, { listenerThrows: true }, { levelThrows: true }]) {
    const r = runtime(options); r.load('widget'); await new Promise(resolve => setImmediate(resolve)); const view = await r.settle(r.frames[0])
    assert.match(r.text(view), options.levelThrows ? /--/ : /73%/)
    assert(!r.cache.has('bluetooth')); assert.equal(r.listeners.size, 0); assert.equal(r.scans, 0); check()
  }
  // Pure component / composition failures retain a text-only phone fallback.
  for (const target of ['composeItems', 'DeviceCell']) {
    const r = runtime()
    const module = r.load(target === 'composeItems' ? 'snapshot' : 'ui')
    module[target] = () => { throw Error(target + ' injected failure') }
    r.load('index'); const view = await r.settle(r.frames[0])
    assert.match(r.text(view), /73%.*充电中/)
    assert.match(r.logs.join('\n'), /injected failure/); check()
  }
  // Grid failure has a separate widget fallback, independent of the app bootstrap.
  {
    const r = runtime(); r.load('grid').BatteryGrid = () => { throw Error('grid unavailable') }
    r.load('widget'); await new Promise(resolve => setImmediate(resolve)); const view = await r.settle(r.frames[0])
    assert.match(r.text(view), /73%.*充电中/); assert.match(r.text(view), /配件暂不可用/); check()
  }
  // A real standard-service result is parsed without changing local phone state.
  {
    const service = { uuid: '180F', characteristics: [{ uuid: '2A19', properties: ['read'] }] }
    const peripheral = { id: 'test-device', name: 'BLE Keyboard', services: [service],
      async discoverServices() {}, async discoverCharacteristics() {}, async readValue() { return { toIntArray: () => [88] } } }
    const r = runtime({ peripherals: [peripheral] })
    r.load('index'); let view = await r.settle(r.frames[0])
    await r.nodes(view).find(n => n.type === 'Button' && /读取已连接/.test(n.props.title)).props.action()
    view = await r.settle(r.frames[0]); assert.match(r.text(view), /88%/); assert.match(r.text(view), /73%.*充电中/)
    assert.equal(r.scans, 1); check()
  }
  // Device listener refresh continues after the initial view is presented.
  {
    const r = runtime(); r.load('index'); await r.settle(r.frames[0])
    Object.defineProperty(r.api.Device, 'batteryLevel', { value: 0.42 })
    r.listeners.get('level')(0.42)
    const view = await r.settle(r.frames[0]); assert.match(r.text(view), /42%.*充电中/); check()
  }
  // Regression for the iPhone screenshot: APIs exist globally, not as module exports.
  {
    const r = runtime(); const store = r.load('store'), defaults = r.load('model').DEFAULT_SETTINGS
    assert.equal(r.api.Storage, undefined); assert.equal(r.api.BluetoothCentralManager, undefined)
    assert.equal(store.saveSettings({ ...defaults, showDeviceNames: true }), true)
    assert.equal(store.loadSettings().showDeviceNames, true)
    assert.equal(r.logs.length, 0); check()
  }
  // Even missing/broken global Storage must never push a traceback into the widget.
  for (const options of [{ storageMissing: true }, { storageThrows: true }]) {
    const r = runtime(options); r.load('widget'); await new Promise(resolve => setImmediate(resolve))
    const view = await r.settle(r.frames[0])
    assert.match(r.text(view), /73%/)
    assert(!/TypeError|Storage|undefined|失败|错误/.test(r.text(view)))
    assert(r.logs.length > 0); check()
  }
  // Saved settings affect a separate widget run immediately, without any BLE task.
  {
    const app = runtime(); app.load('index'); let view = await app.settle(app.frames[0])
    const toggle = app.nodes(view).find(n => n.type === 'Toggle' && n.props.title === '显示设备名称')
    toggle.props.onChanged(true)
    assert(app.reloads > 0)
    const widget = runtime({ data: app.data }); widget.load('widget'); await new Promise(resolve => setImmediate(resolve))
    view = await widget.settle(widget.frames[0]); assert.match(widget.text(view), /iPhone/)
    assert.equal(widget.scans, 0); check()
  }
  // Empty rings are empty slots; supported widget sizes stay within content bounds.
  for (const [family, size, expected] of [
    ['systemSmall', { width: 158, height: 158 }, [2, 2]],
    ['systemMedium', { width: 338, height: 158 }, [4, 1]],
    ['systemLarge', { width: 338, height: 354 }, [2, 2]],
    ['accessoryCircular', { width: 76, height: 76 }, [1, 1]],
  ]) {
    const r = runtime({ family, size }); const grid = r.load('grid')
    for (const names of [false, true]) {
      const layout = grid.gridLayout(family, size, names)
      assert.equal(layout.columns, expected[0]); assert.equal(layout.rows, expected[1])
      assert(layout.ringSize * layout.columns + layout.gap * (layout.columns - 1) <= size.width)
      assert(layout.ringSize * layout.rows + layout.gap * (layout.rows - 1) + (names ? 16 * layout.rows : 0) <= size.height)
    }
    r.load('widget'); await new Promise(resolve => setImmediate(resolve)); const view = await r.settle(r.frames[0])
    assert.equal((r.text(view).match(/73%/g) || []).length, 1)
    const circles = r.nodes(view).filter(n => n.type === 'Circle')
    assert.equal(circles.filter(n => n.props.trim != null).length, 1) // Only the real phone fills a ring.
    check()
  }
  // The user's AirPods can appear as a selected audio output, without inventing a battery level.
  for (const options of [
    { audioOutputs: [{ uid: 'pods', portName: 'AirPods Pro', portType: 'bluetoothA2DP' }] },
    { audioOutputs: [] }, { audioThrows: true },
  ]) {
    const r = runtime(options); r.load('index'); let view = await r.settle(r.frames[0])
    assert.equal(r.audioReads, 0)
    const button = r.nodes(view).find(n => n.type === 'Button' && n.props.title === '检查耳机音频输出')
    await button.props.action(); view = await r.settle(r.frames[0])
    assert.equal(r.audioReads, 1); assert.equal(r.scans, 0); assert.match(r.text(view), /73%.*充电中/)
    if (options.audioOutputs?.length) {
      assert.match(r.text(view), /当前耳机输出：AirPods Pro/)
      const route = r.load('store').loadSnapshot().items.find(i => i.id.startsWith('audio-output:'))
      assert.equal(route.level, null); assert.equal(route.name, 'AirPods Pro')
    } else if (!options.audioThrows) assert.match(r.text(view), /这不代表耳机未连接/)
    check()
  }
  // Old cached placeholder toggles apply immediately, without requiring a successful scan.
  {
    const r = runtime(); const { composeItems } = r.load('snapshot'), { DEFAULT_SETTINGS } = r.load('model')
    const phone = r.load('battery').buildPhoneItem()
    const old = { version: 1, builtAt: Date.now(), items: [r.load('snapshot').airpodsPlaceholder()] }
    assert.equal(composeItems(phone, old, DEFAULT_SETTINGS).length, 1)
    const enabled = composeItems(phone, null, { ...DEFAULT_SETTINGS, showAirpodsPlaceholder: true })
    assert.equal(enabled.length, 2); assert.equal(enabled[1].connected, false); assert.equal(enabled[1].level, null); check()
  }
  // Stale unknown-level routes become offline too; duplicate IDs cannot take over the phone.
  {
    const r = runtime(); const { composeItems } = r.load('snapshot'), { DEFAULT_SETTINGS } = r.load('model')
    const phone = r.load('battery').buildPhoneItem()
    const stale = { ...phone, id: 'audio-output:old', kind: 'other', level: null, updatedAt: 1 }
    const snap = { version: 1, builtAt: Date.now(), items: [stale, stale] }
    const items = composeItems(phone, snap, DEFAULT_SETTINGS)
    assert.equal(items.length, 2); assert.equal(items[1].connected, false); assert.equal(items[1].charge, 'unknown')
    assert.equal(composeItems(phone, snap, { ...DEFAULT_SETTINGS, hideOffline: true }).length, 1); check()
  }
  // Rapid double-taps share one read task, and full 128-bit UUIDs are accepted exactly.
  {
    const service = { uuid: '0000180F-0000-1000-8000-00805F9B34FB', characteristics: [{ uuid: '00002A19-0000-1000-8000-00805F9B34FB', properties: ['read'] }] }
    const p = { id: 'kbd', name: '键盘', services: [service], async discoverServices() {}, async discoverCharacteristics() {}, async readValue() { return { toIntArray: () => [88] } } }
    const r = runtime({ peripherals: [p, p] }); r.load('index'); let view = await r.settle(r.frames[0])
    const action = r.nodes(view).find(n => n.type === 'Button' && /读取已连接/.test(n.props.title)).props.action
    await Promise.all([action(), action()]); view = await r.settle(r.frames[0])
    assert.equal(r.scans, 1); assert.match(r.text(view), /88%/); check()
  }
  // Chinese labels/states and no fabricated system battery promises.
  for (const [state, translated] of [['charging', '充电中'], ['unplugged', '未充电'], ['full', '已充满'], ['unknown', '状态未知']]) {
    const r = runtime({ charge: state }); r.load('index'); const view = await r.settle(r.frames[0])
    assert.match(r.text(view), new RegExp(translated))
    assert(!/Diagnostics|Preview|Actions|Settings|unplugged|charging|Last snapshot|never/.test(r.text(view)))
    for (const node of r.nodes(view).filter(n => ['Button','Toggle','Stepper'].includes(n.type))) assert(/[\u3400-\u9fff]/.test(node.props.title))
    check()
  }
  // A hung native retrieval returns a visible failure without hanging the UI.
  {
    const r = runtime({ hangRetrieve: true, fastTimeout: true }); r.load('index'); let view = await r.settle(r.frames[0])
    await r.nodes(view).find(n => n.type === 'Button' && /读取已连接/.test(n.props.title)).props.action()
    view = await r.settle(r.frames[0]); assert.match(r.text(view), /配件读取失败/); assert.match(r.text(view), /73%.*充电中/); check()
  }
  // Invalid characteristic bytes remain unknown, rather than becoming NaN% or a made-up value.
  for (const bad of [NaN, -1, 101, 33.3]) {
    const service = { uuid: '180F', characteristics: [{ uuid: '2A19', properties: ['read'] }] }
    const p = { id: 'bad-byte', name: '测试配件', services: [service], async discoverServices() {}, async discoverCharacteristics() {}, async readValue() { return { toIntArray: () => [bad] } } }
    const r = runtime({ peripherals: [p] }); const result = await r.load('bluetooth').readBleBatteries(r.load('model').DEFAULT_SETTINGS)
    assert.equal(result[0].level, null); check()
  }
  // Intent refresh preserves an existing headphone-route snapshot; phone-only mode never loads BLE.
  {
    const audio = { id: 'audio-output:pods', name: 'AirPods', kind: 'other', symbol: 'airpods', level: null, charge: 'unknown', connected: true, updatedAt: Date.now() }
    const r = runtime(); const defaults = r.load('model').DEFAULT_SETTINGS
    r.load('store').saveSettings({ ...defaults, maxItems: 1 })
    r.load('store').saveSnapshot([audio])
    await r.load('app_intents').RefreshBatteryIntent()
    assert.equal(r.scans, 0); assert(!r.cache.has('bluetooth'))
    assert.equal(r.load('store').loadSnapshot().items[0].id, audio.id); check()
  }
  // Installer includes the complete local dependency closure of both entry points.
  const installer = fs.readFileSync(path.resolve(root, '../install.tsx'), 'utf8')
  for (const [name] of runtimeFiles()) assert(installer.includes(`"${name}"`), `Installer omits ${name}`)
  check()
  console.log(`PASS: ${checks} JS fault-injection / staged-render checks (not native iOS rendering).`)
}
function runtimeFiles() { return fs.readdirSync(root).filter(n => /\.(ts|tsx)$/.test(n)).map(n => [n]) }
main().catch(error => { console.error(error); process.exitCode = 1 })
