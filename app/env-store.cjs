// Encrypted environment-variable store. Values are encrypted with the OS
// credential store (Electron safeStorage), never written to settings, prompts,
// logs or the renderer, and are injected only into employee runtimes.
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const I = require('./renderer/i18n.js')
const L = (zh, en) => I.getLang() === 'en' ? en : zh

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
// Names that would change how Office, Node, DSH or the OS itself start.
const BLOCKED = /^(PATH|PATHEXT|NODE_OPTIONS|NODE_PATH|ELECTRON_.*|DSH_.*|CODEX_HOME|CODEX_.*SANDBOX.*|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES.*|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|SHELL|PSMODULEPATH|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|GLOBAL_AGENT_.*|HTTPS?_PROXY|NO_PROXY|ALL_PROXY)$/i
// System-scan noise: OS, shell and session facts nobody wants to "import".
const NOISE = /^(ALLUSERSPROFILE|COMMONPROGRAM.*|COMPUTERNAME|DRIVERDATA|HOMEDRIVE|HOMEPATH|LOGONSERVER|NUMBER_OF_PROCESSORS|ONEDRIVE.*|OS|PROCESSOR_.*|PROMPT|PUBLIC|SESSIONNAME|USERDOMAIN.*|USERNAME|WSLENV|WT_.*|TERM.*|COLORTERM|LANG|LC_.*|PWD|OLDPWD|SHLVL|LOGNAME|USER|_|CHROME_.*|VSCODE_.*|ORIGINAL_XDG_.*|FPS_BROWSER_.*|EFC_.*|IGCCSVC_DB|ZES_ENABLE_SYSMAN|POWERSHELL_.*|CONEMU.*|MSYS.*|MINGW.*|NVM_.*|CHOCOLATEYLASTPATHUPDATE|GIT_ASKPASS|NO_COLOR|PAGER|GIT_PAGER|INIT_CWD|NPM_CONFIG_.*|NPM_LIFECYCLE_.*|NPM_PACKAGE_.*|NODE|NODE_ENV|NODE_EXE|COREPACK_.*)$/i
const SECRETISH = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE|DSN|DATABASE_URL|CONNECTION_STRING/i
const SCOPES = ['all', 'dsh', 'codex']

const validName = name => typeof name === 'string' && NAME.test(name) && !BLOCKED.test(name)
const secretish = name => SECRETISH.test(String(name))
// Values that carry a credential whatever their name: URL userinfo or long opaque tokens.
const secretValue = s => /:\/\/[^\s/@]*:[^\s/@]+@/.test(s) || /[A-Za-z0-9_+/=.-]{24,}/.test(s)
/** Display-only mask: never more than the first 3 and last 2 characters of long values. */
function mask(value, name = '') {
  const s = String(value ?? '')
  if (!s) return ''
  if (!secretish(name) && s.length <= 80 && !secretValue(s)) return s
  if (s.length <= 8) return '•'.repeat(s.length)
  return `${s.slice(0, 3)}${'•'.repeat(Math.min(12, s.length - 5))}${s.slice(-2)}`
}

