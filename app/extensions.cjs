// DSH Office extensions: plugins, MCP servers, skills and the expert library.
//
// A plugin is a folder with a plugin.json manifest that may contribute
//   - mcpServers: MCP connections (same shape as Settings → MCP)
//   - experts:    expert role templates HR can hire from
//   - skills:     a skills folder (DSH skill format: <name>/SKILL.md or <name>.md)
// Built-in plugins ship in app/plugins; user plugins live in <userData>/plugins,
// user skills in <userData>/skills.
// Office settings own the on/off switches (settings.plugins, pluginMcp, skillToggles),
// the user's own MCP servers (settings.mcpServers) and custom experts (settings.experts).
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const P = require('./parameters.js')

const WIN = process.platform === 'win32'
const BUILTIN_DIR = path.join(__dirname, 'plugins')
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')) } catch { return null } }

/** Bilingual value: "text" | { zh, en } → text in the wanted language. */
const pick = (v, lang = 'zh') => v && typeof v === 'object' && !Array.isArray(v) ? String(v[lang] ?? v.zh ?? v.en ?? '') : String(v ?? '')

/** Read one plugin folder; never throws (a broken plugin is listed with its error). */
function readPlugin(dir, builtin) {
  const base = { id: path.basename(dir), dir, builtin, name: path.basename(dir), description: '', version: '', author: '', mcpServers: [], experts: [], skillsDir: '', enabledByDefault: false }
  const m = readJson(path.join(dir, 'plugin.json'))
  if (!m) return { ...base, error: 'plugin.json missing or invalid' }
  try {
    const id = String(m.id || base.id)
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) throw new Error(`bad plugin id: ${id}`)
    const mcpServers = (m.mcpServers || []).map(s => P.normalizeMcpServer({ enabled: true, ...s }))
    const experts = (m.experts || []).map(e => P.normalizeExpert(e))
    const sd = m.skills ? path.resolve(dir, String(m.skills)) : path.join(dir, 'skills')
    const skillsDir = sd.startsWith(dir) && fs.existsSync(sd) ? sd : ''
    return { ...base, id, name: m.name || id, description: m.description || '', version: String(m.version || ''), author: String(m.author || ''),
      homepage: String(m.homepage || ''), enabledByDefault: m.enabledByDefault === true, mcpServers, experts, skillsDir,
      skills: skillsDir ? listSkills(skillsDir) : [] }
  } catch (err) { return { ...base, error: String(err.message || err) } }
}

