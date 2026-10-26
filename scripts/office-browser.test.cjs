'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { TOOLS, validateArgs, createBridge } = require('../app/plugins/office-browser/server.cjs')
const ext = require('../app/extensions.cjs')
const { browserEnv, RuntimePool } = require('../app/runtime.cjs')

test('office browser advertises ten narrow schemas without session or secret arguments', () => {
  assert.equal(TOOLS.length, 10)
  assert.equal(new Set(TOOLS.map(t => t.name)).size, 10)
  for (const tool of TOOLS) {
    assert.match(tool.name, /^browser_/)
    assert.equal(tool.inputSchema.type, 'object')
    assert.equal(tool.inputSchema.additionalProperties, false)
    assert.ok(tool.description.length > 35)
    assert.ok(!['contextId', 'projectDir', 'password', 'token'].some(k => k in tool.inputSchema.properties))
  }
  validateArgs('browser_search', { query: 'Electron', count: 3 })
  validateArgs('browser_type', { ref: 'e1', text: '', submit: true })
  validateArgs('browser_snapshot', {})
  for (const [name, args] of [['unknown', {}], ['browser_open', {}], ['browser_search', { query: 'q', count: 11 }], ['browser_search', { query: 'q', count: 1.5 }], ['browser_snapshot', { contextId: 'other' }], ['browser_scroll', { dir: 'left' }]]) assert.throws(() => validateArgs(name, args))
})

test('bridge forwards trusted session metadata and capability only to the loopback service', async () => {
  const requests = []
  const env = { DSH_OFFICE_BROWSER_URL: 'http://127.0.0.1:43210', DSH_OFFICE_BROWSER_TOKEN: 'private-capability', DSH_OFFICE_BROWSER_CONTEXT: 'employee-1', DSH_OFFICE_BROWSER_PROJECT: 'D:\\dsh-office\\tmp\\project', DSH_OFFICE_BROWSER_OWNER: 'Researcher' }
  const bridge = createBridge(env, async (url, req) => {
    requests.push({ url: String(url), ...req, body: JSON.parse(req.body) })
    return { ok: true, json: async () => ({ result: { title: 'Source', url: 'https://example.com', text: 'Public text' } }) }
  })
  const result = await bridge.call('browser_open', { url: 'https://example.com' })
  assert.equal(result.text, 'Public text')
  assert.equal(requests[0].headers.authorization, 'Bearer private-capability')
  assert.equal(requests[0].body.contextId, 'employee-1')
  assert.equal(requests[0].body.projectDir, path.resolve(env.DSH_OFFICE_BROWSER_PROJECT))
  assert.equal(requests[0].body.owner, 'Researcher')
  assert.doesNotMatch(JSON.stringify(result), /private-capability|43210/)
  await bridge.release()
  assert.match(requests[1].url, /\/release$/)
  const broken = createBridge(env, async () => ({ ok: false, json: async () => ({ error: 'private-capability http://127.0.0.1:43210/' }) }))
  await assert.rejects(broken.call('browser_snapshot', {}), e => !/private-capability|43210/.test(e.message))
  for (const url of ['https://127.0.0.1:1', 'http://example.com:1', 'http://user:pass@127.0.0.1:1']) {
    await assert.rejects(createBridge({ ...env, DSH_OFFICE_BROWSER_URL: url }).call('browser_snapshot', {}), /unavailable/)
  }
})

test('built-in plugin is enabled, resolves its shipped script, and passes capabilities by environment', () => {
  const plugin = ext.loadPlugins('').find(p => p.id === 'office-browser')
  assert.ok(plugin && !plugin.error)
  assert.equal(plugin.enabledByDefault, true)
  const live = ext.resolve({}, [plugin]).mcpServers
  assert.equal(live.length, 1)
  assert.ok(fs.existsSync(live[0].args[0]))
  const previous = process.env.DSH_OFFICE_BROWSER_TOKEN
  process.env.DSH_OFFICE_BROWSER_TOKEN = 'must-not-enter-arguments'
  try {
    const args = ext.codexMcpArgs(live, 'D:\\workspace')
    assert.match(args.join('\n'), /env_vars=.*DSH_OFFICE_BROWSER_TOKEN/)
    assert.doesNotMatch(args.join('\n'), /must-not-enter-arguments/)
    const patch = ext.dshMcpPatch(live, 'D:\\workspace')
    assert.match(patch, /!!js process\.env\.DSH_OFFICE_BROWSER_TOKEN/)
    assert.doesNotMatch(patch, /must-not-enter-arguments/)
    assert.equal(ext.resolve({ plugins: { 'office-browser': false } }, [plugin]).mcpServers.length, 0)
  } finally { if (previous === undefined) delete process.env.DSH_OFFICE_BROWSER_TOKEN; else process.env.DSH_OFFICE_BROWSER_TOKEN = previous }
})

