// DSH runtime pool: one `dsh --profile office` SDK subprocess per (model, rush) route.
// Each runtime speaks newline-delimited JSON-RPC over stdio (no console window).
'use strict'
const { spawn, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const os = require('node:os')
const parameters = require('./parameters.js')
const { CodexRuntime } = require('./codex.cjs')
const extensions = require('./extensions.cjs')
/** Live extensions for a settings snapshot (user plugins dir: $DSH_OFFICE_PLUGIN_DIR, set by main.cjs). */
function extOf(settings) {
  const plugins = extensions.loadPlugins(process.env.DSH_OFFICE_PLUGIN_DIR || '')
  return extensions.resolve(settings, plugins)
}

/** Locate the Node.js binary the DSH CLI must run under (Windows, macOS, Linux). */
function findNode(preferred) {
  if (preferred && fs.existsSync(preferred)) return preferred
  const win = process.platform === 'win32'
  try {
    const out = execFileSync(win ? 'where' : 'which', ['node'], { windowsHide: true, encoding: 'utf8' })
    const first = out.split(/\r?\n/).map(s => s.trim()).find(s => s && fs.existsSync(s))
    if (first) return first
  } catch {}
  const home = os.homedir()
  const guesses = win
    ? ['C:\\Program Files\\nodejs\\node.exe', 'C:\\Program Files (x86)\\nodejs\\node.exe', 'E:\\Program Files\\nodejs\\node.exe']
    : ['/usr/local/bin/node', '/usr/bin/node', '/opt/homebrew/bin/node', '/snap/bin/node', '/usr/local/nodejs/bin/node']
  for (const p of guesses) if (fs.existsSync(p)) return p
  if (!win) {
    // nvm / fnm / volta shims, newest first
    for (const root of [path.join(home, '.nvm', 'versions', 'node'), path.join(home, '.local', 'share', 'fnm', 'node-versions'), path.join(home, '.volta', 'bin')]) {
      try {
        const versions = fs.readdirSync(root).sort().reverse()
        for (const v of versions) for (const p of [path.join(root, v, 'bin', 'node'), path.join(root, v, 'installation', 'bin', 'node'), path.join(root, v, 'node')]) if (fs.existsSync(p)) return p
      } catch {}
    }
  }
  return win ? 'node.exe' : 'node'
}

function portOpen(port, host = '127.0.0.1', timeout = 400) {
  return new Promise(resolve => {
    const s = net.connect({ port, host })
    const done = v => { s.destroy(); resolve(v) }
    s.setTimeout(timeout, () => done(false))
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
  })
}

const yamlStr = s => JSON.stringify(String(s))
/** DSH llm-pi-ai `reasoningEfforts`: level → wire value; `off` sends nothing; [] → non-reasoning model. */
function effortsYaml(efforts) {
  if (!Array.isArray(efforts)) return ''
  if (!efforts.some(e => e !== 'off')) return '            reasoningEfforts: false\n'
  return '            reasoningEfforts:\n' + efforts.map(e => e === 'off' ? '              off: null\n' : `              ${e}: ${yamlStr(e)}\n`).join('')
}

/** Write the office profile (bundles + patch) from the app settings. */
function writeProfile(settings, ext = {}) {
  settings = parameters.validateSettings(settings)
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const dir = path.join(home, 'profiles', 'office')
  fs.mkdirSync(dir, { recursive: true })
  const w = (f, t) => {
    const target = path.join(dir, f), temporary = `${target}.${process.pid}.tmp`
    try { fs.writeFileSync(temporary, t, 'utf8'); fs.renameSync(temporary, target) }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
  }
  w('package.json', JSON.stringify({
    name: 'dsh-profile-office', private: true, dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-sdk-app'] } },
  }, null, 2) + '\n')
  w('cordis.yml', '[]\n')
  if (!fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) w('pnpm-workspace.yaml', 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
  const byProvider = {}
  // Codex CLI models are driven by `codex exec`; DSH knows nothing about them.
  const dshModels = settings.models.filter(m => m.engine !== 'codex')
  for (const m of dshModels) (byProvider[m.provider] ??= []).push(m)
  let providers = ''
  for (const [pid, models] of Object.entries(byProvider)) {
    const p = settings.providers[pid]
    if (!p) continue // built-in provider (e.g. deepseek-official) needs no declaration
    providers += `      ${pid}:\n        displayName: ${yamlStr(p.displayName || pid)}\n        apiKeyEnv: ${yamlStr(p.apiKeyEnv)}\n        api: ${yamlStr(p.api || 'openai-completions')}\n        baseURL: ${yamlStr(p.baseURL)}\n`
    // Gateways that front non-OpenAI models reject the `developer` role pi-ai uses for reasoning models.
    const api = p.api || 'openai-completions'
    if (api !== 'anthropic-messages') providers += `        compat:\n          supportsDeveloperRole: ${p.developerRole === true}\n`
    providers += '        models:\n'
    const seen = new Set()
    for (const m of models) {
      for (const [id, name] of [[m.model, m.name], [m.fastModel, `${m.name} Fast`]]) {
        if (!id || seen.has(id)) continue
        seen.add(id)
        // A separately configured fast model owns its own limits even when an
        // earlier model references it as an acceleration target.
        const configured = models.find(entry => entry.model === id)
        const target = configured || m
        providers += `          - id: ${yamlStr(id)}\n            name: ${yamlStr(configured?.name || name)}\n            contextWindow: ${target.contextWindow}\n`
        // An explicit maxTokens is both the model's output capability and its
        // per-request cap, so only write it when the user (or discovery) set one.
        if (Number(target.maxTokens) > 0) providers += `            maxTokens: ${Math.floor(Number(target.maxTokens))}\n`
        providers += effortsYaml(target.efforts)
        // custom gateway models default to text-only in DSH; declare vision so read_image / image attachments work
        providers += target.vision === false ? '            input: ["text"]\n' : '            input: ["text", "image"]\n'
      }
    }
  }
  const def = dshModels.find(m => m.key === settings.defaultModel) || dshModels[0]
  const compaction = '- id: compaction-basic\n  name: "@deepseek-ai/dsh-compaction-basic"\n  config:\n'
    + Object.entries(settings.compaction).map(([key, value]) => `    ${key}: ${JSON.stringify(value)}\n`).join('')
  w('cordis.patch.yml', `# Generated by DSH Office — edit models in the app's settings.
- id: sdk-app-startup
  config:
    profile: office
${def ? `- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: ${yamlStr(def.provider)}
    model: ${yamlStr(def.model)}
` : ''}${providers ? `- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
${providers}` : ''}${compaction}`)
  // CLI overlays outrank ~/.dsh/cordis.patch.yml, so Office settings survive
  // a machine-wide compaction preference without changing that global file.
  const patch = 'office.runtime.patch.yml'
  // Extensions: plugin skill roots + one dsh-mcp-client row per live MCP server.
  const extRows = extensions.dshSkillPatch(ext.skillDirs || []) + extensions.dshMcpPatch(ext.mcpServers || [], settings.workspace)
  w(patch, '# Generated by DSH Office. Change compaction, MCP and plugin settings in the app.\n' + compaction + extRows)
  return path.join(dir, patch)
}

class Runtime {
  constructor(pool, key, model, rush, effort) {
    this.pool = pool; this.key = key; this.model = model; this.rush = rush; this.effort = effort
    this.nextId = 0; this.pending = new Map(); this.watchers = new Map(); this.buf = ''
    this.stderrTail = ''
    this.ready = this.start()
  }

  async start() {
    const { settings } = this.pool
    const dshRoot = settings.dshRoot
    const bin = path.join(dshRoot, 'apps', 'cli', 'lib', 'bin.js')
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.GLOBAL_AGENT_HTTP_PROXY; delete env.GLOBAL_AGENT_HTTPS_PROXY
    env.DSH_PERMISSION_MODE = settings.permissionMode || 'workspace-write'
    if (this.rush) env.DSH_OFFICE_RUSH = '1'
    if (settings.proxyPort && await portOpen(settings.proxyPort)) {
      env.HTTPS_PROXY = env.HTTP_PROXY = `http://127.0.0.1:${settings.proxyPort}`
      env.NO_PROXY = 'localhost,127.0.0.1,::1,deepseek.com'
    }
    fs.mkdirSync(settings.workspace, { recursive: true })
    this.proc = spawn(this.pool.node, [bin, '--profile', 'office', '--patch', this.pool.patchPath], {
      cwd: dshRoot, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.proc.stdout.setEncoding('utf8')
    this.proc.stdout.on('data', d => this.onData(d))
    this.proc.stderr.setEncoding('utf8')
    this.proc.stderr.on('data', d => { this.stderrTail = (this.stderrTail + d).slice(-4000) })
    this.proc.on('exit', code => this.onExit(code))
    this.proc.on('error', err => this.onExit(String(err)))
    const modelId = (this.rush && this.model.fastModel) ? this.model.fastModel : this.model.model
    await this.request('initialize', {
      cwd: settings.workspace, provider: this.model.provider, model: modelId,
      ...(this.effort ? { reasoningEffort: this.effort } : {}),
    })
    this.pool.log(`runtime ${this.key} ready`)
  }

  request(method, params) {
    return new Promise((resolve, reject) => {
      if (this.dead) return reject(new Error(`runtime ${this.key} exited: ${this.dead}`))
      const id = ++this.nextId
      this.pending.set(id, { resolve, reject })
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  onData(chunk) {
    this.buf += chunk
    let n
    while ((n = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, n); this.buf = this.buf.slice(n + 1)
      if (!line.trim()) continue
      let m
      try { m = JSON.parse(line) } catch { continue }
      if (m.id !== undefined && !m.method) {
        const p = this.pending.get(m.id)
        if (!p) continue
        this.pending.delete(m.id)
        m.error ? p.reject(new Error(m.error.message || JSON.stringify(m.error))) : p.resolve(m.result)
      } else if (m.method) {
        const sid = m.params?.sessionId
        const w = sid && this.watchers.get(sid)
        if (w) w(m.method, m.params)
      }
    }
  }

  onExit(code) {
    this.dead = `code ${code}; ${this.stderrTail.split('\n').filter(Boolean).slice(-4).join(' | ')}`
    this.pool.log(`runtime ${this.key} exited ${this.dead}`)
    for (const p of this.pending.values()) p.reject(new Error(`runtime exited: ${this.dead}`))
    this.pending.clear()
    for (const w of this.watchers.values()) w('runtime.exit', { reason: this.dead })
    this.watchers.clear()
    this.pool.runtimes.delete(this.key)
  }

  /** Queue a prompt on a session and resolve with the final assistant text once the session idles. */
  async run(sessionId, text, onEvent) {
    await this.ready
    return new Promise((resolve, reject) => {
      let messageId; let received = false; let last = ''; const early = []
      const handle = (method, params) => {
        if (method === 'runtime.exit') return reject(new Error(`runtime exited: ${params.reason}`))
        if (method === 'session.event') {
          const ev = params.event
          if (!received) {
            if (messageId === undefined) { early.push([method, params]); return }
            if (ev.type === 'agent/inbox/spliced' && ev.data?.inserted?.some(x => x.id === messageId)) received = true
            return
          }
          if (ev.type === 'assistant/message') {
            const t = (ev.data.message.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
            if (t) last = t
          }
          try { onEvent?.(ev) } catch {}
        } else if (method === 'session.status' && received && params.status === 'idle') {
          this.watchers.delete(sessionId)
          resolve(last)
        }
      }
      this.watchers.set(sessionId, handle)
      this.request('session/prompt', { sessionId, contentBlocks: [{ type: 'text', text }] })
        .then(r => { messageId = r.messageId; for (const [m, p] of early.splice(0)) handle(m, p) })
        .catch(err => { this.watchers.delete(sessionId); reject(err) })
    })
  }

  async close() {
    if (this.dead) return
    try { await Promise.race([this.request('shutdown', {}), new Promise(r => setTimeout(r, 1500))]) } catch {}
    try { this.proc.stdin.end() } catch {}
    setTimeout(() => { try { this.proc.kill() } catch {} }, 1500)
  }
}

class RuntimePool {
  constructor(settings, log = () => {}) {
    this.settings = settings; this.log = log; this.runtimes = new Map()
    this.node = findNode(settings.nodePath)
    this.ext = extOf(settings); this.patchPath = writeProfile(settings, this.ext)
  }
  configure(settings) {
    this.settings = settings
    this.node = findNode(settings.nodePath)
    this.ext = extOf(settings); this.patchPath = writeProfile(settings, this.ext)
    return this.closeAll()
  }
  get(modelKey, rush, effort) {
    const model = this.settings.models.find(m => m.key === modelKey) || this.settings.models[0]
    if (!model) throw new Error(require('./renderer/i18n.js').t('err.noModelShort'))
    const key = `${model.key}|${effort || '-'}${rush ? '|rush' : ''}`
    let rt = this.runtimes.get(key)
    if (!rt) {
      // Codex CLI models run through `codex exec`, not a DSH subprocess.
      rt = model.engine === 'codex' ? new CodexRuntime(this, key, model, effort) : new Runtime(this, key, model, rush, effort)
      this.runtimes.set(key, rt); rt.ready.catch(() => {})
    }
    return rt
  }
  async closeAll() { await Promise.all([...this.runtimes.values()].map(r => r.close())); this.runtimes.clear() }
}

module.exports = { RuntimePool, writeProfile, findNode, extOf }
