'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { createRequire } = require('node:module')
const P = require('../app/parameters.js')
const { writeProfile } = require('../app/runtime.cjs')
const model = (extra = {}) => ({ key: 'route-model', name: 'Test', model: 'test', provider: 'route', contextWindow: 200000, maxTokens: 32768, ...extra })
const settings = (extra = {}) => ({ models: [model()], providers: { route: { apiKeyEnv: 'TEST_KEY', api: 'openai-completions', baseURL: 'https://example.test' } }, defaultModel: 'route-model', workspace: 'D:\\AI\\office-test', dshRoot: 'D:\\deepseek-harness', ...extra })

test('recommendations respect output capability and explain the real compaction threshold', () => {
  assert.deepEqual(P.recommendModel(model()), { contextWindow: 200000, maxTokens: 32768, headroomTokens: 8192, summaryMaxTokens: 8192, thresholdRatio: 0.8, retainRatio: 0.16, compactionRetries: 1, maxOverflowRetries: 1 })
  const small = P.recommendModel(model({ contextWindow: 16384, outputLimit: 2048 }))
  assert.equal(small.maxTokens, 2048)
  assert.ok(small.headroomTokens <= 1024)
  assert.equal(P.recommendModel(model({ detectedLimits: { contextWindow: 100000, outputLimit: 4096 } })).contextWindow, 100000)
  assert.equal(P.recommendModel(model({ detectedLimits: { contextWindow: 100000, outputLimit: 4096 } })).maxTokens, 4096)
  const budget = P.modelBudget(model(), P.DEFAULT_COMPACTION)
  assert.equal(budget.thresholdTokens, 159040)
  assert.equal(budget.thresholdRatio, 0.7952)
  assert.equal(budget.retainTokens, 26757)
  assert.equal(budget.limitedByOutput, true)
})

test('invalid budgets and detected capability overclaims are rejected before persistence', () => {
  for (const maxTokens of [-1, 0.5, NaN, '32768', 200000]) assert.throws(() => P.validateModel(model({ maxTokens })))
  assert.throws(() => P.validateModel(model({ contextWindow: 200000.5 })), /正整数/)
  assert.throws(() => P.validateModel(model({ outputLimit: 8192 })), /模型能力/)
  assert.throws(() => P.validateModel(model({ detectedLimits: { contextWindow: 100000 } })), /检测到/)
  assert.throws(() => P.validateSettings(settings({ compaction: { headroomTokens: 180000 } })), /耗尽/)
  assert.throws(() => P.validateSettings(settings({ compaction: { retainRatio: 0.8 } })), /保留比例/)
  assert.throws(() => P.validateSettings(settings({ compaction: { maxTokens: 16384 }, models: [model({ outputLimit: 32768, maxTokens: 8192, detectedLimits: { contextWindow: 200000, outputLimit: 8192 } })] })), /摘要上限|模型能力/)
  assert.throws(() => P.normalizeCompaction({ maxOverflowRetries: -1 }), /非负整数/)
  assert.throws(() => P.normalizeCompaction({ summarizationProvider: 'route' }), /一起设置/)
})

test('legacy settings migrate to explicit output budgets and metadata stays detached', () => {
  const raw = settings({ models: [model({ maxTokens: 0, outputLimit: 10000, detectedLimits: { contextWindow: 200000, outputLimit: 10000 }, limitSources: { contextWindow: 'provider' }, limitsCheckedAt: '2026-10-15T00:00:00Z', vision: false })] })
  const migrated = P.migrateSettings(raw)
  assert.equal(migrated.models[0].maxTokens, 10000)
  assert.equal(migrated.compaction.maxTokens, 8192)
  assert.equal(raw.models[0].maxTokens, 0)
  assert.equal(migrated.models[0].vision, false)
  migrated.models[0].detectedLimits.contextWindow = 1
  assert.equal(raw.models[0].detectedLimits.contextWindow, 200000)
  const small = P.migrateSettings(settings({ models: [model({ contextWindow: 16384, maxTokens: 0, outputLimit: 2048 })] }))
  assert.equal(small.compaction.headroomTokens, 1024)
  assert.ok(small.compaction.maxTokens <= 2048)
})

