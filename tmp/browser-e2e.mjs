// Real employee projects, isolated profiles and credentials; no visible windows.
// Usage: node tmp/browser-e2e.mjs <dsh|codex>
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
const mode = process.argv[2]
if (!['dsh', 'codex'].includes(mode)) throw new Error('Usage: node tmp/browser-e2e.mjs <dsh|codex>')
const root = path.resolve(import.meta.dirname, '..'), run = String(Date.now())
const seedFile = path.resolve(process.env.DSH_OFFICE_E2E_SETTINGS || path.join(root, 'tmp', 'en-demo-profile', 'settings.json'))
if (!fs.existsSync(seedFile)) throw new Error('Isolated settings fixture is missing. Set DSH_OFFICE_E2E_SETTINGS to a prepared settings.json copy; this script never falls back to real user configuration.')
let seed
try { seed = JSON.parse(fs.readFileSync(seedFile, 'utf8').replace(/^\uFEFF/, '')) }
catch { throw new Error('DSH_OFFICE_E2E_SETTINGS must point to a valid settings.json fixture') }
assert.ok(Array.isArray(seed.models), 'The settings fixture needs a models array')
const base = path.join(root, 'tmp', `browser-e2e-${mode}-${run}`)
const profile = path.join(base, 'profile'), workspace = path.join(base, 'workspace')
const dshHome = path.join(base, 'dsh-home'), codexHome = path.join(base, 'codex-home')
for (const dir of [profile, workspace, dshHome, codexHome]) fs.mkdirSync(dir, { recursive: true })
// Copy only credentials from their originals. Neither engine reads/writes the real homes.
fs.copyFileSync(path.join(os.homedir(), '.dsh', '.credentials.yaml'), path.join(dshHome, '.credentials.yaml'))
if (mode === 'codex') for (const name of ['auth.json', 'models_cache.json']) {
  const source = path.join(os.homedir(), '.codex', name)
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(codexHome, name))
}
const model = seed.models.find(m => mode === 'codex' ? m.engine === 'codex' : m.key === 'sonnet-5-5')
assert.ok(model && !/minimax|mmx/i.test(JSON.stringify(model)), 'Non-MiniMax engine fixture is available')
const brief = `Hire exactly one browser-auditor employee. Verify a public fact: IANA maintains example.com and example.org for documentation. The employee MUST really call office-browser MCP browser_search with query "IANA example domains documentation", then browser_open on a relevant result (prefer https://www.iana.org/help/example-domains), and browser_screenshot on that source page. Write 01-browser-evidence.md in this project directory with: a concise conclusion, one exact sentence quoted from the opened page, its full source URL, and the exact screenshot path returned by browser_screenshot. Do not invent tool results, quotes, URLs or files. Do not use command-line network tools or another browser. Deliver only this short research note and the real screenshot. The goal, audience and format are fully specified; proceed without questions.`
Object.assign(seed, {
  workspace, models: [{ ...model, defaultEffort: 'low', maxTokens: 8192 }],
  providers: mode === 'codex' ? {} : { [model.provider]: seed.providers[model.provider] },
  defaultModel: model.key, defaultEffort: 'low', minTeam: 1, maxTeam: 1,
  normalConcurrency: 1, ceoAsk: false, permissionMode: 'workspace-write',
  mcpServers: [], plugins: { 'office-browser': true, 'office-experts': false, 'mcp-starter': false }, pluginMcp: {},
  browser: { searchEngine: 'bing', allowPrivate: false, blockedDomains: [], maxPages: 20, maxTaskMs: 600000 },
  experts: [{ id: 'browser-auditor', name: 'Robin', icon: '🔎', title: 'Browser evidence auditor', skills: 'Public-web research, exact quotes, source verification', prompt: brief, mcp: ['office-browser'] }],
})
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(seed, null, 2))
const port = mode === 'dsh' ? 9452 : 9453
const child = spawn(path.join(root, 'dist', 'DSH Office', 'DSH Office.exe'), [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--window-size=1500,960'], {
  windowsHide: true, stdio: 'ignore', env: { ...process.env, DSH_OFFICE_HEADLESS: '1', DSH_HOME: dshHome, CODEX_HOME: codexHome },
})
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const info = { mode, base, profile, workspace, startedAt: new Date().toISOString(), passed: false }
const log = text => console.log(new Date().toISOString().slice(11, 19), mode, text)
let socket, serial = 0
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial
  const timer = setTimeout(() => { socket.removeEventListener('message', receive); reject(new Error(`CDP ${method} timed out`)) }, 30000)
  const receive = event => { const message = JSON.parse(event.data); if (message.id === id) { clearTimeout(timer); socket.removeEventListener('message', receive); message.error ? reject(new Error(message.error.message)) : resolve(message.result) } }
  socket.addEventListener('message', receive)
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async body => {
  const result = await cdp('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.name === '.office' ? [] : entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
try {
  let target
  for (let i = 0; i < 80 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(1200) })).json()).find(p => p.type === 'page' && /renderer[\\/]index\.html/.test(p.url)) } catch {}
    if (!target) await sleep(400)
  }
  assert.ok(target, 'Headless app exposes its renderer via CDP')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  await sleep(1800)
  await evaluate("localStorage.setItem('dsh-office-lang','en')")
  await cdp('Page.reload')
  await sleep(1800)
  assert.equal(await evaluate('return (await office.init()).settings.workspace'), workspace, 'CDP belongs to this isolated profile')
  const live = await evaluate('return (await office.extInfo()).live')
  log('live extensions ' + JSON.stringify(live))
  const p = await evaluate(`return office.submit(${JSON.stringify({ title: `Browser evidence · ${mode}`, brief })})`)
  info.projectId = p.id; info.projectDir = p.dir
  log('submitted ' + p.id)
  let last = '', watched = false
  const deadline = Date.now() + 25 * 60 * 1000
  while (Date.now() < deadline) {
    await sleep(4500)
    const state = await evaluate(`const data=await office.init();const project=data.projects.find(p=>p.id===${JSON.stringify(p.id)});return {project,agents:data.agents.filter(a=>a.role==='employee').map(a=>({id:a.id,name:a.name,activity:a.activity}))}`)
    const stage = `${state.project?.status} | ${state.project?.phase}`
    if (stage !== last) { last = stage; log(stage) }
    const browser = await evaluate("return office.browser('state')")
    const employeeTab = browser.tabs.find(t => t.owner && t.readOnly && t.url && t.url !== 'about:blank')
    if (!watched && employeeTab && !employeeTab.loading) {
      await evaluate(`document.getElementById('btn-browser')?.click(); await office.browser('select',{id:${JSON.stringify(employeeTab.id)}});`)
      await sleep(500)
      const shot = await cdp('Page.captureScreenshot', { format: 'png' })
      info.observedPanel = path.join(base, 'employee-observed.png')
      fs.writeFileSync(info.observedPanel, Buffer.from(shot.data, 'base64'))
      // Both languages observe the exact same employee session. Native page
      // capture is also retained separately by browser_screenshot.
      await evaluate("document.getElementById('btn-lang').click()")
      await sleep(200)
      const chinese = await cdp('Page.captureScreenshot', { format: 'png' })
      info.observedPanelZh = path.join(base, 'employee-observed-zh.png')
      fs.writeFileSync(info.observedPanelZh, Buffer.from(chinese.data, 'base64'))
      await evaluate("document.getElementById('btn-lang').click()")
      watched = true; log('captured employee observation panel')
    }
    if (state.project && ['done', 'failed'].includes(state.project.status)) { info.status = state.project.status; info.phase = state.project.phase; break }
  }
  assert.equal(info.status, 'done', info.phase || 'Project did not finish before timeout')
  const officeLog = fs.readFileSync(path.join(profile, 'office.log'), 'utf8')
  info.toolCalls = [...new Set(officeLog.match(/mcp__office-browser__browser_[a-z_]+/g) || [])]
  for (const name of ['browser_search', 'browser_open', 'browser_screenshot']) assert.ok(info.toolCalls.includes(`mcp__office-browser__${name}`), `${mode} emitted ${name} through MCP`)
  const files = walk(p.dir)
  info.screenshots = files.filter(file => /browser-shots[\\/].+\.png$/i.test(file) && fs.statSync(file).size > 1000)
  assert.ok(info.screenshots.length, 'Real screenshot exists in the project directory')
  info.deliverable = files.find(file => /01-browser-evidence\.md$/i.test(file))
  assert.ok(info.deliverable, 'Employee wrote the requested deliverable')
  const content = fs.readFileSync(info.deliverable, 'utf8')
  info.sourceUrls = [...new Set(content.match(/https?:\/\/[^\s<>"')\]]+/g) || [])]
  assert.ok(info.sourceUrls.some(url => /https?:\/\/(www\.)?iana\.org\//.test(url)), 'Deliverable contains a real IANA source URL')
  assert.ok(/IANA|Internet Assigned Numbers Authority/i.test(content), 'Deliverable discusses the researched source')
  info.passed = true
  log('PASS ' + JSON.stringify({ toolCalls: info.toolCalls, screenshots: info.screenshots, deliverable: info.deliverable, sourceUrls: info.sourceUrls }))
} catch (error) {
  info.error = error.message
  log('FAIL ' + error.message)
  process.exitCode = 1
} finally {
  info.finishedAt = new Date().toISOString()
  fs.writeFileSync(path.join(base, 'evidence.json'), JSON.stringify(info, null, 2))
  fs.writeFileSync(path.join(root, 'tmp', `browser-e2e-${mode}-latest.json`), JSON.stringify(info, null, 2))
  if (socket?.readyState === WebSocket.OPEN) {
    try { await evaluate('office.win.close()') } catch {}
    socket.close()
  }
  await sleep(2000)
  if (child.exitCode === null) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
    else child.kill()
  }
  log('evidence ' + path.join(base, 'evidence.json'))
}