/** YAML frontmatter fields we care about (single-line scalars; quotes optional). */
function frontmatter(text) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!m) return { meta: {}, body: text }
  const meta = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (!kv) continue
    let v = kv[2].trim()
    if (/^(["']).*\1$/.test(v)) v = v[0] === '"' ? (() => { try { return JSON.parse(v) } catch { return v.slice(1, -1) } })() : v.slice(1, -1).replace(/''/g, "'")
    meta[kv[1]] = v
  }
  return { meta, body: m[2] }
}
const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/

/** Skills inside a skills root (one level deep, like DSH skill-filesystem): { name, description, file, dir }. */
function listSkills(root) {
  const out = []
  if (!root) return out
  try {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      let file, dir = ''
      if (e.isDirectory() && fs.existsSync(path.join(root, e.name, 'SKILL.md'))) { file = path.join(root, e.name, 'SKILL.md'); dir = path.join(root, e.name) }
      else if (e.isFile() && /\.md$/i.test(e.name) && !/^readme/i.test(e.name)) file = path.join(root, e.name)
      else continue
      let meta = {}
      try { meta = frontmatter(fs.readFileSync(file, 'utf8')).meta } catch {}
      const name = String(meta.name || (dir ? e.name : e.name.replace(/\.md$/i, '')))
      out.push({ name, description: String(meta.description || '').slice(0, 500), file, dir })
    }
  } catch {}
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function loadPlugins(userDir) {
  const list = [], seen = new Set()
  for (const [root, builtin] of [[BUILTIN_DIR, true], [userDir, false]]) {
    let names = []
    try { names = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort() } catch {}
    for (const n of names) {
      const p = readPlugin(path.join(root, n), builtin)
      if (seen.has(p.id)) continue // a built-in id cannot be shadowed
      seen.add(p.id); list.push(p)
    }
  }
  return list
}

const pluginEnabled = (settings, p) => !p.error && (settings.plugins && typeof settings.plugins[p.id] === 'boolean' ? settings.plugins[p.id] : p.enabledByDefault)

/**
 * What is live right now: enabled MCP servers (user first, then plugins; first
 * name wins), the expert library (custom first) and skills (user skills first,
 * then plugin skills; per-skill switches in settings.skillToggles["source/name"]).
 */
function resolve(settings, plugins, userSkills = []) {
  const on = plugins.filter(p => pluginEnabled(settings, p))
  const mcpServers = [], names = new Set(), skipped = []
  const add = (s, source) => {
    if (s.enabled === false) return
    if (names.has(s.name.toLowerCase())) { skipped.push({ kind: 'mcp', name: s.name, source }); return }
    names.add(s.name.toLowerCase()); mcpServers.push({ ...s, source })
  }
  for (const s of settings.mcpServers || []) add(s, 'user')
  for (const p of on) for (const s of p.mcpServers) {
    const o = settings.pluginMcp?.[`${p.id}/${s.name}`]
    add(typeof o === 'boolean' ? { ...s, enabled: o } : s, p.id)
  }
  const experts = [], ids = new Set()
  for (const e of settings.experts || []) if (!ids.has(e.id)) { ids.add(e.id); experts.push({ ...e, source: 'user' }) }
  for (const p of on) for (const e of p.experts) if (!ids.has(e.id)) { ids.add(e.id); experts.push({ ...e, source: p.id }) }
  const skills = [], sn = new Set()
  const addSkill = (s, source) => {
    const key = `${source}/${s.name}`
    if (settings.skillToggles?.[key] === false) return
    if (sn.has(s.name)) { skipped.push({ kind: 'skill', name: s.name, source }); return }
    sn.add(s.name); skills.push({ ...s, source, key })
  }
  for (const s of userSkills) addSkill(s, 'user')
  for (const p of on) for (const s of p.skills || []) addSkill(s, p.id)
  return { mcpServers, experts, skills, skipped }
}

/**
 * Copy the live skills into <workspace>/.agents/skills so both engines find them:
 * DSH through customSkillDirs, Codex through its project skill discovery (it skips
 * user config, so this is the only per-run way in). Only folders Office put there
 * (listed in .office-managed.json) are ever replaced; a same-name skill the user
 * keeps in that folder wins.
 */
function stageSkills(skills, workspace) {
  if (!workspace) return ''
  const root = path.join(workspace, '.agents', 'skills'), mf = path.join(root, '.office-managed.json')
  let prev = []
  try { prev = JSON.parse(fs.readFileSync(mf, 'utf8')) } catch {}
  for (const n of Array.isArray(prev) ? prev : []) if (SKILL_NAME.test(n)) fs.rmSync(path.join(root, n), { recursive: true, force: true })
  if (!skills.length) { fs.rmSync(mf, { force: true }); return '' }
  fs.mkdirSync(root, { recursive: true })
  const staged = []
  for (const s of skills) {
    if (!SKILL_NAME.test(s.name)) continue
    const dst = path.join(root, s.name)
    if (fs.existsSync(dst)) continue
    if (s.dir) fs.cpSync(s.dir, dst, { recursive: true })
    else { fs.mkdirSync(dst); fs.copyFileSync(s.file, path.join(dst, 'SKILL.md')) }
    staged.push(s.name)
  }
  fs.writeFileSync(mf, JSON.stringify(staged))
  return root
}

// ---------- user skills (<userData>/skills) ----------
const skillText = (name, description, body) => `---\nname: ${name}\ndescription: ${JSON.stringify(String(description).replace(/\s+/g, ' ').trim())}\n---\n\n${String(body || '').trim()}\n`
/** Create or update one user skill. Renaming moves its folder (resources included). */
function saveUserSkill(root, { name, description, body, oldName }) {
  name = String(name || '').trim(); description = String(description || '').trim()
  if (!SKILL_NAME.test(name)) throw new Error(P.msg('技能名只能用小写字母、数字和 -（1-64 位）', 'Skill names use lowercase letters, digits and - (1-64 chars)'))
  if (!description) throw new Error(P.msg('技能需要一句说明（模型据此判断何时使用）', 'A skill needs a description (the model uses it to decide when to load it)'))
  if (!String(body || '').trim()) throw new Error(P.msg('技能正文不能为空', 'The skill body cannot be empty'))
  fs.mkdirSync(root, { recursive: true })
  const dst = path.join(root, name)
  if (oldName && oldName !== name) {
    if (!SKILL_NAME.test(oldName)) throw new Error('bad skill name')
    if (fs.existsSync(dst)) throw new Error(P.msg(`已有同名技能：${name}`, `A skill named ${name} already exists`))
    if (fs.existsSync(path.join(root, oldName))) fs.renameSync(path.join(root, oldName), dst)
    else fs.rmSync(path.join(root, `${oldName}.md`), { force: true })
  } else if (!oldName && (fs.existsSync(dst) || fs.existsSync(`${dst}.md`))) throw new Error(P.msg(`已有同名技能：${name}`, `A skill named ${name} already exists`))
  if (fs.existsSync(`${dst}.md`)) fs.rmSync(`${dst}.md`) // flat file becomes a folder bundle
  fs.mkdirSync(dst, { recursive: true })
  fs.writeFileSync(path.join(dst, 'SKILL.md'), skillText(name, description, body))
  return name
}
function deleteUserSkill(root, name) {
  if (!SKILL_NAME.test(String(name))) throw new Error('bad skill name')
  fs.rmSync(path.join(root, name), { recursive: true, force: true })
  fs.rmSync(path.join(root, `${name}.md`), { force: true })
}
/** Import a skill folder (with SKILL.md), a folder of skills, or a single .md file. Returns imported names. */
function importSkills(src, root) {
  const st = fs.statSync(src)
  const found = st.isFile() ? (/\.md$/i.test(src) ? [{ file: src, dir: '' }] : [])
    : fs.existsSync(path.join(src, 'SKILL.md')) ? [{ file: path.join(src, 'SKILL.md'), dir: src }]
    : listSkills(src)
  const done = []
  fs.mkdirSync(root, { recursive: true })
  for (const f of found) {
    const { meta, body } = frontmatter(fs.readFileSync(f.file, 'utf8'))
    const name = String(meta.name || path.basename(f.dir || f.file).replace(/\.md$/i, '')).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
    if (!SKILL_NAME.test(name) || !String(meta.description || '').trim()) continue
    const dst = path.join(root, name)
    fs.rmSync(dst, { recursive: true, force: true }); fs.rmSync(`${dst}.md`, { force: true })
    if (f.dir) fs.cpSync(f.dir, dst, { recursive: true, filter: x => !/[\\/](node_modules|\.git)([\\/]|$)/.test(x.slice(f.dir.length)) })
    else fs.mkdirSync(dst)
    fs.writeFileSync(path.join(dst, 'SKILL.md'), skillText(name, meta.description, body))
    done.push(name)
  }
  if (!done.length) throw new Error(P.msg('没有找到可导入的技能（需要带 name / description 头部的 SKILL.md 或 .md 文件）', 'No importable skill found (needs SKILL.md or .md files with name / description frontmatter)'))
  return done
}
/** Full text of a skill: { name, description, body }. */
function readSkill(file) {
  const { meta, body } = frontmatter(fs.readFileSync(file, 'utf8'))
  return { name: String(meta.name || ''), description: String(meta.description || ''), body: body.replace(/^\s+/, '') }
}

/** `${VAR}` → value from the environment (unknown vars become empty). */
const expandEnv = s => String(s).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, k) => process.env[k] ?? '')
const mapObj = (o, f) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, f(v)]))

