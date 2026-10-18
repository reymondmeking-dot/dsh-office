// DSH-compatible provider plumbing: credential refs in ~/.dsh/.credentials.yaml,
// model discovery (GET {baseURL}/models), and import of providers declared in other DSH profiles.
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const I18N = require('./renderer/i18n.js')
const T = (k, v) => I18N.t(k, v)

const dshHome = () => process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const CRED_FILE = () => path.join(dshHome(), '.credentials.yaml')

/** Same rule as DSH's Models page: route id usable as settings key and credential stem. */
const ROUTE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
/** DSH `deriveKeyRef`: `minimax-cn` → `MINIMAX_CN_API_KEY`. */
const deriveKeyRef = provider => `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
const PROTOCOLS = ['openai-completions', 'openai-responses', 'anthropic-messages']
const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

let YAML
function yaml(dshRoot) {
  if (YAML) return YAML
  const pnpm = path.join(dshRoot, 'node_modules', '.pnpm')
  const dirs = [path.join(dshRoot, 'node_modules', 'yaml')]
  try { for (const d of fs.readdirSync(pnpm)) if (/^yaml@2/.test(d)) dirs.push(path.join(pnpm, d, 'node_modules', 'yaml')) } catch {}
  for (const d of dirs) { try { YAML = require(d); return YAML } catch {} }
  throw new Error(T('err.yamlResolve', { dir: path.join(dshRoot, 'node_modules') }))
}

let TOML
/** smol-toml from the DSH tree; null when DSH is not installed (caller falls back). */
function loadToml(dshRoot) {
  if (TOML !== undefined) return TOML
  const roots = [dshRoot, process.env.DSH_ROOT, path.join(__dirname, '..', '..', 'deepseek-harness')].filter(Boolean)
  const dirs = []
  for (const root of roots) {
    dirs.push(path.join(root, 'node_modules', 'smol-toml'))
    try { for (const d of fs.readdirSync(path.join(root, 'node_modules', '.pnpm'))) if (/^smol-toml@/.test(d)) dirs.push(path.join(root, 'node_modules', '.pnpm', d, 'node_modules', 'smol-toml')) } catch {}
  }
  for (const d of dirs) { try { TOML = require(d); return TOML } catch {} }
  TOML = null
  return TOML
}

let YAML_ROOT
function dshRoots(dshRoot) {
  const home = os.homedir()
  return [...new Set([
    dshRoot, process.env.DSH_ROOT,
    process.platform === 'win32' ? 'D:\\deepseek-harness' : '/opt/deepseek-harness',
    path.join(home, 'deepseek-harness'), path.join(home, 'deepseek', 'harness'),
  ].filter(Boolean))]
}
/** Parse a YAML document with the library shipped alongside DSH where possible. */
function yamlParse(text, dshRoot) {
  if (!YAML_ROOT) {
    for (const root of dshRoots(dshRoot)) {
      try { YAML_ROOT = yaml(root); break } catch {}
    }
    if (!YAML_ROOT) YAML_ROOT = null
  }
  if (YAML_ROOT) return YAML_ROOT.parse(text)
  throw new Error(T('err.yamlMissing'))
}

function readCreds(dshRoot) {
  const Y = yaml(dshRoot)
  const text = fs.existsSync(CRED_FILE()) ? fs.readFileSync(CRED_FILE(), 'utf8') : 'version: 1\nrefs: {}\n'
  return Y.parseDocument(text)
}

/** Credential state for each ref: { REF: '••••abcd' | null }. Never returns the secret. */
function keyStatus(dshRoot, refs) {
  const doc = readCreds(dshRoot).toJS() || {}
  const out = {}
  for (const r of refs) { const v = doc.refs?.[r]; out[r] = typeof v === 'string' && v ? `••••${v.slice(-4)}` : null }
  return out
}

function storedKey(dshRoot, ref) {
  const v = (readCreds(dshRoot).toJS() || {}).refs?.[ref]
  return typeof v === 'string' && v ? v : undefined
}

/** Write (or clear with '') one ref, preserving every other entry and comment. */
function setKey(dshRoot, ref, value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) throw new Error(T('err.invalidRef', { ref }))
  const doc = readCreds(dshRoot)
  if (!doc.has('version')) doc.set('version', 1)
  const v = String(value || '').trim()
  if (v) {
    if (/[^\x21-\x7e]/.test(v)) throw new Error(T('err.keyChars'))
    doc.setIn(['refs', ref], v)
  } else doc.deleteIn(['refs', ref])
  fs.mkdirSync(dshHome(), { recursive: true })
  const file = CRED_FILE()
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-office`)
  fs.writeFileSync(file, doc.toString(), { encoding: 'utf8', mode: 0o600 })
}

