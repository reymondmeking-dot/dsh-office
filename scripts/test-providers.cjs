'use strict'
// Offline fixtures only: never contact a configured provider or read stored credentials.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { discover, testModel } = require('../app/providers.cjs')

async function endpoint(t, { listing = { data: [] }, listStatus = 200, probeStatus = 200 } = {}) {
  const calls = []
  const server = http.createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    calls.push({ path: req.url, method: req.method, headers: req.headers, body: body ? JSON.parse(body) : null })
    const metadata = req.method === 'GET'
    res.writeHead(metadata ? listStatus : probeStatus, { 'content-type': 'application/json' })
    res.end(JSON.stringify(metadata ? listing : probeStatus === 200 ? { choices: [{ message: { content: 'ok' } }] } : { error: { message: 'fixture rejected request' } }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  return { baseURL: `http://127.0.0.1:${server.address().port}/v1`, calls }
}

function catalogFixture(t, providers) {
  const root = path.resolve(process.env.DSH_OFFICE_TEST_WORK || (process.platform === 'win32' ? 'D:\\AI' : os.tmpdir()))
  fs.mkdirSync(root, { recursive: true })
  const fixture = fs.mkdtempSync(path.join(root, 'dsh-office-provider-test-'))
  t.after(() => {
    const target = path.resolve(fixture)
    assert.ok(target.startsWith(root + path.sep), 'Fixture cleanup must remain in the intended test root')
    fs.rmSync(target, { recursive: true, force: true })
  })
  const dataDir = path.join(fixture, 'node_modules', '@earendil-works', 'pi-ai', 'dist', 'providers', 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  for (const [provider, models] of Object.entries(providers)) fs.writeFileSync(path.join(dataDir, `${provider}.json`), JSON.stringify({ 'openai-completions': models }))
  return fixture
}

test('discovery normalizes numeric capabilities and keeps the compatibility output field', async t => {
  const { baseURL } = await endpoint(t, { listing: { data: [{ id: 'fixture-model', context_length: '262144', max_output_tokens: '32768', max_input_tokens: '240000', reasoning_efforts: ['off', 'low', 'high'], architecture: { input_modalities: ['text', 'image', 'text'] } }] } })
  const [model] = await discover(fetch, { baseURL, api: 'openai-completions' })
  assert.equal(model.contextWindow, 262144)
  assert.equal(model.inputLimit, 240000)
  assert.equal(model.outputLimit, 32768)
  assert.equal(model.maxTokens, 32768)
  assert.deepEqual(model.reasoningEfforts, { off: null, low: 'low', high: 'high' })
  assert.deepEqual(model.input, ['text', 'image'])
})

test('discovery rejects invalid limits and does not claim input capacity is a shared context', async t => {
  const { baseURL } = await endpoint(t, { listing: { models: { 'fixture-model': { contextWindow: -1, context_length: '9.5', max_input_tokens: '128000', maxTokens: Infinity, max_output_tokens: '9007199254740992', max_completion_tokens: '0' } } } })
  const [model] = await discover(fetch, { baseURL, api: 'openai-completions' })
  assert.equal(model.contextWindow, undefined)
  assert.equal(model.inputLimit, 128000)
  assert.equal(model.outputLimit, undefined)
})

test('successful probe retrieves only the exact model and preserves provider provenance', async t => {
  const { baseURL, calls } = await endpoint(t, { listing: { data: [{ id: 'fixture-model-new', context_length: 999999 }, { id: 'fixture-model', context_window: 131072, max_tokens: 16384, reasoning: false }] } })
  const result = await testModel(fetch, { baseURL, api: 'openai-completions', apiKey: 'fixture-secret', model: 'fixture-model', configuredModel: { model: 'fixture-model', contextWindow: 200000, outputLimit: 65536 } })
  assert.equal(result.reply, 'ok')
  assert.equal(typeof result.ms, 'number')
  assert.equal(result.modelInfo.contextWindow, 131072)
  assert.equal(result.modelInfo.outputLimit, 16384)
  assert.equal(result.modelInfo.reasoningEfforts, false)
  assert.deepEqual(result.modelInfo.sources, { contextWindow: 'provider', outputLimit: 'provider', reasoningEfforts: 'provider' })
  assert.ok(Number.isFinite(Date.parse(result.modelInfo.checkedAt)))
  assert.equal(result.metadataWarning, undefined)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].body.max_tokens, 32)
  assert.equal(calls[0].headers.authorization, 'Bearer fixture-secret')
  assert.equal(calls[1].headers.authorization, 'Bearer fixture-secret')
  assert.ok(!JSON.stringify(result).includes('fixture-secret'))
})

test('unsupported model listing does not turn a successful connection into a failure', async t => {
  const { baseURL } = await endpoint(t, { listStatus: 404, listing: { error: { message: 'listing unavailable' } } })
  const result = await testModel(fetch, { baseURL, api: 'openai-completions', model: 'office-fixture-no-metadata' })
  assert.equal(result.reply, 'ok')
  assert.equal(result.metadataWarning, 'metadata-unavailable')
  assert.equal(result.modelInfo.contextWindow, undefined)
  assert.equal(result.modelInfo.outputLimit, undefined)
  assert.deepEqual(result.modelInfo.sources, {})
})

test('missing exact model and incomplete metadata have distinct warnings', async t => {
  const { baseURL } = await endpoint(t, { listing: { data: [{ id: 'office-fixture-exact-new', context_length: 1000000 }, { id: 'office-fixture-incomplete', max_input_tokens: 9000 }] } })
  const missing = await testModel(fetch, { baseURL, api: 'openai-completions', model: 'office-fixture-exact' })
  assert.equal(missing.metadataWarning, 'model-not-listed')
  assert.equal(missing.modelInfo.contextWindow, undefined)
  const incomplete = await testModel(fetch, { baseURL, api: 'openai-completions', model: 'office-fixture-incomplete' })
  assert.equal(incomplete.metadataWarning, 'limits-not-reported')
  assert.equal(incomplete.modelInfo.inputLimit, 9000)
  assert.equal(incomplete.modelInfo.contextWindow, undefined)
})

test('configured request caps are never presented as discovered output capability', async t => {
  const { baseURL } = await endpoint(t, { listStatus: 403 })
  const result = await testModel(fetch, { baseURL, api: 'openai-completions', model: 'office-fixture-cap', configuredModel: { model: 'office-fixture-cap', maxTokens: 8192, contextWindow: 64000 } })
  assert.equal(result.modelInfo.outputLimit, undefined)
  assert.equal(result.modelInfo.contextWindow, 64000)
  assert.equal(result.modelInfo.sources.contextWindow, 'configured')
})

test('installed catalog fallback is exact, keeps provenance, and does not replace provider values', async t => {
  const model = 'office-fixture-catalog'
  const dshRoot = catalogFixture(t, { 'fixture-provider': { [model]: { id: model, api: 'openai-completions', contextWindow: 128000, maxTokens: 32000, reasoning: true, thinkingLevelMap: { off: null, minimal: null, xhigh: 'xhigh' }, input: ['text', 'image'] } } })
  const { baseURL } = await endpoint(t, { listing: { data: [{ id: model, context_window: 64000 }] } })
  const result = await testModel(fetch, { baseURL, api: 'openai-completions', model, route: 'fixture-provider', dshRoot })
  assert.equal(result.modelInfo.contextWindow, 64000)
  assert.equal(result.modelInfo.sources.contextWindow, 'provider')
  assert.equal(result.modelInfo.outputLimit, 32000)
  assert.equal(result.modelInfo.sources.outputLimit, 'dsh-catalog')
  assert.deepEqual(result.modelInfo.reasoningEfforts, { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' })
  assert.equal(result.metadataWarning, 'limits-not-reported')
})

test('conflicting catalog entries do not invent a capacity for an unknown gateway route', async t => {
  const model = 'office-fixture-conflicting'
  const dshRoot = catalogFixture(t, { one: { [model]: { id: model, contextWindow: 32000, maxTokens: 8192 } }, two: { [model]: { id: model, contextWindow: 128000, maxTokens: 8192 } } })
  const { baseURL } = await endpoint(t, { listStatus: 404 })
  const result = await testModel(fetch, { baseURL, api: 'openai-completions', model, route: 'private-gateway', dshRoot })
  assert.equal(result.modelInfo.contextWindow, undefined)
  assert.equal(result.modelInfo.outputLimit, 8192)
  assert.equal(result.modelInfo.sources.outputLimit, 'dsh-catalog')
})

test('Anthropic and Responses probes keep their request protocols and metadata authentication', async t => {
  for (const api of ['anthropic-messages', 'openai-responses']) {
    const { baseURL, calls } = await endpoint(t)
    await testModel(fetch, { baseURL, api, apiKey: 'fixture-secret', model: 'office-fixture-protocol' })
    if (api === 'anthropic-messages') {
      assert.equal(calls[0].path, '/v1/messages')
      assert.equal(calls[0].body.max_tokens, 32)
      assert.equal(calls[1].path, '/v1/models?limit=1000')
      assert.equal(calls[1].headers['x-api-key'], 'fixture-secret')
      assert.equal(calls[1].headers['anthropic-version'], '2023-06-01')
    } else {
      assert.equal(calls[0].path, '/v1/responses')
      assert.equal(calls[0].body.max_output_tokens, 32)
      assert.equal(calls[1].path, '/v1/models')
    }
  }
})

test('a failed connectivity probe still fails and does not request metadata', async t => {
  const { baseURL, calls } = await endpoint(t, { probeStatus: 401 })
  await assert.rejects(testModel(fetch, { baseURL, api: 'openai-completions', model: 'office-fixture-failure' }), /401/)
  assert.equal(calls.length, 1)
})
