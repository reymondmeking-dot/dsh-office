'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const P = require('../app/browser-policy.cjs')
const { Vault } = require('../app/vault.cjs')
const ROOT = path.resolve(__dirname, '../tmp/browser-unit-' + process.pid)
fs.mkdirSync(ROOT, { recursive: true })
test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }))
function storage() {
  const key = crypto.randomBytes(32)
  return { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'dpapi',
    encryptString(text) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); const bytes = Buffer.concat([c.update(text, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), bytes]) },
    decryptString(b) { const c = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); c.setAuthTag(b.subarray(12, 28)); return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString('utf8') } }
}
test('vault encrypts all site metadata and password, roundtrips, replaces, deletes, and exports ciphertext', () => {
  const file = path.join(ROOT, 'vault.json'), vault = new Vault(file, storage())
  const entry = vault.save({ origin: 'https://example.org/login', username: 'private-user-245', password: 'secret-never-on-disk-849' })
  const disk = fs.readFileSync(file, 'utf8')
  for (const clear of ['example.org', 'private-user-245', 'secret-never-on-disk-849']) assert.ok(!disk.includes(clear))
  assert.deepEqual(Object.keys(JSON.parse(disk)).sort(), ['ciphertext', 'version'])
  assert.equal(vault.get(entry.id).password, 'secret-never-on-disk-849')
  assert.deepEqual(vault.list(), [{ id: entry.id, origin: 'https://example.org', username: 'private-user-245' }])
  assert.equal(vault.save({ origin: 'https://example.org', username: 'private-user-245', password: 'new-secret' }).id, entry.id)
  assert.equal(vault.list().length, 1)
  const backup = path.join(ROOT, 'encrypted-backup.json'); vault.exportEncrypted(backup); assert.equal(fs.readFileSync(backup, 'utf8'), fs.readFileSync(file, 'utf8'))
  vault.delete(entry.id); assert.deepEqual(vault.list(), [])
})
test('vault refuses unavailable or plaintext backends without touching disk', () => {
  for (const backend of [{ isEncryptionAvailable: () => false }, { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'basic_text' }]) {
    const file = path.join(ROOT, crypto.randomUUID() + '.json'), vault = new Vault(file, backend)
    assert.throws(() => vault.save({ origin: 'https://test.org', password: 'nope' })); assert.ok(!fs.existsSync(file))
  }
})
test('workspace paths reject traversal, prefix siblings, and links escaping workspace', () => {
  const ws = path.join(ROOT, 'work'), outside = path.join(ROOT, 'work-sibling'); fs.mkdirSync(ws); fs.mkdirSync(outside)
  fs.writeFileSync(path.join(ws, 'ok.md'), 'ok'); fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret')
  assert.equal(P.workspacePath(ws, 'ok.md'), fs.realpathSync(path.join(ws, 'ok.md')))
  assert.throws(() => P.workspacePath(ws, '../work-sibling/secret.txt'))
  assert.throws(() => P.workspacePath(ws, path.join(outside, 'secret.txt')))
  fs.symlinkSync(outside, path.join(ws, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => P.workspacePath(ws, 'linked/secret.txt'))
  assert.throws(() => P.workspacePath(ws, 'linked/new.txt', { create: true }))
  assert.equal(P.workspacePath(ws, 'nested/new.png', { create: true }), path.join(fs.realpathSync(ws), 'nested', 'new.png'))
})
test('URL policy blocks local ranges, credential URLs, non-HTTP schemes and DNS private resolutions', async () => {
  for (const host of ['127.0.0.1', '10.2.3.4', '172.16.0.1', '192.168.1.1', '169.254.169.254', '[::1]', '[::ffff:127.0.0.1]', '[fc00::1]', 'localhost', 'router.local']) assert.equal(P.privateAddress(host), true, host)
  for (const url of ['file:///etc/passwd', 'javascript:1', 'http://user:pass@public.example', 'http://127.0.0.1', 'http://localhost']) await assert.rejects(P.assertURL(url))
  await assert.rejects(P.assertURL('https://evil.example', {}, async () => [{ address: '10.0.0.1' }]))
  await assert.rejects(P.assertURL('https://sub.blocked.org', { blockedDomains: ['blocked.org'] }))
  assert.equal(await P.assertURL('https://public.example/', {}, async () => [{ address: '93.184.216.34' }]), 'https://public.example/')
  assert.equal(await P.assertURL('http://127.0.0.1:1234', { allowPrivate: true }), 'http://127.0.0.1:1234/')
})
test('search parses Bing/DDG/Google redirect URLs, deduplicates and excludes non-web links', () => {
  const actual = 'https://www.example.org/fact', encoded = 'a1' + Buffer.from(actual).toString('base64url')
  const rows = [{ title: ' Fact ', url: 'https://www.bing.com/ck/a?u=' + encoded, snippet: ' Public fact ' }, { title: 'duplicate', url: actual }, { title: 'other', url: 'https://duckduckgo.com/l/?uddg=' + encodeURIComponent('https://other.org') }, { title: 'bad', url: 'javascript:alert(1)' }]
  assert.deepEqual(P.parseSearchResults(rows, 3), [{ title: 'Fact', url: actual, snippet: 'Public fact' }, { title: 'other', url: 'https://other.org', snippet: '' }])
  assert.equal(P.decodeResultURL('https://www.google.com/url?q=https%3A%2F%2Fsite.org'), 'https://site.org')
  assert.match(P.searchURL('public fact'), /bing\.com\/search\?q=public%20fact$/)
  assert.equal(P.searchURL('a&b', { searchEngine: 'custom', searchTemplate: 'https://search.org/?q={q}' }), 'https://search.org/?q=a%26b')
  assert.throws(() => P.searchURL('x', { searchEngine: 'custom', searchTemplate: 'file:///{q}' }))
})

test('model-result redaction walks values before JSON escaping and covers encoded URL secrets', () => {
  const password = 'a"b\\c\n &+/?', raw = { title: password, url: 'https://public.org/?password=' + encodeURIComponent(password), rows: [{ snippet: 'before ' + password + ' after' }], plus: new URLSearchParams({q:password}).toString(), normal: 'public content' }
  const cleaned = P.redactResult(raw, new Set([password]))
  assert.equal(cleaned.title, '[redacted]'); assert.equal(cleaned.rows[0].snippet, 'before [redacted] after'); assert.equal(cleaned.normal, 'public content')
  assert.equal(cleaned.url, 'https://public.org/?password=[redacted]'); assert.equal(cleaned.plus, 'q=[redacted]')
  assert.ok(!JSON.stringify(cleaned).includes(JSON.stringify(password).slice(1,-1)))
})
