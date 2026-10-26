// Use existing authenticated native CLIs through an explicit read-only allowlist.
// Credential files are never opened, copied, returned or logged by this module.
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const I = require('./renderer/i18n.js')
const L = (zh, en) => I.getLang() === 'en' ? en : zh
const DOCS = Object.freeze({ github: 'https://cli.github.com/manual/', taptap: 'https://developer.taptap.cn/v3/cli/' })
const GH_FIELDS = {
  'repo view': 'name,nameWithOwner,description,url,isPrivate,defaultBranchRef,primaryLanguage,stargazerCount,updatedAt',
  'repo list': 'name,nameWithOwner,description,url,isPrivate,updatedAt',
  'issue list': 'number,title,url,state,author,updatedAt',
  'issue view': 'number,title,url,state,author,body,comments,updatedAt',
  'pr list': 'number,title,url,state,author,updatedAt',
  'pr view': 'number,title,url,state,author,body,comments,mergeable,updatedAt',
  'pr checks': 'name,state,bucket,link',
  'search repos': 'name,fullName,description,url,visibility,updatedAt',
  'search issues': 'number,title,url,state,author,repository,updatedAt',
  'search prs': 'number,title,url,state,author,repository,updatedAt',
}
const GH_COMMANDS = [...Object.keys(GH_FIELDS), 'status']
const TAP_COMMANDS = ['overview', 'developer +list', 'app +list', 'app analyze-app-status', 'app get-app-module', 'app get-app-version', 'app list-app-versions', 'app list-packages']
const COMMANDS = Object.freeze({ github: GH_COMMANDS, taptap: TAP_COMMANDS })
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const IDENT = /^[A-Za-z0-9_.-]{1,100}$/
const POSITIVE = /^\d{1,18}$/

