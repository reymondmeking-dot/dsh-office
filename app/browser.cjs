'use strict'
// Electron's own Chromium is the only browser engine. Nothing from a remote
// page receives a preload, Node, privileged IPC, the bridge token or the vault.
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const { app, BrowserWindow, WebContentsView, session, safeStorage, shell, clipboard, nativeImage } = require('electron')
const { Vault } = require('./vault.cjs')
const P = require('./browser-policy.cjs')
const I = require('./renderer/i18n.js')
const L = (zh, en) => I.getLang() === 'en' ? en : zh
const WORLD = 1004
const serialize = x => JSON.stringify(x).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
const sleep = ms => new Promise(r => setTimeout(r, ms))
class BrowserService {
  constructor({ getWindow, getSettings, emit = () => {}, log = () => {}, userData, cliTool, envSecrets }) {
    Object.assign(this, { getWindow, getSettings, emit, log, userData, cliTool, envSecrets })
    this.tabs = new Map(); this.contexts = new Map(); this.pending = new Map(); this.downloads = []
    this.activeId = ''; this.visible = false; this.bounds = { x: 20, y: 180, width: 1200, height: 580 }
    this.vault = new Vault(path.join(userData, 'vault.json'), safeStorage)
    this.token = crypto.randomBytes(32).toString('hex'); this.previewTokens = new Map(); this.attached = null
    this.sessions = new WeakSet()
    this.timer = setInterval(() => this.maintenance(), 800); this.timer.unref()
  }
  config() { return P.policy(this.getSettings().browser) }
  workspace() { return this.getSettings().workspace }
  async start() {
    this.pdfContentsHandler=(_event,contents)=>{
      if(contents.getType()!=='remote')return
      if([...this.tabs.values()].some(t=>t.file&&/\.pdf$/i.test(t.file)&&t.view.webContents.session===contents.session)) contents.setBackgroundThrottling(false)
    }
    app.on('web-contents-created',this.pdfContentsHandler)
    this.hiddenHost = new BrowserWindow({ show: false, width: 1240, height: 820, skipTaskbar: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
    this.hiddenHost.setMenu(null)
    await this.hiddenHost.loadURL('about:blank')
    this.server = http.createServer((req, res) => this.request(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end() }))
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', resolve) })
    this.url = 'http://127.0.0.1:' + this.server.address().port
    return { url: this.url, token: this.token }
  }
  async request(req, res) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff')
    // File previews use a separate unguessable capability, never the MCP token.
    const url = new URL(req.url, 'http://127.0.0.1')
    if (req.method === 'GET' && url.pathname.startsWith('/preview/')) return this.preview(req, res, url)
    if (req.headers.authorization !== 'Bearer ' + this.token || req.headers.origin || req.headers['sec-fetch-site'] === 'cross-site') { res.writeHead(403); return res.end() }
    if (req.method !== 'POST' || !['/tool', '/release', '/cli-tool'].includes(url.pathname)) { res.writeHead(404); return res.end() }
    const chunks = []; let size = 0
    for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) { res.writeHead(413); res.end(); return } chunks.push(chunk) }
    try {
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (typeof input.contextId !== 'string' || !input.contextId || input.contextId.length > 240) throw new Error('Invalid browser context')
      const result = url.pathname === '/release' ? this.release(input.contextId) : url.pathname === '/cli-tool' ? await this.sanitize(await this.callCli(input)) : await this.tool(input.name, input.args || {}, input.contextId, input.projectDir, input.owner)
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ result }))
    } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: (await this.sanitize(this.cleanError(e))).slice(0,500) })) }
  }
  async callCli(input) {
    if (typeof this.cliTool !== 'function') throw new Error(L('本机 CLI 资源不可用', 'Local CLI resources are unavailable'))
    return this.cliTool(input.name, input.args || {}, { contextId: input.contextId, projectDir: input.projectDir, owner: input.owner })
  }
  cleanError(e) {
    let msg = String(e?.message || 'Browser operation failed')
    for (const t of this.tabs.values()) for (const secret of t.secrets) if (secret) msg = msg.split(secret).join('[redacted]')
    return msg.replace(/Bearer\s+\S+/ig, 'Bearer [redacted]')
  }
  preview(req, res, url) {
    try {
      const parts = url.pathname.split('/'), permit = this.previewTokens.get(parts[2])
      if (!permit) { res.writeHead(403); return res.end() }
      const relative = decodeURIComponent(parts.slice(3).join('/'))
      const file = P.workspacePath(this.workspace(), relative)
      if (!P.within(permit.root, file) || /(^|[\\/])(vault[^\\/]*\.json|\.credentials[^\\/]*|\.env[^\\/]*|auth\.json)$/i.test(file)) { res.writeHead(403); return res.end() }
      if (!fs.statSync(file).isFile() || fs.statSync(file).size > 50 * 1024 * 1024) { res.writeHead(413); return res.end() }
      const ext = path.extname(file).toLowerCase(), mime = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' }[ext] || 'text/plain; charset=utf-8'
      res.setHeader('Content-Type', mime)
      // Preview documents have no external network, frames, plugins or forms.
      // PDF is exempt from sandbox CSP for Chromium's built-in viewer.
      if (ext !== '.pdf') res.setHeader('Content-Security-Policy', "sandbox allow-scripts; default-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'")
      fs.createReadStream(file).pipe(res)
    } catch { res.writeHead(403); res.end() }
  }
  state() {
    return { tabs: [...this.tabs.values()].map(t => ({ id: t.id, title: t.title || L('新标签页', 'New tab'), url: t.file ? t.file : t.view.webContents.getURL(), loading: t.loading, canGoBack: t.view.webContents.navigationHistory.canGoBack(), canGoForward: t.view.webContents.navigationHistory.canGoForward(), owner: t.ownerLabel || t.owner, readOnly: !!t.owner && !t.takeover, file: t.file || '' })), activeId: this.activeId, visible: this.visible, downloads: this.downloads.slice(-12), pending: [...this.pending.values()].map(({ id, kind, origin, contextId }) => ({ id, kind, origin, contextId })), vaultAvailable: this.vault.available() }
  }
  changed() { this.emit('browser-state', { state: this.state() }) }
  attach() {
    const win = this.getWindow()
    if (this.attached && win && !win.isDestroyed()) { try { win.contentView.removeChildView(this.attached); this.hiddenHost.contentView.addChildView(this.attached); this.attached.setBounds({x:0,y:0,width:1200,height:760}) } catch {} this.attached = null }
    const t = this.tabs.get(this.activeId)
    if (!this.visible || !t || !win || win.isDestroyed()) return
    try { this.hiddenHost.contentView.removeChildView(t.view) } catch {}
    win.contentView.addChildView(t.view); this.attached = t.view; t.view.setBounds(this.bounds)
    // Prevent input in employee tabs while the user observes the same session.
    t.view.webContents.setIgnoreMenuShortcuts(true)
    this.setReadOnly(t)
  }
  setReadOnly(t) {
    if (t.view.webContents.isDestroyed()) return
    try { if (!t.view.webContents.debugger.isAttached()) t.view.webContents.debugger.attach('1.3'); t.view.webContents.debugger.sendCommand('Input.setIgnoreInputEvents',{ignore:!!t.owner&&!t.takeover}).catch(()=>{}) } catch {}
    this.js(t, `globalThis.__officeReadOnly=${!!t.owner && !t.takeover}; if(!globalThis.__officeInputGate){globalThis.__officeInputGate=true;for(const name of ['pointerdown','mousedown','click','keydown','input','wheel'])document.addEventListener(name,e=>{if(globalThis.__officeReadOnly&&!globalThis.__officeCoordinateAction&&e.isTrusted){e.preventDefault();e.stopImmediatePropagation()}},true)}`).catch(() => {})
  }
  async allowed(url, tab) {
    if (url === 'about:blank') return url
    if (tab.file && this.url && url.startsWith(this.url + '/preview/' + tab.previewToken + '/')) return url
    return P.assertURL(url, this.config())
  }
  newTab(owner = '', projectDir = '') {
    if (this.tabs.size >= 30) throw new Error(L('标签页上限为 30', 'The tab limit is 30'))
    const id = crypto.randomUUID(), partition = owner ? 'office-agent-' + id : 'persist:office-browser'
    const ses = session.fromPartition(partition)
    const view = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, backgroundThrottling: false, spellcheck: false, plugins: true, disableDialogs: true } })
    view.setBounds({ x: 0, y: 0, width: 1200, height: 760 })
    const t = { id, view, owner, projectDir, title: '', loading: false, takeover: false, refs: 0, secrets: new Set(), createdAt: Date.now(), pages: 0, partition }
    this.hiddenHost.contentView.addChildView(view)
    this.tabs.set(id, t); if (!owner || !this.activeId) this.activeId = id
    ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false)); ses.setPermissionCheckHandler(() => false)
    ses.webRequest.onBeforeRequest((details, cb) => {
      const entry = this.tabs.get([...this.tabs.keys()].find(k => this.tabs.get(k).view.webContents.id === details.webContentsId)) || t
      if (entry.file && /\.pdf$/i.test(entry.file) && /^(chrome:\/\/resources\/|chrome:\/\/pdf\/|chrome-untrusted:\/\/pdf\/)/.test(details.url)) return cb({cancel:false})
      if (/^(data:|blob:|chrome-extension:)/.test(details.url)) return cb({ cancel: false })
      this.allowed(details.url, entry).then(async () => {
        if (entry.owner && details.resourceType === 'mainFrame' && !details.url.startsWith('about:')) {
          if (Date.now() - entry.createdAt > this.config().maxTaskMs || entry.pages >= this.config().maxPages) return cb({ cancel: true })
          entry.pages++
        }
        if (!this.config().allowPrivate && /^https?:/.test(details.url) && !entry.file) {
          try {
            const resolved = await ses.resolveHost(new URL(details.url).hostname)
            if (!resolved.endpoints?.length || resolved.endpoints.some(endpoint => P.privateAddress(endpoint.address))) return cb({ cancel: true })
          } catch { return cb({ cancel: true }) }
        }
        cb({ cancel: false })
      }, () => {if(process.env.DSH_OFFICE_BROWSER_DEBUG==='1'){try{const u=new URL(details.url);this.log('browser denied '+u.protocol+'//'+u.hostname)}catch{}}cb({ cancel: true })})
    })
    // Chromium's persistent user session has one request listener; resolve each
    // request by WebContents id rather than capturing the most recent user tab.
    if (!this.sessions.has(ses)) { this.sessions.add(ses); ses.on('will-download', (_event, item, contents) => this.download(item, contents)) }
    const wc = view.webContents
    wc.setWindowOpenHandler(({ url }) => { this.navigate(t, url).catch(() => {}); return { action: 'deny' } })
    wc.on('will-navigate', (event, url) => { if (t.file && !url.startsWith(this.url + '/preview/' + t.previewToken + '/')) event.preventDefault() })
    wc.on('did-start-loading', () => { t.loading = true; this.changed() })
    wc.on('did-stop-loading', () => { t.loading = false; this.changed() })
    wc.on('page-title-updated', (_e, title) => { t.title = title; this.changed() })
    wc.on('did-navigate', () => { t.refs++; this.changed() })
    wc.on('did-navigate-in-page', () => { t.refs++; this.changed() })
    wc.on('did-finish-load', () => { this.installCapture(t).catch(() => {}); this.setReadOnly(t); this.changed() })
    wc.on('before-input-event', (event) => { if (t.owner && !t.takeover) event.preventDefault() })
    this.attach(); this.changed(); return t
  }
  async download(item, contents) {
    const t = [...this.tabs.values()].find(x => x.view.webContents === contents)
    if (!t) { item.cancel(); return }
    try {
      const dir = P.workspacePath(this.workspace(), 'downloads', { create: true }); fs.mkdirSync(dir, { recursive: true })
      const base = path.basename(item.getFilename()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'download'
      let file = path.join(dir, base), n = 1
      while (fs.existsSync(file)) file = path.join(dir, `${path.parse(base).name}-${n++}${path.extname(base)}`)
      file = P.workspacePath(this.workspace(), file, { create: true }); item.setSavePath(file)
      const record = { name: path.basename(file), path: file, state: 'progressing' }; this.downloads.push(record); this.changed()
      item.once('done', (_e, state) => { record.state = state; this.changed() })
    } catch { item.cancel() }
  }
  tab(id) { const t = this.tabs.get(id || this.activeId); if (!t) throw new Error(L('没有可用标签页', 'No browser tab is available')); return t }
  async navigate(t, input) {
    const url = await this.allowed(P.addressURL(input, this.config()), t)
    if (t.owner) {
      const p = this.config()
      if (t.pages >= p.maxPages) throw new Error(L('此任务已达到页面数上限', 'This task has reached its page limit'))
      if (Date.now() - t.createdAt > p.maxTaskMs) throw new Error(L('此浏览任务已超时', 'This browsing task has timed out'))
    }
    t.refs++; t.loading = true; this.changed()
    try { await Promise.race([t.view.webContents.loadURL(url), new Promise((_, reject) => setTimeout(() => reject(new Error(L('页面加载超时', 'Page load timed out'))), 45000))]) }
    finally { t.loading = false; this.changed() }
    return t
  }
  async js(t, code) { return t.view.webContents.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `(async()=>{${code}})()` }], true) }
  close(id) {
    const t = this.tabs.get(id); if (!t) return true
    if (this.attached === t.view) { try { this.getWindow()?.contentView.removeChildView(t.view) } catch {} this.attached = null }
    for (const [key, v] of this.pending) if (v.tabId === id) this.pending.delete(key)
    if (t.previewToken) this.previewTokens.delete(t.previewToken)
    this.tabs.delete(id); if (this.activeId === id) this.activeId = [...this.tabs.keys()].at(-1) || ''
    try { this.hiddenHost.contentView.removeChildView(t.view) } catch {}
    try { t.view.webContents.close({ waitForBeforeUnload: false }) } catch {}
    if (t.owner) session.fromPartition(t.partition).clearStorageData().catch(() => {})
    this.attach(); this.changed(); return true
  }
  release(contextId) { const id = this.contexts.get(contextId), t = this.tabs.get(id); if(t?.takeover){t.owner='';t.ownerLabel='';this.changed()}else if(id)this.close(id);this.contexts.delete(contextId);return true }
  stop() { if(this.stopped)return;this.stopped=true;if(this.pdfContentsHandler)app.removeListener('web-contents-created',this.pdfContentsHandler);clearInterval(this.timer); for (const id of [...this.tabs.keys()]) this.close(id); this.server?.close(); if(this.hiddenHost&&!this.hiddenHost.isDestroyed())this.hiddenHost.destroy() }
  captureCredential(t, c, origin) {
    if (!c?.password || c.origin !== origin || typeof c.password !== 'string' || c.password.length > 20000) return
    t.secrets.add(c.password)
    try { const old = this.vault.available() && this.vault.get(null, origin); if (old && old.username === c.username && old.password === c.password) return } catch {}
    for (const p of this.pending.values()) if (p.kind === 'save' && p.tabId === t.id) this.pending.delete(p.id)
    const id = crypto.randomUUID()
    this.pending.set(id, { id, kind: 'save', origin, contextId: t.owner, tabId: t.id, credential: { origin, username: String(c.username || '').slice(0, 1000), password: c.password }, createdAt: Date.now() })
    this.emit('browser-prompt', { id, kind: 'save', origin, contextId: t.owner }); this.changed()
  }
  async installCapture(t) {
    if (t.file || !/^https?:/.test(t.view.webContents.getURL())) return
    const wc = t.view.webContents, origin = new URL(wc.getURL()).origin
    // A CDP binding in an isolated world delivers the submit event before a
    // navigation destroys the document. It is not exposed in the page world.
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
    if (!t.bindingHandler) {
      t.bindingName = '__officeCapture' + crypto.randomBytes(10).toString('hex')
      t.captureWorlds = new Map()
      t.bindingHandler = (_event, method, params) => {
        if (method !== 'Runtime.bindingCalled' || params.name !== t.bindingName || !t.captureWorlds.has(params.executionContextId)) return
        try { this.captureCredential(t, JSON.parse(params.payload), t.captureWorlds.get(params.executionContextId)) } catch {}
      }
      wc.debugger.on('message', t.bindingHandler)
    }
    const { frameTree } = await wc.debugger.sendCommand('Page.getFrameTree')
    const { executionContextId } = await wc.debugger.sendCommand('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'office-credential-capture' })
    t.captureWorlds.clear(); t.captureWorlds.set(executionContextId, origin)
    await wc.debugger.sendCommand('Runtime.addBinding', { name: t.bindingName, executionContextId })
    await wc.debugger.sendCommand('Runtime.evaluate', { contextId: executionContextId, expression: `
      if(!globalThis.__officeCaptureInstalled){
        globalThis.__officeCaptureInstalled=true;
        document.addEventListener('submit',e=>{
          const f=e.target,pass=f.querySelector('input[type=password]');if(!pass||!pass.value)return;
          const user=f.querySelector('input[autocomplete=username],input[type=email],input[name*=user i],input[name*=login i],input[type=text]');
          globalThis[${serialize(t.bindingName)}](JSON.stringify({origin:location.origin,username:user?.value||'',password:pass.value}))
        },true)
      }
    ` })
  }
  async maintenance() {
    for (const t of this.tabs.values()) {
      if (t.owner && !t.takeover && Date.now() - t.createdAt > this.config().maxTaskMs) { this.release(t.owner); continue }
    }
    for (const [id, p] of this.pending) if (Date.now() - p.createdAt > 120000) { this.pending.delete(id); this.changed() }
  }
  requestLogin(t, origin, entryId) {
    const current = new URL(t.view.webContents.getURL()).origin
    const wanted = new URL(origin || current).origin
    if (wanted !== current) throw new Error(L('登录请求与当前站点不匹配', 'Login request does not match the current site'))
    const entry = this.vault.get(entryId, current)
    if (!entry) throw new Error(L('此站点没有已保存凭据', 'No saved credentials exist for this site'))
    const id = crypto.randomUUID()
    this.pending.set(id, { id, kind: 'login', origin: current, contextId: t.owner, tabId: t.id, entryId: entry.id, createdAt: Date.now() })
    this.emit('browser-prompt', { id, kind: 'login', origin: current, contextId: t.owner }); this.changed()
    return { status: 'pending_user_confirmation', origin: current, message: L('等待用户在办公室界面确认；不会返回凭据', 'Waiting for confirmation in the Office UI; credentials are never returned') }
  }
  async fill(t, origin, entryId) {
    const current = new URL(t.view.webContents.getURL()).origin
    if (current !== origin) throw new Error(L('站点已变更，请重新请求登录', 'The site changed; request login again'))
    const e = this.vault.get(entryId, current)
    if (!e) throw new Error(L('凭据不存在', 'Credentials are unavailable'))
    t.secrets.add(e.password)
    const ok = await this.js(t, `
      if(location.origin!==${serialize(current)})return false;
      const pass=document.querySelector('input[type=password]');if(!pass)return false;
      const f=pass.form||document;
      const user=f.querySelector('input[autocomplete=username],input[type=email],input[name*=user i],input[name*=login i],input[type=text]');
      const fill=(el,value)=>{if(!el)return;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};
      fill(user,${serialize(e.username)});fill(pass,${serialize(e.password)});return true
    `)
    if (!ok) throw new Error(L('当前页面没有可填充的登录表单', 'No login form is available on this page'))
    return { filled: true, origin }
  }
  async confirm(id, allow) {
    const p = this.pending.get(id); if (!p) throw new Error(L('请求已过期', 'This request expired'))
    this.pending.delete(id); this.changed()
    if (!allow) return { accepted: false }
    const t = this.tab(p.tabId)
    if (p.kind === 'save') { this.vault.save(p.credential); p.credential.password = ''; return { saved: true, origin: p.origin } }
    return this.fill(t, p.origin, p.entryId)
  }
  async file(input) {
    const file = P.workspacePath(this.workspace(), input), stat = fs.statSync(file)
    if (!stat.isFile()) throw new Error(L('请选择文件', 'Select a file'))
    if (stat.size > 50 * 1024 * 1024) throw new Error(L('预览文件不能超过 50 MB', 'Preview files must be below 50 MB'))
    const name = path.basename(file), ext = path.extname(file).toLowerCase()
    if (/\.(md|markdown|txt|js|mjs|cjs|ts|tsx|jsx|json|css|csv|log|py|yaml|yml|toml|xml|sh|ps1|sql|go|rs|c|h|cpp|java)$/i.test(ext)) {
      if (stat.size > 2 * 1024 * 1024) throw new Error(L('文本预览不能超过 2 MB', 'Text previews must be below 2 MB'))
      return { kind: /\.(md|markdown)$/.test(ext) ? 'markdown' : 'text', path: file, name, content: fs.readFileSync(file, 'utf8') }
    }
    if (!/\.(html?|pdf|png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(ext)) throw new Error(L('此文件格式暂不支持内置预览', 'This file type is not supported for built-in preview'))
    const t = this.newTab(); t.file = file; t.title = name; t.previewToken = crypto.randomBytes(24).toString('hex'); this.previewTokens.set(t.previewToken, { tabId: t.id, root: path.dirname(file) })
    const relative = path.relative(fs.realpathSync(this.workspace()), file).split(path.sep).map(encodeURIComponent).join('/')
    await t.view.webContents.loadURL(this.url + '/preview/' + t.previewToken + '/' + relative)
    this.changed(); return { kind: 'view', path: file, name, tabId: t.id }
  }
  async ui(action, args = {}) {
    if (action === 'state') return this.state()
    if (action === 'new') { const t = this.newTab(); if (args.url) await this.navigate(t, args.url); return this.state() }
    if (action === 'select') { this.tab(args.id); this.activeId = args.id; this.attach(); this.changed(); return this.state() }
    if (action === 'close') { this.close(args.id || this.activeId); return this.state() }
    if (action === 'visible') { this.visible = !!args.visible; this.attach(); this.changed(); return this.state() }
    if (action === 'bounds') {
      const win = this.getWindow(), size = win?.getContentSize() || [1500, 960]
      this.bounds = { x: Math.max(0, Math.min(size[0], Math.floor(args.x || 0))), y: Math.max(0, Math.min(size[1], Math.floor(args.y || 0))), width: Math.max(1, Math.min(size[0], Math.floor(args.width || 1))), height: Math.max(1, Math.min(size[1], Math.floor(args.height || 1))) }
      if (this.attached) this.attached.setBounds(this.bounds)
      return true
    }
    if (action === 'file') return this.file(args.path)
    if (action === 'credentials') return { available: this.vault.available(), sites: this.vault.available() ? this.vault.list() : [] }
    if (action === 'delete') { this.vault.delete(args.id); return true }
    if (action === 'copy') { const e = this.vault.get(args.id); if (!e) throw new Error(L('凭据不存在', 'Credentials are unavailable')); clipboard.writeText(e.password); return true }
    if (action === 'export') {
      if (args.confirmed !== true || args.secondConfirmation !== true) return { confirmationRequired: true }
      const file = P.workspacePath(this.workspace(), args.path || 'vault-backup.json', { create: true })
      if (fs.existsSync(file)) throw new Error(L('导出文件已存在，请选择新文件名', 'Export file exists; choose a new filename'))
      fs.mkdirSync(path.dirname(file),{recursive:true}); this.vault.exportEncrypted(file); return { path: file, encrypted: true }
    }
    if (action === 'confirm') return this.confirm(args.id, args.allow === true)
    const t = this.tab(args.id)
    if (action === 'takeover') { t.takeover = true; this.setReadOnly(t); this.changed(); return this.state() }
    if (action === 'fill') return this.fill(t, new URL(t.view.webContents.getURL()).origin, args.credentialId || args.entryId)
    if (action === 'external') { const url = t.view.webContents.getURL(); await P.assertURL(url, this.config()); await shell.openExternal(url); return true }
    if (t.owner && !t.takeover) throw new Error(L('员工正在操作；请先接管', 'An employee controls this tab; take over first'))
    if (action === 'navigate') await this.navigate(t, args.url)
    else if (action === 'back' && t.view.webContents.navigationHistory.canGoBack()) t.view.webContents.navigationHistory.goBack()
    else if (action === 'forward' && t.view.webContents.navigationHistory.canGoForward()) t.view.webContents.navigationHistory.goForward()
    else if (action === 'reload') t.view.webContents.reload()
    else throw new Error(L('未知浏览器操作', 'Unknown browser action'))
    return this.state()
  }
  async redact(t, text) {
    let value = String(text || '')
    for (const secret of t.secrets) if (secret) value = value.split(secret).join('[redacted]')
    // Saved-password values never go back through the model even after reload.
    try { const origin = new URL(t.view.webContents.getURL()).origin; for (const e of this.vault.available() ? this.vault.read().filter(e => e.origin === origin) : []) if (e.password) value = value.split(e.password).join('[redacted]') } catch {}
    return value
  }
  async readable(t) {
    const text = await this.js(t, `const copy=document.body?.cloneNode(true);if(!copy)return '';copy.querySelectorAll('script,style,noscript,input,textarea,select,[contenteditable],nav,footer').forEach(n=>n.remove());return (copy.innerText||copy.textContent||'').replace(/\s+/g,' ').trim()`)
    return { title: await this.redact(t, t.view.webContents.getTitle()), url: t.view.webContents.getURL(), text: (await this.redact(t, text)).slice(0,18000) }
  }
  async snapshot(t) {
    const elements = await this.js(t, `
      globalThis.__officeRefs=new Map();let i=0;
      const els=[...document.querySelectorAll('a,button,input,textarea,select,[role=button],[role=link],[role=checkbox],[role=combobox],[contenteditable=true]')];
      return els.filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'}).slice(0,160).map(e=>{
        const ref=${serialize('r' + t.refs + '-')}+(++i);globalThis.__officeRefs.set(ref,e);
        const type=(e.getAttribute('type')||'').toLowerCase(),sensitive=type==='password'||/password|token|secret|credit.?card|cc-number|one-time-code/i.test((e.name||'')+' '+(e.autocomplete||''));
        const labels=e.labels?[...e.labels].map(x=>x.innerText).join(' '):'';
        return {ref,role:e.getAttribute('role')||e.tagName.toLowerCase(),type,label:(e.getAttribute('aria-label')||labels||e.getAttribute('placeholder')||e.innerText||e.getAttribute('title')||'').trim(),disabled:!!e.disabled,sensitive,options:e.tagName==='SELECT'?[...e.options].slice(0,30).map(o=>({label:o.label,value:o.value})):undefined}
      })
    `)
    const cleaned = await this.sanitize(elements)
    for(const element of cleaned) element.label=element.label.slice(0,140)
    return { title: await this.redact(t, t.view.webContents.getTitle()), url: t.view.webContents.getURL(), elements: cleaned }
  }
  async screenshot(t, projectDir) {
    const targetDir = P.workspacePath(this.workspace(), projectDir || t.projectDir || this.workspace())
    const dir = P.workspacePath(this.workspace(), path.join(targetDir, 'browser-shots'), { create: true }); fs.mkdirSync(dir, { recursive: true })
    const file = P.workspacePath(this.workspace(), path.join(dir, 'browser-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex') + '.png'), { create: true })
    let secrets = [...t.secrets]
    try { if (this.vault.available()) secrets.push(...this.vault.read().filter(e => e.origin === new URL(t.view.webContents.getURL()).origin).map(e => e.password)) } catch {}
    // A credential-tainted page is never captured: arbitrary page scripts can
    // repaint secrets into pseudo-elements, closed shadow roots or child frames.
    if (secrets.length) {
      const placeholder = nativeImage.createFromBitmap(Buffer.alloc(1200 * 760 * 4, 255), {width:1200,height:760})
      fs.writeFileSync(file, placeholder.toPNG())
      return {path:file,url:t.view.webContents.getURL(),protected:true,message:L('已使用凭据的页面以安全占位图代替截图', 'A safe placeholder replaces screenshots of pages that have used credentials')}
    }
    // During capture mask form controls and any text node containing a known
    // secret. Restore immediately; no redaction annotation contains the secret.
    const wasAttached = this.attached === t.view
    if (!wasAttached) { try { this.hiddenHost.contentView.removeChildView(t.view) } catch {} this.hiddenHost.contentView.addChildView(t.view) }
    const mask = await t.view.webContents.insertCSS('input,textarea,select,[contenteditable],canvas,video,iframe,object,embed{visibility:hidden!important}', {cssOrigin:'user'})
    await this.js(t, `const secrets=${serialize(secrets)};globalThis.__officeMasked=[];const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=walk.nextNode())if(secrets.some(s=>s&&n.textContent.includes(s))){globalThis.__officeMasked.push([n,n.textContent]);n.textContent='[redacted]'}`)
    try {
      if(!t.view.webContents.debugger.isAttached())t.view.webContents.debugger.attach('1.3')
      await t.view.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1200,height:760,deviceScaleFactor:1,mobile:false})
      const image = await t.view.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true})
      fs.writeFileSync(file,Buffer.from(image.data,'base64'))
    }
    finally { await this.js(t, 'for(const [n,text] of globalThis.__officeMasked||[])if(n.isConnected)n.textContent=text;globalThis.__officeMasked=[]').catch(() => {}); await t.view.webContents.removeInsertedCSS(mask).catch(() => {}); await t.view.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride').catch(()=>{}); if(wasAttached)this.attach() }
    return { path: file, url: t.view.webContents.getURL() }
  }
  async sanitize(value) {
    const secrets = new Set([...this.tabs.values()].flatMap(t => [...t.secrets]))
    try { if (this.vault.available()) for (const e of this.vault.read()) secrets.add(e.password) } catch {}
    try { for (const s of (this.envSecrets?.() || [])) secrets.add(s) } catch {}
    return P.redactResult(value, secrets)
  }
  async tool(name, args = {}, contextId, projectDir, owner) { return this.sanitize(await this.performTool(name, args, contextId, projectDir, owner)) }
  async performTool(name, args = {}, contextId, projectDir, owner) {
    if (!/^browser_(search|open|snapshot|click|type|select|scroll|screenshot|read_file|login)$/.test(name)) throw new Error('Unknown browser tool')
    if (typeof contextId !== 'string' || !contextId) throw new Error('Missing browser context')
    const project = P.workspacePath(this.workspace(), projectDir || this.workspace())
    if (name === 'browser_read_file') {
      const file = P.workspacePath(this.workspace(), path.resolve(project, String(args.path || '')))
      const stat = fs.statSync(file); if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error(L('只能读取 2 MB 以内的工作区文件', 'Only workspace files below 2 MB can be read'))
      // Credential and environment files are never returned to model tools.
      if (/(^|[\\/])(vault[^\\/]*\.json|\.credentials[^\\/]*|\.env[^\\/]*|auth\.json)$/i.test(file)) throw new Error(L('不能通过员工工具读取凭据文件', 'Credential files cannot be read through employee tools'))
      let content = fs.readFileSync(file, 'utf8')
      for (const t of this.tabs.values()) content = await this.redact(t, content)
      if (this.vault.available()) for (const entry of this.vault.read()) if (entry.password) content = content.split(entry.password).join('[redacted]')
      return { path: file, content }
    }
    let t = this.tabs.get(this.contexts.get(contextId))
    if (!t) { t = this.newTab(contextId, project); this.contexts.set(contextId, t.id); t.ownerLabel = String(owner || contextId).slice(0, 100) }
    if (t.takeover) throw new Error(L('用户已接管此标签页；员工浏览操作已暂停', 'The user took over this tab; employee browsing is paused'))
    if (Date.now() - t.createdAt > this.config().maxTaskMs) { this.release(contextId); throw new Error(L('浏览任务已超时', 'The browsing task timed out')) }
    this.log('office-browser tool=' + name + ' context=' + contextId.replace(/[^\w.-]/g, '').slice(0, 70))
    if (name === 'browser_open') { await this.navigate(t, args.url); return this.readable(t) }
    if (name === 'browser_search') {
      await this.navigate(t, P.searchURL(args.query, this.config())); await sleep(450)
      const rows = await this.js(t, `
        const nodes=[...document.querySelectorAll('li.b_algo,.result,div.MjjYud')];
        const rows=nodes.map(n=>{const a=n.querySelector('h2 a,a.result__a,a:has(h3)');return a?{title:a.innerText,url:a.href,snippet:n.querySelector('.b_caption p,.result__snippet,.VwiC3b')?.innerText||n.innerText}:null}).filter(Boolean);
        if(!rows.length)for(const a of document.querySelectorAll('h2 a,h3 a,a.result__a,a:has(h3)'))rows.push({title:a.innerText,url:a.href,snippet:a.closest('article,li,section,div')?.innerText||''});
        return rows.slice(0,30)
      `)
      const results = P.parseSearchResults(await this.sanitize(rows), args.count)
      const safe = []; for (const r of results) { try { await P.assertURL(r.url, this.config()); safe.push(r) } catch {} }
      return { query: String(args.query || '').slice(0, 500), results: JSON.parse(await this.redact(t, JSON.stringify(safe))), searchUrl: t.view.webContents.getURL(), ...(safe.length ? {} : { message: L('搜索站点未返回可解析结果；可能需要验证或稍后重试', 'The search site returned no parseable results; a challenge or retry may be required') }) }
    }
    if (name === 'browser_snapshot') return this.snapshot(t)
    if (name === 'browser_screenshot') return this.screenshot(t, project)
    if (name === 'browser_login') return this.requestLogin(t, args.origin)
    if (name === 'browser_scroll') {
      await this.js(t, `window.scrollBy({top:${args.dir === 'up' ? -600 : 600},behavior:'instant'});return true`)
      return { scrolled: args.dir === 'up' ? 'up' : 'down' }
    }
    const ref = String(args.ref || '')
    if (!/^r\d+-\d+$/.test(ref)) throw new Error(L('ref 无效，请先获取快照', 'Invalid ref; take a snapshot first'))
    const code = `const el=globalThis.__officeRefs?.get(${serialize(ref)});if(!el||!el.isConnected)throw new Error('Stale ref; take a new snapshot');if(el.disabled)throw new Error('Element is disabled');el.scrollIntoView({block:'center'});`
    if (name === 'browser_click') {
      const result = await this.js(t, code + `if(el.type==='password')throw new Error('Use browser_login for password fields');if(typeof el.click==='function'){try{el.click();return true}catch{}}const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}`)
      if (result && typeof result === 'object') {
        const readOnly = !!t.owner && !t.takeover
        try {
          await this.js(t, 'globalThis.__officeCoordinateAction=true;return true')
          await t.view.webContents.debugger.sendCommand('Input.setIgnoreInputEvents',{ignore:false})
          t.view.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:result.x,y:result.y})
          t.view.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:result.x,y:result.y})
          await sleep(80)
        } finally {
          await this.js(t, 'globalThis.__officeCoordinateAction=false;return true').catch(()=>{})
          if(!t.view.webContents.isDestroyed()) await t.view.webContents.debugger.sendCommand('Input.setIgnoreInputEvents',{ignore:readOnly}).catch(()=>{})
        }
      }
      await sleep(350); return { clicked: true, ...(await this.readable(t)) }
    }
    if (name === 'browser_type') {
      await this.js(t, code + `if(el.type==='password'||/password|secret|token|cc-number|one-time-code/i.test((el.name||'')+' '+(el.autocomplete||'')))throw new Error('Use browser_login for credentials');if(!['INPUT','TEXTAREA'].includes(el.tagName)&&!el.isContentEditable)throw new Error('Element is not editable');el.focus();if(el.isContentEditable)el.textContent=${serialize(String(args.text || '').slice(0, 10000))};else{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${serialize(String(args.text || '').slice(0, 10000))})}el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));${args.submit ? "if(el.form)el.form.requestSubmit();else el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}))" : ''};return true`)
      await sleep(200); return { typed: true, submitted: !!args.submit }
    }
    if (name === 'browser_select') { await this.js(t, code + `if(el.tagName!=='SELECT')throw new Error('Element is not a select');const value=${serialize(String(args.value || ''))};if(![...el.options].some(o=>o.value===value))throw new Error('Unknown option');el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));return true`); return { selected: true } }
  }
}
module.exports = { BrowserService }