test('summary routes and caps use the selected summary model capability', () => {
  const models = [model(), model({ key: 'summary', provider: 'summary-route', model: 'summary', contextWindow: 200000, maxTokens: 4096, outputLimit: 4096 })]
  assert.throws(() => P.validateSettings(settings({ models, compaction: { summarizationProvider: 'summary-route', summarizationModel: 'summary' } })), /摘要上限/)
  assert.doesNotThrow(() => P.validateSettings(settings({ models, compaction: { maxTokens: 4096, summarizationProvider: 'summary-route', summarizationModel: 'summary' } })))
  assert.throws(() => P.validateSettings(settings({ compaction: { summarizationProvider: 'other', summarizationModel: 'missing' } })), /已配置/)
  const smallerSummary = models.map(m => m.key === 'summary' ? { ...m, contextWindow: 100000 } : m)
  assert.throws(() => P.validateSettings(settings({ models: smallerSummary, compaction: { maxTokens: 4096, summarizationProvider: 'summary-route', summarizationModel: 'summary' } })), /摘要模型窗口/)
  assert.throws(() => P.validateSettings(settings({ compaction: { maxTokens: 50000 } })), /摘要模型窗口/)
  // Headroom and summary length are independent; free window below the actual
  // trigger can safely accommodate a summary larger than headroom.
  assert.doesNotThrow(() => P.validateSettings(settings({ compaction: { headroomTokens: 1024, maxTokens: 8192 } })))
})

test('browser and Node share the same parameter rules', () => {
  const context = {}
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/parameters.js'), 'utf8'), context)
  assert.equal(context.OfficeParameters.modelBudget(model()).thresholdTokens, 159040)
  assert.throws(() => context.OfficeParameters.normalizeCompaction({ retainRatio: 0.9 }), /保留比例/)
})

test('profile output and final CLI overlay preserve Office compression choices over home defaults', () => {
  const base = process.platform === 'win32' ? 'D:\\AI' : os.tmpdir()
  const dir = fs.mkdtempSync(path.join(base, 'dsh-office-parameters-test-'))
  const previous = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = dir
    const globalPatch = '- id: compaction-basic\n  config:\n    headroomTokens: 65536\n'
    fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), globalPatch)
    const compaction = { ...P.DEFAULT_COMPACTION, thresholdRatio: 0.9, headroomTokens: 4096, maxTokens: 4096, compactionRetries: 0, maxOverflowRetries: 2 }
    const patch = writeProfile(settings({ compaction }))
    const profile = fs.readFileSync(path.join(dir, 'profiles', 'office', 'cordis.patch.yml'), 'utf8')
    assert.match(profile, /maxTokens: 32768/)
    assert.match(profile, /contextWindow: 200000/)
    for (const [key, value] of Object.entries(compaction)) assert.ok(fs.readFileSync(patch, 'utf8').includes(`    ${key}: ${JSON.stringify(value)}\n`))
    assert.equal(fs.readFileSync(path.join(dir, 'cordis.patch.yml'), 'utf8'), globalPatch)
    const explicitFast = model({ key: 'fast', model: 'fast', name: 'Explicit Fast', contextWindow: 100000, maxTokens: 4096, efforts: ['off'], vision: false })
    writeProfile(settings({ models: [model({ fastModel: 'fast', efforts: ['off', 'high'], vision: true }), explicitFast], compaction }))
    const distinct = fs.readFileSync(path.join(dir, 'profiles', 'office', 'cordis.patch.yml'), 'utf8')
    const fastBlock = distinct.split('          - id: "fast"\n')[1].split('- id: compaction-basic')[0]
    assert.match(fastBlock, /name: "Explicit Fast"/)
    assert.match(fastBlock, /contextWindow: 100000/)
    assert.match(fastBlock, /maxTokens: 4096/)
    assert.match(fastBlock, /reasoningEfforts: false/)
    assert.match(fastBlock, /input: \["text"\]/)
    assert.equal((distinct.match(/- id: "fast"/g) || []).length, 1)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    const absolute = path.resolve(dir), allowed = path.resolve(base) + path.sep
    if (!absolute.startsWith(allowed)) throw new Error('Refusing to remove a path outside the test workspace')
    fs.rmSync(absolute, { recursive: true, force: true })
  }
})

test('SDK runtime launches with the generated final overlay without contacting a model', async () => {
  const base = process.platform === 'win32' ? 'D:\\AI' : os.tmpdir()
  const dir = fs.mkdtempSync(path.join(base, 'dsh-office-runtime-test-'))
  const previous = process.env.DSH_HOME
  let launch
  try {
    process.env.DSH_HOME = dir
    const filename = path.join(__dirname, '../app/runtime.cjs'), localRequire = createRequire(filename)
    const child = new EventEmitter()
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
    child.stdout.setEncoding = child.stderr.setEncoding = () => {}
    child.stdin = { write: text => { const request = JSON.parse(text); child.stdout.emit('data', JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} }) + '\n') } }
    const fakeChildProcess = { spawn: (node, args, options) => { launch = { node, args, options }; return child }, execFileSync() { throw new Error('unexpected binary lookup') } }
    const context = { module: { exports: {} }, require: id => id === 'node:child_process' ? fakeChildProcess : localRequire(id), process, setTimeout, console, __dirname: path.dirname(filename), __filename: filename }
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename })
    const pool = new context.module.exports.RuntimePool(settings({ workspace: path.join(dir, 'workspace'), nodePath: process.execPath, proxyPort: 0 }))
    const rt = pool.get('route-model', false, 'medium')
    await rt.ready
    const patchIndex = launch.args.indexOf('--patch')
    assert.ok(patchIndex > 0)
    assert.equal(launch.args[patchIndex + 1], path.join(dir, 'profiles', 'office', 'office.runtime.patch.yml'))
    assert.equal(launch.options.windowsHide, true)
    child.emit('exit', 0)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    const absolute = path.resolve(dir), allowed = path.resolve(base) + path.sep
    if (!absolute.startsWith(allowed)) throw new Error('Refusing to remove a path outside the test workspace')
    fs.rmSync(absolute, { recursive: true, force: true })
  }
})