test('runtime metadata clears inherited session values and isolates cached runtimes', async () => {
  const env = { DSH_OFFICE_BROWSER_CONTEXT: 'stale', DSH_OFFICE_BROWSER_PROJECT: 'stale', DSH_OFFICE_BROWSER_OWNER: 'stale' }
  browserEnv(env)
  assert.deepEqual(env, {})
  browserEnv(env, { id: 'employee-1', projectDir: process.cwd(), owner: 'Researcher' })
  assert.equal(env.DSH_OFFICE_BROWSER_CONTEXT, 'employee-1')
  assert.equal(env.DSH_OFFICE_BROWSER_OWNER, 'Researcher')
  const root = path.join(__dirname, '..', 'tmp', 'browser-runtime-unit')
  fs.mkdirSync(root, { recursive: true })
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = path.join(root, 'dsh-home')
  try {
    const settings = { workspace: path.join(root, 'workspace'), providers: {}, models: [{ key: 'cx', engine: 'codex', name: 'Codex', model: 'example', provider: 'codex', contextWindow: 200000, maxTokens: 32768 }], defaultModel: 'cx' }
    const pool = new RuntimePool(settings)
    const first = pool.get('cx', false, 'low', { id: 'one', projectDir: settings.workspace })
    const second = pool.get('cx', false, 'low', { id: 'two', projectDir: settings.workspace })
    assert.notEqual(first, second)
    assert.equal(pool.get('cx', false, 'low', { id: 'one', projectDir: settings.workspace }), first)
    first.threads.set('cx|one', 'saved-thread')
    await pool.releaseSession('one')
    assert.ok(![...pool.runtimes.values()].includes(first))
    assert.equal(pool.get('cx', false, 'low', { id: 'one', projectDir: settings.workspace }).threads.get('cx|one'), 'saved-thread')
    assert.doesNotMatch(pool.get('cx', false, 'low').args().join('\n'), /mcp_servers\.office-browser/)
    assert.match(second.args().join('\n'), /mcp_servers\.office-browser/)
    await pool.closeAll()
  } finally { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous }
})

test('real stdio MCP handshake and tool calls use the authenticated HTTP bridge', async () => {
  const calls = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', d => { body += d })
    req.on('end', () => {
      calls.push({ url: req.url, authorization: req.headers.authorization, body: JSON.parse(body) })
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ result: req.url === '/release' ? true : { title: 'Example Domain', url: 'https://example.com' } }))
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const child = spawn(process.execPath, [path.join(__dirname, '../app/plugins/office-browser/server.cjs')], { windowsHide: true, env: { ...process.env, DSH_OFFICE_BROWSER_URL: `http://127.0.0.1:${server.address().port}`, DSH_OFFICE_BROWSER_TOKEN: 'local-token', DSH_OFFICE_BROWSER_CONTEXT: 'employee-session' }, stdio: ['pipe', 'pipe', 'pipe'] })
  const waiters = new Map(); let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', data => { buffer += data; let n; while ((n = buffer.indexOf('\n')) >= 0) { const message = JSON.parse(buffer.slice(0, n)); buffer = buffer.slice(n + 1); waiters.get(message.id)?.(message); waiters.delete(message.id) } })
  const request = (id, method, params = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MCP reply timed out')), 5000)
    waiters.set(id, message => { clearTimeout(timer); resolve(message) })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  try {
    assert.equal((await request(1, 'initialize', { protocolVersion: '2025-06-18' })).result.serverInfo.name, 'office-browser')
    child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
    assert.equal((await request(2, 'tools/list')).result.tools.length, 10)
    const reply = await request(3, 'tools/call', { name: 'browser_open', arguments: { url: 'https://example.com' } })
    assert.match(reply.result.content[0].text, /Example Domain/)
    assert.doesNotMatch(JSON.stringify(reply), /local-token|employee-session/)
    assert.equal(calls[0].authorization, 'Bearer local-token')
    assert.equal(calls[0].body.contextId, 'employee-session')
    assert.equal((await request(4, 'nonexistent')).error.code, -32601)
    assert.equal((await request(5, 'tools/call', { name: 'browser_open', arguments: { url: 'https://example.com', password: 'forbidden' } })).result.isError, true)
  } finally {
    child.stdin.end()
    await new Promise(resolve => { child.once('close', resolve); setTimeout(() => { child.kill(); resolve() }, 2000).unref() })
    await new Promise(resolve => server.close(resolve))
  }
})
