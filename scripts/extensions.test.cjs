'use strict'
// Extension system: plugins, MCP servers (DSH + Codex), experts, skills.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const P = require('../app/parameters.js')
const ext = require('../app/extensions.cjs')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'office-ext-'))
const everything = (() => {
  const roots = [path.join('D:\\deepseek-harness', 'node_modules', '.pnpm')]
  for (const r of roots) {
    try {
      const d = fs.readdirSync(r).find(x => x.startsWith('@modelcontextprotocol+server-everything@'))
      if (d) return path.join(r, d, 'node_modules', '@modelcontextprotocol', 'server-everything', 'dist', 'index.js')
    } catch {}
  }
  return null
})()

test('MCP servers and experts are normalized and invalid ones rejected', () => {
  const s = P.normalizeMcpServer({ name: 'gh', command: 'npx', args: ['-y', 'x'], env: { A: '${A}' } })
  assert.equal(s.transport, 'stdio'); assert.equal(s.enabled, true); assert.equal(s.timeoutMs, 60000)
  assert.equal(P.normalizeMcpServer({ name: 'h', transport: 'http', url: 'https://x.test/mcp' }).transport, 'streamable-http')
  for (const bad of [{ name: 'bad name', command: 'x' }, { name: 'x' }, { name: 'x', transport: 'streamable-http', url: 'ftp://x' }, { name: 'x', command: 'y', timeoutMs: 10 }])
    assert.throws(() => P.normalizeMcpServer(bad))
  const e = P.normalizeExpert({ id: 'seo', title: 'SEO', prompt: { zh: '中', en: 'en' }, mcp: ['gh'], skillset: ['seo-list'] })
  assert.deepEqual(e.mcp, ['gh']); assert.deepEqual(e.skillset, ['seo-list'])
  assert.throws(() => P.normalizeExpert({ id: 'x', title: 'x', prompt: 'y', skillset: ['Bad Skill'] }))
  assert.throws(() => P.validateSettings({ ...base(), skillToggles: { a: 'yes' } }))
  assert.throws(() => P.normalizeExpert({ id: 'Bad Id', title: 'x', prompt: 'y' }))
  assert.throws(() => P.normalizeExpert({ id: 'ok', title: 'x' }))
  assert.throws(() => P.validateSettings({ ...base(), mcpServers: [{ name: 'a', command: 'x' }, { name: 'A', command: 'y' }] }))
})
const base = () => ({ models: [{ key: 'k', name: 'n', model: 'm', provider: 'p', contextWindow: 200000, maxTokens: 32768 }], providers: {}, defaultModel: 'k', workspace: 'D:\\ws' })

test('built-in plugins load; resolve applies user-first precedence and per-server switches', () => {
  const plugins = ext.loadPlugins(tmp())
  const experts = plugins.find(p => p.id === 'office-experts'), starter = plugins.find(p => p.id === 'mcp-starter')
  assert.ok(experts && starter && !experts.error && !starter.error)
  assert.ok(experts.experts.length >= 8 && experts.skills.length >= 2)
  // defaults: experts plugin on, MCP starter off
  let r = ext.resolve({}, plugins)
  assert.equal(r.mcpServers.length, 0); assert.ok(r.experts.some(e => e.id === 'researcher')); assert.equal(r.skills.length, 2)
  assert.deepEqual(r.experts.find(e => e.id === 'researcher').skillset, ['office-report-writing', 'office-self-check'])
  assert.ok(r.skills.every(s => s.description.length > 20))
  r = ext.resolve({ plugins: { 'mcp-starter': true, 'office-experts': false }, pluginMcp: { 'mcp-starter/thinking': false },
    mcpServers: [{ name: 'fetch', command: 'mine' }], experts: [{ id: 'mine', title: 'Mine', prompt: 'p' }] }, plugins)
  assert.deepEqual(r.mcpServers.map(s => `${s.name}@${s.source}`), ['fetch@user', 'memory@mcp-starter'])
  assert.ok(r.skipped.some(x => x.name === 'fetch' && x.source === 'mcp-starter'))
  assert.deepEqual(r.experts.map(e => e.id), ['mine']); assert.equal(r.skills.length, 0)
})

