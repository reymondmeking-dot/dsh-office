'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { CliResources, validateCall, parseAuth, sanitize, safeEnv, runNative } = require('../app/cli-resources.cjs')
const { TOOLS, validateArgs, options } = require('../app/plugins/office-cli/server.cjs')
const { createBridge } = require('../app/plugins/office-browser/server.cjs')
const ext = require('../app/extensions.cjs')

const workspace = path.join(__dirname, '..', 'tmp', 'cli-resources-unit')
fs.mkdirSync(workspace, { recursive: true })
const ghAuth = () => ({ code: 0, stdout: JSON.stringify({ hosts: { 'github.com': [{ active: true, state: 'success', login: 'ignored-login', token: 'never-return-this-token' }] } }), stderr: '' })
const tapAuth = () => ({ code: 0, stdout: JSON.stringify({ ok: true, data: { hasAccessToken: true, accessTokenExpired: false, offline: true, serverChecked: false, accessToken: 'never-return-this-token' } }), stderr: '' })

test('CLI auth projection distinguishes verified authentication from offline credential evidence', () => {
  const github = parseAuth('github', ghAuth())
  assert.equal(github.authenticated, true); assert.equal(github.status, 'ready'); assert.equal(github.verified, true)
  const taptap = parseAuth('taptap', tapAuth())
  assert.equal(taptap.authenticated, null); assert.equal(taptap.credentialAvailable, true); assert.equal(taptap.status, 'credentials-present'); assert.equal(taptap.verified, false)
  assert.doesNotMatch(JSON.stringify({ github, taptap }), /ignored-login|never-return-this-token/)
  assert.equal(parseAuth('github', { stdout: '{}' }).authenticated, false)
  assert.equal(parseAuth('taptap', { stdout: 'not JSON' }).status, 'unknown')
})

test('CLI argv validation admits listed reads and rejects writes, shells, files, endpoint changes and sensitive commands', () => {
  const read = validateCall('github', ['repo', 'view', 'owner/repo'])
  assert.equal(read.command, 'repo view'); assert.ok(read.args.includes('--json'))
  assert.deepEqual(validateCall('github', ['issue', 'view', '12', '--repo', 'owner/repo']).args.slice(0, 5), ['issue', 'view', '12', '--repo', 'owner/repo'])
  assert.ok(validateCall('github', ['search', 'repos', 'pixel office', '--limit=3']).args.includes('3'))
  assert.ok(validateCall('taptap', ['overview', '--page-size', '2']).args.includes('--json'))
  assert.ok(validateCall('taptap', ['app', 'get-app-module', '--dev-id', '1', '--app-id', '2', '--data', '{"module_id":"basic-info"}']).args.includes('--json'))
  const rejected = [
    ['github', ['auth', 'token']], ['github', ['config', 'get', 'oauth_token']], ['github', ['api', '/user']],
    ['github', ['extension', 'exec', 'x']], ['github', ['pr', 'merge', '12']], ['github', ['issue', 'comment', '1']],
    ['github', ['repo', 'view', 'owner/repo', '--web']], ['github', ['repo', 'view', 'https://evil.test/repo']],
    ['github', ['issue', 'view', '1', '--repo', 'owner/repo', '--template', '{{exec}}']],
    ['github', ['issue', 'view', '1']], ['github', ['search', 'repos', '$(gh auth token)']],
    ['github', ['search', 'repos', 'x; auth token']], ['github', ['search', 'repos', 'x', '--limit', '9999']],
    ['github', ['issue', 'list', '--repo', 'owner/repo', '--hostname', 'evil.test']],
    ['taptap', ['auth', 'status']], ['taptap', ['app', 'save-changes', '--yes']],
    ['taptap', ['app', 'get-app-module', '--data', '@secret.json']], ['taptap', ['app', 'get-app-module', '--data', '-']],
    ['taptap', ['app', 'get-app-module', '--data', '{"token":"secret"}']],
    ['taptap', ['overview', '--server-url', 'https://evil.test']], ['taptap', ['overview', '--dev-id', '../secrets']],
    ['other', ['status']],
  ]
  for (const [resource, args] of rejected) assert.throws(() => validateCall(resource, args), `${resource} ${args.join(' ')}`)
})

test('resources stay locked until confirmation and authorization revocation applies without restarting', async () => {
  const settings = { workspace, cliResources: { github: false, taptap: false } }, calls = []
  const resources = new CliResources({ getSettings: () => settings, find: id => id + '.exe', run: async (exe, args) => {
    calls.push({ exe, args })
    if (args[0] === '--help') return { code: 0, stdout: 'taptap-cli — TapTap CLI', stderr: '' }
    if (args[0] === 'auth') return exe === 'github.exe' ? ghAuth() : tapAuth()
    if (args.at(-1) === '--help') return { code: 0, stdout: 'Risk: read\n', stderr: '' }
    return { code: 0, stdout: '{"name":"example","access_token":"secret-token","body":"ghp_abc123"}', stderr: '' }
  } })
  await assert.rejects(resources.tool('cli_call', { resource: 'github', args: ['repo', 'view', 'owner/repo'] }, { projectDir: workspace }), /授权|confirmed/)
  assert.equal(calls.length, 0)
  assert.deepEqual((await resources.tool('cli_list_resources')).resources, [])
  settings.cliResources.github = true
  const list = (await resources.tool('cli_list_resources')).resources
  assert.equal(list.length, 1); assert.equal(list[0].id, 'github'); assert.ok(!Object.hasOwn(list[0], 'path'))
  const result = await resources.tool('cli_call', { resource: 'github', args: ['repo', 'view', 'owner/repo'] }, { projectDir: workspace })
  assert.equal(result.ok, true); assert.equal(result.data.name, 'example'); assert.equal(result.data.access_token, '[redacted]'); assert.equal(result.data.body, '[redacted]')
  const last = calls.at(-1); assert.equal(last.exe, 'github.exe'); assert.ok(last.args.includes('--json'))
  settings.cliResources.github = false
  await assert.rejects(resources.tool('cli_call', { resource: 'github', args: ['repo', 'view', 'owner/repo'] }, { projectDir: workspace }), /授权|confirmed/)
  assert.deepEqual((await resources.tool('cli_list_resources')).resources, [])
})

