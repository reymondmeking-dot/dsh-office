// DSH Office — Electron main process: window, settings, project archive, and the
// CEO → HR → meeting → work → report → archive orchestration over DSH runtimes.
'use strict'
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { RuntimePool } = require('./runtime.cjs')
const parameters = require('./parameters.js')
const prov = require('./providers.cjs')
const agents = require('./agents.cjs')
const codexCli = require('./codex.cjs')
const I18N = require('./renderer/i18n.js')
const T = (k, v) => I18N.t(k, v)
const jn = a => a.join(I18N.getLang() === 'en' ? ', ' : '、')
/** UI language picks the agents' working language too: prompts, harness, names, file names. */
const EN = () => I18N.getLang() === 'en'
const L = (zh, en) => EN() ? en : zh
/** Built-in CEO/HR names follow the UI language until the user renames them. */
const DEFAULT_NAMES = { ceo: { zh: '乔老板', en: 'Joe' }, hr: { zh: '安娜', en: 'Anna' } }
const DEFAULT_TITLES = { 'HR 总监': 'HR Director' }
const shownName = a => { const d = DEFAULT_NAMES[a?.id]; return d && (a.name === d.zh || a.name === d.en) ? (EN() ? d.en : d.zh) : a?.name }
const shownTitle = a => EN() && DEFAULT_TITLES[a?.title] ? DEFAULT_TITLES[a.title] : a?.title

// On Linux the Chromium SUID sandbox is unavailable when running as root
// (Docker/CI) or without unprivileged user namespaces; fall back automatically.
if (process.platform === 'linux' && (process.env.DSH_OFFICE_NO_SANDBOX === '1' || (() => { try { return typeof process.getuid === 'function' && process.getuid() === 0 } catch { return false } })())) {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}

const USER = app.getPath('userData')
const SETTINGS_FILE = path.join(USER, 'settings.json')
const STATE_FILE = path.join(USER, 'office-state.json')
const LOG_FILE = path.join(USER, 'office.log')
const HARNESS_DIR = path.join(USER, 'harness')
const PLUGIN_DIR = path.join(USER, 'plugins')
const SKILL_DIR = path.join(USER, 'skills')
const extensions = require('./extensions.cjs')

/** Where a DSH (deepseek-harness) checkout normally lives on each platform. */
function defaultDshRoot() {
  const home = os.homedir()
  const cands = process.platform === 'win32'
    ? ['D:\\deepseek-harness', 'C:\\deepseek-harness', path.join(home, 'deepseek-harness')]
    : ['/opt/deepseek-harness', path.join(home, 'deepseek-harness'), path.join(home, 'deepseek', 'harness'), '/srv/deepseek-harness']
  for (const c of cands) { try { if (fs.existsSync(path.join(c, 'package.json'))) return c } catch {} }
  for (const c of cands) { try { if (fs.existsSync(c)) return c } catch {} }
  return process.platform === 'win32' ? cands[0] : path.join(home, 'deepseek-harness')
}

const DEFAULT_SETTINGS = {
  workspace: path.join(os.homedir(), 'Documents', 'DSH Office'),
  dshRoot: defaultDshRoot(),
  nodePath: '',
  proxyPort: 19828,
  permissionMode: 'workspace-write',
  defaultModel: '',
  defaultEffort: 'medium',
  normalConcurrency: 3,
  minTeam: 2,
  maxTeam: 5,
  compaction: parameters.DEFAULT_COMPACTION,
  // No built-in API configuration: the user adds providers/models in Settings.
  providers: {},
  models: [],
  // Extensions (Settings → Extensions): user MCP servers, custom experts, plugin switches.
  mcpServers: [],
  experts: [],
  plugins: {},
  pluginMcp: {},
  skillToggles: {},
}
const NO_MODEL_MSG = () => T('err.noModel')
/** Default per-request output cap used to sanity-check a model entry. */
const DEFAULT_CONTEXT_WINDOW = parameters.DEFAULT_CONTEXT_WINDOW