function loadMain() {
  const handlers = new Map(), files = new Map(), writes = []
  const userData = path.join('D:\\AI', 'office-memory-test'), file = path.join(userData, 'settings.json')
  files.set(file, JSON.stringify(settings()))
  const fakeFs = {
    readFileSync: f => { if (!files.has(f)) throw new Error('missing'); return files.get(f) },
    mkdirSync() {}, existsSync: f => files.has(f),
    writeFileSync: (f, text) => { writes.push(f); files.set(f, text) },
    renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from) },
    unlinkSync: f => files.delete(f), appendFileSync() {},
  }
  const prov = { ROUTE_PATTERN: /^[a-z][a-z0-9-]*$/, PROTOCOLS: ['openai-completions'], THINKING_LEVELS: ['off', 'low', 'medium', 'high'], deriveKeyRef: () => 'TEST_KEY', storedKey: () => 'saved-key', setKey() {}, testModel: async (_fetch, options) => options }
  const filename = path.join(__dirname, '../app/main.cjs'), localRequire = createRequire(filename)
  const electron = { app: { getPath: () => userData, requestSingleInstanceLock: () => true, on() {}, whenReady: () => ({ then() {} }), commandLine: { appendSwitch() {} } }, ipcMain: { handle: (name, cb) => handlers.set(name, cb), on() {} }, net: { fetch() {} } }
  const context = { module: { exports: {} }, require: id => id === 'electron' ? electron : id === 'node:fs' ? fakeFs : id === './providers.cjs' ? prov : localRequire(id), __dirname: path.dirname(filename), process, console, setTimeout, clearTimeout }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\nmodule.exports = { setBusy: value => { current = value }, getSettings: () => settings, setPool: value => { pool = value } };', context, { filename })
  context.module.exports.setPool({ configure: async () => {} })
  writes.length = 0
  return { handlers, files, writes, file, api: context.module.exports }
}

test('main IPC rejects invalid settings without changing saved settings and keeps busy protection', async () => {
  const m = loadMain(), saved = m.files.get(m.file), save = m.handlers.get('office:saveSettings')
  await assert.rejects(save(null, { compaction: { headroomTokens: 180000 } }), /耗尽/)
  assert.equal(m.files.get(m.file), saved)
  assert.equal(m.writes.length, 0)
  m.api.setBusy({ id: 'active' })
  await assert.rejects(save(null, { compaction: { headroomTokens: 4096 } }), /项目进行中|project/i)
  m.api.setBusy(null)
  const result = await save(null, { compaction: { headroomTokens: 4096, maxTokens: 4096 } })
  assert.equal(result.compaction.thresholdRatio, 0.8)
  assert.equal(result.compaction.headroomTokens, 4096)
  assert.equal(JSON.parse(m.files.get(m.file)).compaction.maxTokens, 4096)
  assert.ok(m.writes.every(f => f !== m.file && f.endsWith('.tmp')))
})

test('provider IPC persists capability metadata and routes detection to the matching configured model', async () => {
  const m = loadMain()
  const meta = { outputLimit: 40000, inputLimit: 180000, detectedLimits: { contextWindow: 200000, outputLimit: 40000 }, limitSources: { contextWindow: 'provider', outputLimit: 'provider' }, limitsCheckedAt: '2026-10-15T00:00:00Z', vision: false }
  const saved = await m.handlers.get('office:saveProvider')(null, 'route', { existing: true, api: 'openai-completions', baseURL: 'https://example.test' }, '', [model(meta)])
  assert.equal(saved.models[0].outputLimit, 40000)
  assert.equal(saved.models[0].inputLimit, 180000)
  assert.equal(saved.models[0].limitSources.outputLimit, 'provider')
  assert.equal(saved.models[0].detectedLimits.contextWindow, 200000)
  assert.equal(saved.models[0].vision, false)
  const result = await m.handlers.get('office:testModel')(null, { route: 'route', model: 'test', baseURL: 'https://example.test', api: 'openai-completions' })
  assert.equal(result.configuredModel.model, 'test')
  assert.equal(result.dshRoot, 'D:\\deepseek-harness')
  const unrelated = await m.handlers.get('office:testModel')(null, { route: 'other', model: 'test' })
  assert.equal(unrelated.configuredModel, undefined)
})