test('skills: user skills win name clashes, switches apply, staging only replaces Office-managed folders', () => {
  const user = tmp(), ws = tmp()
  ext.saveUserSkill(user, { name: 'office-self-check', description: 'My own self check', body: '# Mine' })
  ext.saveUserSkill(user, { name: 'seo-list', description: 'Use: "SEO" checks', body: 'steps' })
  assert.throws(() => ext.saveUserSkill(user, { name: 'seo-list', description: 'd', body: 'b' }))
  assert.throws(() => ext.saveUserSkill(user, { name: 'Bad Name', description: 'd', body: 'b' }))
  assert.throws(() => ext.saveUserSkill(user, { name: 'nodesc', description: '', body: 'b' }))
  const us = ext.listSkills(user)
  assert.deepEqual(us.map(s => s.name), ['office-self-check', 'seo-list'])
  assert.equal(ext.readSkill(us[1].file).description, 'Use: "SEO" checks')
  const plugins = ext.loadPlugins(tmp())
  let r = ext.resolve({}, plugins, us)
  assert.deepEqual(r.skills.map(s => `${s.name}@${s.source}`), ['office-self-check@user', 'seo-list@user', 'office-report-writing@office-experts'])
  assert.ok(r.skipped.some(x => x.kind === 'skill' && x.name === 'office-self-check' && x.source === 'office-experts'))
  r = ext.resolve({ skillToggles: { 'user/office-self-check': false, 'office-experts/office-report-writing': false } }, plugins, us)
  assert.deepEqual(r.skills.map(s => `${s.name}@${s.source}`), ['seo-list@user', 'office-self-check@office-experts'])
  // the user's own .agents/skills content is never touched
  const own = path.join(ws, '.agents', 'skills', 'hand-made'); fs.mkdirSync(own, { recursive: true }); fs.writeFileSync(path.join(own, 'SKILL.md'), 'x')
  const root = ext.stageSkills(r.skills, ws)
  assert.equal(root, path.join(ws, '.agents', 'skills'))
  assert.ok(fs.existsSync(path.join(root, 'seo-list', 'SKILL.md')) && fs.existsSync(path.join(root, 'office-self-check', 'SKILL.md')))
  ext.stageSkills([], ws)
  assert.ok(!fs.existsSync(path.join(root, 'seo-list')) && fs.existsSync(path.join(own, 'SKILL.md')))
  // rename keeps the folder, delete removes it, import accepts Claude-style folders
  ext.saveUserSkill(user, { name: 'seo-checks', oldName: 'seo-list', description: 'd', body: 'b' })
  assert.deepEqual(ext.listSkills(user).map(s => s.name), ['office-self-check', 'seo-checks'])
  ext.deleteUserSkill(user, 'seo-checks')
  const src = tmp(); fs.mkdirSync(path.join(src, 'pdf-tool', 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(src, 'pdf-tool', 'SKILL.md'), '---\nname: pdf-tool\ndescription: Work with PDFs\n---\nUse scripts/run.py')
  fs.writeFileSync(path.join(src, 'pdf-tool', 'scripts', 'run.py'), 'print(1)')
  assert.deepEqual(ext.importSkills(src, user), ['pdf-tool'])
  assert.ok(fs.existsSync(path.join(user, 'pdf-tool', 'scripts', 'run.py')))
  assert.throws(() => ext.importSkills(tmp(), user))
})

test('DSH profile overlay mounts MCP clients and plugin skill roots; secrets stay as env references', () => {
  const home = tmp(), old = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const { writeProfile } = require('../app/runtime.cjs')
    const servers = [P.normalizeMcpServer({ name: 'gh', command: 'npx', args: ['-y', 'srv'], env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' } }), P.normalizeMcpServer({ name: 'remote', transport: 'streamable-http', url: 'https://x.test/mcp', headers: { Authorization: 'Bearer ${TOK}' } })]
    const patch = writeProfile({ ...base(), dshRoot: 'D:\\deepseek-harness' }, { mcpServers: servers, skillDirs: ['D:\\skills'] })
    const y = fs.readFileSync(patch, 'utf8')
    assert.match(y, /- id: skill-filesystem\n {2}config:\n {4}customSkillDirs: \["D:\\\\skills"\]/)
    assert.match(y, /id: "office-mcp-gh"\n\s+name: "@deepseek-ai\/dsh-mcp-client"/)
    assert.match(y, /"GITHUB_TOKEN": !!js process\.env\.GITHUB_TOKEN/)
    assert.match(y, /transport: streamable-http/)
    assert.doesNotMatch(y, /\$\{GITHUB_TOKEN\}/)
    const none = fs.readFileSync(writeProfile({ ...base(), dshRoot: 'D:\\deepseek-harness' }, {}), 'utf8')
    assert.doesNotMatch(none, /dsh-mcp-client|skill-filesystem/)
  } finally { if (old === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = old }
})

test('Codex MCP overrides are valid TOML values with approval pre-granted', () => {
  const a = ext.codexMcpArgs([P.normalizeMcpServer({ name: 'gh', command: 'C:\\Program Files\\node.exe', args: ['a b', 'x"y'], env: { K: 'v' } })], 'D:\\ws')
  const kv = a.filter((_, i) => i % 2 === 1)
  assert.ok(a.filter((_, i) => i % 2 === 0).every(x => x === '-c'))
  assert.ok(kv.includes('mcp_servers.gh.command="C:\\\\Program Files\\\\node.exe"'))
  assert.ok(kv.includes('mcp_servers.gh.args=["a b", "x\\"y"]'))
  assert.ok(kv.includes('mcp_servers.gh.default_tools_approval_mode="approve"'))
  assert.ok(kv.some(x => x.startsWith('mcp_servers.gh.env={')))
})

test('plugins install from a folder, are validated, and uninstall cleanly', () => {
  const src = tmp(), user = tmp()
  fs.writeFileSync(path.join(src, 'plugin.json'), JSON.stringify({ id: 'my-pack', name: 'Mine', experts: [{ id: 'x1', title: 'X', prompt: 'p' }] }))
  const p = ext.installPlugin(src, user)
  assert.equal(p.id, 'my-pack')
  assert.ok(ext.loadPlugins(user).some(x => x.id === 'my-pack' && !x.builtin))
  assert.throws(() => ext.installPlugin(tmp(), user))
  ext.removePlugin('my-pack', user)
  assert.ok(!ext.loadPlugins(user).some(x => x.id === 'my-pack'))
  assert.throws(() => ext.removePlugin('office-experts', user))
})

test('MCP connection test lists real tools and reports failures', { skip: !everything && 'server-everything not installed' }, async () => {
  const ok = await ext.testMcp({ name: 'everything', command: process.execPath, args: [everything, 'stdio'] })
  assert.equal(ok.ok, true, ok.error); assert.ok(ok.tools.some(t => t.name === 'echo'))
  const bad = await ext.testMcp({ name: 'bad', command: 'definitely-not-a-command-xyz' }, { timeout: 10000 })
  assert.equal(bad.ok, false); assert.ok(bad.error)
})
