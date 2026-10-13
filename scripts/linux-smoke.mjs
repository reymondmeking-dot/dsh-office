// Headless smoke test for the Linux build, run INSIDE the container against
// the app launched with --remote-debugging-port=9333. Node 24 globals only.
import { writeFileSync } from 'node:fs'

const base = 'http://127.0.0.1:9333'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function listPages() {
  const res = await fetch(`${base}/json`).then(r => r.json()).catch(() => null)
  return Array.isArray(res) ? res.filter(p => p.type === 'page') : null
}

let pages = null
for (let i = 0; i < 60; i++) {
  pages = await listPages()
  if (pages?.length) break
  await sleep(1000)
}
if (!pages?.length) { console.error('FAIL: no CDP page after 60s'); process.exit(1) }

const ws = new WebSocket(pages[0].webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
let id = 0
const call = (method, params = {}) => new Promise(res => {
  const i = ++id
  const h = ev => { const m = JSON.parse(ev.data); if (m.id === i) { ws.removeEventListener('message', h); res(m) } }
  ws.addEventListener('message', h)
  ws.send(JSON.stringify({ id: i, method, params }))
})
const evalJs = async expression => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 20000 })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text))
  return r.result?.result?.value
}

const result = {}
result.title = await evalJs('document.title')
result.bodyClass = await evalJs('document.body.className')
result.hasOfficeApi = await evalJs('typeof window.office?.scanAgents === "function"')
result.canvasSize = await evalJs(`(() => { const c = document.querySelector('#office'); return c ? [c.width, c.height] : null })()`)
// End-to-end: the multi-agent scanner runs inside the real renderer/main bridge.
result.scan = await evalJs(`window.office.scanAgents().then(r => ({
  records: r.records.length,
  sources: r.sources.map(s => [s.id, s.count]),
  noLeak: !JSON.stringify(r.records).includes('"keyValue"'),
}))`)
// Settings sheet + import modal exist in the DOM.
result.domHooks = await evalJs(`({
  importBtn: !!document.querySelector('#set-import'),
  providerModal: !!document.querySelector('#prov-modal'),
  importModal: !!document.querySelector('#imp-modal'),
  fetchApply: !!document.querySelector('#pv-fetch-apply'),
})`)
// Open settings then the import modal; screenshot both states.
await evalJs(`document.querySelector('#btn-settings, [data-open="settings-modal"]')?.click()`)
await sleep(600)
await evalJs(`document.querySelector('#set-import')?.click()`)
await sleep(1500)
result.importSummary = await evalJs(`document.querySelector('#imp-summary')?.textContent || ''`)
const shot = await call('Page.captureScreenshot', { format: 'png' })
if (shot.result?.data) writeFileSync('/workspace/tmp/linux-smoke.png', Buffer.from(shot.result.data, 'base64'))

console.log(JSON.stringify(result, null, 2))
const ok = result.title && result.hasOfficeApi && result.canvasSize && result.scan?.records >= 0 && result.domHooks.importModal
ws.close()
process.exit(ok ? 0 : 2)