/** YAML scalar for a config value: a lone ${VAR} stays a live env lookup instead of a copied secret. */
function yamlVal(v) {
  const s = String(v)
  const lone = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(s)
  return lone ? `!!js process.env.${lone[1]}` : JSON.stringify(expandEnv(s))
}

/** DSH patch rows for the live MCP servers (one dsh-mcp-client row each). */
function dshMcpPatch(servers, cwd) {
  if (!servers.length) return ''
  let y = '- insert:\n'
  for (const s of servers) {
    y += `    - id: ${JSON.stringify('office-mcp-' + s.name)}\n      name: "@deepseek-ai/dsh-mcp-client"\n      config:\n        serverName: ${JSON.stringify(s.name)}\n        transport: ${s.transport}\n`
    if (s.transport === 'stdio') {
      y += `        command: ${JSON.stringify(expandEnv(s.command))}\n        args: [${s.args.map(a => JSON.stringify(expandEnv(a))).join(', ')}]\n`
      if (Object.keys(s.env).length) y += '        env:\n' + Object.entries(s.env).map(([k, v]) => `          ${JSON.stringify(k)}: ${yamlVal(v)}\n`).join('')
      y += `        cwd: ${JSON.stringify(expandEnv(s.cwd || cwd))}\n`
    } else {
      y += `        url: ${JSON.stringify(expandEnv(s.url))}\n`
      if (Object.keys(s.headers).length) y += '        headers:\n' + Object.entries(s.headers).map(([k, v]) => `          ${JSON.stringify(k)}: ${yamlVal(v)}\n`).join('')
    }
    y += `        toolCallTimeoutMs: ${s.timeoutMs}\n`
  }
  return y
}

