// Evaluate JS in the running DSH Office renderer via CDP (app launched with --remote-debugging-port=9333).
const expr = process.argv[2]
const list = await (await fetch('http://127.0.0.1:9333/json')).json()
const page = list.find(p => p.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let id = 0
const call = (method, params) => new Promise(res => {
  const i = ++id
  const h = ev => { const m = JSON.parse(ev.data); if (m.id === i) { ws.removeEventListener('message', h); res(m) } }
  ws.addEventListener('message', h)
  ws.send(JSON.stringify({ id: i, method, params }))
})
const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 1))
ws.close()
