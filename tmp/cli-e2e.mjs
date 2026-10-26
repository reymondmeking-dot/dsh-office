// Headless authorization flow and one real, read-only public GitHub CLI call.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
const root = path.resolve(import.meta.dirname, '..')
const base = path.join(root, 'tmp', 'cli-e2e-' + Date.now())
const profile = path.join(base, 'profile'), workspace = path.join(base, 'workspace')
const dshHome = path.join(base, 'dsh-home'), codexHome = path.join(base, 'codex-home')
for (const dir of [profile, workspace, dshHome, codexHome]) fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ workspace, dshRoot: 'D:\\deepseek-harness', models: [], providers: {}, cliResources: { github: false, taptap: false } }))
const out = path.join(root, 'tmp', 'ui-shots', 'after'); fs.mkdirSync(out, { recursive: true })
const child = spawn(path.join(root, 'dist', 'DSH Office', 'DSH Office.exe'), [`--user-data-dir=${profile}`, '--remote-debugging-port=9474', '--inspect=9475', '--window-size=1500,960'], {
  windowsHide: true, stdio: 'ignore', env: { ...process.env, DSH_OFFICE_HEADLESS: '1', DSH_HOME: dshHome, CODEX_HOME: codexHome },
})
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const info = { base, profile, passed: false, checks: {}, screenshots: [] }
const log = value => console.log('cli-e2e', value)
const connections = []
async function connect(port, predicate) {
  let target
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(800) })).json()).find(predicate) } catch {}
    if (!target) await sleep(300)
  }
  assert.ok(target, `Isolated debugger ${port} is available`)
  const socket = new WebSocket(target.webSocketDebuggerUrl); connections.push(socket)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  let serial = 0
  return async (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { socket.removeEventListener('message', receive); reject(new Error(`CDP ${method} timed out`)) }, 12000)
    const receive = event => { const m = JSON.parse(event.data); if (m.id === id) { clearTimeout(timer); socket.removeEventListener('message', receive); m.error ? reject(new Error(m.error.message)) : resolve(m.result) } }
    socket.addEventListener('message', receive); socket.send(JSON.stringify({ id, method, params }))
  })
}
const evaluate = call => async body => {
  const result = await call('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
let run
try {
  const cdp = await connect(9474, t => t.type === 'page' && /renderer[\\/]index\.html/.test(t.url))
  const inspector = await connect(9475, t => t.type === 'node')
  run = evaluate(cdp)
  await sleep(1500)
  assert.equal(await run('return (await office.init()).settings.workspace'), workspace)
  // The capability stays in this process's memory and is never printed or saved.
  const bridge = await evaluate(inspector)("return {url:process.env.DSH_OFFICE_BROWSER_URL,token:process.env.DSH_OFFICE_BROWSER_TOKEN,argv:process.argv}")
  assert.ok(bridge.argv.includes(`--user-data-dir=${profile}`), 'Inspector belongs to this isolated profile')
  const tool = async (name, args) => {
    const response = await fetch(new URL('/cli-tool', bridge.url), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bridge.token}` }, body: JSON.stringify({ name, args, contextId: 'cli-e2e', projectDir: workspace, owner: 'CLI verification' }), signal: AbortSignal.timeout(40000) })
    const body = await response.json()
    assert.equal(JSON.stringify(body).includes(bridge.token), false, 'Bridge capability never appears in results')
    return { status: response.status, body }
  }
  const wait = async (expression, timeout = 15000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) { if (await run(`return !!(${expression})`)) return; await sleep(200) }
    throw new Error('UI condition timed out')
  }
  const screenshot = async name => {
    await sleep(300)
    const shot = await cdp('Page.captureScreenshot', { format: 'png' }), file = path.join(out, name + '.png')
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64')); info.screenshots.push(file)
  }
  const language = async value => { await run(`if(I18N.getLang()!==${JSON.stringify(value)})document.getElementById('btn-lang').click()`); await sleep(150) }
  const detection = await run('return office.detectCli()')
  info.resources = detection.resources.map(({ id, installed, authenticated, credentialAvailable, status, verified }) => ({ id, installed, authenticated, credentialAvailable, status, verified }))
  assert.ok(detection.resources.find(r => r.id === 'github' && r.installed && r.authenticated))
  info.checks.realResourceDetection = true
  assert.deepEqual((await tool('cli_list_resources', {})).body.result.resources, [])
  assert.equal((await tool('cli_call', { resource: 'github', args: ['repo', 'view', 'reymondmeking-dot/dsh-office'] })).status, 400)
  info.checks.deniedBeforeGrant = true
  await language('en')
  await run("document.getElementById('btn-settings').click();document.getElementById('cli-settings').scrollIntoView({block:'center'});document.getElementById('cli-detect').click()")
  await wait("document.querySelectorAll('#cli-list input[type=checkbox]').length===2 && !document.getElementById('cli-detect').disabled")
  await run("for(const row of document.querySelectorAll('#cli-list .cli-resource')){const input=row.querySelector('input');const wanted=row.textContent.includes('GitHub CLI');if(input.checked!==wanted)input.click()}")
  await run("document.getElementById('cli-grant').click()")
  await wait("!document.getElementById('browser-confirm-modal').classList.contains('hidden')")
  await screenshot('cli-grant-confirm-en')
  await language('zh'); await screenshot('cli-grant-confirm-zh'); await language('en')
  await run("document.getElementById('browser-confirm-yes').click()")
  await wait("document.getElementById('cli-message').textContent.includes('Access updated')")
  const saved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'))
  assert.equal(saved.cliResources.github, true); assert.equal(saved.cliResources.taptap, false)
  info.checks.uiConfirmedGrantPersisted = true
  const list = await tool('cli_list_resources', {})
  assert.deepEqual(list.body.result.resources.map(r => r.id), ['github'])
  const read = await tool('cli_call', { resource: 'github', args: ['repo', 'view', 'reymondmeking-dot/dsh-office'] })
  assert.equal(read.status, 200); assert.equal(read.body.result.ok, true)
  assert.equal(read.body.result.data.nameWithOwner, 'reymondmeking-dot/dsh-office')
  info.publicRepository = { name: read.body.result.data.nameWithOwner, url: read.body.result.data.url }
  info.checks.realPublicRepositoryRead = true
  assert.equal((await tool('cli_call', { resource: 'taptap', args: ['overview'] })).status, 400)
  info.checks.unselectedTapTapDenied = true
  assert.equal((await tool('cli_call', { resource: 'github', args: ['auth', 'token'] })).status, 400)
  info.checks.authTokenCommandDenied = true
  for (const [width, height] of [[1500, 960], [1280, 800]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    for (const lang of ['en', 'zh']) {
      await language(lang)
      await run("document.getElementById('cli-settings').scrollIntoView({block:'center'});for(const el of document.querySelectorAll('#cli-list details'))el.open=true")
      await screenshot(`${lang}-${width}x${height}-cli-resources`)
      await run("document.getElementById('set-about').click()")
      const about = await run("return {version:document.querySelector('.about-version').textContent,links:[...document.querySelectorAll('#about-modal [data-office-link]')].map(a=>a.href)}")
      assert.match(about.version, /1\.4\.0/)
      assert.deepEqual(about.links, ['https://github.com/reymondmeking-dot/dsh-office', 'https://planto-ai.com/'])
      info.checks.aboutVersionAndLinks = true
      await screenshot(`${lang}-${width}x${height}-about`)
      await run("document.querySelector('[data-close=about-modal]').click()")
    }
  }
  await language('en')
  await run("for(const input of document.querySelectorAll('#cli-list input[type=checkbox]'))if(input.checked)input.click();document.getElementById('cli-grant').click()")
  await wait("!document.getElementById('browser-confirm-modal').classList.contains('hidden')")
  await run("document.getElementById('browser-confirm-yes').click()")
  await wait("document.getElementById('cli-message').textContent.includes('Access updated')")
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8')).cliResources.github, false)
  assert.equal((await tool('cli_call', { resource: 'github', args: ['repo', 'view', 'reymondmeking-dot/dsh-office'] })).status, 400)
  info.checks.revocationAppliesImmediately = true
  info.checks.noCredentialContentsReadByTest = true
  info.passed = true
  log('PASS ' + JSON.stringify(info.checks))
} catch (error) { info.error = error.message; log('FAIL ' + error.message); process.exitCode = 1 }
finally {
  info.finishedAt = new Date().toISOString()
  fs.writeFileSync(path.join(base, 'evidence.json'), JSON.stringify(info, null, 2))
  fs.writeFileSync(path.join(root, 'tmp', 'cli-e2e-latest.json'), JSON.stringify(info, null, 2))
  if (run) { try { await run('office.win.close()') } catch {} }
  for (const socket of connections) socket.close()
  await sleep(1500)
  if (child.exitCode === null) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
  log('evidence ' + path.join(base, 'evidence.json'))
}
