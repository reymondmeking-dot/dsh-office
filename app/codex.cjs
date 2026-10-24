// Codex CLI as an employee engine: `codex exec --json` per turn, `codex exec resume <thread>` to keep context.
// CodexRuntime exposes the same run(sessionId, text, onEvent) / close() surface as the DSH Runtime, and maps
// Codex JSONL items onto the DSH-style events main.cjs already understands (tool/call, step/start).
'use strict'
const { spawn, execFile, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const WIN = process.platform === 'win32'
const codexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
const readText = f => { try { return fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '') } catch { return null } }

/** Directories a GUI-launched app may miss on macOS/Linux (PATH there is minimal). */
function extraDirs() {
  const h = os.homedir()
  if (WIN) return [path.join(process.env.APPDATA || '', 'npm'), path.join(h, 'AppData', 'Roaming', 'npm'), 'C:\\Program Files\\nodejs']
  const dirs = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', path.join(h, '.local', 'bin'), path.join(h, '.npm-global', 'bin'), path.join(h, '.volta', 'bin'), path.join(h, '.bun', 'bin')]
  try {
    const root = path.join(h, '.nvm', 'versions', 'node')
    for (const v of fs.readdirSync(root).sort().reverse()) dirs.push(path.join(root, v, 'bin'))
  } catch {}
  return dirs
}

/** Resolve how to launch Codex: { cmd, prefix[] } or null. `node` runs npm's codex.js on Windows (no .cmd shell needed). */
function findCodex({ codexPath, node } = {}) {
  const jsNear = dir => {
    const js = path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
    return fs.existsSync(js) ? js : null
  }
  const fromFile = file => {
    if (!file || !fs.existsSync(file)) return null
    if (/\.js$/i.test(file)) return { cmd: node || 'node', prefix: [file], display: file }
    if (WIN && /\.(cmd|ps1|bat)$|codex$/i.test(file) && !/\.exe$/i.test(file)) {
      const js = jsNear(path.dirname(file))
      return js ? { cmd: node || 'node', prefix: [js], display: js } : null
    }
    return { cmd: file, prefix: [], display: file }
  }
  if (codexPath) { const r = fromFile(codexPath); if (r) return r }
  const names = WIN ? ['codex.cmd', 'codex.exe', 'codex'] : ['codex']
  const seen = new Set()
  let pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  for (const d of [...pathDirs, ...extraDirs()]) {
    if (seen.has(d)) continue; seen.add(d)
    for (const n of names) {
      const r = fromFile(path.join(d, n))
      if (r) return r
    }
  }
  return fromFile(process.env.CODEX_CLI_PATH)
}

const cleanEnv = () => { const e = { ...process.env }; delete e.ELECTRON_RUN_AS_NODE; return e }

