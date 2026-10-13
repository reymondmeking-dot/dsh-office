// Extraction of API configuration from other agent runtimes installed on this
// machine: DSH profiles, Codex, Claude Code, Hermes, opencode, cc-switch, plus
// API-related environment variables and `.env` files.
//
// Secret handling: a located key value NEVER leaves this module through scan().
// Records carry only a masked preview; the raw value stays in `secrets`, keyed by
// record id, and the main process reads it back with `secretOf()` when it actually
// writes a credential. The renderer only ever sees `hasKey` / `keyMask`.
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const prov = require('./providers.cjs')
const I18N = require('./renderer/i18n.js')
const T = (k, v) => I18N.t(k, v)

const home = () => os.homedir()
const readText = f => { try { return fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '') } catch { return null } }
const readJson = f => { const t = readText(f); if (t == null) return null; try { return JSON.parse(t.replace(/^\uFEFF/, '')) } catch { return null } }
/** Tolerant JSONC: comments and trailing commas (used by opencode.jsonc and VS Code files). */
const stripJsonc = t => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:"'\\])\/\/[^\n]*/g, '$1')
  .replace(/,(\s*[}\]])/g, '$1')
const readJsonc = f => { const t = readText(f); if (t == null) return null; try { return JSON.parse(stripJsonc(t)) } catch { return null } }

const posInt = (...xs) => xs.find(x => Number.isInteger(x) && x > 0)
const mask = v => typeof v === 'string' && v.length >= 8 ? `••••${v.slice(-4)}` : v ? '••••' : null
const str = v => typeof v === 'string' && v.trim() ? v.trim() : null