function findNative(resource, env = process.env) {
  const win = process.platform === 'win32'
  const dirs = [...new Set([...(env.PATH || env.Path || '').split(path.delimiter),
    ...(win ? [path.join(env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI'), path.join(env.APPDATA || '', 'npm')]
      : ['/usr/local/bin', '/opt/homebrew/bin', path.join(os.homedir(), '.local', 'bin')])].filter(Boolean))]
  const name = resource === 'github' ? (win ? 'gh.exe' : 'gh') : (win ? 'taptap-cli.exe' : 'taptap-cli')
  for (const dir of dirs) {
    const candidates = [path.join(dir, name)]
    if (resource === 'taptap') {
      const platform = { win32: 'windows', linux: 'linux', darwin: 'darwin' }[process.platform]
      const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch]
      if (platform && arch) candidates.push(path.join(dir, 'node_modules', '@taptap', 'cli', 'bin', `taptap-cli-${platform}-${arch}${win ? '.exe' : ''}`))
    }
    for (const file of candidates) {
      try { if (fs.statSync(file).isFile() && (!win || /\.exe$/i.test(file))) return fs.realpathSync(file) } catch {}
    }
  }
  return ''
}

function safeEnv(parent = process.env) {
  const env = { ...parent, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', GH_NO_EXTENSION_UPDATE_NOTIFIER: '1',
    NO_COLOR: '1', CLICOLOR: '0', TERM: 'dumb', GH_PAGER: '', PAGER: '', GIT_PAGER: '', GH_BROWSER: '', BROWSER: '' }
  for (const key of Object.keys(env)) if (/^(ELECTRON_RUN_AS_NODE|NODE_OPTIONS|GH_DEBUG|DEBUG|DSH_OFFICE_BROWSER_(TOKEN|URL))$/.test(key)) delete env[key]
  return env
}

function runNative(executable, args, { cwd, timeout = 20000, outputCap = 128 * 1024, env = process.env } = {}) {
  return new Promise(resolve => {
    let stdout = '', stderr = '', size = 0, finished = false, timedOut = false, truncated = false, child
    const finish = (code, error = '') => { if (finished) return; finished = true; clearTimeout(timer); resolve({ code, stdout, stderr, timedOut, truncated, error }) }
    const timer = setTimeout(() => { timedOut = true; try { child?.kill() } catch {}; finish(-1, 'timeout') }, timeout)
    try { child = spawn(executable, args, { cwd, env: safeEnv(env), windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch { return finish(-1, 'launch_failed') }
    const append = (kind, data) => {
      const bytes = Buffer.from(data), remaining = Math.max(0, outputCap - size); size += bytes.length
      const text = bytes.subarray(0, remaining).toString('utf8')
      if (kind === 'stdout') stdout += text; else stderr += text
      if (size > outputCap) { truncated = true; try { child.kill() } catch {}; finish(-1, 'output_limit') }
    }
    child.stdout.on('data', data => append('stdout', data)); child.stderr.on('data', data => append('stderr', data))
    child.once('error', () => finish(-1, 'launch_failed')); child.once('close', code => finish(Number.isInteger(code) ? code : -1))
  })
}

function parseAuth(resource, result) {
  let data
  try { data = JSON.parse(result.stdout) } catch { return { authenticated: null, credentialAvailable: false, status: 'unknown', verified: false } }
  if (resource === 'github') {
    const accounts = Object.values(data.hosts || {}).flat().filter(x => x && x.active === true)
    const authenticated = accounts.some(x => x.state === 'success')
    return { authenticated: accounts.length ? authenticated : false, credentialAvailable: authenticated,
      status: authenticated ? 'ready' : 'not-authenticated', verified: accounts.length > 0 }
  }
  const d = data.data || data
  const credentialAvailable = d.hasAccessToken === true && d.accessTokenExpired === false
  // An offline credential is evidence of a saved session, not a live service check.
  const verified = d.serverChecked === true
  const authenticated = verified ? credentialAvailable && d.serverAlive === true : credentialAvailable ? null : false
  return { authenticated, credentialAvailable, status: verified && authenticated ? 'ready' : credentialAvailable ? 'credentials-present' : 'not-authenticated', verified }
}

function validateCall(resource, input) {
  if (!Object.hasOwn(COMMANDS, resource)) throw new Error(L('不支持的 CLI 资源', 'Unsupported CLI resource'))
  if (!Array.isArray(input) || !input.length || input.length > 32 || input.some(x => typeof x !== 'string' || x.length > 12000 || /[\x00-\x1f`$;|<>&]/.test(x)) || input.join('').length > 16000) throw new Error(L('CLI 参数必须是受支持的字符串数组', 'CLI arguments must be a supported string array'))
  const args = [...input]
  const one = resource === 'github' ? args[0] === 'status' : args[0] === 'overview'
  const command = args.slice(0, one ? 1 : 2).join(' ')
  if (!COMMANDS[resource].includes(command)) throw new Error(L('只允许列表中的只读命令', 'Only listed read-only commands are allowed'))
  const rest = args.slice(one ? 1 : 2), output = args.slice(0, one ? 1 : 2), positionals = [], seen = new Set()
  const options = resource === 'github'
    ? { '--repo': 'repo', '-R': 'repo', '--limit': 'limit', '-L': 'limit', '--state': 'state', '--author': 'ident', '--assignee': 'ident', '--owner': 'ident', '--label': 'query', '--search': 'query', '--language': 'query', '--topic': 'query', '--visibility': 'visibility', '--org': 'ident' }
    : { '--dev-id': 'id', '--app-id': 'id', '--page': 'page', '--page-size': 'limit', '--kw': 'query', '--data': 'json', '--locale': 'locale' }
  const perCommand = {
    'repo view': [], 'repo list': ['limit', 'visibility', 'language', 'topic'],
    'issue list': ['repo', 'limit', 'state', 'author', 'assignee', 'label', 'search'], 'issue view': ['repo'],
    'pr list': ['repo', 'limit', 'state', 'author', 'assignee', 'label', 'search'], 'pr view': ['repo'], 'pr checks': ['repo'],
    'search repos': ['limit', 'owner', 'language'], 'search issues': ['repo', 'limit', 'state', 'author', 'assignee', 'label', 'owner'],
    'search prs': ['repo', 'limit', 'state', 'author', 'assignee', 'label', 'owner'], 'status': ['org'],
    'overview': ['dev-id', 'page-size'], 'developer +list': [], 'app +list': ['dev-id', 'page', 'page-size', 'kw'],
    'app analyze-app-status': ['dev-id', 'app-id', 'data', 'locale'], 'app get-app-module': ['dev-id', 'app-id', 'data', 'locale'],
    'app get-app-version': ['dev-id', 'app-id', 'data', 'locale'], 'app list-app-versions': ['dev-id', 'app-id', 'data', 'locale'],
    'app list-packages': ['dev-id', 'app-id', 'data', 'locale'],
  }
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i]
    if (!item.startsWith('-')) { positionals.push(item); output.push(item); continue }
    const parts = item.split('='), flag = parts.shift(), kind = options[flag]
    if (!kind) throw new Error(L('不允许此 CLI 参数', 'This CLI flag is not allowed'))
    const canonical = flag === '-R' ? 'repo' : flag === '-L' ? 'limit' : flag.slice(2)
    if (!perCommand[command].includes(canonical) || seen.has(canonical)) throw new Error(L('此命令不支持该参数或参数重复', 'Flag is unsupported for this command or repeated'))
    seen.add(canonical)
    const value = parts.length ? parts.join('=') : rest[++i]
    if (typeof value !== 'string' || !value || value.startsWith('-') || value.startsWith('@') || /(^|\s)(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|\\\\)/.test(value)) throw new Error(L('不允许路径或缺失的参数值', 'Paths and missing flag values are not allowed'))
    const valid = kind === 'repo' ? REPO.test(value) : kind === 'ident' ? IDENT.test(value)
      : kind === 'limit' ? POSITIVE.test(value) && Number(value) >= 1 && Number(value) <= 50
        : kind === 'page' ? POSITIVE.test(value) && Number(value) >= 1 && Number(value) <= 20
          : kind === 'id' ? POSITIVE.test(value) && Number(value) > 0
            : kind === 'state' ? ['open', 'closed', 'all', 'merged'].includes(value)
              : kind === 'visibility' ? ['public', 'private', 'internal'].includes(value)
                : kind === 'locale' ? /^(zh-CN|en-US|en|zh)$/.test(value) : value.length <= 500
    if (!valid) throw new Error(L('CLI 参数值无效', 'Invalid CLI flag value'))
    if (kind === 'json') {
      let data; try { data = JSON.parse(value) } catch { throw new Error(L('data 必须为内联 JSON 对象', 'data must be an inline JSON object')) }
      if (!data || typeof data !== 'object' || Array.isArray(data) || /"(?:token|secret|password|authorization|server_url|base_url|endpoint|path|file|__proto__|constructor)"\s*:/i.test(value)) throw new Error(L('data 包含不允许的字段', 'data contains forbidden fields'))
    }
    output.push(flag, value)
  }
  if (resource === 'github') {
    const maxPositionals = command === 'repo view' || command === 'repo list' || /^(issue view|pr view|pr checks|search )/.test(command) ? 1 : 0
    if (positionals.length > maxPositionals || positionals.some(v => /^[-@]|[\\]|^[A-Za-z]:/.test(v))) throw new Error(L('不允许此命令位置参数', 'Command positional arguments are not allowed'))
    if (command === 'repo view' && (positionals.length !== 1 || !REPO.test(positionals[0]))) throw new Error(L('请指定 owner/repo', 'Specify owner/repo'))
    if (command === 'repo list' && positionals.length && !IDENT.test(positionals[0])) throw new Error(L('仓库所有者无效', 'Invalid repository owner'))
    if (/^(issue view|pr view|pr checks)$/.test(command) && (positionals.length !== 1 || !POSITIVE.test(positionals[0]))) throw new Error(L('请指定条目数字编号', 'Specify an item number'))
    if (/^(issue|pr) /.test(command) && !seen.has('repo')) throw new Error(L('请通过 --repo 指定 owner/repo', 'Specify owner/repo with --repo'))
    if (command.startsWith('search ') && (positionals.length !== 1 || positionals[0].length > 500)) throw new Error(L('请提供一个搜索条件字符串', 'Provide one search query string'))
    if (GH_FIELDS[command]) output.push('--json', GH_FIELDS[command])
    if (/ (list)$|^search /.test(command) && !seen.has('limit')) output.push('--limit', '20')
  } else {
    if (positionals.length) throw new Error(L('TapTap 仅支持命名参数', 'TapTap accepts named flags only'))
    output.push('--json')
  }
  return { command, args: output }
}

function sanitize(value, env = process.env) {
  const clean = text => {
    let s = String(text).replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '[redacted]')
      .replace(/\bBearer\s+\S+/ig, 'Bearer [redacted]')
      .replace(/((?:access[_-]?token|refresh[_-]?token|api[_-]?key|password|secret)\s*[=:]\s*)["']?[^\s,"'}]+/ig, '$1[redacted]')
    for (const [key, secret] of Object.entries(env)) if (/TOKEN|SECRET|PASSWORD|API_KEY/.test(key) && typeof secret === 'string' && secret.length >= 6) s = s.split(secret).join('[redacted]')
    return s
  }
  if (Array.isArray(value)) return value.map(x => sanitize(x, env))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /(?:token|secret|password|authorization|credential|api.?key|cookie)/i.test(key) ? '[redacted]' : sanitize(item, env)]))
  return typeof value === 'string' ? clean(value) : value
}

class CliResources {
  constructor({ getSettings, find = findNative, run = runNative, env = process.env } = {}) {
    this.getSettings = getSettings || (() => ({})); this.find = find; this.run = run; this.env = env; this.cache = null; this.cacheAt = 0
  }
  async detect({ refresh = false } = {}) {
    if (!refresh && this.cache && Date.now() - this.cacheAt < 60000) return this.withAuthorization(this.cache)
    const resources = await Promise.all(['github', 'taptap'].map(async id => {
      const executable = this.find(id, this.env)
      const base = { id, name: id === 'github' ? 'GitHub CLI' : 'TapTap CLI', installed: !!executable, path: executable, scope: 'read-only', commands: COMMANDS[id], documentation: DOCS[id] }
      if (!executable) return { ...base, authenticated: false, credentialAvailable: false, verified: false, status: 'not-installed' }
      try {
        if (id === 'taptap') {
          const identity = await this.run(executable, ['--help'], { env: this.env, timeout: 8000, outputCap: 24000 })
          if (!/taptap-cli[\s\S]*TapTap CLI/i.test(identity.stdout)) return { ...base, authenticated: null, credentialAvailable: false, verified: false, status: 'unsupported' }
        }
        const auth = await this.run(executable, id === 'github' ? ['auth', 'status', '--json', 'hosts'] : ['auth', 'status', '--offline', '--json'], { env: this.env, timeout: 12000, outputCap: 24000 })
        return { ...base, ...parseAuth(id, auth) }
      } catch { return { ...base, authenticated: null, credentialAvailable: false, verified: false, status: 'unknown' } }
    }))
    this.cache = resources; this.cacheAt = Date.now(); return this.withAuthorization(resources)
  }
  withAuthorization(resources) { return { resources: resources.map(r => ({ ...r, enabled: this.getSettings().cliResources?.[r.id] === true })) } }
  async tool(name, args = {}, context = {}) {
    if (name === 'cli_list_resources') {
      if (Object.keys(args).length) throw new Error(L('此工具不接收参数', 'This tool takes no arguments'))
      const info = await this.detect()
      return { resources: info.resources.filter(r => r.enabled).map(({ path: _path, ...r }) => r), scope: 'read-only' }
    }
    if (name !== 'cli_call' || Object.keys(args).some(k => !['resource', 'args'].includes(k))) throw new Error(L('未知 CLI 工具或参数', 'Unknown CLI tool or argument'))
    if (this.getSettings().cliResources?.[args.resource] !== true) throw new Error(L('此 CLI 资源尚未由用户勾选并确认授权', 'The user has not selected and confirmed this CLI resource'))
    const validated = validateCall(args.resource, args.args)
    const resource = (await this.detect()).resources.find(r => r.id === args.resource)
    if (!resource?.installed || !resource.credentialAvailable || ['unsupported', 'unknown'].includes(resource.status)) throw new Error(L('CLI 未安装或没有可用登录状态；请在设置中重新检测', 'CLI is unavailable or has no usable login session; detect it again in Settings'))
    const settings = this.getSettings()
    const cwd = require('./browser-policy.cjs').workspacePath(settings.workspace, context.projectDir || settings.workspace)
    if (args.resource === 'taptap') {
      const help = await this.run(resource.path, [...validated.command.split(' '), '--help'], { cwd, env: this.env, timeout: 8000, outputCap: 24000 })
      if (help.code !== 0 || !/^Risk:\s*read\s*$/im.test(help.stdout)) throw new Error(L('无法核实此 TapTap 命令为只读操作', 'This TapTap command could not be verified as read-only'))
    }
    const result = await this.run(resource.path, validated.args, { cwd, env: this.env, timeout: 25000, outputCap: 128 * 1024 })
    let data
    try { data = JSON.parse(result.stdout) } catch { data = result.stdout }
    return sanitize({ resource: args.resource, command: validated.command, ok: result.code === 0, exitCode: result.code,
      data, error: result.error || (result.code !== 0 ? result.stderr.slice(0, 2000) : ''), truncated: !!result.truncated, timedOut: !!result.timedOut }, this.env)
  }
}
module.exports = { CliResources, COMMANDS, DOCS, findNative, runNative, parseAuth, validateCall, sanitize, safeEnv }