function listingUrl(baseURL, api) {
  const base = baseURL.replace(/\/+$/, '')
  if (api !== 'anthropic-messages') return `${base}/models`
  return `${base.endsWith('/v1') ? base.slice(0, -3) : base}/v1/models?limit=1000`
}

/** Listings often encode token limits as strings; never accept fractions or unsafe integers. */
const posInt = (...xs) => xs.map(x => typeof x === 'string' && /^\d+$/.test(x.trim()) ? Number(x) : x).find(x => Number.isSafeInteger(x) && x > 0)

function reasoningEfforts(raw, catalog = false) {
  const value = raw?.reasoningEfforts ?? raw?.reasoning_efforts ?? raw?.supported_reasoning_efforts
  if (value === false || raw?.reasoning === false) return false
  if (Array.isArray(value)) {
    const levels = THINKING_LEVELS.filter(level => value.includes(level))
    if (levels.length) return Object.fromEntries(levels.map(level => [level, level === 'off' ? null : level]))
  } else if (value && typeof value === 'object') {
    const entries = THINKING_LEVELS.filter(level => typeof value[level] === 'string' && value[level] || level === 'off' && value[level] === null)
    if (entries.length) return Object.fromEntries(entries.map(level => [level, value[level]]))
  }
  // This defaulting belongs to the installed pi-ai catalog contract, not to arbitrary APIs.
  if (catalog && raw?.reasoning === true) {
    const map = raw.thinkingLevelMap || {}
    return Object.fromEntries(THINKING_LEVELS.filter(level => map[level] !== null && (!['xhigh', 'max'].includes(level) || map[level] !== undefined)).map(level => [level, map[level] ?? (level === 'off' ? null : level)]))
  }
}

function modelMetadata(raw, catalog = false) {
  const input = raw?.input ?? raw?.input_modalities ?? raw?.architecture?.input_modalities
  const modalities = Array.isArray(input) ? [...new Set(input.filter(x => typeof x === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(x)))] : []
  return {
    contextWindow: posInt(raw?.contextWindow, raw?.context_window, raw?.context_length, raw?.limit?.context, raw?.top_provider?.context_length),
    // An input-only limit is not the size of a shared input/output context window.
    inputLimit: posInt(raw?.inputLimit, raw?.max_input_tokens, raw?.input_token_limit, raw?.limit?.input),
    outputLimit: posInt(raw?.outputLimit, raw?.maxTokens, raw?.max_tokens, raw?.max_output_tokens, raw?.max_completion_tokens, raw?.output_token_limit, raw?.limit?.output, raw?.top_provider?.max_completion_tokens),
    reasoningEfforts: reasoningEfforts(raw, catalog),
    input: modalities.length ? modalities : undefined,
  }
}

const METADATA_FIELDS = ['contextWindow', 'inputLimit', 'outputLimit', 'reasoningEfforts', 'input']