/** DSH patch row that adds the staged skill root to the filesystem skill provider. */
function dshSkillPatch(dirs) {
  if (!dirs.length) return ''
  return `- id: skill-filesystem\n  config:\n    customSkillDirs: [${dirs.map(d => JSON.stringify(d)).join(', ')}]\n`
}

/** `codex exec` -c overrides that mount the live MCP servers (TOML values). */
function codexMcpArgs(servers, cwd) {
  const t = v => JSON.stringify(String(v)) // TOML basic strings share JSON escaping
  const table = o => `{${Object.entries(o).map(([k, v]) => `${t(k)}=${t(expandEnv(v))}`).join(', ')}}`
  const a = []
  for (const s of servers) {
    const k = `mcp_servers.${s.name}`
    if (s.transport === 'stdio') {
      a.push('-c', `${k}.command=${t(expandEnv(s.command))}`, '-c', `${k}.args=[${s.args.map(x => t(expandEnv(x))).join(', ')}]`)
      if (Object.keys(s.env).length) a.push('-c', `${k}.env=${table(s.env)}`)
      a.push('-c', `${k}.cwd=${t(expandEnv(s.cwd || cwd))}`)
    } else {
      a.push('-c', `${k}.url=${t(expandEnv(s.url))}`)
      if (Object.keys(s.headers).length) a.push('-c', `${k}.http_headers=${table(s.headers)}`)
    }
    a.push('-c', `${k}.tool_timeout_sec=${Math.ceil(s.timeoutMs / 1000)}`, '-c', `${k}.default_tools_approval_mode="approve"`)
  }
  return a
}

// ---------- MCP connection test (initialize + tools/list) ----------
const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dsh-office', version: '1.3.0' } }

function testStdio(s, cwd, timeout) {
  return new Promise(resolve => {
    const env = { ...process.env, ...mapObj(s.env, expandEnv) }
    delete env.ELECTRON_RUN_AS_NODE
    const cmd = expandEnv(s.command), args = s.args.map(expandEnv)
    // npx/uvx etc. are .cmd shims on Windows; they need a shell.
    const shell = WIN && !/\.exe$/i.test(cmd) && !fs.existsSync(cmd)
    const q = x => /[\s"&|<>^]/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x
    let proc
    try {
      proc = shell ? spawn([cmd, ...args].map(q).join(' '), { cwd: s.cwd || cwd, env, shell: true, windowsHide: true })
        : spawn(cmd, args, { cwd: s.cwd || cwd, env, windowsHide: true })
    } catch (err) { return resolve({ ok: false, error: String(err.message || err) }) }
    let buf = '', errTail = '', done = false, info = null
    const finish = r => { if (done) return; done = true; clearTimeout(timer); try { proc.stdin.end() } catch {}; try { WIN && proc.pid ? spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true }) : proc.kill() } catch {}; resolve(r) }
    const timer = setTimeout(() => finish({ ok: false, error: `timeout after ${timeout / 1000}s${errTail ? ': ' + errTail.trim().split('\n').slice(-2).join(' | ') : ''}` }), timeout)
    const send = m => { try { proc.stdin.write(JSON.stringify(m) + '\n') } catch {} }
    proc.on('error', err => finish({ ok: false, error: String(err.message || err) }))
    proc.on('close', code => finish({ ok: false, error: `exited ${code}${errTail ? ': ' + errTail.trim().split('\n').slice(-3).join(' | ') : ''}` }))
    proc.stderr.on('data', d => { errTail = (errTail + d).slice(-800) })
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', d => {
      buf += d; let n
      while ((n = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, n).trim(); buf = buf.slice(n + 1)
        let m; try { m = JSON.parse(line) } catch { continue }
        if (m.id === 1) {
          if (m.error) return finish({ ok: false, error: m.error.message || 'initialize failed' })
          info = m.result?.serverInfo || null
          send({ jsonrpc: '2.0', method: 'notifications/initialized' })
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
        } else if (m.id === 2) {
          if (m.error) return finish({ ok: false, error: m.error.message || 'tools/list failed' })
          finish({ ok: true, server: info, tools: (m.result?.tools || []).map(x => ({ name: x.name, description: String(x.description || '').slice(0, 200) })) })
        }
      }
    })
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT })
  })
}

