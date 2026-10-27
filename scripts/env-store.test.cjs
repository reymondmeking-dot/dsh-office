'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EnvStore, scanCandidates, parseDotEnv, validName, mask, redact } = require('../app/env-store.cjs')
const { injectEnv } = require('../app/runtime.cjs')

// Reversible stand-in for Electron safeStorage; the test checks the file never holds plaintext.
const fakeStorage = (backend = 'dpapi') => ({
  isEncryptionAvailable: () => true, getSelectedStorageBackend: () => backend,
  encryptString: s => Buffer.from(Buffer.from(s, 'utf8').toString('base64').split('').reverse().join(''), 'utf8'),
  decryptString: b => Buffer.from(b.toString('utf8').split('').reverse().join(''), 'base64').toString('utf8'),
})
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'office-env-test-'))

test('env store encrypts at rest, masks for the renderer and scopes injection per engine', () => {
  const dir = tmp()
  try {
    const store = new EnvStore(path.join(dir, 'env-vault.json'), fakeStorage())
    const r = store.import({ OPENAI_API_KEY: 'sk-abcdefghijklmnopqrstuvwxyz123456', REGION: 'cn-north-1', PATH: 'C:\\evil', DSH_HOME: 'x', 'bad name': 'v', EMPTY: '' }, { source: 'paste' })
    assert.deepEqual(r.added.sort(), ['OPENAI_API_KEY', 'REGION'])
    assert.deepEqual(r.skipped.map(s => s.name).sort(), ['DSH_HOME', 'EMPTY', 'PATH', 'bad name'])
    const raw = fs.readFileSync(path.join(dir, 'env-vault.json'), 'utf8')
    assert.ok(!raw.includes('sk-abcdefghij') && !raw.includes('cn-north-1'), 'plaintext must not reach disk')
    const listed = store.list()
    assert.equal(listed.available, true)
    const key = listed.vars.find(v => v.name === 'OPENAI_API_KEY')
    assert.ok(!JSON.stringify(listed).includes('sk-abcdefghijklmnop'))
    assert.match(key.masked, /^sk-•+56$/)
    assert.equal(listed.vars.find(v => v.name === 'REGION').masked, 'cn-north-1')
    store.update('REGION', { scope: 'codex' })
    assert.deepEqual(Object.keys(store.injected('dsh')), ['OPENAI_API_KEY'])
    assert.deepEqual(Object.keys(store.injected('codex')).sort(), ['OPENAI_API_KEY', 'REGION'])
    store.update('OPENAI_API_KEY', { enabled: false })
    assert.deepEqual(Object.keys(store.injected('dsh')), [])
    // Only credential-like values are redacted; plain config stays readable.
    assert.deepEqual(store.secrets(), ['sk-abcdefghijklmnopqrstuvwxyz123456'])
    // Re-reading from disk with a fresh instance round-trips.
    const again = new EnvStore(path.join(dir, 'env-vault.json'), fakeStorage())
    assert.equal(again.read().length, 2)
    again.delete('REGION'); assert.equal(again.read().length, 1)
    again.clear(); assert.deepEqual(again.injected('all'), {})
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('env store refuses plaintext fallback storage', () => {
  const dir = tmp()
  try {
    const store = new EnvStore(path.join(dir, 'v.json'), fakeStorage('basic_text'))
    assert.equal(store.available(), false)
    assert.deepEqual(store.list(), { available: false, vars: [] })
    assert.throws(() => store.import({ A_KEY: 'value123' }))
    assert.deepEqual(store.injected('dsh'), {})
    assert.ok(!fs.existsSync(path.join(dir, 'v.json')))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('candidate scan reads system and .env sources, filters OS noise and blocked names', () => {
  const dir = tmp()
  try {
    const file = path.join(dir, '.env')
    fs.writeFileSync(file, '# c\nexport ANTHROPIC_API_KEY="sk-ant-xyz123456789"\nDATABASE_URL=postgres://u:p4ss@h/db # inline\n$env:FOO=bar\nNODE_OPTIONS=--inspect\n')
    const list = scanCandidates({ env: { COMPUTERNAME: 'PC', PATH: 'x', GITHUB_TOKEN: 'ghp_abcdefghijklmnop', MY_FLAG: '1' }, files: [file] })
    const names = list.map(c => `${c.source === 'system' ? 'sys' : 'file'}:${c.name}`).sort()
    assert.deepEqual(names, ['file:ANTHROPIC_API_KEY', 'file:DATABASE_URL', 'file:FOO', 'sys:GITHUB_TOKEN', 'sys:MY_FLAG'])
    const db = list.find(c => c.name === 'DATABASE_URL')
    assert.equal(db.value, 'postgres://u:p4ss@h/db'); assert.equal(db.secret, true); assert.ok(!db.masked.includes('p4ss'))
    assert.ok(list.every(c => typeof c.id === 'string' && c.id.length > 4))
    assert.equal(new Set(list.map(c => c.id)).size, list.length)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('dotenv parsing, name validation, masking and deep redaction', () => {
  assert.deepEqual(parseDotEnv("A=1\nB='two words'\nC=\"x\\ny\"\n  # skip\nset D=4"), { A: '1', B: 'two words', C: 'x\ny', D: '4' })
  for (const n of ['PATH', 'Path', 'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'DSH_OFFICE_ENV_NAMES', 'LD_PRELOAD', 'HTTPS_PROXY', '1A', 'A-B']) assert.equal(validName(n), false, n)
  for (const n of ['OPENAI_API_KEY', 'AWS_REGION', '_X']) assert.equal(validName(n), true, n)
  assert.equal(mask('postgres://user:secretpw@host/db', 'DB'), 'pos••••••••••••db')
  assert.equal(mask('short', 'TOKEN'), '•••••')
  assert.deepEqual(redact({ a: 'use sk-1234567890 now', b: ['sk-1234567890'], n: 3 }, ['sk-1234567890', 'x']), { a: 'use [redacted] now', b: ['[redacted]'], n: 3 })
})

test('runtime injection sets variables, drops case-variant duplicates and lists names for the DSH plugin', () => {
  const env = { openai_api_key: 'old', KEEP: 'k' }
  injectEnv(env, { OPENAI_API_KEY: 'new', REGION: 'r' })
  assert.equal(env.OPENAI_API_KEY, 'new'); assert.equal(env.openai_api_key, undefined); assert.equal(env.KEEP, 'k')
  assert.deepEqual(env.DSH_OFFICE_ENV_NAMES.split(',').sort(), ['OPENAI_API_KEY', 'REGION'])
  const empty = { DSH_OFFICE_ENV_NAMES: 'STALE' }; injectEnv(empty, {})
  assert.equal(empty.DSH_OFFICE_ENV_NAMES, undefined)
})

test('DSH env plugin adds listed variables to every shell request and restores on dispose', async () => {
  const plugin = await import(require('node:url').pathToFileURL(path.join(__dirname, '../app/dsh/env-inject.mjs')).href)
  const shell = { resolve: request => ({ ...request, resolved: true }) }
  const effects = []
  const ctx = { shell, effect: fn => effects.push(fn()) }
  process.env.DSH_OFFICE_ENV_NAMES = 'MY_TEST_API_KEY,MISSING_ONE'; process.env.MY_TEST_API_KEY = 'sk-test-value'
  try {
    plugin.apply(ctx)
    assert.deepEqual(shell.resolve({ command: 'x' }), { command: 'x', env: { MY_TEST_API_KEY: 'sk-test-value' }, resolved: true })
    assert.deepEqual(shell.resolve({ command: 'x', env: { MY_TEST_API_KEY: 'override' } }).env, { MY_TEST_API_KEY: 'override' })
    for (const dispose of effects) dispose?.()
    assert.deepEqual(shell.resolve({ command: 'x' }), { command: 'x', resolved: true })
  } finally { delete process.env.DSH_OFFICE_ENV_NAMES; delete process.env.MY_TEST_API_KEY }
})