/** Read data, without importing provider code or contacting another service. */
function catalogMetadata({ dshRoot, route, model, api }) {
  for (const root of dshRoots(dshRoot)) {
    const packages = [path.join(root, 'node_modules', '@earendil-works', 'pi-ai'), path.join(root, 'packages', 'llm', 'llm-pi-ai', 'node_modules', '@earendil-works', 'pi-ai')]
    try {
      for (const dir of fs.readdirSync(path.join(root, 'node_modules', '.pnpm'))) {
        if (dir.startsWith('@earendil-works+pi-ai@')) packages.push(path.join(root, 'node_modules', '.pnpm', dir, 'node_modules', '@earendil-works', 'pi-ai'))
      }
    } catch {}
    for (const pkg of packages) {
      const dataDir = path.join(pkg, 'dist', 'providers', 'data')
      let files
      try { files = fs.readdirSync(dataDir).filter(file => /^[a-z][a-z0-9-]*\.json$/.test(file)) } catch { continue }
      const preferred = ROUTE_PATTERN.test(route || '') ? `${route}.json` : ''
      const matches = []
      for (const file of [...files.filter(file => file === preferred), ...files.filter(file => file !== preferred)]) {
        let data
        try { data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')) } catch { continue }
        for (const [protocol, models] of Object.entries(data || {})) {
          const raw = models?.[model]
          if (!raw || raw.id !== model || (raw.api || protocol) !== api) continue
          const metadata = modelMetadata(raw, true)
          if (file === preferred) return metadata
          matches.push(metadata)
        }
      }
      if (!matches.length) continue
      // A gateway alias can name several catalog providers. Keep only facts they agree on.
      const metadata = {}
      for (const field of METADATA_FIELDS) {
        if (matches[0][field] !== undefined && matches.every(row => JSON.stringify(row[field]) === JSON.stringify(matches[0][field]))) metadata[field] = matches[0][field]
      }
      return metadata
    }
  }
  return {}
}

/** Ask the endpoint which models it serves (DSH discovery semantics). */
async function discover(fetchImpl, { baseURL, api, apiKey }) {
  if (!/^https?:\/\//.test(baseURL || '')) throw new Error(T('err.httpBase'))
  const url = listingUrl(baseURL, api)
  const headers = { accept: 'application/json' }
  if (apiKey) {
    if (api === 'anthropic-messages') { headers['x-api-key'] = apiKey; headers['anthropic-version'] = '2023-06-01' }
    else headers.authorization = `Bearer ${apiKey}`
  }
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 20000)
  let res, body
  try {
    res = await fetchImpl(url, { headers, signal: ac.signal })
    body = await res.json().catch(() => null)
  } catch (e) { throw new Error(T('err.connect', { url, error: e.message || e })) } finally { clearTimeout(t) }
  if (!res.ok) throw new Error(T('err.httpStatus', { url, status: res.status, auth: res.status === 401 || res.status === 403 ? T('err.authHint') : '' }))
  let rows
  if (Array.isArray(body?.data)) rows = body.data.map(raw => ({ raw }))
  else if (body?.models && typeof body.models === 'object' && !Array.isArray(body.models)) rows = Object.entries(body.models).filter(([, r]) => r && typeof r === 'object').map(([key, raw]) => ({ key, raw }))
  else throw new Error(T('err.badList'))
  const out = []
  for (const { key, raw } of rows) {
    const id = key || raw?.id; if (typeof id !== 'string' || !id) continue
    const metadata = modelMetadata(raw)
    out.push({ id, name: raw?.name || raw?.display_name || raw?.displayName || id, ...metadata, maxTokens: metadata.outputLimit })
  }
  return out
}

/** Probe connectivity with one small request, then obtain declared metadata without capacity stress tests. */
async function testModel(fetchImpl, { baseURL, api, apiKey, model, route, dshRoot, configuredModel }) {
  if (!/^https?:\/\//.test(baseURL || '')) throw new Error(T('err.httpBase'))
  if (!model) throw new Error(T('err.needModel'))
  const base = baseURL.replace(/\/+$/, '')
  const prompt = T('test.prompt')
  let url; const headers = { 'content-type': 'application/json', accept: 'application/json' }; let body
  if (api === 'anthropic-messages') {
    url = `${base.endsWith('/v1') ? base.slice(0, -3) : base}/v1/messages`
    if (apiKey) headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    body = { model, max_tokens: 32, messages: [{ role: 'user', content: prompt }] }
  } else if (api === 'openai-responses') {
    url = `${base}/responses`
    if (apiKey) headers.authorization = `Bearer ${apiKey}`
    body = { model, input: prompt, max_output_tokens: 32 }
  } else {
    url = `${base}/chat/completions`
    if (apiKey) headers.authorization = `Bearer ${apiKey}`
    body = { model, max_tokens: 32, messages: [{ role: 'user', content: prompt }] }
  }
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 45000)
  const t0 = Date.now(); let res, text
  try {
    res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal })
    text = await res.text()
  } catch (e) { throw new Error(ac.signal.aborted ? T('err.timeout') : T('err.connectPlain', { error: e.message || e })) } finally { clearTimeout(t) }
  const ms = Date.now() - t0
  let j = null; try { j = JSON.parse(text) } catch {}
  if (!res.ok) {
    const msg = j?.error?.message || j?.message || text.slice(0, 200)
    throw new Error(T('err.modelStatus', { status: res.status, detail: res.status === 401 || res.status === 403 ? T('err.statusAuth') : res.status === 404 ? T('err.status404') : '', msg }))
  }
  const reply = j?.choices?.[0]?.message?.content
    ?? (Array.isArray(j?.content) ? j.content.filter(b => b.type === 'text').map(b => b.text).join('') : null)
    ?? j?.output_text
    ?? (Array.isArray(j?.output) ? j.output.flatMap(o => o.content || []).map(c => c.text || '').join('') : null)
    ?? ''
  const modelInfo = { id: model, sources: {}, checkedAt: new Date().toISOString() }
  let metadataWarning
  let remote
  try {
    const models = await discover(fetchImpl, { baseURL, api, apiKey })
    remote = models.find(row => row.id === model)
    if (!remote) metadataWarning = 'model-not-listed'
    else if (!remote.contextWindow || !remote.outputLimit) metadataWarning = 'limits-not-reported'
  } catch { metadataWarning = 'metadata-unavailable' }
  const catalog = catalogMetadata({ dshRoot, route, model, api })
  // A configured maxTokens is the request cap, not proof of output capability.
  const configured = configuredModel && (configuredModel.model || configuredModel.id) === model
    ? modelMetadata({ ...configuredModel, maxTokens: undefined }) : {}
  for (const field of METADATA_FIELDS) {
    for (const [source, metadata] of [['provider', remote], ['dsh-catalog', catalog], ['configured', configured]]) {
      if (metadata?.[field] === undefined) continue
      modelInfo[field] = metadata[field]
      modelInfo.sources[field] = source
      break
    }
  }
  return { ms, reply: String(reply).trim().slice(0, 60), modelInfo, ...(metadataWarning ? { metadataWarning } : {}) }
}