function run1(launch, args, timeout = 20000) {
  return new Promise(resolve => {
    execFile(launch.cmd, [...launch.prefix, ...args], { env: cleanEnv(), timeout, windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout || ''}\n${stderr || ''}`.trim(), err })
    })
  })
}

/** Is Codex installed / signed in, and which models does this account offer? */
async function scanCodexCli({ codexPath, node } = {}) {
  const launch = findCodex({ codexPath, node })
  if (!launch) return { found: false }
  const ver = await run1(launch, ['--version'])
  const login = await run1(launch, ['login', 'status'])
  const config = readText(path.join(codexHome(), 'config.toml')) || ''
  const top = config.split(/^\s*\[/m)[0]
  const cfgModel = (/^\s*model\s*=\s*"([^"]+)"/m.exec(top) || [])[1] || ''
  let cache = null
  try { cache = JSON.parse(readText(path.join(codexHome(), 'models_cache.json'))) } catch {}
  const models = (cache?.models || []).map(m => {
    // Office only knows low..max; Codex's extra "ultra" tier is not offered.
    const efforts = APP_LEVELS.filter(l => (m.supported_reasoning_levels || []).some(x => (x.effort || x) === l))
    return {
      slug: m.slug, name: m.display_name || m.slug, contextWindow: Number(m.context_window) || 0,
      efforts, defaultEffort: pickDefault(efforts, m.default_reasoning_level),
      vision: Array.isArray(m.input_modalities) ? m.input_modalities.includes('image') : true,
      visible: m.visibility !== 'hide',
    }
  }).filter(m => m.slug)
  if (cfgModel && !models.some(m => m.slug === cfgModel)) models.unshift({ slug: cfgModel, name: cfgModel, contextWindow: 0, efforts: ['low', 'medium', 'high'], defaultEffort: 'medium', vision: true, visible: true })
  return {
    found: true, path: launch.display, version: (ver.out.match(/\d+\.\d+\.\d+\S*/) || [''])[0],
    loggedIn: /logged in/i.test(login.out) && !/not logged/i.test(login.out), loginText: login.out.split('\n').pop().slice(0, 160),
    configModel: cfgModel, configFast: configFast(), models,
  }
}

const APP_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']
/** Codex's own default level, clamped to what Office offers. */
const pickDefault = (efforts, want) => efforts.includes(want) ? want : efforts.includes('medium') ? 'medium' : efforts[0] || ''
/** Does the user's Codex config run in fast (priority) service tier? */
function configFast() {
  const top = (readText(path.join(codexHome(), 'config.toml')) || '').split(/^\s*\[/m)[0]
  const tier = (/^\s*service_tier\s*=\s*"([^"]+)"/m.exec(top) || [])[1]
  return tier === 'priority' || tier === 'fast'
}

class CodexRuntime {
  constructor(pool, key, model, effort) {
    this.pool = pool; this.key = key; this.model = model; this.effort = effort
    this.threads = new Map() // office sessionId -> codex thread id
    this.children = new Set(); this.dead = false
    this.ready = Promise.resolve()
  }

  args(resumeId) {
    const { settings } = this.pool
    const full = settings.permissionMode === 'danger-full-access'
    const a = ['exec']
    if (resumeId) a.push('resume')
    a.push('--json', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '-m', this.model.model,
      '-c', `sandbox_mode="${full ? 'danger-full-access' : 'workspace-write'}"`, '-c', 'approval_policy="never"')
    // Windows needs the elevated sandbox for writes to land inside the workspace; it still blocks writes outside it.
    if (WIN && !full) a.push('-c', 'windows.sandbox="elevated"')
    if (this.effort && this.effort !== 'off') a.push('-c', `model_reasoning_effort="${this.effort}"`)
    // Fast mode = Codex's priority service tier. Office's own switch wins; otherwise follow the user's Codex config.
    if ((settings.codexFast ?? configFast())) a.push('-c', 'service_tier="priority"')
    if (resumeId) a.push(resumeId)
    a.push('-') // prompt on stdin: no quoting problems, no length limit
    return a
  }

  run(sessionId, text, onEvent) {
    const { settings } = this.pool
    const launch = findCodex({ codexPath: settings.codexPath, node: this.pool.node })
    if (!launch) return Promise.reject(new Error(require('./renderer/i18n.js').t('err.codexMissing')))
    fs.mkdirSync(settings.workspace, { recursive: true })
    return new Promise((resolve, reject) => {
      const resumeId = this.threads.get(sessionId)
      const proc = spawn(launch.cmd, [...launch.prefix, ...this.args(resumeId)], { cwd: settings.workspace, env: cleanEnv(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      this.children.add(proc)
      let buf = '', last = '', failed = '', done = false, tail = ''
      const emit = ev => { try { onEvent?.(ev) } catch {} }
      const item = it => {
        if (!it) return
        if (it.type === 'command_execution') emit({ type: 'tool/call', data: { name: WIN ? 'pwsh' : 'bash', arguments: '{}' } })
        else if (it.type === 'file_change') {
          for (const c of it.changes || []) emit({ type: 'tool/call', data: { name: c.kind === 'add' ? 'write' : 'edit', arguments: JSON.stringify({ file_path: c.path }) } })
        } else if (it.type === 'web_search') emit({ type: 'tool/call', data: { name: 'web_search', arguments: '{}' } })
        else if (it.type === 'mcp_tool_call') emit({ type: 'tool/call', data: { name: it.tool || 'mcp', arguments: '{}' } })
      }
      const line = l => {
        if (!l.trim()) return
        let m; try { m = JSON.parse(l) } catch { tail = (tail + '\n' + l).slice(-1500); return }
        if (m.type === 'thread.started' && m.thread_id) this.threads.set(sessionId, m.thread_id)
        else if (m.type === 'turn.started') emit({ type: 'step/start' })
        else if (m.type === 'item.started') item(m.item)
        else if (m.type === 'item.completed' && m.item?.type === 'agent_message' && m.item.text) { last = m.item.text; emit({ type: 'assistant/attempt' }) }
        else if (m.type === 'turn.failed') failed = m.error?.message || 'turn failed'
        else if (m.type === 'error' && !failed) failed = m.message || 'error'
      }
      proc.stdout.setEncoding('utf8')
      proc.stdout.on('data', d => { buf += d; let n; while ((n = buf.indexOf('\n')) >= 0) { line(buf.slice(0, n)); buf = buf.slice(n + 1) } })
      proc.stderr.setEncoding('utf8')
      proc.stderr.on('data', d => { tail = (tail + d).slice(-1500) })
      const finish = fn => { if (done) return; done = true; this.children.delete(proc); fn() }
      proc.on('error', err => finish(() => reject(err)))
      proc.on('close', code => finish(() => {
        if (buf.trim()) line(buf)
        if (failed) return reject(new Error(failed))
        if (code !== 0 && !last) return reject(new Error(`codex exited ${code}: ${tail.split('\n').filter(Boolean).slice(-3).join(' | ')}`))
        resolve(last)
      }))
      proc.stdin.on('error', () => {})
      proc.stdin.end(text)
    })
  }

  async close() {
    this.dead = true
    for (const p of this.children) { try { p.kill() } catch {} }
    this.children.clear()
  }
}

module.exports = { CodexRuntime, findCodex, scanCodexCli, configFast, pickDefault }
