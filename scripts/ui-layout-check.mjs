// Isolated, headless layout evidence. No provider calls or credential reads.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import net from 'node:net'
const root = path.resolve(import.meta.dirname, '..'), phase = process.argv[2] || 'after'
const capture = !process.argv.includes('--no-shots')
const officeOnly = process.argv.includes('--office-only')
const stageOnly = process.argv.includes('--stage-only') || officeOnly
const base = path.join(root, 'tmp', 'layout-refresh-' + Date.now()), profile = path.join(base, 'profile'), workspace = path.join(base, 'workspace')
const out = path.join(root, 'tmp', 'ui-layout', phase)
const freePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)) }) })
const port = await freePort(), inspectPort = await freePort()
for (const dir of [profile, workspace, out, path.join(base, 'dsh-home'), path.join(base, 'codex-home')]) fs.mkdirSync(dir, { recursive: true })
for (const [id, title] of [['research', '公开资料研究 · Public source research'], ['design', '界面排版与交互 · Interface layout']]) {
  const dir = path.join(workspace, 'projects', id)
  fs.mkdirSync(path.join(dir, '.office', 'conversations'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.office', 'project.json'), JSON.stringify({ id, title, dir, rel: 'projects/' + id, status: 'done', kind: 'workspace', phase: '已完成', createdAt: Date.now(), team: [], reports: [], summary: 'A local layout fixture. No model calls.' }))
  fs.writeFileSync(path.join(dir, 'notes.md'), '# Research notes\n\nA local **layout fixture**, with source links.\n\n- Independent conversations\n- Files stay inside the project\n\n[Electron documentation](https://www.electronjs.org/docs/latest/)\n')
  fs.writeFileSync(path.join(dir, '.office', 'conversations', 'default.json'), JSON.stringify({ id: 'default', title: '默认对话 · Default conversation', createdAt: Date.now(), updatedAt: Date.now(), sourceProjectIds: [] }))
}
const fruits = ['orange', 'grape', 'apple', 'cherry', 'peach', 'lemon', 'strawberry', 'watermelon', 'banana', 'pear']
const models = Array.from({ length: 24 }, (_, i) => ({ key: 'fixture-' + i, name: 'Layout model ' + (i + 1), model: 'fixture', engine: 'codex', provider: 'codex', fruit: fruits[i % fruits.length], contextWindow: 200000, maxTokens: 8192, efforts: ['low', 'medium', 'high'] }))
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ workspace, models, defaultModel: models[0].key, providers: {}, cliResources: {}, cliCustom: [], plugins: {}, autopilot: { resume: false } }))
const child = spawn(path.join(root, 'dist', 'DSH Office', 'DSH Office.exe'), [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, `--inspect=${inspectPort}`], { windowsHide: true, stdio: 'ignore', env: { ...process.env, DSH_OFFICE_HEADLESS: '1', DSH_HOME: path.join(base, 'dsh-home'), CODEX_HOME: path.join(base, 'codex-home') } })
const sleep = ms => new Promise(r => setTimeout(r, ms)); let ws, serial = 0
const checks = [], errors = []
let passed = false
function cdp(method, params = {}) { return new Promise((resolve, reject) => { const id = ++serial, timer = setTimeout(() => { ws.removeEventListener('message', on); reject(Error(method + ' timeout')) }, 30000); const on = e => { const m = JSON.parse(e.data); if (m.id !== id) return; clearTimeout(timer); ws.removeEventListener('message', on); m.error ? reject(Error(m.error.message)) : resolve(m.result) }; ws.addEventListener('message', on); ws.send(JSON.stringify({ id, method, params })) }) }
async function ev(expression) { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value }
async function shot(name) { if (!capture) return; await sleep(300); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.data, 'base64')) }
const close = () => ev("window.OfficeMenus?.closeAll(); document.querySelectorAll('.modal').forEach(x=>x.classList.add('hidden'));true")
async function check(name, width, height) {
  const geometry = await ev(`({page:document.documentElement.scrollWidth, bar:document.querySelector('#titlebar').scrollWidth, sheets:[...document.querySelectorAll('.modal:not(.hidden) > .sheet')].map(x=>({id:x.parentElement.id,rect:x.getBoundingClientRect().toJSON(),client:x.clientWidth,scroll:x.scrollWidth})),nav:document.querySelector('.workspace-nav').getBoundingClientRect().toJSON(),controls:document.querySelector('.office-controls').getBoundingClientRect().toJSON()})`)
  assert.equal(geometry.page, width); assert.equal(geometry.bar, width)
  assert.ok(geometry.nav.right <= geometry.controls.left + 1)
  for (const s of geometry.sheets) { assert.ok(s.rect.x >= 0 && s.rect.right <= width + 1 && s.rect.y >= 0 && s.rect.bottom <= height + 1, s.id + ' stays in viewport'); assert.ok(s.scroll <= s.client + 1, s.id + ' does not overflow horizontally') }
  checks.push({ name, width, height, geometry }); await shot(name)
}
try {
  let target
  for (let i = 0; i < 90 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.url.endsWith('/renderer/index.html')) } catch {} if (!target) await sleep(250) }
  assert.ok(target); ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }))
  assert.equal(await ev('office.init().then(x=>x.settings.workspace)'), workspace)
  const inspector = (await (await fetch(`http://127.0.0.1:${inspectPort}/json`)).json())[0], mainSocket = new WebSocket(inspector.webSocketDebuggerUrl)
  await new Promise(r => mainSocket.addEventListener('open', r, { once: true }))
  const savedSocket = ws; ws = mainSocket
  await ev("process.mainModule.require('electron').BrowserWindow.getAllWindows().forEach(w=>w.webContents.setBackgroundThrottling(false))")
  assert.ok((await ev("process.mainModule.require('electron').BrowserWindow.getAllWindows().map(w=>w.isVisible())")).every(x=>!x))
  ws = savedSocket; mainSocket.close()
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text) })
  await cdp('Runtime.enable'); await sleep(1200)
  for (const [width, height] of [[1280, 800], [1500, 960]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    for (const lang of ['zh', 'en']) {
      if (await ev('I18N.getLang()') !== lang) await ev("document.querySelector('#btn-lang').click()")
      const prefix = `${lang}-${width}`; await close(); await check(prefix + '-office', width, height)
      if (stageOnly) {
        const stage = await ev("({background:getComputedStyle(document.querySelector('#stage')).backgroundColor,image:getComputedStyle(document.querySelector('#stage')).backgroundImage,shadow:getComputedStyle(document.querySelector('#office')).boxShadow,office:document.querySelector('#office').getBoundingClientRect().toJSON(),stage:document.querySelector('#stage').getBoundingClientRect().toJSON()})")
        assert.equal(stage.background, 'rgb(244, 246, 249)'); assert.equal(stage.image, 'none'); assert.equal(stage.shadow, 'none')
        assert.ok(stage.office.x >= -1 && stage.office.right <= width + 1 && stage.office.y >= stage.stage.y - 1 && stage.office.bottom <= height + 1)
        assert.ok(Math.min(stage.stage.width - stage.office.width, stage.stage.height - stage.office.height) < 1, 'office uses the full available width or height')
        assert.ok(Math.abs(stage.office.width / stage.office.height - 400 / 232) < .001, 'office keeps its aspect ratio')
        await ev("Office.handlers.say({id:'ceo',text:'Layout verification · 界面验证：说话气泡保持完整，不被标题栏遮住。',ms:5000})")
        await sleep(100)
        const bubbleTops = await ev("[...document.querySelectorAll('#bubbles .bubble')].filter(x=>x.style.display!=='none' && x.offsetHeight).map(x=>x.getBoundingClientRect().top)")
        assert.ok(bubbleTops.length > 0, 'speech fixture is visible')
        assert.ok(bubbleTops.every(top => top >= stage.stage.y), 'speech stays below the title bar')
        if (officeOnly) continue
        await ev("document.querySelector('#btn-work-mode').click()"); await check(prefix + '-work-mode', width, height); await ev('OfficeMenus.closeAll()')
        await ev("document.querySelector('#btn-settings').click()"); await sleep(250); await check(prefix + '-settings', width, height); await close(); continue
      }
      await ev("document.querySelector('#btn-settings').click()"); await sleep(250); await check(prefix + '-settings', width, height)
      if (phase !== 'before') {
        for (const section of ['cli-settings', 'env-settings', 'browser-settings']) { await ev(`document.querySelector('[data-setting-jump="${section}"]').click()`); await check(prefix + '-settings-' + section, width, height) }
        assert.equal(await ev("[...document.querySelectorAll('#settings-modal .settings-body > .group')].filter(x=>!x.classList.contains('hidden')).length"), 1)
      }
      await close(); await ev("document.querySelector('#btn-ext').click()"); await sleep(250)
      for (const tab of ['plugins', 'mcp', 'skills', 'experts']) { await ev(`document.querySelector('[data-ext-tab=${tab}]').click()`); await check(prefix + '-extensions-' + tab, width, height) }
      await close(); await ev("OfficeProjects.open('research')"); await check(prefix + '-project', width, height)
      if (phase !== 'before') {
        await ev("document.querySelector('#project-more').click()"); assert.equal(await ev("document.querySelector('#project-more').getAttribute('aria-expanded')"), 'true'); await shot(prefix + '-project-more')
        await ev("document.querySelector('#project-more').focus()")
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown' }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown' })
        assert.equal(await ev("document.querySelector('#project-more').getAttribute('aria-expanded')"), 'true')
        assert.equal(await ev('document.activeElement.id'), 'project-reveal')
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
        assert.equal(await ev("document.querySelector('#project-modal').classList.contains('hidden')"), false)
        assert.equal(await ev('document.activeElement.id'), 'project-more')
        assert.equal(await ev("document.querySelector('#project-more').getAttribute('aria-expanded')"), 'false')
      }
      await close(); await ev("document.dispatchEvent(new CustomEvent('office:open-project-chat',{detail:{id:'research',conversationId:'default'}}))"); await sleep(400); await check(prefix + '-chat', width, height)
      await close(); await ev("document.querySelector('#btn-browser').click()"); await sleep(300); await check(prefix + '-browser', width, height)
      await close()
      if (phase !== 'before') { await ev("document.querySelector('#btn-more').click()"); await check(prefix + '-more', width, height); await ev("OfficeMenus.closeAll();document.querySelector('#btn-work-mode').click()"); assert.equal(await ev("document.querySelector('#fruits').children.length"), 24); await check(prefix + '-work-mode', width, height); await ev('OfficeMenus.closeAll()') }
    }
  }
  if (phase !== 'before') assert.deepEqual(errors, [])
  passed = true; console.log('PASS', phase, checks.length, 'layout states', out)
} catch (error) { errors.push(error.stack); throw error }
finally { ws?.close(); if (child.exitCode === null) child.kill(); fs.writeFileSync(path.join(base, 'result.json'), JSON.stringify({ passed, phase, out, screenshotsCaptured: capture, checks, errors }, null, 2)); console.log('EVIDENCE', base) }