function log(msg) {
  try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`) } catch {}
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8')
    fs.renameSync(temporary, file)
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
}

const loadedSettings = readJson(SETTINGS_FILE, {})
let settings = parameters.migrateSettings({ ...DEFAULT_SETTINGS, ...loadedSettings,
  compaction: loadedSettings.compaction,
})
if (JSON.stringify(settings) !== JSON.stringify(loadedSettings)) writeJson(SETTINGS_FILE, settings)
// runtime.cjs finds user plugins and skills through these (they follow userData; not settings).
process.env.DSH_OFFICE_PLUGIN_DIR = PLUGIN_DIR
process.env.DSH_OFFICE_SKILL_DIR = SKILL_DIR
for (const m of settings.models) if (!Array.isArray(m.efforts)) m.efforts = ['off', 'low', 'medium', 'high']
const projectsDir = () => path.join(settings.workspace, 'projects')

// ---------- harness ----------
function ensureHarness() {
  fs.mkdirSync(path.join(HARNESS_DIR, 'en'), { recursive: true })
  const norm = s => s.replace(/\r\n/g, '\n').trim()
  for (const f of ['ceo.md', 'hr.md', 'employee.md']) {
    const enDst = path.join(HARNESS_DIR, 'en', f), enSrc = path.join(__dirname, 'harness', 'en', f)
    if (!fs.existsSync(enDst) && fs.existsSync(enSrc)) fs.copyFileSync(enSrc, enDst)
    const dst = path.join(HARNESS_DIR, f), src = path.join(__dirname, 'harness', f)
    if (!fs.existsSync(dst)) { fs.copyFileSync(src, dst); continue }
    // upgrade untouched copies of an older shipped version; keep the user's own edits
    const cur = norm(fs.readFileSync(dst, 'utf8')), ship = norm(fs.readFileSync(src, 'utf8'))
    if (cur === ship) continue
    const legacy = path.join(__dirname, 'harness', 'legacy', f)
    if (fs.existsSync(legacy) && norm(fs.readFileSync(legacy, 'utf8')) === cur) {
      fs.copyFileSync(dst, `${dst}.v1.bak`); fs.copyFileSync(src, dst); log(`harness ${f} upgraded to v2`)
    }
  }
}
/** Harness file for the current language: <userData>/harness/en/<name>.md in English mode, else the Chinese one. */
const harnessFile = (name, lang = I18N.getLang()) => {
  const en = path.join(HARNESS_DIR, 'en', `${name}.md`)
  return lang === 'en' && fs.existsSync(en) ? en : path.join(HARNESS_DIR, `${name}.md`)
}
function harness(name, vars) {
  let t = fs.readFileSync(harnessFile(name), 'utf8')
  for (const [k, v] of Object.entries(vars)) t = t.replaceAll(`{{${k}}}`, String(v))
  const self = (name === 'ceo' || name === 'hr') && agent(name)
  if (self) t += EN()
    ? `\n\n(Your name in the office is "${shownName(self)}". ${name === 'ceo' ? `HR is "${shownName(agent('hr'))}"` : `The CEO is "${shownName(agent('ceo'))}"`}.)`
    : `\n\n（你在办公室里的名字是「${self.name}」。${name === 'ceo' ? `HR 叫「${agent('hr')?.name}」` : `CEO 叫「${agent('ceo')?.name}」`}。）`
  return t
}

// ---------- office state (agents) ----------
const state = readJson(STATE_FILE, null) || {
  agents: [
    { id: 'ceo', role: 'ceo', name: '乔老板', title: 'CEO', model: null, look: { hair: 1, shirt: 0 } },
    { id: 'hr', role: 'hr', name: '安娜', title: 'HR 总监', model: null, look: { hair: 2, shirt: 1 } },
  ],
  rush: false,
}
state.agents = state.agents.filter(a => a.role !== 'employee') // staff leave between app launches
for (const a of state.agents) { a.status = 'idle'; a.activity = '' }
const saveState = () => writeJson(STATE_FILE, { agents: state.agents.map(({ log: _l, ...a }) => a), rush: state.rush })
const agent = id => state.agents.find(a => a.id === id)
const modelOf = a => (a.model && settings.models.some(m => m.key === a.model)) ? a.model : settings.defaultModel
/** Thinking effort an agent runs with: its own pick, else the office default, clamped to what the model offers. */
function effortOf(a) {
  const m = settings.models.find(x => x.key === modelOf(a))
  const offered = m?.efforts?.length ? m.efforts : null
  // a Codex model carries its own ticked default depth, which outranks the office-wide default
  const want = a.effort || (m?.engine === 'codex' && m.defaultEffort) || settings.defaultEffort || null
  if (!offered) return null
  if (want && offered.includes(want)) return want
  // nearest offered level at or below the wish, else the lowest thinking level
  const L = prov.THINKING_LEVELS, wi = L.indexOf(want)
  const below = offered.filter(e => L.indexOf(e) <= wi).sort((x, y) => L.indexOf(y) - L.indexOf(x))
  return below[0] || offered[0]
}

let win
const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload) }
const emit = (type, data = {}) => send('office:event', { type, ...data, t: Date.now() })
function setAgent(id, patch) {
  const a = agent(id); if (!a) return
  Object.assign(a, patch)
  if (patch.activity) { a.log = [...(a.log || []), { t: Date.now(), text: patch.activity }].slice(-40) }
  send('office:agent', publicAgent(a))
  clearTimeout(setAgent.t); setAgent.t = setTimeout(saveState, 1500) // keep office-state.json in step with live status
}
const publicAgent = a => ({ ...a, name: shownName(a), title: shownTitle(a), effectiveModel: modelOf(a), effectiveEffort: effortOf(a) })

// ---------- runtime ----------
let pool
function initPool() {
  pool = new RuntimePool(settings, log)
}
/** Enabled MCP servers / experts / skills right now (what the pool was configured with). */
const liveExt = () => pool?.ext || extensions.resolve(settings, extensions.loadPlugins(PLUGIN_DIR), extensions.listSkills(SKILL_DIR))

const sleep = ms => new Promise(r => setTimeout(r, ms))
const pace = ms => sleep(state.rush ? ms / 3 : ms)

function toolLabel(name, args) {
  let a = {}
  try { a = JSON.parse(args || '{}') } catch {}
  const file = a.file_path || a.path || a.pattern || ''
  const base = file ? path.basename(String(file)) : ''
  const map = {
    write: T('tool.write', { name: base }), edit: T('tool.edit', { name: base }), read: T('tool.read', { name: base }),
    glob: T('tool.glob'), grep: T('tool.grep'),
    pwsh: T('tool.shell'), bash: T('tool.shell'), web_search: T('tool.webSearch'), web_fetch: T('tool.webFetch'), todo_write: T('tool.todo'),
    skill: T('tool.skill'), subagent: T('tool.subagent'), read_image: T('tool.image'),
  }
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name || '')
  if (mcp) return T('tool.mcp', { server: mcp[1], name: mcp[2] })
  if (name === 'skill' && (a.name || a.skill)) return T('tool.skillNamed', { name: String(a.name || a.skill) })
  return map[name] || T('tool.other', { name })
}

async function runAgent(a, sessionTag, prompt, rush) {
  const rt = pool.get(modelOf(a), rush, effortOf(a))
  const sessionId = `${a.id}-${sessionTag}-${crypto.randomBytes(4).toString('hex')}`
  const text = await rt.run(sessionId, prompt, ev => {
    if (ev.type === 'tool/call') {
      if (/^mcp__/.test(ev.data.name || '')) log(`mcp ${a.name} ${ev.data.name}`)
      if (ev.data.name === 'skill') log(`skill ${a.name} ${String(ev.data.arguments || '').slice(0, 120)}`)
      setAgent(a.id, { activity: toolLabel(ev.data.name, ev.data.arguments) })
    }
    else if (ev.type === 'assistant/attempt' || ev.type === 'step/start') emit('typing', { id: a.id })
  })
  return text
}

function parseJson(text) {
  const s = text.indexOf('{'); const e = text.lastIndexOf('}')
  if (s < 0 || e <= s) throw new Error('no JSON object')
  return JSON.parse(text.slice(s, e + 1))
}

// ---------- projects ----------
function slug(s) {
  return (String(s).replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28)) || 'project'
}
function stamp() {
  const d = new Date(); const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
const projectFile = dir => path.join(dir, '.office', 'project.json')
function saveProject(p) { writeJson(projectFile(p.dir), p) }

function listProjects() {
  const root = projectsDir()
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory())
    .map(d => readJson(projectFile(path.join(root, d.name)), null)).filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt)
}

function listFiles(dir) {
  const out = []
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.office' || e.name === 'node_modules' || e.name.startsWith('.git')) continue
      const full = path.join(d, e.name); const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { if (out.length < 400) walk(full, r) } else {
        const st = fs.statSync(full); out.push({ rel: r, path: full, size: st.size, mtime: st.mtimeMs })
      }
    }
  }
  try { walk(dir, '') } catch {}
  return out
}

const queue = []
let current = null

// plain recursive copy (fs.cpSync crashed the Electron main process)
async function copyDir(from, to) {
  await fs.promises.mkdir(to, { recursive: true })
  for (const e of await fs.promises.readdir(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name)
    if (e.isDirectory()) await copyDir(a, b); else if (e.isFile()) await fs.promises.copyFile(a, b)
  }
}
/** Copy the boss's dropped files/folders into <project>/附件/ and return their records. */
async function copyAttachments(dir, list) {
  const out = []
  const src = [...new Set([].concat(list || []).map(String).filter(Boolean))]
  if (!src.length) return out
  const attDir = L('附件', 'attachments')
  const dest = path.join(dir, attDir); fs.mkdirSync(dest, { recursive: true })
  for (const s of src) {
    try {
      const st = fs.statSync(s)
      const base = path.basename(s)
      let name = base, n = 1
      while (fs.existsSync(path.join(dest, name))) { const e = path.extname(base); name = `${path.basename(base, e)} (${++n})${e}` }
      const to = path.join(dest, name)
      if (st.isDirectory()) await copyDir(s, to); else await fs.promises.copyFile(s, to)
      const size = st.isDirectory() ? listFiles(to).reduce((a, f) => a + f.size, 0) : st.size
      out.push({ name, from: s, path: to, rel: `${attDir}/${name}`, dir: st.isDirectory(), size })
    } catch (err) { log(`attachment ${s} failed: ${err}`); out.push({ name: path.basename(s), from: s, error: String(err.message || err) }) }
  }
  return out
}
const fmtSize = b => b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(1)} GB` : b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

async function submitTask(input) {
  if (!settings.models?.length) throw new Error(NO_MODEL_MSG())
  const createdAt = Date.now()
  const name = `${stamp()}-${slug(input.title)}`
  const dir = path.join(projectsDir(), name)
  fs.mkdirSync(path.join(dir, '.office'), { recursive: true })
  const p = {
    id: name, title: input.title, brief: input.brief || '', rush: !!input.rush, dir, rel: `projects/${name}`, continueOf: input.continueOf || null,
    createdAt, status: 'queued', phase: '排队中', team: [], assignments: [], reports: [], summary: '', color: Math.floor(Math.random() * 8),
  }
  p.attachments = await copyAttachments(dir, input.attachments)
  saveProject(p)
  queue.push(p)
  emit('project', { project: p })
  if (input.rush && !state.rush) setRush(true)
  pump()
  return p
}

async function pump() {
  if (current || !queue.length) return
  current = queue.shift()
  try { await runProject(current) } catch (err) {
    log(`project ${current.id} failed: ${err.stack || err}`)
    current.status = 'failed'; current.phase = `失败：${String(err.message || err).slice(0, 120)}`
    saveProject(current); emit('project', { project: current })
    emit('say', { id: 'ceo', text: T('say.projectFail'), ms: 6000 })
    setAgent('ceo', { status: 'idle', activity: T('act.projectFailed') })
  } finally {
    current = null
    pump()
  }
}

function phase(p, status, text) {
  p.status = status; p.phase = text; saveProject(p); emit('project', { project: p })
}

async function runProject(p) {
  const vars = { projectDir: p.dir, projectRel: p.rel }
  const rush = () => state.rush || p.rush
  const rushNote = () => rush() ? L('\n\n【加急项目】老板要求加急：全员快速模式，抓重点，尽快交付可用成果。', '\n\n[RUSH] The boss wants this fast: everyone in quick mode, focus on what matters, ship something usable as soon as possible.') : ''

  // previous staff leave
  const leaving = state.agents.filter(a => a.role === 'employee')
  if (leaving.length) {
    emit('dismiss', { ids: leaving.map(a => a.id) })
    state.agents = state.agents.filter(a => a.role !== 'employee'); saveState()
    await pace(2500)
  }

  // 0. "continue" an archived project: hand its folder + summary to everyone
  const prev = p.continueOf ? listProjects().find(x => x.id === p.continueOf) : null
  let prevNote = prev ? `\n\n## 这是续作\n本项目接着已归档项目「${prev.title}」继续做。旧项目目录：${prev.dir}\n旧项目总结：${(prev.summary || '（无）').slice(0, 1500)}\n旧项目的成果文件可以直接读取、复用；新成果写到本项目目录。` : ''
  let qaNote = () => p.qa?.length ? `\n\n## 老板的补充说明（CEO 提问、老板回答）\n${p.qa.map(x => `- 问：${x.q}\n  答：${x.a || '（老板未回答，按合理假设处理并写明）'}`).join('\n')}` : ''
  const okAtt = (p.attachments || []).filter(a => !a.error)
  let attNote = okAtt.length ? `\n\n## 老板提供的附件（已复制到项目目录，请按需阅读/使用，不要修改原件）\n${okAtt.map(a => `- ${a.path}${a.dir ? '（文件夹）' : ''}，${fmtSize(a.size)}`).join('\n')}\nPDF、Word、表格、图片、音视频等可以用合适的工具或命令行读取、转写或抽帧；读不了的格式要在交付里说明。` : ''
  if (EN()) {
    prevNote = prev ? `\n\n## This is a follow-up\nThis project continues the archived project "${prev.title}". Old project folder: ${prev.dir}\nOld project summary: ${(prev.summary || '(none)').slice(0, 1500)}\nYou may read and reuse the old project's files; write new outputs into this project's folder.` : ''
    qaNote = () => p.qa?.length ? `\n\n## Clarifications from the boss (CEO asked, boss answered)\n${p.qa.map(x => `- Q: ${x.q}\n  A: ${x.a || '(no answer; make a reasonable assumption and state it)'}`).join('\n')}` : ''
    attNote = okAtt.length ? `\n\n## Attachments from the boss (copied into the project folder; read/use as needed, do not modify the originals)\n${okAtt.map(a => `- ${a.path}${a.dir ? ' (folder)' : ''}, ${fmtSize(a.size)}`).join('\n')}\nPDF, Word, spreadsheets, images, audio and video can be read, transcribed or sampled with suitable tools or the command line; say so in the deliverable if a format cannot be read.` : ''
  }
  const taskText = () => EN()
    ? `Title: ${p.title}\nDescription: ${p.brief || '(no further description)'}${attNote}${prevNote}${qaNote()}${rushNote()}`
    : `标题：${p.title}\n描述：${p.brief || '（无更多描述）'}${attNote}${prevNote}${qaNote()}${rushNote()}`

  // 1. CEO sets the goal
  phase(p, 'goal', 'CEO 制定目标')
  setAgent('ceo', { status: 'busy', activity: T('act.newTask', { title: p.title }) })
  emit('say', { id: 'ceo', text: T('say.newTask', { title: p.title }), ms: 2500 })
  emit('work-start', { id: 'ceo' })
  const goalJson = L('{"goal":"一段话的项目目标","scope":["交付物1","交付物2"],"acceptance":["验收标准1","验收标准2"],"toHr":"一句话交代给 HR 的话"}',
    '{"goal":"the project goal in one paragraph","scope":["deliverable 1","deliverable 2"],"acceptance":["criterion 1","criterion 2"],"toHr":"one sentence for HR"}')
  const goalPrompt = EN() ? `${harness('ceo', vars)}

## Now: set the goal
The boss's task:
${taskText()}

Define this project's goal, deliverable scope and acceptance criteria, then hand it to HR to hire and split the work. ${prev ? 'You may read the old project folder first to see where it stands.' : 'Look at related files in the workspace if needed.'}
Output strict JSON:
${goalJson}` : `${harness('ceo', vars)}

## 现在：制定目标
老板的任务：
${taskText()}

请明确本项目的目标、交付范围和验收标准，交给 HR 去招人分工。${prev ? '可以先读旧项目目录了解进度。' : '需要时可以查看工作区里的相关文件。'}
输出严格 JSON：
${goalJson}`
  const askRule = EN() ? `

## Ask the boss first if something is unclear
If key information in the task is unclear, would clearly change the outcome, and cannot be found in the workspace or the old project (e.g. an ambiguous reference, audience, format, style, length, deadline), you may ask the boss instead of guessing.
- At most 3 questions, each concrete and easy to answer, ideally with 2-4 options.
- Do not ask about small things you can reasonably assume.
- To ask, output only: {"questions":[{"q":"question","options":["option A","option B"]}]}
- If no questions are needed, output the goal JSON directly.` : `

## 不清楚可以先问老板
如果任务里有关键信息不清楚、会明显影响成果方向，而且无法从工作区或旧项目里查到（例如：指代不明的编号/名称、目标受众、交付格式、风格、篇幅、截止要求），你可以先向老板提问，而不是瞎猜。
- 最多 3 个问题，每个问题具体、好回答，尽量给出 2~4 个选项。
- 能合理假设的小事不要问。
- 要提问时只输出：{"questions":[{"q":"问题","options":["选项A","选项B"]}]}
- 不需要提问时，直接输出目标 JSON。`
  let goal
  try {
    let out = parseJson(await runAgent(agent('ceo'), 'goal', goalPrompt + (settings.ceoAsk === false ? '' : askRule), rush()))
    const qs = [].concat(out.questions || []).map(q => typeof q === 'string' ? { q } : q).filter(q => q && q.q).slice(0, 3)
    if (!out.goal && qs.length) {
      phase(p, 'asking', 'CEO 在向老板提问')
      setAgent('ceo', { status: 'idle', activity: T('act.asking', { n: qs.length }) })
      const answers = await askUser(p, qs.map(q => ({ q: String(q.q), options: [].concat(q.options || []).map(String).slice(0, 5) })))
      p.qa = qs.map((q, i) => ({ q: String(q.q), a: String(answers?.[i] || '').trim() })); saveProject(p)
      emit('say', { id: 'ceo', text: answers ? T('say.thanks') : T('say.assume'), ms: 2500 })
      setAgent('ceo', { status: 'busy', activity: T('act.makingGoal') })
      phase(p, 'goal', 'CEO 制定目标')
      out = parseJson(await runAgent(agent('ceo'), 'goal2', EN() ? `${harness('ceo', vars)}

## Now: set the goal
The boss's task:
${taskText()}

Define this project's goal, deliverable scope and acceptance criteria. Do not ask again.
Output strict JSON:
${goalJson}` : `${harness('ceo', vars)}

## 现在：制定目标
老板的任务：
${taskText()}

请明确本项目的目标、交付范围和验收标准。不要再提问。
输出严格 JSON：
${goalJson}`, rush()))
    }
    goal = out
    if (!goal.goal) throw new Error('empty goal')
  } catch (err) {
    log(`CEO goal fallback: ${err}`)
    goal = EN()
      ? { goal: `${p.title}: ${p.brief || ''}`, scope: [], acceptance: ['All deliverable files are present and usable as is'], toHr: 'Please hire and split the work for this task.' }
      : { goal: `${p.title}：${p.brief || ''}`, scope: [], acceptance: ['成果文件齐全、可直接使用'], toHr: '按任务招人分工吧。' }
  }
  goal.scope = [].concat(goal.scope || []).map(String); goal.acceptance = [].concat(goal.acceptance || []).map(String)
  p.goal = goal; saveProject(p)
  const goalText = EN()
    ? `Goal: ${goal.goal}\nScope:\n${goal.scope.map(s => `- ${s}`).join('\n') || '- (not listed)'}\nAcceptance criteria:\n${goal.acceptance.map(s => `- ${s}`).join('\n')}`
    : `目标：${goal.goal}\n交付范围：\n${goal.scope.map(s => `- ${s}`).join('\n') || '- （未列出）'}\n验收标准：\n${goal.acceptance.map(s => `- ${s}`).join('\n')}`

  // CEO walks to HR with the brief
  phase(p, 'hiring', 'CEO 把目标交给 HR')
  setAgent('ceo', { status: 'busy', activity: T('act.givenToHr') })
  emit('summon-hr', { project: p.id, title: p.title, text: goal.toHr })
  await pace(4500)
  setAgent('ceo', { status: 'idle', activity: T('act.waitAccept') })

  // 2. HR hires + divides work + schedules
  setAgent('hr', { status: 'busy', activity: T('act.hrPlanning') })
  emit('hr-hiring', {})
  const live = liveExt()
  const lang = EN() ? 'en' : 'zh'
  const pk = v => extensions.pick(v, lang)
  const expertNote = () => live.experts.length ? (EN()
    ? `## Expert library (prefer these when a role fits; set "expert" to the id, and you may still pick the name)\n${live.experts.map(e => `- ${e.id}: ${pk(e.title)}${pk(e.skills) ? ` (${pk(e.skills)})` : ''}${e.mcp.length ? ` [tools: ${e.mcp.join(', ')}]` : ''}${e.skillset?.length ? ` [skills: ${e.skillset.join(', ')}]` : ''}`).join('\n')}\n\n`
    : `## 专家库（岗位合适时优先招专家：把 "expert" 设为专家 id，名字仍可自己起）\n${live.experts.map(e => `- ${e.id}：${pk(e.title)}${pk(e.skills) ? `（${pk(e.skills)}）` : ''}${e.mcp.length ? ` [工具：${e.mcp.join('、')}]` : ''}${e.skillset?.length ? ` [技能：${e.skillset.join('、')}]` : ''}`).join('\n')}\n\n`) : ''
  const hrPrompt = EN() ? `${harness('hr', { minTeam: settings.minTeam, maxTeam: settings.maxTeam })}

## This task
${taskText()}

## The CEO's goal
${goalText}

${expertNote()}Hire, assign and schedule the work. Output format (strict JSON):
{"team":[{"name":"English first name","title":"job title","skills":"core skills","task":"detailed sub-task: what to do, what to deliver, quality bar","deliverable":"main deliverable file name, e.g. 02-market-research.md","expert":"expert id from the library, or empty","after":["names of colleagues who must finish first, or []"]}],"note":"one sentence on the hiring and scheduling plan","kickoff":"one opening line for the kickoff meeting"}` : `${harness('hr', { minTeam: settings.minTeam, maxTeam: settings.maxTeam })}

## 本次任务
${taskText()}

## CEO 定的目标
${goalText}

${expertNote()}请招人并分工排期。输出格式（严格 JSON）：
{"team":[{"name":"员工中文名","title":"职位","skills":"核心技能","task":"详细子任务：做什么、交付什么、质量标准","deliverable":"主交付文件名，如 02-市场调研.md","expert":"专家库里的专家 id，没有则留空","after":["必须等哪些同事完成（填名字），没有则 []"]}],"note":"一句话说明招聘与排期思路","kickoff":"一句开工会开场白"}`
  let team, hrPlan = {}
  const hrStart = Date.now()
  try {
    hrPlan = parseJson(await runAgent(agent('hr'), 'hire', hrPrompt, rush()))
    team = (hrPlan.team || []).slice(0, settings.maxTeam)
    if (!team.length) throw new Error('empty team')
    if (hrPlan.note) emit('say', { id: 'hr', text: hrPlan.note, ms: 5000 })
  } catch (err) {
    log(`HR fallback: ${err}`)
    team = EN() ? [
      { name: 'Ivy', title: 'Researcher', skills: 'research, analysis', task: `Research and analyse "${p.title}"`, deliverable: '01-research.md', after: [] },
      { name: 'Max', title: 'Producer', skills: 'execution, writing', task: `Produce the main output for "${p.title}" based on the research`, deliverable: '02-main-output.md', after: ['Ivy'] },
    ] : [
      { name: '小研', title: '研究员', skills: '调研、分析', task: `围绕「${p.title}」做调研与分析`, deliverable: '01-调研分析.md', after: [] },
      { name: '小创', title: '执行专员', skills: '方案落地、写作', task: `基于调研产出「${p.title}」的主要成果`, deliverable: '02-主要成果.md', after: ['小研'] },
    ]
  }
  await sleep(Math.max(0, (state.rush ? 800 : 2500) - (Date.now() - hrStart)))
  const hires = team.map((m, i) => {
    const ex = m.expert ? live.experts.find(e => e.id === String(m.expert).trim()) : null
    return {
    id: `emp-${crypto.randomBytes(3).toString('hex')}`, role: 'employee', name: String(m.name || (ex && pk(ex.name)) || T('emp.fallback', { n: i + 1 })).slice(0, 12),
    title: String(m.title || (ex && pk(ex.title)) || T('emp.titleFallback')).slice(0, 24), skills: String(m.skills || (ex && pk(ex.skills)) || ''), duty: String(m.task || m.duty || ''), task: String(m.task || m.duty || ''),
    expert: ex ? { id: ex.id, title: pk(ex.title), icon: ex.icon || '', source: ex.source } : null,
    deliverable: String(m.deliverable || `${String(i + 1).padStart(2, '0')}-${slug(m.title || 'result')}.md`).replace(/[\\/]/g, '-'),
    model: null, status: 'idle', activity: T('act.newcomer'), look: { hair: Math.floor(Math.random() * 6), shirt: Math.floor(Math.random() * 10), skin: Math.floor(Math.random() * 3) },
    project: p.id, _after: [].concat(m.after || []).map(String),
  } })
  // resolve "after" names → ids; drop unknown names, self-refs and cycles
  const byName = new Map(hires.map(h => [h.name, h.id]))
  const origName = new Map(team.map((m, i) => [String(m.name || ''), hires[i].id]))
  for (const h of hires) h.deps = [...new Set(h._after.map(n => byName.get(n) || origName.get(n) || (hires.find(x => x.id === n)?.id)).filter(id => id && id !== h.id))]
  const cyclic = () => { const seen = new Set(), stack = new Set(); const visit = id => { if (stack.has(id)) return true; if (seen.has(id)) return false; seen.add(id); stack.add(id); const r = hires.find(x => x.id === id).deps.some(visit); stack.delete(id); return r }; return hires.some(h => visit(h.id)) }
  if (cyclic()) { log('HR schedule has a cycle; ignoring deps'); for (const h of hires) h.deps = [] }
  for (const h of hires) delete h._after
  state.agents.push(...hires); saveState()
  const nameOf = id => hires.find(h => h.id === id)?.name || id
  p.team = hires.map(({ id, name, title, skills, duty, deliverable, expert }) => ({ id, name, title, skills, duty, deliverable, expert: expert?.id || undefined }))
  p.assignments = hires.map(h => ({ id: h.id, name: h.name, title: h.title, task: h.task, deliverable: h.deliverable, after: h.deps.map(nameOf), expert: h.expert?.id || undefined }))
  phase(p, 'hiring', `HR 招到 ${hires.length} 人`)
  setAgent('hr', { status: 'busy', activity: T('act.hrHired', { n: hires.length }) })
  emit('hired', { agents: hires.map(publicAgent) })
  await pace(5500)

  // 3. Kick-off meeting, run by HR
  phase(p, 'meeting', 'HR 主持开工会')
  emit('meeting-start', { ids: ['ceo', 'hr', ...hires.map(h => h.id)], title: p.title, host: 'hr' })
  const meetStart = Date.now()
  await pace(2500)
  emit('say', { id: 'ceo', text: `🎯 ${goal.goal.slice(0, 70)}`, ms: 4000 })
  await pace(2500)
  emit('say', { id: 'hr', text: hrPlan.kickoff || T('say.kickoffFallback'), ms: 3500 })
  for (const h of hires) {
    await pace(1500)
    const wait = h.deps.length ? T('meet.waitDeps', { names: jn(h.deps.map(nameOf)) }) : T('meet.startNow')
    emit('say', { id: 'hr', text: `@${h.name}：${h.task.slice(0, 60)}${h.task.length > 60 ? '…' : ''}${wait}`, ms: 3800 })
    emit('say', { id: h.id, text: h.deps.length ? T('say.waitUpstream') : T('say.gotIt'), ms: 1800, delay: 1500 })
  }
  saveProject(p)
  await sleep(Math.max(0, (state.rush ? 2500 : 7000) - (Date.now() - meetStart)))
  emit('say', { id: 'hr', text: T('say.meetingEnd'), ms: 2500 })
  await pace(1800)
  emit('meeting-end', { ids: ['ceo', 'hr', ...hires.map(h => h.id)] })
  setAgent('hr', { status: 'idle', activity: T('act.hrWaiting') })
  for (const h of hires) if (h.deps.length) setAgent(h.id, { status: 'idle', activity: T('act.waitDeps', { names: jn(h.deps.map(nameOf)) }) })
  await pace(3500)

  // 4. Work in dependency order; HR reviews every report, may send it back
  phase(p, 'working', '员工按排期开工')
  const MAX_REWORK = rush() ? 1 : 2
  const approved = new Map() // id -> final report record
  const parseStatus = text => {
    const first = (text || '').trim().split('\n')[0]
    if (/受阻|blocked/i.test(first)) return 'blocked'
    if (/部分完成|partial/i.test(first)) return 'partial'
    if (/完成|done/i.test(first)) return 'done'
    return 'done'
  }
  const handoff = h => h.deps.length ? (EN()
    ? `\n\n## Upstream handover (passed HR review)\n${h.deps.map(id => { const r = approved.get(id); return `### ${r.name} (${r.title}) -> ${p.rel}/${r.deliverable}\n${r.report}` }).join('\n\n')}\n\nRead the upstream output files first and stay consistent with them.`
    : `\n\n## 上游交接（已通过 HR 审核）\n${h.deps.map(id => { const r = approved.get(id); return `### ${r.name}（${r.title}）→ ${p.rel}/${r.deliverable}\n${r.report}` }).join('\n\n')}\n\n请先阅读上游成果文件，与之保持一致。`) : ''
  const reviewPrompt = (h, rec, round) => EN() ? `${harness('hr', { minTeam: settings.minTeam, maxTeam: settings.maxTeam })}

## Now: review the report
Project goal:
${goalText}

Employee: ${h.name} (${h.title})
Assigned sub-task: ${h.task}
Main deliverable: ${p.rel}/${h.deliverable}
Submission ${round + 1}, self-reported status: ${rec.status}
Employee report:
${rec.report}

Check the outputs in the project folder (read only, do not edit files) and decide whether it passes. ${round >= MAX_REWORK ? 'This is the last chance: unless it is completely unusable, pass it and put the open issues in your comment.' : ''}
Output strict JSON: {"pass":true,"comment":"one-sentence review (on a fail, say exactly what to change)"}` : `${harness('hr', { minTeam: settings.minTeam, maxTeam: settings.maxTeam })}

## 现在：审核汇报
项目目标：
${goalText}

员工：${h.name}（${h.title}）
分配的子任务：${h.task}
主交付文件：${p.rel}/${h.deliverable}
第 ${round + 1} 次提交，自报状态：${rec.status}
员工汇报：
${rec.report}

请检查项目目录中的成果（只读，不要改文件），判断是否通过。${round >= MAX_REWORK ? '这已经是最后一次机会，除非完全不可用，否则请判定通过并把遗留问题写进意见。' : ''}
输出严格 JSON：{"pass":true,"comment":"一句话审核意见（不通过时写清要改什么）"}`

  // Expert hires get their expert brief; everyone learns which MCP tools are mounted.
  const expertBlock = h => {
    const ex = h.expert && live.experts.find(e => e.id === h.expert.id)
    let out = ''
    if (ex) out += EN() ? `\n\n## Your expert brief (${pk(ex.title)})\n${pk(ex.prompt)}` : `\n\n## 你的专家设定（${pk(ex.title)}）\n${pk(ex.prompt)}`
    if (live.mcpServers.length) {
      const mine = ex?.mcp?.length ? live.mcpServers.filter(s => ex.mcp.includes(s.name)) : []
      const list = live.mcpServers.map(s => `- ${s.name}${s.description ? `: ${s.description}` : ''} (mcp__${s.name}__*)`).join('\n')
      out += EN() ? `\n\n## MCP tools available\n${list}${mine.length ? `\nYour expert role relies on: ${mine.map(s => s.name).join(', ')}. Use them where they help.` : ''}`
        : `\n\n## 可用的 MCP 工具\n${list}${mine.length ? `\n你的专家岗位重点使用：${mine.map(s => s.name).join('、')}，需要时直接调用。` : ''}`
    }
    const mySkills = ex?.skillset?.length ? live.skills.filter(s => ex.skillset.includes(s.name)) : []
    if (mySkills.length) {
      const list = mySkills.map(s => `- ${s.name}${s.description ? `: ${s.description}` : ''}`).join('\n')
      out += EN() ? `\n\n## Skills for your role\nLoad these with the skill tool (or read .agents/skills/<name>/SKILL.md) before the matching step and follow them:\n${list}`
        : `\n\n## 你的岗位技能\n在对应步骤前用 skill 工具加载（或读取 .agents/skills/<名字>/SKILL.md）并照做：\n${list}`
    }
    return out
  }
  const work = async h => {
    let feedback = ''
    for (let round = 0; ; round++) {
      setAgent(h.id, { status: 'busy', activity: round ? T('act.rework', { n: round }) : T('act.startWork') })
      emit('work-start', { id: h.id })
      const prompt = EN() ? `${harness('employee', { ...vars, name: h.name, title: h.title, skills: h.skills, deliverable: h.deliverable })}${expertBlock(h)}

## Project
${taskText()}

## Project goal (CEO)
${goalText}

## Team assignments (for reference; only do your own part)
${p.assignments.map(x => `- ${x.name} (${x.title}): ${x.task} -> ${x.deliverable}${x.after.length ? ` (after ${x.after.join(', ')})` : ''}`).join('\n')}

## Your sub-task (from HR)
${h.task}${handoff(h)}${feedback ? `\n\n## HR sent it back (rework accordingly; edit the existing files)\n${feedback}` : ''}

Start working now and write your output to ${p.rel}/${h.deliverable}.` : `${harness('employee', { ...vars, name: h.name, title: h.title, skills: h.skills, deliverable: h.deliverable })}${expertBlock(h)}

## 项目
${taskText()}

## 项目目标（CEO）
${goalText}

## 团队分工（供参考，只做你自己的部分）
${p.assignments.map(x => `- ${x.name}（${x.title}）：${x.task} → ${x.deliverable}${x.after.length ? `（在 ${x.after.join('、')} 之后）` : ''}`).join('\n')}

## 你的子任务（HR 分配）
${h.task}${handoff(h)}${feedback ? `\n\n## HR 退回意见（请据此返工，修改已有文件即可）\n${feedback}` : ''}

请直接开始工作，把成果写入 ${p.rel}/${h.deliverable}。`
      let report, ok = true
      try { report = await runAgent(h, round ? `rework${round}` : 'work', prompt, rush()) } catch (err) { ok = false; report = L(`状态：受阻\n出错了：`, `Status: blocked\nError: `) + String(err.message || err).slice(0, 300) }
      report = (report || L('状态：完成\n已完成。', 'Status: done\nDone.')).trim()
      const rec = { id: h.id, name: h.name, title: h.title, ok, status: ok ? parseStatus(report) : 'blocked', report, deliverable: h.deliverable, round, at: Date.now() }

      // walk to HR and report
      setAgent(h.id, { status: 'reporting', activity: T('act.goReport') })
      emit('report', { id: h.id, to: 'hr', text: report.replace(/^(状态：\S+|Status:\s*\S+)\s*/i, ''), status: rec.status, ok })
      setAgent('hr', { status: 'busy', activity: T('act.hrReviewing', { name: h.name }) })
      let verdict
      try {
        verdict = parseJson(await runAgent(agent('hr'), `review-${h.name}-${round}`, reviewPrompt(h, rec, round), rush()))
      } catch (err) { log(`HR review fallback: ${err}`); verdict = { pass: true, comment: L('（审核失败，默认通过）', '(review failed, passed by default)') } }
      const pass = verdict.pass !== false || round >= MAX_REWORK
      rec.review = { pass, comment: String(verdict.comment || '') }
      p.reports.push(rec); saveProject(p)
      emit('review', { id: h.id, by: 'hr', pass, comment: rec.review.comment, round })
      setAgent('hr', { status: 'idle', activity: pass ? T('act.reviewPass', { name: h.name }) : T('act.reviewFail', { name: h.name }) })
      await pace(7000)
      if (pass) {
        approved.set(h.id, rec)
        setAgent(h.id, { status: 'idle', activity: rec.status === 'done' ? T('act.reviewPass', { name: h.name }) : T('act.reviewPassWarn', { status: rec.status === 'blocked' ? T('st.blocked') : T('st.partial') }) })
        phase(p, 'working', `已通过 ${approved.size}/${hires.length}`)
        return
      }
      feedback = rec.review.comment
    }
  }
  const limit = () => rush() ? hires.length : Math.max(1, settings.normalConcurrency)
  await new Promise(resolve => {
    const running = new Set(), started = new Set()
    const next = () => {
      for (const h of hires) {
        if (running.size >= limit()) break
        if (started.has(h.id) || !h.deps.every(d => approved.has(d))) continue
        started.add(h.id)
        const job = work(h).catch(err => {
          log(`work ${h.id} crashed: ${err.stack || err}`)
          approved.set(h.id, { id: h.id, name: h.name, title: h.title, ok: false, status: 'blocked', report: L('流程异常', 'Workflow error'), deliverable: h.deliverable })
        }).finally(() => { running.delete(job); next() })
        running.add(job)
      }
      if (!running.size && started.size === hires.length) resolve()
    }
    next()
  })

  // 5. CEO acceptance
  phase(p, 'integrating', 'CEO 验收成果')
  setAgent('hr', { status: 'busy', activity: T('act.submitting') })
  emit('handover', { from: 'hr', to: 'ceo' })
  await pace(5000)
  setAgent('hr', { status: 'idle', activity: T('act.submitted') })
  setAgent('ceo', { status: 'busy', activity: T('act.accepting') })
  emit('work-start', { id: 'ceo' })
  const finals = hires.map(h => approved.get(h.id)).filter(Boolean)
  const tag = s => (EN() ? { done: 'done', partial: 'partial', blocked: 'blocked' } : { done: '完成', partial: '部分完成', blocked: '受阻' })[s] || s
  const finalPrompt = EN() ? `${harness('ceo', vars)}

## Now: final acceptance
The boss's task:
${taskText()}

Your goal:
${goalText}

Employee deliveries after HR review:
${finals.map(r => `### ${r.name} (${r.title}) - ${tag(r.status)}${r.review ? ` - HR comment: ${r.review.comment}` : ''}\nDeliverable: ${p.rel}/${r.deliverable}\n${r.report}`).join('\n\n')}

Please:
1. Check the outputs in ${p.rel} against each acceptance criterion; only make small fixes (transitions, typos, formatting), do not redo the employees' work.
2. Write ${p.rel}/00-project-summary.md: goal, team and roles, key points of each output with file links, acceptance verdict (mark each criterion met / not met), open issues and next steps.
3. Your last reply reports to the boss in 3 sentences; the first sentence is the acceptance verdict.` : `${harness('ceo', vars)}

## 现在：最终验收
老板的任务：
${taskText()}

你定的目标：
${goalText}

HR 审核后的员工交付：
${finals.map(r => `### ${r.name}（${r.title}）· ${tag(r.status)}${r.review ? ` · HR 意见：${r.review.comment}` : ''}\n交付文件：${p.rel}/${r.deliverable}\n${r.report}`).join('\n\n')}

请：
1. 按验收标准逐条检查项目目录 ${p.rel} 里的成果，只做小修（衔接、错字、格式），不要重做员工的工作。
2. 写出 ${p.rel}/00-项目总结.md：项目目标、团队与分工、每份成果的要点与文件链接、验收结论（逐条标注达标/未达标）、遗留问题与后续建议。
3. 最后一条回复用 3 句话向老板汇报，第一句写验收结论。`
  let summary
  try { summary = await runAgent(agent('ceo'), 'final', finalPrompt, rush()) } catch (err) { summary = L('验收失败：', 'Acceptance failed: ') + (err.message || err) }
  p.summary = (summary || '').trim()
  emit('say', { id: 'ceo', text: p.summary.slice(0, 80) || T('say.done'), ms: 6000 })
  setAgent('ceo', { status: 'busy', activity: T('act.archiving') })
  emit('archive', { id: 'ceo', project: p.id })
  await pace(6000)
  p.files = listFiles(p.dir).length
  p.finishedAt = Date.now()
  phase(p, 'done', '已验收归档')
  setAgent('ceo', { status: 'idle', activity: T('act.archived', { title: p.title }) })
  emit('celebrate', {})
}

// ---------- CEO → 老板 提问 ----------
let pendingAsk = null
function askUser(p, questions) {
  return new Promise(resolve => {
    pendingAsk = { project: p.id, title: p.title, questions, resolve }
    emit('ask', { project: p.id, title: p.title, questions })
  })
}

function setRush(on) {
  state.rush = !!on; saveState()
  emit('rush', { on: state.rush })
}

// ---------- project chat: talk to the CEO about a finished project ----------
const chatFile = p => path.join(p.dir, '.office', 'chat.json')
const readChat = p => { const v = readJson(chatFile(p), []); return Array.isArray(v) ? v : [] }
/** projectId -> { sid, rt }. One CEO session per project keeps its context across turns. */
const chatSessions = new Map()
const chatBusy = new Set()
const fileRec = f => ({ rel: f.rel, path: f.path, size: f.size, mtime: f.mtime })

/** The project's main outputs: summary first, then each employee's deliverable, then everything else. */
function productsOf(p) {
  const all = listFiles(p.dir).filter(f => !/^(附件|attachments)\//.test(f.rel))
  const base = r => r.split('/').pop()
  const used = new Set()
  const summary = all.find(f => /(^|\/)00-.*(总结|summary)/i.test(f.rel)) || all.find(f => /总结|project-summary/i.test(f.rel)) || null
  if (summary) used.add(summary.rel)
  const main = []
  for (const d of (p.assignments || []).map(a => a.deliverable).filter(Boolean)) {
    const f = all.find(x => !used.has(x.rel) && (x.rel === d || base(x.rel) === d))
    if (f) { used.add(f.rel); main.push(f) }
  }
  const others = all.filter(f => !used.has(f.rel)).sort((a, b) => a.rel.localeCompare(b.rel))
  return { summary: summary && fileRec(summary), main: main.map(fileRec), others: others.map(fileRec) }
}

function chatContextPrompt(p, history) {
  const prods = productsOf(p)
  const names = [prods.summary, ...prods.main, ...prods.others].filter(Boolean).slice(0, 60)
  if (EN()) {
    const goalEn = p.goal ? `${p.goal.goal || ''}${p.goal.acceptance?.length ? `\nAcceptance criteria: ${p.goal.acceptance.join('; ')}` : ''}` : '(none)'
    const talkEn = history.slice(-16).map(m => `${m.role === 'user' ? 'Boss' : 'You (CEO)'}: ${String(m.text).slice(0, 800)}`).join('\n\n')
    return `${harness('ceo', { projectDir: p.dir, projectRel: p.rel })}

## Now: project chat
The project "${p.title}" has ${p.status === 'done' ? 'been accepted and archived' : 'ended (not fully successful)'}, and the boss wants to keep talking about it. No JSON in this step: answer in natural language, in the language the boss uses, concise and concrete.
- Project folder: ${p.dir}
- The boss's original task: ${p.brief || '(no further description)'}
- Project goal: ${goalEn}
- Your last acceptance report: ${(p.summary || '(none)').slice(0, 3000)}
- Project files (relative to the project folder):
${names.map(f => `  - ${f.rel}`).join('\n') || '  (none yet)'}
${talkEn ? `\nEarlier conversation:\n${talkEn}\n` : ''}
Rules:
1. When the boss asks about content, wants an explanation or comparison, read the files first; do not answer from memory.
2. When the boss asks to change, extend or redo an output, edit the files in the project folder directly (or create new ones), then say which files you changed.
3. When you mention a file, use its path relative to the project folder (e.g. 02-main-output.md) so the boss can click it.
4. Do not modify the originals in the attachments folder.`
  }
  const goal = p.goal ? `${p.goal.goal || ''}${p.goal.acceptance?.length ? `\n验收标准：${p.goal.acceptance.join('；')}` : ''}` : '（无）'
  const talk = history.slice(-16).map(m => `${m.role === 'user' ? '老板' : '你（CEO）'}：${String(m.text).slice(0, 800)}`).join('\n\n')
  return `${harness('ceo', { projectDir: p.dir, projectRel: p.rel })}

## 现在：项目对话
项目「${p.title}」已经${p.status === 'done' ? '验收归档' : '结束（未完全成功）'}，老板想接着和你聊这个项目。这一步不需要输出 JSON，用自然语言直接回答；用老板使用的语言回复，简洁具体。
- 项目目录：${p.dir}
- 老板最初的任务：${p.brief || '（无更多描述）'}
- 项目目标：${goal}
- 你上次的验收汇报：${(p.summary || '（无）').slice(0, 3000)}
- 项目文件（相对项目目录）：
${names.map(f => `  - ${f.rel}`).join('\n') || '  （暂无）'}
${talk ? `\n之前的对话：\n${talk}\n` : ''}
规则：
1. 老板问成果内容、要解读或对比时，先读对应文件再回答，不要凭印象。
2. 老板要求修改、补充或重做某个成果时，直接改项目目录里的文件（或新建文件），改完说明改了哪些文件。
3. 回复里提到文件时，用项目目录内的相对路径（例如 02-主要成果.md），方便老板点击查看。
4. 不要修改「附件」文件夹里的原件。`
}

async function chatSend(id, input) {
  const text = String(input || '').trim()
  if (!text) throw new Error(T('err.chatEmpty'))
  const p = listProjects().find(x => x.id === id)
  if (!p) throw new Error(T('err.chatNoProject'))
  if (!['done', 'failed'].includes(p.status)) throw new Error(T('err.chatNotReady'))
  if (!settings.models?.length) throw new Error(NO_MODEL_MSG())
  if (chatBusy.has(id)) throw new Error(T('err.chatBusy'))
  chatBusy.add(id)
  const ceo = agent('ceo')
  const solo = !current // do not touch the CEO's office status while a project is running
  try {
    const history = readChat(p)
    history.push({ role: 'user', text, at: Date.now() })
    writeJson(chatFile(p), history)
    const rt = pool.get(modelOf(ceo), false, effortOf(ceo))
    let sess = chatSessions.get(id)
    const fresh = !sess || sess.rt !== rt
    if (fresh) { sess = { sid: `ceo-chat-${crypto.randomBytes(5).toString('hex')}`, rt }; chatSessions.set(id, sess) }
    const prompt = fresh ? `${chatContextPrompt(p, history.slice(0, -1))}\n\n${L('## 老板说', '## The boss says')}\n${text}` : text
    const sig = list => new Map(list.map(f => [f.rel, `${f.size}:${Math.round(f.mtime)}`]))
    const before = sig(listFiles(p.dir))
    if (solo) setAgent('ceo', { status: 'busy', activity: T('act.chatting') })
    emit('chat-status', { project: id, text: T('chat.thinking', { name: ceo?.name || 'CEO' }) })
    const out = await rt.run(sess.sid, prompt, ev => {
      if (ev.type === 'tool/call') emit('chat-status', { project: id, text: toolLabel(ev.data.name, ev.data.arguments) })
      else if (ev.type === 'assistant/attempt' || ev.type === 'step/start') emit('chat-status', { project: id, text: T('chat.thinking', { name: ceo?.name || 'CEO' }) })
    })
    const reply = (out || '').trim() || T('chat.noReply')
    const after = listFiles(p.dir)
    const files = []
    for (const f of after) {
      const changed = before.get(f.rel) !== `${f.size}:${Math.round(f.mtime)}`
      const b = f.rel.split('/').pop()
      const mentioned = reply.includes(f.rel) || (b.length >= 5 && reply.includes(b))
      if (changed || mentioned) files.push({ ...fileRec(f), changed })
    }
    files.sort((a, b) => (b.changed - a.changed) || a.rel.localeCompare(b.rel))
    const message = { role: 'ceo', text: reply, at: Date.now(), files: files.slice(0, 12) }
    const latest = readChat(p); latest.push(message); writeJson(chatFile(p), latest)
    if (solo) emit('say', { id: 'ceo', text: reply.slice(0, 60), ms: 4000 })
    return { message, products: productsOf(p) }
  } catch (err) {
    chatSessions.delete(id) // next turn rebuilds the context from the saved transcript
    log(`chat ${id} failed: ${err.stack || err}`)
    throw err
  } finally {
    chatBusy.delete(id)
    emit('chat-status', { project: id, text: '' })
    if (solo && !current) setAgent('ceo', { status: 'idle', activity: T('act.chatDone') })
  }
}

/** Resolve a path and make sure it stays inside the projects folder. */
function inProjects(file) {
  const root = path.resolve(projectsDir())
  const full = path.resolve(String(file))
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('outside projects')
  return full
}

// ---------- IPC ----------
ipcMain.handle('office:chatHistory', (_e, id) => {
  const p = listProjects().find(x => x.id === id); if (!p) return null
  let messages = readChat(p)
  if (!messages.length && p.summary) messages = [{ role: 'ceo', text: p.summary, at: p.finishedAt || p.createdAt, seed: true }]
  return { id: p.id, title: p.title, status: p.status, messages, products: productsOf(p), busy: chatBusy.has(id) }
})
ipcMain.handle('office:chatSend', (_e, id, text) => chatSend(id, text))
ipcMain.handle('office:readImage', (_e, file) => {
  const full = inProjects(file)
  const st = fs.statSync(full)
  if (st.size > 12_000_000) return { tooLarge: true }
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }[path.extname(full).slice(1).toLowerCase()]
  if (!mime) return { binary: true }
  return { dataUrl: `data:${mime};base64,${fs.readFileSync(full).toString('base64')}` }
})
ipcMain.handle('office:init', () => ({
  settings, agents: state.agents.map(publicAgent), rush: state.rush,
  projects: listProjects(), current: current?.id || null, queue: queue.map(q => q.id),
  ask: pendingAsk && { project: pendingAsk.project, title: pendingAsk.title, questions: pendingAsk.questions },
}))
ipcMain.handle('office:answer', (_e, answers) => {
  const a = pendingAsk; if (!a) return false
  pendingAsk = null; emit('ask-done', { project: a.project, skipped: !answers })
  a.resolve(answers || null); return true
})
ipcMain.handle('office:submit', (_e, input) => submitTask(input))
ipcMain.handle('office:rush', (_e, on) => { setRush(on); return state.rush })
ipcMain.handle('office:setModel', (_e, id, key) => {
  const a = agent(id); if (!a) return null
  a.model = key || null; saveState()
  setAgent(id, { activity: T('act.modelChange', { model: settings.models.find(m => m.key === modelOf(a))?.name }) })
  return publicAgent(a)
})
ipcMain.handle('office:setDefaultEffort', (_e, effort) => {
  settings.defaultEffort = effort; writeJson(SETTINGS_FILE, settings)
  for (const a of state.agents) send('office:agent', publicAgent(a))
  return settings
})
ipcMain.handle('office:setEffort', (_e, id, effort) => {
  const a = agent(id); if (!a) return null
  a.effort = effort || null; saveState()
  const effText = lvl => T('effort.' + lvl)
  setAgent(id, { activity: a.effort ? T('act.effort', { text: effText(effortOf(a)) || effortOf(a) }) : T('act.effortFollow', { text: effText(effortOf(a)) || '—' }) })
  return publicAgent(a)
})
// ---- providers (DSH Models-page semantics) ----
const providerRefs = () => Object.entries(settings.providers || {}).map(([route, p]) => p.apiKeyEnv || prov.deriveKeyRef(route))
/** A key typed by the user wins; otherwise reuse the secret an agent scan located. */
const keyFor = (req = {}) => (req.apiKey || '').trim() || (req.keyFrom ? agents.secretOf(req.keyFrom) : null) || null
ipcMain.handle('office:providerInfo', () => ({
  protocols: prov.PROTOCOLS, levels: prov.THINKING_LEVELS,
  keys: prov.keyStatus(settings.dshRoot, providerRefs()),
  dsh: (() => { try { return prov.dshProviders(settings.dshRoot) } catch (e) { log(`dshProviders: ${e.message}`); return [] } })(),
}))
/** Scan every agent runtime on this machine for API configuration (keys stay in main). */
ipcMain.handle('office:scanAgents', () => {
  const started = Date.now()
  const result = agents.scan()
  result.configured = Object.entries(settings.providers || {}).map(([route, p]) => ({ route, apiKeyEnv: p.apiKeyEnv, baseURL: p.baseURL }))
  // A record is importable when its key is embedded in the scan OR its env ref
  // already exists in ~/.dsh/.credentials.yaml (e.g. a non-office DSH profile).
  const refs = new Set(providerRefs())
  for (const r of result.records) if (r.keyEnv) refs.add(r.keyEnv)
  result.hasKey = {}
  for (const ref of refs) { try { result.hasKey[ref] = !!prov.storedKey(settings.dshRoot, ref) } catch { result.hasKey[ref] = false } }
  result.dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  log(`scanAgents: ${result.records.length} records from ${result.sources.length} sources in ${Date.now() - started}ms`)
  return result
})
/** Codex CLI as an employee engine: detect the install, list the account's models, add them as fruits. */
const FRUIT_KEYS = ['orange', 'grape', 'apple', 'cherry', 'peach', 'lemon', 'strawberry', 'watermelon', 'banana', 'pear']
ipcMain.handle('office:codexScan', async () => {
  const r = await codexCli.scanCodexCli({ codexPath: settings.codexPath, node: pool.node })
  r.added = settings.models.filter(m => m.engine === 'codex').map(m => m.model)
  return r
})
/** One call sets the whole Codex matrix: which models are on, each model's default depth, and fast mode. */
ipcMain.handle('office:codexApply', async (_e, req = {}) => {
  const scan = await codexCli.scanCodexCli({ codexPath: settings.codexPath, node: pool.node })
  if (!scan.found) throw new Error(T('err.codexMissing'))
  const want = new Set([].concat(req.enabled || []).map(String))
  const defaults = req.defaults || {}
  const before = settings.models.filter(m => m.engine === 'codex').map(m => m.model).sort().join('|')
  const picked = scan.models.filter(m => want.has(m.slug))
  const after = picked.map(m => m.slug).sort().join('|')
  const setChanged = before !== after
  if (setChanged && current) throw new Error(T('err.projectBusy'))
  const taken = new Set(settings.models.map(m => m.fruit))
  const nextFruit = () => { const f = FRUIT_KEYS.find(k => !taken.has(k)) || FRUIT_KEYS[taken.size % FRUIT_KEYS.length]; taken.add(f); return f }
  const keep = settings.models.filter(m => m.engine !== 'codex')
  const keys = new Set(keep.map(m => m.key))
  const added = picked.map(m => {
    const old = settings.models.find(x => x.engine === 'codex' && x.model === m.slug)
    let key = old?.key || `codex-${m.slug}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    while (keys.has(key)) key += '-2'; keys.add(key)
    const want = defaults[m.slug]
    return parameters.validateModel({
      key, name: m.name, provider: 'codex', engine: 'codex', model: m.slug,
      contextWindow: m.contextWindow || 272000, vision: m.vision, fastModel: '',
      fruit: old?.fruit || nextFruit(), efforts: m.efforts.length ? m.efforts : ['low', 'medium', 'high'],
      defaultEffort: m.efforts.includes(want) ? want : (old?.defaultEffort && m.efforts.includes(old.defaultEffort) ? old.defaultEffort : m.defaultEffort),
    })
  })
  const order = new Map(settings.models.map((m, i) => [m.key, i]))
  added.sort((x, y) => (order.get(x.key) ?? 1e9) - (order.get(y.key) ?? 1e9))
  const next = parameters.validateSettings({ ...settings, models: [...keep, ...added], codexFast: !!req.fast })
  if (!next.models.some(m => m.key === next.defaultModel)) next.defaultModel = next.models[0]?.key || ''
  writeJson(SETTINGS_FILE, next); settings = next
  if (setChanged) {
    await pool.configure(settings)
    for (const a of state.agents) { if (a.model && !settings.models.some(m => m.key === a.model)) a.model = null }
    saveState()
  } else pool.settings = settings
  for (const a of state.agents) send('office:agent', publicAgent(a))
  return settings
})
ipcMain.handle('office:testModel', async (_e, req) => {
  const ref = req.apiKeyEnv || (req.route && prov.ROUTE_PATTERN.test(req.route) ? prov.deriveKeyRef(req.route) : '')
  const apiKey = keyFor(req) || (ref ? prov.storedKey(settings.dshRoot, ref) : undefined)
  const { net } = require('electron')
  const configuredModel = settings.models.find(m => m.provider === req.route && m.model === req.model)
  return prov.testModel((url, init) => net.fetch(url, init), { route: req.route, baseURL: req.baseURL, api: req.api, apiKey, model: req.model, dshRoot: settings.dshRoot, configuredModel })
})
ipcMain.handle('office:rename', (_e, id, name) => {
  const a = agent(id); if (!a) return null
  const n = String(name || '').trim().slice(0, 12)
  if (!n || n === shownName(a)) return publicAgent(a)
  const old = shownName(a); a.name = n; saveState()
  setAgent(id, { activity: T('act.rename', { old, n }) })
  return publicAgent(a)
})
ipcMain.handle('office:discover', async (_e, req) => {
  const route = req.route
  const ref = req.apiKeyEnv || (route ? prov.deriveKeyRef(route) : '')
  const apiKey = keyFor(req) || (ref ? prov.storedKey(settings.dshRoot, ref) : undefined)
  const { net } = require('electron')
  return prov.discover((url, init) => net.fetch(url, init), { baseURL: req.baseURL, api: req.api, apiKey })
})
/** `env:FOO_API_KEY` style refs are valid; anything else must be an env-var identifier. */
function assertRef(ref) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) throw new Error(T('err.invalidRef', { ref }))
  return ref
}
ipcMain.handle('office:setLang', (_e, lang) => {
  I18N.setLang(lang)
  for (const a of state.agents) send('office:agent', publicAgent(a)) // default names/titles follow the language
  return I18N.getLang()
})
ipcMain.handle('office:saveProvider', async (_e, route, p, apiKey, models) => {
  if (current) throw new Error(T('err.projectBusy'))
  if (!prov.ROUTE_PATTERN.test(route)) throw new Error(T('err.routePattern'))
  if (!p.existing && settings.providers?.[route]) throw new Error(T('err.routeExists', { route }))
  if (!/^https?:\/\/\S+$/.test(p.baseURL || '')) throw new Error(T('err.baseHttp'))
  if (!prov.PROTOCOLS.includes(p.api)) throw new Error(T('err.protocol'))
  if (!Array.isArray(models) || !models.length) throw new Error(T('err.needModel'))
  const ids = new Set()
  for (const m of models) {
    if (!m.model) throw new Error(T('err.modelEmpty'))
    if (ids.has(m.model)) throw new Error(T('err.modelDup', { model: m.model }))
    ids.add(m.model)
    parameters.validateModel(m)
  }
  const apiKeyEnv = assertRef(settings.providers?.[route]?.apiKeyEnv || p.apiKeyEnv || prov.deriveKeyRef(route))
  // The key arrives as a positional argument; a one-click agent import may
  // instead reference a secret the scan cached (keyFrom), never sent to the UI.
  const incoming = (apiKey || '').trim() || (p.keyFrom ? agents.secretOf(p.keyFrom) : null)
  const used = new Set(settings.models.filter(m => m.provider !== route).map(m => m.key))
  const clean = models.map(m => {
    let key = m.key && !used.has(m.key) ? m.key : `${route}-${m.model}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    while (used.has(key)) key += '-2'
    used.add(key)
    const previous = settings.models.find(old => old.provider === route && old.model === m.model)
    return parameters.validateModel({
      key, name: (m.name || m.model).trim(), provider: route, model: m.model.trim(),
      contextWindow: m.contextWindow ?? previous?.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
      maxTokens: m.maxTokens ?? previous?.maxTokens,
      outputLimit: m.outputLimit ?? m.modelInfo?.outputLimit ?? previous?.outputLimit,
      inputLimit: m.inputLimit ?? m.modelInfo?.inputLimit ?? previous?.inputLimit,
      detectedLimits: m.detectedLimits ?? previous?.detectedLimits,
      limitSources: m.limitSources ?? m.modelInfo?.sources ?? previous?.limitSources,
      limitsCheckedAt: m.limitsCheckedAt ?? m.modelInfo?.checkedAt ?? previous?.limitsCheckedAt,
      vision: m.vision ?? previous?.vision,
      fruit: m.fruit || 'apple', fastModel: (m.fastModel || '').trim(),
      efforts: prov.THINKING_LEVELS.filter(l => (m.efforts || []).includes(l)),
    })
  })
  const before = settings.models.findIndex(m => m.provider === route)
  const others = settings.models.filter(m => m.provider !== route)
  const next = parameters.validateSettings({ ...settings,
    providers: { ...settings.providers, [route]: { displayName: p.displayName || route, apiKeyEnv, api: p.api, baseURL: p.baseURL.trim() } },
    models: before < 0 ? [...others, ...clean] : [...others.slice(0, before), ...clean, ...others.slice(before)],
  })
  if (!next.models.some(m => m.key === next.defaultModel)) next.defaultModel = next.models[0].key
  if (incoming) prov.setKey(settings.dshRoot, apiKeyEnv, incoming)
  else if (!prov.storedKey(settings.dshRoot, apiKeyEnv)) throw new Error(T('err.needKey'))
  writeJson(SETTINGS_FILE, next)
  settings = next
  await pool.configure(settings)
  for (const a of state.agents) send('office:agent', publicAgent(a))
  return settings
})
ipcMain.handle('office:deleteProvider', async (_e, route) => {
  if (current) throw new Error(T('err.projectBusy'))
  const rest = settings.models.filter(m => m.provider !== route)
  const { [route]: _gone, ...others } = settings.providers || {}
  const compaction = settings.compaction.summarizationProvider === route
    ? { ...settings.compaction, summarizationProvider: '', summarizationModel: '' }
    : settings.compaction
  const next = parameters.validateSettings({ ...settings, providers: others, models: rest, compaction })
  if (!rest.some(m => m.key === next.defaultModel)) next.defaultModel = rest[0]?.key || ''
  writeJson(SETTINGS_FILE, next)
  settings = next
  await pool.configure(settings)
  for (const a of state.agents) send('office:agent', publicAgent(a))
  return settings
})
ipcMain.handle('office:projects', () => listProjects())
ipcMain.handle('office:files', (_e, id) => {
  const p = listProjects().find(x => x.id === id); if (!p) return []
  return listFiles(p.dir)
})
ipcMain.handle('office:readFile', (_e, file) => {
  const full = inProjects(file)
  const st = fs.statSync(full)
  if (st.size > 2_000_000) return { tooLarge: true }
  const buf = fs.readFileSync(full)
  if (buf.includes(0)) return { binary: true }
  return { text: buf.toString('utf8') }
})
ipcMain.handle('office:open', (_e, p) => shell.openPath(p))
ipcMain.handle('office:reveal', (_e, p) => shell.showItemInFolder(p))
ipcMain.handle('office:harnessDir', () => shell.openPath(HARNESS_DIR))
ipcMain.handle('office:harness', (_e, name) => fs.readFileSync(harnessFile(name), 'utf8'))
ipcMain.handle('office:saveHarness', (_e, name, text) => {
  if (!['ceo', 'hr', 'employee'].includes(name)) throw new Error('bad harness')
  fs.writeFileSync(harnessFile(name), text, 'utf8'); return true
})
ipcMain.handle('office:pickFiles', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], title: T('dlg.pickAtts') })
  return r.canceled ? [] : r.filePaths.map(f => { const st = fs.statSync(f); return { path: f, name: path.basename(f), size: st.size, dir: false } })
})
ipcMain.handle('office:statPaths', (_e, list) => [].concat(list || []).map(f => { try { const st = fs.statSync(f); return { path: f, name: path.basename(f), size: st.isDirectory() ? 0 : st.size, dir: st.isDirectory() } } catch { return null } }).filter(Boolean))
ipcMain.handle('office:pickDir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: settings.workspace })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle('office:saveSettings', async (_e, next) => {
  if (current) throw new Error(T('err.settingsBusy'))
  const validated = parameters.validateSettings({ ...settings, ...next,
    compaction: { ...settings.compaction, ...next.compaction },
  })
  fs.mkdirSync(path.join(validated.workspace, 'projects'), { recursive: true })
  writeJson(SETTINGS_FILE, validated)
  settings = validated
  await pool.configure(settings)
  return settings
})
ipcMain.handle('office:openLog', () => shell.openPath(LOG_FILE))

// ---------- extensions: plugins / MCP / skills / experts ----------
const extInfo = () => {
  const plugins = extensions.loadPlugins(PLUGIN_DIR)
  const userSkills = extensions.listSkills(SKILL_DIR)
  const live = extensions.resolve(settings, plugins, userSkills)
  return {
    pluginDir: PLUGIN_DIR, skillDir: SKILL_DIR, plugins: plugins.map(p => extensions.publicPlugin(p, settings)),
    mcpServers: settings.mcpServers || [], experts: settings.experts || [], pluginMcp: settings.pluginMcp || {}, skillToggles: settings.skillToggles || {},
    skills: userSkills.map(s => ({ name: s.name, description: s.description })),
    live: { mcp: live.mcpServers.map(s => ({ name: s.name, source: s.source })), experts: live.experts.map(e => ({ id: e.id, source: e.source })), skills: live.skills.map(s => ({ name: s.name, source: s.source, description: s.description })), skipped: live.skipped },
  }
}
async function saveExt(patch) {
  if (current) throw new Error(T('err.settingsBusy'))
  const validated = parameters.validateSettings({ ...settings, ...patch })
  writeJson(SETTINGS_FILE, validated)
  settings = validated
  await pool.configure(settings)
  return extInfo()
}
/** Skill files changed on disk: re-stage them for the next task. */
async function skillsChanged() {
  if (current) throw new Error(T('err.settingsBusy'))
  await pool.configure(settings)
  return extInfo()
}
ipcMain.handle('office:extInfo', () => extInfo())
ipcMain.handle('office:saveExt', (_e, patch = {}) => {
  const allowed = {}
  for (const k of ['mcpServers', 'experts', 'plugins', 'pluginMcp', 'skillToggles']) if (patch[k] !== undefined) allowed[k] = patch[k]
  return saveExt(allowed)
})
// Skill bodies are read lazily: the list only carries name + description.
const skillFile = (source, name) => {
  const list = source === 'user' ? extensions.listSkills(SKILL_DIR) : (extensions.loadPlugins(PLUGIN_DIR).find(p => p.id === source)?.skills || [])
  const s = list.find(x => x.name === name)
  if (!s) throw new Error(`skill not found: ${source}/${name}`)
  return s.file
}
ipcMain.handle('office:readSkill', (_e, source, name) => ({ ...extensions.readSkill(skillFile(source, name)), source }))
ipcMain.handle('office:saveSkill', (_e, s = {}) => {
  if (current) throw new Error(T('err.settingsBusy'))
  extensions.saveUserSkill(SKILL_DIR, s)
  return skillsChanged()
})
ipcMain.handle('office:deleteSkill', (_e, name) => {
  if (current) throw new Error(T('err.settingsBusy'))
  extensions.deleteUserSkill(SKILL_DIR, name)
  const skillToggles = { ...(settings.skillToggles || {}) }; delete skillToggles[`user/${name}`]
  return saveExt({ skillToggles })
})
ipcMain.handle('office:importSkill', async (_e, kind) => {
  if (current) throw new Error(T('err.settingsBusy'))
  const r = await dialog.showOpenDialog(win, kind === 'file'
    ? { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Markdown', extensions: ['md'] }], title: T('ext.pickSkill') }
    : { properties: ['openDirectory'], title: T('ext.pickSkill') })
  if (r.canceled) return null
  const names = r.filePaths.flatMap(f => extensions.importSkills(f, SKILL_DIR))
  return { ...(await skillsChanged()), imported: names }
})
ipcMain.handle('office:skillDir', () => { fs.mkdirSync(SKILL_DIR, { recursive: true }); return shell.openPath(SKILL_DIR) })
ipcMain.handle('office:reloadSkills', () => skillsChanged())
ipcMain.handle('office:testMcp', (_e, server) => extensions.testMcp(server, { cwd: settings.workspace }))
ipcMain.handle('office:installPlugin', async (_e, dir) => {
  if (!dir) {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: T('ext.pickPlugin') })
    if (r.canceled) return null
    dir = r.filePaths[0]
  }
  const p = extensions.installPlugin(dir, PLUGIN_DIR)
  // a freshly installed plugin starts enabled
  return saveExt({ plugins: { ...(settings.plugins || {}), [p.id]: true } })
})
ipcMain.handle('office:removePlugin', (_e, id) => {
  extensions.removePlugin(id, PLUGIN_DIR)
  const plugins = { ...(settings.plugins || {}) }; delete plugins[id]
  return saveExt({ plugins })
})
ipcMain.handle('office:pluginDir', () => { fs.mkdirSync(PLUGIN_DIR, { recursive: true }); return shell.openPath(PLUGIN_DIR) })
ipcMain.on('win:min', () => win?.minimize())
ipcMain.on('win:max', () => win?.isMaximized() ? win.unmaximize() : win?.maximize())
ipcMain.on('win:close', () => win?.close())

// ---------- app ----------
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  ensureHarness()
  fs.mkdirSync(projectsDir(), { recursive: true })
  initPool()
  // Recover projects interrupted by a previous exit.
  for (const p of listProjects()) if (!['done', 'failed'].includes(p.status)) { p.status = 'failed'; p.phase = '应用退出时中断'; saveProject(p) }
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 680, frame: false, backgroundColor: '#1d1f27',
    title: 'DSH Office', icon: process.platform === 'win32' ? path.join(__dirname, 'icon.ico') : path.join(__dirname, 'icon.png'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false },
  })
  // DSH_OFFICE_HEADLESS=1 keeps the window hidden (automated screenshots / UI audits).
  if (process.env.DSH_OFFICE_HEADLESS !== '1') win.once('ready-to-show', () => win.show())
  win.webContents.on('console-message', (e) => {
    const lvl = e.level ?? 'info'
    if (lvl === 'error' || lvl === 'warning' || lvl === 2 || lvl === 3) log(`renderer ${lvl}: ${e.message} @${e.sourceId}:${e.lineNumber}`)
  })
  win.webContents.on('render-process-gone', (_e, d) => log(`renderer gone: ${JSON.stringify(d)}`))
  win.webContents.on('preload-error', (_e, p, err) => log(`preload error ${p}: ${err}`))
  // a file dropped outside the drop zone must not navigate the app away
  win.webContents.on('will-navigate', e => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  // Warm the CEO's runtime so the first task starts fast.
  if (settings.models.length) setTimeout(() => pool.get(modelOf(agent('ceo')), false, effortOf(agent('ceo'))), 1500)
})

app.on('window-all-closed', async () => {
  try { await pool?.closeAll() } catch {}
  app.quit()
})
