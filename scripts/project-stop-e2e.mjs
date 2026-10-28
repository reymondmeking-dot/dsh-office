// Deterministic, real Electron IPC + runtime process-tree cancellation; no model or credentials.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import net from 'node:net'
const root = path.resolve(import.meta.dirname, '..'), base = path.join(root, 'tmp', 'project-stop-' + Date.now())
const reservePort = async () => { const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port; await new Promise(r => server.close(r)); return port }
const profile = path.join(base, 'profile'), workspace = path.join(base, 'workspace'), port = await reservePort(), inspectPort = await reservePort()
for (const dir of [profile, workspace, path.join(base, 'dsh-home'), path.join(base, 'codex-home')]) fs.mkdirSync(dir, { recursive: true })
const interruptedDir = path.join(workspace, 'projects', 'interrupted-stop')
fs.mkdirSync(path.join(interruptedDir, '.office'), { recursive: true })
fs.writeFileSync(path.join(interruptedDir, '.office', 'project.json'), JSON.stringify({ id: 'interrupted-stop', title: 'Interrupted stop', dir: interruptedDir, rel: 'projects/interrupted-stop', status: 'stopping', createdAt: 1, team: [], assignments: [], reports: [] }))
const fake = path.join(base, 'fixture-cli.js')
fs.writeFileSync(fake, `const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
if(process.argv.includes('--version')){console.log('fixture');process.exit()}
const dir=process.env.DSH_OFFICE_BROWSER_PROJECT,sid=process.env.DSH_OFFICE_BROWSER_CONTEXT;
if(!dir||!sid)process.exit();
const marker=path.join(dir,'fixture-'+sid+'.json'),beat=path.join(dir,'heartbeat-'+sid+'.txt');
const sub=spawn(process.execPath,['-e','require("node:fs").appendFileSync('+JSON.stringify(beat)+',".");setInterval(()=>require("node:fs").appendFileSync('+JSON.stringify(beat)+',"."),80)'],{windowsHide:true,stdio:'ignore'});
console.log(JSON.stringify({type:'thread.started',thread_id:sid}));console.log(JSON.stringify({type:'turn.started'}));
fs.writeFileSync(marker,JSON.stringify({pid:process.pid,child:sub.pid,sid,beat}));
fetch(new URL('/tool',process.env.DSH_OFFICE_BROWSER_URL),{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.DSH_OFFICE_BROWSER_TOKEN},body:JSON.stringify({name:'browser_snapshot',args:{},contextId:sid,projectDir:dir,owner:sid})}).catch(()=>{});
process.stdin.resume();setInterval(()=>{},1000);
`)
const model = { key: 'cancel-fixture', name: 'Cancellation fixture', model: 'fixture', provider: 'codex', engine: 'codex', fruit: 'orange', contextWindow: 200000, maxTokens: 8192, efforts: ['low'] }
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ workspace, dshRoot: 'D:\\deepseek-harness', codexPath: fake, models: [model], defaultModel: model.key, defaultEffort: 'low', providers: {}, cliResources: {}, ceoAsk: false, autopilot: { resume: true, retries: 2, askTimeoutSec: 0, notify: false } }))
const sleep = ms => new Promise(r => setTimeout(r, ms)); let child, ws, next = 0
function cdp(socket, method, params = {}) { return new Promise((resolve, reject) => { const id = ++next, timer = setTimeout(() => { socket.removeEventListener('message', on); reject(Error(method + ' timeout')) }, 30000); const on = e => { const m = JSON.parse(e.data); if (m.id !== id) return; clearTimeout(timer); socket.removeEventListener('message', on); m.error ? reject(Error(m.error.message)) : resolve(m.result) }; socket.addEventListener('message', on); socket.send(JSON.stringify({ id, method, params })) }) }
async function ev(expression, socket = ws) { const r = await cdp(socket, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value }
const api = (name, ...args) => ev(`office.${name}(${args.map(JSON.stringify).join(',')})`)
async function until(fn, message) { for (let i = 0; i < 120; i++) { const v = await fn(); if (v) return v; await sleep(100) } throw Error('Timed out: ' + message) }
async function start() {
  child = spawn(path.join(root, 'dist', 'DSH Office', 'DSH Office.exe'), [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, `--inspect=${inspectPort}`], { windowsHide: true, stdio: 'ignore', env: { ...process.env, DSH_OFFICE_HEADLESS: '1', DSH_HOME: path.join(base, 'dsh-home'), CODEX_HOME: path.join(base, 'codex-home') } })
  const t = await until(async () => { try { return (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.url.endsWith('/renderer/index.html')) } catch {} }, 'renderer')
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true })); await sleep(600)
  assert.equal((await api('init')).settings.workspace, workspace, 'Never mutate a target from another test run')
  const inspectTarget = (await (await fetch(`http://127.0.0.1:${inspectPort}/json`)).json())[0], inspector = new WebSocket(inspectTarget.webSocketDebuggerUrl)
  await new Promise(r => inspector.addEventListener('open', r, { once: true }))
  await ev("process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/renderer/index.html')).webContents.setBackgroundThrottling(false);true", inspector)
  inspector.close()
}
async function stop() {
  if (child?.exitCode === null) {
    try { await ev('office.win.close()') } catch {}
    await Promise.race([new Promise(r => child.once('exit', r)), sleep(6000)])
    if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)) }
  }
  ws?.close(); await sleep(500)
}
const fixtures = dir => fs.readdirSync(dir).filter(x => /^fixture-.*\.json$/.test(x)).map(x => JSON.parse(fs.readFileSync(path.join(dir, x), 'utf8')))
const alive = pid => { try { process.kill(pid, 0); return true } catch { return false } }
const evidence = { base, passed: false, checks: [] }
const pass = message => { evidence.checks.push(message); console.log('PASS', message) }
try {
  await start()
  assert.equal((await api('projects')).find(p => p.id === 'interrupted-stop').status, 'stopped')
  pass('a crash during teardown preserves stop intent instead of auto-resuming')
  const parent = await api('createProject', { title: 'Stop project fixture', folder: path.join(workspace, 'alpha'), confirmed: true })
  const sibling = await api('createProject', { title: 'Unrelated project', folder: path.join(workspace, 'alpha-other'), confirmed: true })
  fs.writeFileSync(path.join(parent.dir, 'keep.txt'), 'original output retained')
  await ev(`window.chatOne = office.chatSend(${JSON.stringify(parent.id)},'Wait until stopped');window.chatTwo=office.chatSend(${JSON.stringify(sibling.id)},'Keep working');true`)
  await until(() => fixtures(parent.dir).length && fixtures(sibling.dir).length, 'real chat runtime trees')
  const location1 = await api('taskLocation', { projectId: parent.id, title: 'Running child' })
  const running = await api('submit', { projectId: parent.id, title: 'Running child', brief: 'Wait', location: location1, locationConfirmed: true })
  await until(() => fixtures(running.dir).length, 'running task runtime')
  const location2 = await api('taskLocation', { projectId: parent.id, title: 'Queued child' })
  const queued = await api('submit', { projectId: parent.id, title: 'Queued child', brief: 'Wait', location: location2, locationConfirmed: true })
  const activity = await api('projectActivity', parent.id)
  assert.equal(activity.runningTasks, 1); assert.equal(activity.queuedTasks, 1); assert.equal(activity.chatCount, 1); assert.equal(activity.canStop, true)
  pass('project activity includes running task, queued descendant and independent chat')
  const stoppedFixtures = [...fixtures(parent.dir), ...fixtures(running.dir)], siblingFixture = fixtures(sibling.dir)[0]
  await until(async () => (await api('browser', 'state')).tabs.filter(t => t.owner).length === 3, 'employee browser tabs')
  await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: 1500, height: 960, deviceScaleFactor: 1, mobile: false })
  for (const lang of ['zh', 'en']) {
    await ev(`if(I18N.getLang()!==${JSON.stringify(lang)})document.querySelector('#btn-lang').click();true`)
    await ev(`OfficeProjects.open(${JSON.stringify(parent.id)})`)
    await sleep(250)
    assert.equal(await ev("document.querySelector('#project-stop').disabled"), false)
    const runningShot = await cdp(ws, 'Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(base, lang + '-project-running.png'), Buffer.from(runningShot.data, 'base64'))
    await ev("document.querySelector('#project-stop').click();true")
    await until(() => ev("!document.querySelector('#project-stop-modal').classList.contains('hidden')"), 'stop confirmation')
    const confirmShot = await cdp(ws, 'Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(base, lang + '-project-stop-confirm.png'), Buffer.from(confirmShot.data, 'base64'))
    if (lang === 'zh') { await ev("document.querySelector('#project-stop-cancel').click();true"); assert.equal((await api('projectActivity', parent.id)).canStop, true) }
  }
  await ev("window.stopUiResult=null;document.addEventListener('office:project-stop-result',e=>window.stopUiResult=e.detail,{once:true});document.querySelector('#project-stop-confirm').click();true")
  await until(() => ev('window.stopUiResult'), 'UI stop completion')
  assert.equal((await ev('window.stopUiResult')).error, undefined)
  assert.equal((await api('projectActivity', parent.id)).canStop, false)
  pass('Chinese/English running controls and confirmation render; cancel preserves work; UI confirm stops project')
  const reply = await ev('window.chatOne'); assert.equal(reply.stopped, true)
  for (const f of stoppedFixtures) { assert.equal(alive(f.pid), false); assert.equal(alive(f.child), false) }
  assert.equal(alive(siblingFixture.pid), true); assert.equal(alive(siblingFixture.child), true)
  const before = fs.statSync(siblingFixture.beat).size; await sleep(250); assert.ok(fs.statSync(siblingFixture.beat).size > before)
  pass('stop terminates owned runtime/descendant processes while unrelated project continues')
  let projects = await api('projects')
  assert.equal(projects.find(p => p.id === running.id).status, 'stopped'); assert.equal(projects.find(p => p.id === queued.id).status, 'stopped'); assert.equal(projects.find(p => p.id === parent.id).status, 'done')
  assert.equal((await api('chatHistory', parent.id)).messages.filter(m => m.role === 'ceo').length, 0)
  assert.equal(fs.readFileSync(path.join(parent.dir, 'keep.txt'), 'utf8'), 'original output retained')
  assert.equal((await api('browser', 'state')).tabs.filter(t => t.owner).length, 1)
  pass('stopped tasks cannot become done; partial files and user chat persist; employee tabs recycled')
  const noOp = await api('stopProject', parent.id); assert.equal(noOp.stopped.length, 0); assert.equal(noOp.chats.length, 0)
  await api('stopProject', sibling.id); assert.equal((await ev('window.chatTwo')).stopped, true)
  const inspector = (await (await fetch(`http://127.0.0.1:${inspectPort}/json`)).json())[0], main = new WebSocket(inspector.webSocketDebuggerUrl)
  await new Promise(r => main.addEventListener('open', r, { once: true }))
  evidence.windows = await ev("process.mainModule.require('electron').BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),title:w.getTitle()}))", main); assert.ok(evidence.windows.every(w => !w.visible)); main.close()
  pass('all windows remain hidden and repeated stop is idempotent')
  await stop(); await start(); await sleep(4500)
  projects = await api('projects'); assert.equal(projects.find(p => p.id === running.id).status, 'stopped'); assert.equal(projects.find(p => p.id === queued.id).status, 'stopped'); assert.equal((await api('init')).current, null)
  pass('explicitly stopped work is not automatically resumed after restart')
  evidence.passed = true
} catch (error) { evidence.error = error.stack; try { evidence.ui = await ev("({stopResult:window.stopUiResult,modal:document.querySelector('#project-stop-modal')?.className,message:document.querySelector('#project-stop-message')?.textContent})"); evidence.projects = await api('projects') } catch {} console.error(error.stack); process.exitCode = 1 }
finally { await stop(); fs.writeFileSync(path.join(base, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log('EVIDENCE', base) }