/** `minimax-cn` → `MINIMAX_CN_API_KEY`; keeps env refs DSH can resolve. */
const keyRefOf = route => `${String(route).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
/** DSH route ids: lowercase, hyphen separated, must start with a letter. */
function toRoute(s) {
  const r = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '')
  return r || 'provider'
}

/** Protocol names differ per agent; map them onto DSH's three wire protocols. */
function mapApi(v, fallback = 'openai-completions') {
  const s = String(v || '').toLowerCase()
  if (!s) return fallback
  if (/anthropic|claude|messages/.test(s)) return 'anthropic-messages'
  if (/responses/.test(s)) return 'openai-responses'
  if (/chat|completions|openai|compatible/.test(s)) return 'openai-completions'
  return fallback
}

/**
 * A bare host is what most agents store, but the OpenAI-compatible wire path
 * needs `/v1`. Only an empty path is touched, so a gateway with a real prefix
 * (`/api/coding/v3`, `/compatible-mode/v1`) keeps it verbatim.
 */
function normalizeBase(baseURL, api) {
  const b = str(baseURL)
  if (!b) return null
  const trimmed = b.replace(/\/+$/, '')
  if (api === 'anthropic-messages') return trimmed
  try {
    const u = new URL(trimmed)
    if (u.pathname === '' || u.pathname === '/') u.pathname = '/v1'
    return u.toString().replace(/\/+$/, '')
  } catch { return trimmed }
}

function modelEntry(id, name, contextWindow, maxTokens) {
  return { id: String(id), name: str(name) || String(id), contextWindow: posInt(contextWindow) || null, maxTokens: posInt(maxTokens) || null }
}

// ---------------------------------------------------------------------------
// TOML — Codex config. smol-toml ships with DSH; a narrow fallback keeps the
// app working when DSH is not installed next to it.
// ---------------------------------------------------------------------------
function tomlParse(text) {
  const lib = prov.loadToml()
  if (lib) { try { return lib.parse(text) } catch { return null } }
  // fallback: [table] headers and `key = "value"` scalars, which is all Codex uses
  const out = {}; let cur = out
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim()
    if (!line) continue
    const h = /^\[([^\]]+)\]$/.exec(line)
    if (h) { cur = out; for (const part of h[1].split('.')) { const k = part.trim().replace(/^"|"$/g, ''); cur = (cur[k] = cur[k] || {}) } continue }
    const kv = /^([A-Za-z0-9_.\-"']+)\s*=\s*(.+)$/.exec(line)
    if (!kv) continue
    const k = kv[1].replace(/^"|"$/g, '')
    let v = kv[2].trim().replace(/\s+#.*$/, '')
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1)
    else if (v === 'true' || v === 'false') v = v === 'true'
    else if (/^-?\d+$/.test(v)) v = Number(v)
    cur[k] = v
  }
  return out
}

// ---------------------------------------------------------------------------
// Known provider table: turns a bare `FOO_API_KEY` environment variable into a
// usable provider without asking the user for a Base URL.
// ---------------------------------------------------------------------------
const COMPAT = 'openai-completions'
const KNOWN_ENV = [
  { re: /^(OPENAI_API_KEY)$/, route: 'openai', name: 'OpenAI', baseURL: 'https://api.openai.com/v1', api: 'openai-responses' },
  { re: /^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_API_KEY)$/, route: 'anthropic', name: 'Anthropic', baseURL: 'https://api.anthropic.com', api: 'anthropic-messages' },
  { re: /^(DEEPSEEK_API_KEY)$/, route: 'deepseek', name: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', api: COMPAT },
  { re: /^(MOONSHOT_API_KEY|KIMI_API_KEY|KIMI_CODE_API_KEY)$/, route: 'moonshot', name: 'Moonshot / Kimi', baseURL: 'https://api.moonshot.cn/v1', api: COMPAT },
  { re: /^(DASHSCOPE_API_KEY|QWEN_API_KEY|ALIYUN_API_KEY)$/, route: 'dashscope', name: '阿里云百炼 DashScope', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', api: COMPAT },
  { re: /^(ARK_API_KEY|VOLCENGINE_API_KEY|VOLC_ARK_API_KEY)$/, route: 'ark', name: '火山方舟 ARK', baseURL: 'https://ark.cn-beijing.volces.com/api/v3', api: COMPAT },
  { re: /^(ZHIPUAI_API_KEY|ZHIPU_API_KEY|GLM_API_KEY|BIGMODEL_API_KEY)$/, route: 'zhipu', name: '智谱 GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4', api: COMPAT },
  { re: /^(OPENROUTER_API_KEY)$/, route: 'openrouter', name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', api: COMPAT },
  { re: /^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENAI_API_KEY)$/, route: 'gemini', name: 'Google Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', api: COMPAT },
  { re: /^(GROQ_API_KEY)$/, route: 'groq', name: 'Groq', baseURL: 'https://api.groq.com/openai/v1', api: COMPAT },
  { re: /^(MISTRAL_API_KEY)$/, route: 'mistral', name: 'Mistral', baseURL: 'https://api.mistral.ai/v1', api: COMPAT },
  { re: /^(XAI_API_KEY|GROK_API_KEY)$/, route: 'xai', name: 'xAI Grok', baseURL: 'https://api.x.ai/v1', api: COMPAT },
  { re: /^(MINIMAX_API_KEY|MINIMAXI_API_KEY)$/, route: 'minimax', name: 'MiniMax', baseURL: 'https://api.minimaxi.com/v1', api: COMPAT },
  { re: /^(SILICONFLOW_API_KEY)$/, route: 'siliconflow', name: 'SiliconFlow 硅基流动', baseURL: 'https://api.siliconflow.cn/v1', api: COMPAT },
  { re: /^(TOGETHER_API_KEY)$/, route: 'together', name: 'Together AI', baseURL: 'https://api.together.xyz/v1', api: COMPAT },
  { re: /^(FIREWORKS_API_KEY)$/, route: 'fireworks', name: 'Fireworks AI', baseURL: 'https://api.fireworks.ai/inference/v1', api: COMPAT },
  { re: /^(CEREBRAS_API_KEY)$/, route: 'cerebras', name: 'Cerebras', baseURL: 'https://api.cerebras.ai/v1', api: COMPAT },
  { re: /^(PERPLEXITY_API_KEY)$/, route: 'perplexity', name: 'Perplexity', baseURL: 'https://api.perplexity.ai', api: COMPAT },
  { re: /^(NOVITA_API_KEY)$/, route: 'novita', name: 'Novita AI', baseURL: 'https://api.novita.ai/openai/v1', api: COMPAT },
  { re: /^(OLLAMA_API_KEY)$/, route: 'ollama', name: 'Ollama Cloud', baseURL: 'https://ollama.com/v1', api: COMPAT },
  { re: /^(SENSENOVA_API_KEY)$/, route: 'sensenova', name: '商汤 SenseNova', baseURL: 'https://api.sensenova.cn/compatible-mode/v1', api: COMPAT },
  { re: /^(STEPFUN_API_KEY)$/, route: 'stepfun', name: '阶跃星辰 StepFun', baseURL: 'https://api.stepfun.com/v1', api: COMPAT },
  { re: /^(BAICHUAN_API_KEY)$/, route: 'baichuan', name: '百川 Baichuan', baseURL: 'https://api.baichuan-ai.com/v1', api: COMPAT },
  { re: /^(HUNYUAN_API_KEY|TENCENT_API_KEY)$/, route: 'hunyuan', name: '腾讯混元', baseURL: 'https://api.hunyuan.cloud.tencent.com/v1', api: COMPAT },
]
/** Variables that look like a key but are not an LLM endpoint. */
const ENV_DENY = /^(GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN|NODE_AUTH_TOKEN|CI_|VERCEL_|NETLIFY_|AWS_SECRET|AWS_ACCESS|AZURE_CLIENT|GOOGLE_APPLICATION|HF_TOKEN|HUGGINGFACE|SLACK_|DISCORD_|TELEGRAM_|STRIPE_|TWILIO_|SENTRY_|DATADOG_|MMCC_|DSH_|HERMES_|CODEX_|CLAUDE_|AWS_|GCP_|MAIL_|SMTP_|REDIS_|DATABASE_URL|POSTGRES|MYSQL|MONGO)/i
const ENV_KEYISH = /(^|_)(API_?KEY|APIKEY|AUTH_?TOKEN|ACCESS_?TOKEN|API_?TOKEN)$/i
const ENV_BASEISH = /(BASE_?URL|API_?BASE|BASE_?URI|API_?ENDPOINT|_ENDPOINT)$/i

/** `.env` files in agent homes and the working directory. */
function envFiles() {
  const h = home(), dsh = process.env.DSH_HOME || path.join(h, '.dsh')
  const hermes = process.env.HERMES_HOME || path.join(h, '.hermes')
  const list = [
    path.join(dsh, '.env'), path.join(h, '.dsh', '.env'),
    path.join(hermes, '.env'), path.join(h, '.hermes', '.env'),
    path.join(h, '.codex', '.env'), path.join(h, '.claude', '.env'),
    path.join(h, '.config', 'opencode', '.env'), path.join(h, '.opencode', '.env'),
    path.join(h, '.cc-switch', '.env'), path.join(h, '.gemini', '.env'),
    path.join(h, '.qwen', '.env'), path.join(process.cwd(), '.env'),
  ]
  return [...new Set(list)].filter(f => { try { return fs.statSync(f).isFile() } catch { return false } })
}

function parseDotEnv(text) {
  const out = {}
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    let v = m[2].trim()
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1)
    else v = v.replace(/\s+#.*$/, '').trim()
    if (v) out[m[1]] = v
  }
  return out
}

// ---------------------------------------------------------------------------
// Scanners. Each returns [{ route, displayName, api, baseURL, models, keyValue,
// keyFrom, origin }]; `keyFrom` describes where a key was found, for the UI.
// ---------------------------------------------------------------------------
function scanDsh() {
  const out = []
  const root = path.join(process.env.DSH_HOME || path.join(home(), '.dsh'), 'profiles')
  let profiles = []
  try { profiles = fs.readdirSync(root) } catch { return out }
  for (const profile of profiles) {
    const file = path.join(root, profile, 'cordis.patch.yml')
    const text = readText(file)
    if (!text) continue
    let entries
    try { entries = prov.yamlParse(text) } catch { continue }
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      const providers = entry?.id === 'llm-pi-ai' ? entry.config?.providers : null
      if (!providers || typeof providers !== 'object') continue
      for (const [route, p] of Object.entries(providers)) {
        if (!p || typeof p !== 'object') continue
        if (out.some(x => x.route === route)) continue
        const ref = p.apiKeyEnv || keyRefOf(route)
        out.push({
          route, displayName: p.displayName || route, api: mapApi(p.api), baseURL: normalizeBase(p.baseURL, mapApi(p.api)),
          keyValue: str(process.env[ref]) || null, keyFrom: process.env[ref] ? T('agent.envVar', { ref }) : T('agent.credSaved', { ref }),
          keyEnv: ref, origin: T('agent.originDsh', { profile }),
          models: (p.models || []).map(m => modelEntry(m.id, m.name, m.contextWindow, m.maxTokens)),
        })
      }
    }
  }
  return out
}

function scanCodex() {
  const out = []
  const dir = path.join(home(), '.codex')
  const text = readText(path.join(dir, 'config.toml'))
  const auth = readJson(path.join(dir, 'auth.json'))
  const top = text ? tomlParse(text) : null
  const providers = top?.model_providers && typeof top.model_providers === 'object' ? top.model_providers : {}
  for (const [id, p] of Object.entries(providers)) {
    if (!p || typeof p !== 'object') continue
    const route = toRoute(id)
    const api = mapApi(p.wire_api, 'openai-responses')
    const envKey = str(p.env_key)
    const keyValue = (envKey && str(process.env[envKey])) || null
    out.push({
      route, displayName: str(p.name) || id, api, baseURL: normalizeBase(p.base_url, api),
      keyValue, keyFrom: keyValue ? T('agent.envVar', { ref: envKey }) : envKey ? T('agent.envUnset', { ref: envKey }) : null,
      keyEnv: envKey || keyRefOf(route), origin: 'Codex · ~/.codex/config.toml',
      models: Object.keys(p.models || {}).map(m => modelEntry(m)), note: p.query_params ? T('agent.queryNote') : null,
    })
  }
  // ChatGPT-OAuth Codex has no API key; surface it as a hint rather than a provider.
  const oauthOnly = !out.length && auth?.auth_mode && auth.auth_mode !== 'apikey'
  return { records: out, hints: oauthOnly ? [T('agent.codexOauth', { mode: auth.auth_mode })] : [] }
}

function scanClaude() {
  const out = []
  const dirs = [path.join(home(), '.claude')]
  if (process.env.CLAUDE_CONFIG_DIR) dirs.unshift(process.env.CLAUDE_CONFIG_DIR)
  for (const dir of dirs) {
    for (const f of ['settings.json', 'settings.local.json']) {
      const j = readJson(path.join(dir, f))
      const env = j?.env
      if (!env || typeof env !== 'object') continue
      const baseURL = str(env.ANTHROPIC_BASE_URL) || 'https://api.anthropic.com'
      const keyValue = str(env.ANTHROPIC_AUTH_TOKEN) || str(env.ANTHROPIC_API_KEY) || null
      const keyVar = str(env.ANTHROPIC_AUTH_TOKEN) ? 'ANTHROPIC_AUTH_TOKEN' : 'ANTHROPIC_API_KEY'
      const models = []
      for (const [k, v] of Object.entries(env)) {
        if (/^ANTHROPIC_(DEFAULT_)?(MODEL|.*_MODEL)$/.test(k) && str(v)) models.push(modelEntry(v, `${v} (${k})`))
      }
      const single = str(j?.model)
      if (single) models.push(modelEntry(single, `${single} (settings.model)`))
      if (!keyValue && !models.length && !str(env.ANTHROPIC_BASE_URL)) continue
      const host = (() => { try { return new URL(baseURL).hostname.split('.')[0] } catch { return 'claude' } })()
      const route = /anthropic\.com/.test(baseURL) ? 'anthropic' : toRoute(host || 'claude')
      out.push({
        route, displayName: route === 'anthropic' ? T('agent.anthropicName') : `Claude Code · ${baseURL}`,
        api: 'anthropic-messages', baseURL: normalizeBase(baseURL, 'anthropic-messages'),
        keyValue, keyFrom: keyValue ? `${f} env.${keyVar}` : null, keyEnv: keyVar,
        origin: `Claude Code · ~/.claude/${f}`,
        models: [...new Map(models.map(m => [m.id, m])).values()],
      })
    }
  }
  return { records: out, hints: [] }
}

function scanHermes() {
  const out = []
  const dir = process.env.HERMES_HOME || path.join(home(), '.hermes')
  const text = readText(path.join(dir, 'config.yaml'))
  if (!text) return { records: out, hints: [] }
  let cfg
  try { cfg = prov.yamlParse(text) } catch { return { records: out, hints: [] } }
  const dotenv = envFiles().filter(f => f.startsWith(dir)).map(f => parseDotEnv(readText(f) || '')).reduce((a, b) => ({ ...a, ...b }), {})
  const pool = readJson(path.join(dir, 'auth.json'))?.credential_pool || {}
  const def = cfg?.model || {}
  const list = Array.isArray(cfg?.custom_providers) ? cfg.custom_providers : []
  for (const p of list) {
    if (!p || typeof p !== 'object') continue
    const route = toRoute(p.name || p.label)
    const api = mapApi(p.api_mode, 'openai-completions')
    const envKey = str(p.key_env)
    const keyValue = str(p.api_key) || (envKey && (str(process.env[envKey]) || str(dotenv[envKey]))) || null
    const models = Object.entries(p.models && typeof p.models === 'object' ? p.models : {}).map(([id, m]) =>
      modelEntry(id, m?.name, m?.context_length ?? m?.context_window ?? m?.contextWindow, m?.max_tokens ?? m?.max_output_tokens ?? m?.maxTokens))
    if (str(p.model) && !models.some(m => m.id === p.model)) models.unshift(modelEntry(p.model))
    const creds = pool[`custom:${p.name}`]
    const fingerprint = Array.isArray(creds) && creds[0]?.secret_fingerprint ? T('agent.fingerprint') : ''
    out.push({
      route, displayName: str(p.name) || str(p.label) || route, api, baseURL: normalizeBase(p.base_url, api),
      keyValue,
      keyFrom: str(p.api_key) ? 'config.yaml custom_providers[].api_key' : keyValue ? T('agent.envVar', { ref: envKey }) : (fingerprint ? T('agent.fingerprintOnly', { note: fingerprint }) : null),
      keyEnv: envKey || keyRefOf(route), origin: 'Hermes · config.yaml custom_providers',
      models, default: def.provider === `custom:${p.name}` && str(def.default) ? def.default : null,
      proxy: str(p.proxy_url) || null,
    })
  }
  // Hermes may also keep keys only in .env / the OS environment.
  for (const [k, v] of Object.entries({ ...dotenv, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)) })) {
    if (!ENV_KEYISH.test(k) || ENV_DENY.test(k) || !v) continue
    const known = KNOWN_ENV.find(x => x.re.test(k))
    const route = known?.route || toRoute(k.replace(ENV_KEYISH, '').replace(/_API_?KEY$/i, ''))
    if (out.some(x => x.route === route || x.keyEnv === k)) continue
    out.push({
      route, displayName: known?.name || T('agent.fromEnv', { route, k }), api: known?.api || 'openai-completions',
      baseURL: known ? normalizeBase(known.baseURL, known.api) : null, keyValue: v,
      keyFrom: T('agent.envVar', { ref: k }), keyEnv: k, origin: `Hermes · ${k}`,
      models: [], needsURL: !known,
    })
  }
  return { records: out, hints: [] }
}

function scanOpencode() {
  const out = []
  const bases = [process.env.XDG_CONFIG_HOME ? path.join(process.env.XDG_CONFIG_HOME, 'opencode') : null,
    path.join(home(), '.config', 'opencode'), path.join(home(), '.opencode'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'opencode') : null].filter(Boolean)
  for (const dir of bases) {
    const j = readJsonc(path.join(dir, 'opencode.json')) || readJsonc(path.join(dir, 'opencode.jsonc'))
    if (!j?.provider || typeof j.provider !== 'object') continue
    for (const [id, p] of Object.entries(j.provider)) {
      if (!p || typeof p !== 'object') continue
      const opt = p.options || {}
      const api = /anthropic/.test(String(p.npm)) ? 'anthropic-messages' : /openai$/.test(String(p.npm)) ? 'openai-responses' : 'openai-completions'
      const keyValue = str(opt.apiKey) || (str(opt.apiKeyEnv) ? str(process.env[opt.apiKeyEnv]) : null) || null
      out.push({
        route: toRoute(id), displayName: str(p.name) || id, api,
        baseURL: normalizeBase(opt.baseURL || opt.baseUrl, api), keyValue,
        keyFrom: str(opt.apiKey) ? 'opencode.json provider.options.apiKey' : keyValue ? T('agent.envVar', { ref: opt.apiKeyEnv }) : null,
        keyEnv: str(opt.apiKeyEnv) || keyRefOf(id),
        origin: `opencode · ${path.join(dir, 'opencode.json')}`,
        models: Object.entries(p.models && typeof p.models === 'object' ? p.models : {}).map(([mid, m]) =>
          modelEntry(mid, m?.name, m?.limit?.context ?? m?.contextWindow, m?.limit?.output ?? m?.maxTokens)),
      })
    }
  }
  return { records: out, hints: [] }
}

function scanCcSwitch() {
  const out = [], hints = []
  const dir = path.join(home(), '.cc-switch')
  if (!fs.existsSync(dir)) return { records: out, hints }
  const cfg = readJson(path.join(dir, 'config.json'))
  if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) hints.push(T('agent.ccsDb'))
  const pricing = readJson(path.join(dir, 'model-pricing.json'))
  if (pricing) hints.push(T('agent.ccsPricing'))
  return { records: out, hints }
}

function scanEnv() {
  const out = []
  const files = envFiles()
  const merged = {}
  const seenIn = {}
  for (const f of files) for (const [k, v] of Object.entries(parseDotEnv(readText(f) || ''))) { merged[k] = v; seenIn[k] = f }
  for (const [k, v] of Object.entries(process.env)) { if (v && !(k in merged)) merged[k] = v; if (v && !seenIn[k]) seenIn[k] = '__system__' }
  const bases = {}
  for (const [k, v] of Object.entries(merged)) if (ENV_BASEISH.test(k) && v) bases[k] = v
  for (const [k, v] of Object.entries(merged)) {
    if (!ENV_KEYISH.test(k) || ENV_DENY.test(k) || !v || v.length < 12) continue
    const known = KNOWN_ENV.find(x => x.re.test(k))
    const stem = k.replace(ENV_KEYISH, '')
    const route = known?.route || toRoute(stem)
    const buddyBase = bases[`${stem}_BASE_URL`] || bases[`${stem}_API_BASE`] || bases[`${stem}_BASE_URI`] || bases[`${stem}_ENDPOINT`]
    if (out.some(x => x.route === route)) continue
    const api = known?.api || 'openai-completions'
    out.push({
      route, displayName: known?.name || T('agent.fromEnv', { route: stem, k }), api,
      baseURL: normalizeBase(buddyBase || known?.baseURL, api), keyValue: v,
      keyFrom: seenIn[k] === '__system__' ? T('agent.keyFromSystem', { k }) : T('agent.keyFromFile', { file: seenIn[k], k }),
      keyEnv: k, origin: seenIn[k] === '__system__' ? T('agent.systemVar') : seenIn[k],
      models: [], needsURL: !(buddyBase || known?.baseURL),
    })
  }
  return { records: out, hints: files.length ? [T('agent.dotenvScanned', { n: files.length })] : [] }
}

// ---------------------------------------------------------------------------
// Scan + secret cache
// ---------------------------------------------------------------------------
const secrets = new Map() // record id → raw key

/** Normalized, deduplicated scan across every supported agent runtime. */
function scan() {
  secrets.clear()
  const sources = []
  const run = (id, label, fn) => {
    let res
    try { res = fn() } catch (e) { sources.push({ id, label, error: String(e.message || e), count: 0 }); return [] }
    const records = Array.isArray(res) ? res : (res.records || [])
    sources.push({ id, label, count: records.length, hints: (res && res.hints) || [] })
    return records.map(r => ({ ...r, source: id, sourceLabel: label }))
  }
  let all = [
    ...run('dsh', T('src.dsh'), scanDsh),
    ...run('codex', T('src.codex'), scanCodex),
    ...run('claude', T('src.claude'), scanClaude),
    ...run('hermes', T('src.hermes'), scanHermes),
    ...run('opencode', T('src.opencode'), scanOpencode),
    ...run('ccswitch', T('src.ccswitch'), scanCcSwitch),
    ...run('env', T('src.env'), scanEnv),
  ]
  // Same route found in several agents: keep the first record (DSH first) and
  // remember the other sources as text only — never their records/keys.
  const byRoute = new Map()
  for (const r of all) {
    if (!r.baseURL && !r.models?.length && !r.keyValue) continue
    const prev = byRoute.get(r.route)
    if (!prev) { byRoute.set(r.route, r); continue }
    ;(prev.otherSources ??= []).push(T(r.keyFrom ? 'agent.srcWithKey' : 'agent.srcNoKey', { src: r.sourceLabel }))
  }
  all = [...byRoute.values()]
  const publicRecords = all.map(r => {
    const id = `${r.source}:${r.route}`
    const keyValue = r.keyValue || null
    if (keyValue) secrets.set(id, keyValue)
    const out = {}
    for (const [k, v] of Object.entries(r)) if (!['keyValue', '_dup'].includes(k)) out[k] = v
    return {
      ...out, id, hasKey: !!keyValue, keyMask: mask(keyValue),
      models: (r.models || []).map(m => ({ ...m })),
      otherSources: r.otherSources || [],
    }
  })
  return { sources, records: publicRecords, scannedAt: new Date().toISOString() }
}

/** Raw key for an import; undefined when the record carried none. */
function secretOf(id) { return secrets.get(String(id)) }

module.exports = { scan, secretOf, toRoute, keyRefOf, mapApi, normalizeBase, modelEntry, parseDotEnv, KNOWN_ENV }