test('TapTap execution rechecks read risk and rejects unknown/missing login state', async () => {
  let risk = 'write', executions = 0
  const resources = new CliResources({ getSettings: () => ({ workspace, cliResources: { taptap: true } }), find: id => id === 'taptap' ? 'taptap.exe' : '', run: async (_exe, args) => {
    if (args[0] === '--help') return { code: 0, stdout: 'taptap-cli — TapTap CLI', stderr: '' }
    if (args[0] === 'auth') return tapAuth()
    if (args.at(-1) === '--help') return { code: 0, stdout: `Risk: ${risk}\n`, stderr: '' }
    executions++; return { code: 0, stdout: '{"ok":true,"data":{"apps":[]}}', stderr: '' }
  } })
  await assert.rejects(resources.tool('cli_call', { resource: 'taptap', args: ['overview'] }, { projectDir: workspace }), /只读|read-only/)
  assert.equal(executions, 0)
  risk = 'read'
  assert.equal((await resources.tool('cli_call', { resource: 'taptap', args: ['overview'] }, { projectDir: workspace })).ok, true)
  assert.equal(executions, 1)
  const missing = new CliResources({ getSettings: () => ({ workspace, cliResources: { github: true } }), find: () => '' })
  await assert.rejects(missing.tool('cli_call', { resource: 'github', args: ['repo', 'view', 'owner/repo'] }), /未安装|unavailable/)
})

test('CLI output redacts credential shapes and native processes do not inherit bridge capabilities or debug hooks', async () => {
  const env = { GH_TOKEN: 'environment-secret', DSH_OFFICE_BROWSER_TOKEN: 'private-bridge', DSH_OFFICE_BROWSER_URL: 'http://127.0.0.1:1234', NODE_OPTIONS: '--inspect', GH_DEBUG: 'api' }
  const result = sanitize({ password: 'p', nested: { authorization: 'Bearer secret', body: 'github_pat_abc123 environment-secret access_token=topsecret' } }, env)
  assert.doesNotMatch(JSON.stringify(result), /topsecret|environment-secret|github_pat_abc123|Bearer secret/)
  const clean = safeEnv(env)
  assert.equal(clean.GH_TOKEN, 'environment-secret'); assert.ok(!Object.hasOwn(clean, 'NODE_OPTIONS')); assert.ok(!Object.hasOwn(clean, 'DSH_OFFICE_BROWSER_TOKEN'))
  const large = await runNative(process.execPath, ['-e', 'process.stdout.write("x".repeat(10000))'], { cwd: workspace, outputCap: 1000 })
  assert.equal(large.truncated, true); assert.ok(Buffer.byteLength(large.stdout) <= 1000)
  const slow = await runNative(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { cwd: workspace, timeout: 150 })
  assert.equal(slow.timedOut, true)
})

test('office-cli ships two tools and forwards only a narrow authenticated CLI route', async () => {
  assert.deepEqual(TOOLS.map(t => t.name), ['cli_list_resources', 'cli_call'])
  assert.equal(TOOLS[1].inputSchema.additionalProperties, false)
  validateArgs('cli_call', { resource: 'github', args: ['repo', 'view', 'owner/repo'] })
  assert.throws(() => validateArgs('cli_call', { resource: 'github', args: ['status'], token: 'x' }))
  let request
  const bridge = createBridge({ DSH_OFFICE_BROWSER_URL: 'http://127.0.0.1:1234', DSH_OFFICE_BROWSER_TOKEN: 'capability', DSH_OFFICE_BROWSER_CONTEXT: 'employee', DSH_OFFICE_BROWSER_PROJECT: workspace }, async (url, init) => { request = { url: String(url), ...init }; return { ok: true, json: async () => ({ result: { resources: [] } }) } }, options)
  await bridge.call('cli_list_resources', {})
  assert.equal(request.url, 'http://127.0.0.1:1234/cli-tool'); assert.equal(request.headers.authorization, 'Bearer capability')
  const plugin = ext.loadPlugins('').find(p => p.id === 'office-cli')
  assert.ok(plugin && !plugin.error && plugin.enabledByDefault)
  const server = ext.resolve({}, [plugin]).mcpServers[0]
  const stdio = await ext.testMcp({ ...server, command: process.execPath })
  assert.equal(stdio.ok, true, stdio.error); assert.equal(stdio.tools.length, 2)
  const previous = process.env.DSH_OFFICE_BROWSER_TOKEN
  process.env.DSH_OFFICE_BROWSER_TOKEN = 'bridge-must-stay-out-of-argv'
  try { const args = ext.codexMcpArgs([server], workspace).join('\n'); assert.match(args, /env_vars=/); assert.doesNotMatch(args, /bridge-must-stay-out-of-argv/) }
  finally { if (previous === undefined) delete process.env.DSH_OFFICE_BROWSER_TOKEN; else process.env.DSH_OFFICE_BROWSER_TOKEN = previous }
})
