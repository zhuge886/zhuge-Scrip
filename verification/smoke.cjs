// Fault-injection checks for the JS layer. This does not emulate SwiftUI/iOS.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../battery-widget')

function runtime(options = {}) {
  const cache = new Map(), states = new Map(), effects = [], cleanups = [], logs = [], frames = []
  let current = '', cursor = 0, dirty = false, scans = 0, exits = 0, mounted = new Set()
  const listeners = new Map(), data = new Map(Object.entries(options.storage || {}))
  const h = (type, props, ...children) => ({ type, props: { ...props, children } })
  const api = Object.fromEntries(['Text','VStack','HStack','ZStack','List','Section','NavigationStack','Button','Toggle','Stepper','Spacer','Image','Circle'].map(n => [n, n]))
  Object.assign(api, {
    useState(initial) {
      // Use the concrete-value contract; lazy initializers deliberately remain functions.
      const values = states.get(current) || []; states.set(current, values)
      const index = cursor++
      if (!(index in values)) values[index] = initial
      return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; dirty = true }]
    },
    useEffect(effect) { const key = current + ':' + cursor++; if (!mounted.has(key)) { mounted.add(key); effects.push(effect) } },
    Script: { queryParameters: options.stage === undefined ? {} : { stage: options.stage }, hasFullAccess() { if (options.proThrows) throw Error('entitlement unavailable'); return options.pro !== false }, exit() { exits++ } },
    Navigation: { useDismiss: () => () => {}, present({ element }) { frames.push(element); return new Promise(() => {}) } },
    Device: {
      get batteryLevel() { if (options.levelThrows) throw Error('level unavailable'); return options.level ?? 0.73 },
      get batteryState() { if (options.chargeThrows) throw Error('state unavailable'); return 'charging' },
      get isiPad() { return false },
      addBatteryLevelListener(cb) { if (options.listenerThrows) throw Error('level listener unavailable'); listeners.set('level', cb) },
      addBatteryStateListener(cb) { if (options.listenerThrows) throw Error('state listener unavailable'); listeners.set('state', cb) },
      removeBatteryLevelListener() { listeners.delete('level') }, removeBatteryStateListener() { listeners.delete('state') },
    },
    Storage: { get(key) { if (options.storageThrows) throw Error('storage unavailable'); return data.get(key) ?? null }, set(key, value) { if (options.writeThrows) throw Error('write unavailable'); data.set(key, value); return options.writeFalse ? false : true } },
    Widget: { family: 'systemMedium', present(node) { frames.push(node) }, reloadAll() {}, async preview() { if (options.previewThrows) throw Error('preview unavailable') } },
    AppIntentManager: { register: o => o.perform }, AppIntentProtocol: { AppIntent: 'AppIntent' },
  })
  Object.defineProperty(api, 'BluetoothCentralManager', { get() {
    if (options.bleImportThrows) throw Error('BLE module unavailable')
    return {
      async retrieveConnectedPeripherals() { scans++; if (options.scanThrows) throw Error('Bluetooth denied'); return options.peripherals || [] },
      async connect() {}, async disconnect() {},
    }
  } })
  function load(name) {
    const base = name.replace(/\.(tsx|ts)$/, '')
    if (base === 'dashboard' && options.dashboardImportThrows) throw Error('dashboard unavailable')
    if (cache.has(base)) return cache.get(base).exports
    const filename = ['.ts','.tsx'].map(ext => path.join(root, base + ext)).find(fs.existsSync)
    assert(filename, `Missing module ${name}`)
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: '__h' } }).outputText
    const module = { exports: {} }; cache.set(base, module)
    const requireLocal = id => id === 'scripting' ? api : load(id.replace(/^\.\//, ''))
    const context = { require: requireLocal, exports: module.exports, module, __h: h, console: { error: (...a) => logs.push(a.join(' ')), log() {} }, setTimeout, clearTimeout }
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
  return { api, h, load, settle, nodes, text, frames, logs, cache, listeners, cleanups, get scans() { return scans }, get exits() { return exits } }
}

async function main() {
  let checks = 0
  const check = () => { checks++ }
  // Stage 0 executes only the official minimal shell; no local dependency loads.
  {
    const r = runtime({ stage: 0, storageThrows: true, levelThrows: true, bleImportThrows: true })
    r.load('index'); const view = await r.settle(r.frames[0])
    assert.match(r.text(view), /Hello Scripting!/)
    assert.equal(r.cache.size, 1); assert.equal(r.scans, 0); check()
  }
  // Restore stages in order, verifying concrete states and actual phone output.
  for (let stage = 1; stage <= 6; stage++) {
    const r = runtime({ stage })
    r.load('index'); const view = await r.settle(r.frames[0])
    assert.match(r.text(view), /Battery|iPhone|Preview/)
    if (stage >= 2) assert.match(r.text(view), /73%.*charging/)
    assert.equal(r.scans, 0); assert(!r.cache.has('bluetooth'))
    assert.equal(r.listeners.size, stage >= 5 ? 2 : 0)
    r.cleanups.forEach(f => f()); assert.equal(r.listeners.size, 0); check()
  }
  // Storage, listeners, entitlement and BLE module failures cannot hide phone status.
  for (const options of [{ storageThrows: true }, { listenerThrows: true }, { pro: false }, { proThrows: true }, { bleImportThrows: true }, { dashboardImportThrows: true }, { storage: { 'battery.snapshot.v1': { version: 1, builtAt: 1, items: [null, {}] }, 'battery.settings.v1': { maxItems: 'bad', enableBle: null } } }]) {
    const r = runtime(options); r.load('index'); const view = await r.settle(r.frames[0])
    assert.match(r.text(view), /73%.*charging/); assert.equal(r.scans, 0)
    if (options.pro === false || options.proThrows) {
      const scan = r.nodes(view).find(n => n.type === 'Button' && /Scan/.test(n.props.title))
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
    const scan = r.nodes(view).find(n => n.type === 'Button' && /Scan/.test(n.props.title))
    await scan.props.action(); view = await r.settle(r.frames[0])
    assert.match(r.text(view), /73%.*charging/)
    const sections = r.nodes(view).filter(n => n.type === 'Section')
    const footer = sections.map(s => s.props.footer).filter(Boolean).map(r.text).join('\n')
    if (options.scanThrows || options.bleImportThrows) assert.match(footer, /Scan failed/)
    else assert.match(footer, /Done\. 0 device/)
    assert.equal(r.scans, options.bleImportThrows ? 0 : 1); check()
  }
  // Storage writes returning false are diagnosed, with an in-memory snapshot retained.
  {
    const r = runtime({ writeFalse: true }); const snap = r.load('store').saveSnapshot([])
    assert.equal(snap.items.length, 0); assert.match(r.logs.join('\n'), /Could not save/); check()
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
    assert.match(r.text(view), /73%.*charging/)
    assert.match(r.logs.join('\n'), /injected failure/); check()
  }
  // Grid failure has a separate widget fallback, independent of the app bootstrap.
  {
    const r = runtime(); r.load('grid').BatteryGrid = () => { throw Error('grid unavailable') }
    r.load('widget'); await new Promise(resolve => setImmediate(resolve)); const view = await r.settle(r.frames[0])
    assert.match(r.text(view), /73%.*charging/); assert.match(r.text(view), /Widget error/); check()
  }
  // A real standard-service result is parsed without changing local phone state.
  {
    const service = { uuid: '180F', characteristics: [{ uuid: '2A19', properties: ['read'] }] }
    const peripheral = { id: 'test-device', name: 'BLE Keyboard', services: [service],
      async discoverServices() {}, async discoverCharacteristics() {}, async readValue() { return { toIntArray: () => [88] } } }
    const r = runtime({ peripherals: [peripheral] })
    r.load('index'); let view = await r.settle(r.frames[0])
    await r.nodes(view).find(n => n.type === 'Button' && /Scan/.test(n.props.title)).props.action()
    view = await r.settle(r.frames[0]); assert.match(r.text(view), /88%/); assert.match(r.text(view), /73%.*charging/)
    assert.equal(r.scans, 1); check()
  }
  // Device listener refresh continues after the initial view is presented.
  {
    const r = runtime(); r.load('index'); await r.settle(r.frames[0])
    Object.defineProperty(r.api.Device, 'batteryLevel', { value: 0.42 })
    r.listeners.get('level')(0.42)
    const view = await r.settle(r.frames[0]); assert.match(r.text(view), /42%.*charging/); check()
  }
  // Installer includes the complete local dependency closure of both entry points.
  const installer = fs.readFileSync(path.resolve(root, '../install.tsx'), 'utf8')
  for (const [name] of runtimeFiles()) assert(installer.includes(`"${name}"`), `Installer omits ${name}`)
  check()
  console.log(`PASS: ${checks} JS fault-injection / staged-render checks (not native iOS rendering).`)
}
function runtimeFiles() { return fs.readdirSync(root).filter(n => /\.(ts|tsx)$/.test(n)).map(n => [n]) }
main().catch(error => { console.error(error); process.exitCode = 1 })