async function testHttp(s, timeout) {
  const url = expandEnv(s.url), headers = mapObj(s.headers, expandEnv)
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout)
  let sid = null
  const post = async (body, expectReply = true) => {
    const res = await fetch(url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(sid ? { 'mcp-session-id': sid } : {}), ...headers }, body: JSON.stringify(body) })
    sid = res.headers.get('mcp-session-id') || sid
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`)
    if (!expectReply) return null
    const text = await res.text()
    if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
      for (const block of text.split(/\r?\n\r?\n/)) {
        const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n')
        if (!data) continue
        try { const m = JSON.parse(data); if (m.id === body.id) return m } catch {}
      }
      throw new Error('no reply in event stream')
    }
    return JSON.parse(text)
  }
  try {
    const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT })
    if (init.error) throw new Error(init.error.message)
    await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, false)
    const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    if (list.error) throw new Error(list.error.message)
    return { ok: true, server: init.result?.serverInfo || null, tools: (list.result?.tools || []).map(x => ({ name: x.name, description: String(x.description || '').slice(0, 200) })) }
  } catch (err) {
    return { ok: false, error: ctl.signal.aborted ? `timeout after ${timeout / 1000}s` : String(err.message || err) }
  } finally { clearTimeout(timer) }
}

/** Connect once, list tools, disconnect. */
function testMcp(raw, { cwd = process.cwd(), timeout = 45000 } = {}) {
  let s
  try { s = P.normalizeMcpServer(raw) } catch (err) { return Promise.resolve({ ok: false, error: String(err.message || err) }) }
  return s.transport === 'stdio' ? testStdio(s, cwd, timeout) : testHttp(s, timeout)
}

// ---------- user plugin install / remove ----------
function installPlugin(src, userDir) {
  const p = readPlugin(src, false)
  if (p.error) throw new Error(p.error)
  if (fs.existsSync(path.join(BUILTIN_DIR, p.id))) throw new Error(`"${p.id}" is a built-in plugin id`)
  const dst = path.join(userDir, p.id)
  if (path.resolve(src) === path.resolve(dst)) return p
  fs.mkdirSync(userDir, { recursive: true })
  fs.rmSync(dst, { recursive: true, force: true })
  fs.cpSync(src, dst, { recursive: true, filter: f => !/[\\/](node_modules|\.git)([\\/]|$)/.test(f.slice(src.length)) })
  return readPlugin(dst, false)
}
function removePlugin(id, userDir) {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) throw new Error('bad plugin id')
  const dst = path.join(userDir, id)
  if (!fs.existsSync(path.join(dst, 'plugin.json'))) throw new Error('not a user plugin')
  fs.rmSync(dst, { recursive: true, force: true })
}

/** Plugin info safe to send to the renderer. */
const publicPlugin = (p, settings) => ({
  id: p.id, name: p.name, description: p.description, version: p.version, author: p.author, homepage: p.homepage, builtin: p.builtin, dir: p.dir, error: p.error || null,
  enabled: pluginEnabled(settings, p), mcpServers: p.mcpServers, experts: p.experts, skills: (p.skills || []).map(s => ({ name: s.name, description: s.description })),
})

module.exports = { BUILTIN_DIR, pick, loadPlugins, readPlugin, resolve, pluginEnabled, dshMcpPatch, dshSkillPatch, codexMcpArgs, testMcp, installPlugin, removePlugin, publicPlugin, expandEnv, listSkills, stageSkills, saveUserSkill, deleteUserSkill, importSkills, readSkill, frontmatter }