function parseDotEnv(text) {
  const out = {}
  for (const raw of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^(?:export\s+|set\s+|\$env:)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/i.exec(line)
    if (!m) continue
    let v = m[2].trim()
    if (/^".*"$/s.test(v)) v = v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"')
    else if (/^'.*'$/s.test(v)) v = v.slice(1, -1)
    else v = v.replace(/\s+#.*$/, '').trim()
    if (v) out[m[1]] = v
  }
  return out
}

class EnvStore {
  constructor(file, safeStorage) { this.file = file; this.storage = safeStorage; this.cache = null }
  available() { return !!this.storage?.isEncryptionAvailable() && this.storage.getSelectedStorageBackend?.() !== 'basic_text' }
  assertAvailable() { if (!this.available()) throw new Error(L('系统加密不可用；环境变量不会保存。请启用系统凭据存储后重试。', 'System encryption is unavailable. Variables were not saved; enable the OS credential store and retry.')) }
  read() {
    if (this.cache) return this.cache.map(e => ({ ...e }))
    this.assertAvailable()
    if (!fs.existsSync(this.file)) return (this.cache = []).slice()
    const disk = JSON.parse(fs.readFileSync(this.file, 'utf8'))
    if (disk.version !== 1 || typeof disk.ciphertext !== 'string') throw new Error(L('环境变量库格式无效', 'Invalid environment store format'))
    this.cache = JSON.parse(this.storage.decryptString(Buffer.from(disk.ciphertext, 'base64')))
    return this.cache.map(e => ({ ...e }))
  }
  write(entries) {
    this.assertAvailable()
    const cipher = this.storage.encryptString(JSON.stringify(entries)).toString('base64')
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const temp = this.file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp'
    try { fs.writeFileSync(temp, JSON.stringify({ version: 1, ciphertext: cipher }), { mode: 0o600 }); fs.renameSync(temp, this.file) }
    finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
    this.cache = entries.map(e => ({ ...e }))
  }
  /** Renderer-safe listing: names, masked values and switches only. */
  list() {
    if (!this.available()) return { available: false, vars: [] }
    return { available: true, vars: this.read().map(e => ({ name: e.name, masked: mask(e.value, e.name), secret: secretish(e.name) || secretValue(e.value), enabled: e.enabled !== false, scope: e.scope, source: e.source || '', updatedAt: e.updatedAt })) }
  }
  /** Add or replace variables. Invalid and blocked names are reported, never stored. */
  import(pairs, { source = 'paste', scope = 'all', enabled = true } = {}) {
    if (!SCOPES.includes(scope)) throw new Error(L('作用范围无效', 'Invalid scope'))
    const all = this.read(), added = [], skipped = []
    for (const [name, raw] of Object.entries(pairs || {})) {
      const value = typeof raw === 'string' ? raw : ''
      if (!validName(name)) { skipped.push({ name: String(name).slice(0, 80), reason: 'blocked' }); continue }
      if (!value || value.length > 32768 || value.includes('\0')) { skipped.push({ name, reason: 'value' }); continue }
      const old = all.findIndex(e => e.name.toUpperCase() === name.toUpperCase())
      const entry = { name, value, enabled, scope: old >= 0 ? all[old].scope : scope, source: String(source).slice(0, 300), updatedAt: new Date().toISOString() }
      if (old >= 0) all.splice(old, 1, entry); else all.push(entry)
      added.push(name)
    }
    if (all.length > 500) throw new Error(L('最多保存 500 个环境变量', 'At most 500 variables can be stored'))
    if (added.length) this.write(all)
    return { added, skipped }
  }
  update(name, patch = {}) {
    const all = this.read(), e = all.find(x => x.name === name)
    if (!e) throw new Error(L('环境变量不存在', 'Variable not found'))
    if (patch.enabled !== undefined) e.enabled = patch.enabled === true
    if (patch.scope !== undefined) { if (!SCOPES.includes(patch.scope)) throw new Error(L('作用范围无效', 'Invalid scope')); e.scope = patch.scope }
    this.write(all); return true
  }
  delete(name) { this.write(this.read().filter(e => e.name !== name)); return true }
  clear() { this.write([]); return true }
  /** name → value for one engine ('dsh' | 'codex'). Unavailable storage injects nothing. */
  injected(engine) {
    if (!this.available() || !fs.existsSync(this.file)) return {}
    try { return Object.fromEntries(this.read().filter(e => e.enabled !== false && (e.scope === 'all' || e.scope === engine) && validName(e.name)).map(e => [e.name, e.value])) } catch { return {} }
  }
  /** Values to redact from any model-visible Office tool output (secret names or credential-looking values). */
  secrets() {
    if (!this.available() || !fs.existsSync(this.file)) return []
    try { return this.read().filter(e => typeof e.value === 'string' && e.value.length >= 6 && (secretish(e.name) || secretValue(e.value))).map(e => e.value) } catch { return [] }
  }
}

/**
 * Import candidates from the system environment and known agent `.env` files.
 * Values stay in main: each candidate gets an opaque id the renderer can select.
 */
function scanCandidates({ env = process.env, files = [] } = {}) {
  const out = []
  for (const [name, value] of Object.entries(env)) {
    if (!value || !validName(name) || NOISE.test(name) || value.length > 32768) continue
    out.push({ name, value, source: 'system' })
  }
  for (const file of files) {
    let text = ''
    try { const st = fs.statSync(file); if (!st.isFile() || st.size > 512 * 1024) continue; text = fs.readFileSync(file, 'utf8') } catch { continue }
    for (const [name, value] of Object.entries(parseDotEnv(text))) if (validName(name)) out.push({ name, value, source: file })
  }
  return out.map((c, i) => ({ ...c, id: `${i}-${crypto.createHash('sha256').update(c.source + '\0' + c.name).digest('hex').slice(0, 10)}`, secret: secretish(c.name) || secretValue(c.value), masked: mask(c.value, c.name) }))
}

/** Replace every stored secret value in model-visible text or structured data. */
function redact(value, secrets) {
  const list = [...new Set(secrets)].filter(s => typeof s === 'string' && s.length >= 6).sort((a, b) => b.length - a.length)
  if (!list.length) return value
  const walk = v => typeof v === 'string' ? list.reduce((s, x) => s.split(x).join('[redacted]'), v)
    : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v
  return walk(value)
}

module.exports = { EnvStore, scanCandidates, parseDotEnv, validName, mask, redact, secretish, secretValue, SCOPES }