/** Providers declared (llm-pi-ai) in other DSH profiles, for one-click import. */
function dshProviders(dshRoot) {
  const Y = yaml(dshRoot)
  const out = []
  const root = path.join(dshHome(), 'profiles')
  let profiles = []
  try { profiles = fs.readdirSync(root) } catch {}
  for (const prof of profiles) {
    if (prof === 'office') continue
    const f = path.join(root, prof, 'cordis.patch.yml')
    if (!fs.existsSync(f)) continue
    let entries
    try { entries = Y.parse(fs.readFileSync(f, 'utf8')) } catch { continue }
    if (!Array.isArray(entries)) continue
    for (const e of entries) {
      const providers = e?.id === 'llm-pi-ai' ? e.config?.providers : null
      if (!providers) continue
      for (const [route, p] of Object.entries(providers)) {
        if (!p || out.some(x => x.route === route)) continue
        out.push({
          route, profile: prof, displayName: p.displayName || route, api: p.api || 'openai-completions', baseURL: p.baseURL || '',
          apiKeyEnv: p.apiKeyEnv || deriveKeyRef(route),
          models: (p.models || []).map(m => ({ id: m.id, name: m.name || m.id, contextWindow: m.contextWindow, maxTokens: m.maxTokens, reasoningEfforts: m.reasoningEfforts })),
        })
      }
    }
  }
  return out
}

module.exports = { ROUTE_PATTERN, deriveKeyRef, PROTOCOLS, THINKING_LEVELS, keyStatus, storedKey, setKey, discover, testModel, dshProviders, loadToml, yamlParse, yaml, posInt }
