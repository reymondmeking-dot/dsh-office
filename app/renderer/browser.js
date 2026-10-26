'use strict'
;(() => {
  const api = window.office, $ = s => document.querySelector(s), t = (k, v) => I18N.t(k, v)
  let state = { tabs: [], activeId: null, downloads: [] }, settings = {}, errorText = '', lastPrompt = null
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const active = () => state.tabs.find(x => x.id === state.activeId)
  const fail = e => { errorText = t('browser.error', { message: String(e?.message || e).replace(/^Error invoking remote method[^:]+:\s*/, '') }); $('#browser-message').textContent = errorText; $('#vault-status').textContent = errorText }
  async function command(action, args = {}) { try { return await api.browser(action, args) } catch (e) { fail(e); throw e } }
  async function refresh() { const s = await command('state'); state = s; render(); return s }
  let boundsFrame = 0
  function bounds() {
    cancelAnimationFrame(boundsFrame)
    boundsFrame = requestAnimationFrame(() => {
      const r = $('#browser-viewport').getBoundingClientRect()
      api.browser('bounds', { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) }).catch(fail)
    })
  }
  let showing = false
  function visibility() {
    const panel = $('#browser-modal'), layer = Number(getComputedStyle(panel).zIndex) || 0
    const covered = [...document.querySelectorAll('.modal')].some(m => m !== panel && !m.classList.contains('hidden') && (Number(getComputedStyle(m).zIndex) || 0) >= layer)
    const visible = !panel.classList.contains('hidden') && !covered
    if (visible !== showing) { showing = visible; api.browser('visible', { visible }).catch(fail) }
    if (visible) bounds()
  }
  async function open(url) {
    $('#file-modal').classList.add('hidden')
    $('#browser-modal').classList.remove('hidden')
    if (url) await command('new', { url })
    await refresh(); visibility(); bounds()
    if (!active() || !active().url || active().url === 'about:blank') $('#browser-address').focus()
  }
  function render() {
    const a = active(), watch = !!a?.readOnly
    const tabs = $('#browser-tabs'); tabs.replaceChildren()
    for (const tab of state.tabs) {
      const el = document.createElement('div'); el.className = 'browser-tab'; el.setAttribute('role', 'tab'); el.setAttribute('aria-selected', String(tab.id === state.activeId)); el.tabIndex = tab.id === state.activeId ? 0 : -1
      const label = document.createElement('span'); label.className = 'tab-label'; label.textContent = `${tab.owner ? tab.owner + ' · ' : ''}${tab.title || t('browser.untitled')}`; el.title = tab.title || tab.url
      const close = document.createElement('button'); close.className = 'tab-close'; close.textContent = '×'; close.title = t('tb.close'); close.setAttribute('aria-label', `${t('tb.close')} ${tab.title || t('browser.untitled')}`)
      close.onclick = async e => { e.stopPropagation(); try { await command('close', { id: tab.id }); await refresh() } catch {} }
      const select = async () => { try { await command('select', { id: tab.id }); await refresh(); bounds() } catch {} }
      el.onclick = select; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select() } else if (['ArrowRight','ArrowLeft'].includes(e.key)) { e.preventDefault(); const i = state.tabs.indexOf(tab), next = state.tabs[(i + (e.key === 'ArrowRight' ? 1 : state.tabs.length - 1)) % state.tabs.length]; command('select', { id: next.id }).then(refresh).catch(() => {}) } }
      el.append(label, close); tabs.append(el)
    }
    if (document.activeElement !== $('#browser-address')) $('#browser-address').value = a?.url === 'about:blank' ? '' : (a?.url || '')
    $('#browser-address').readOnly = watch || !!a?.file
    $('#browser-back').disabled = !a?.canGoBack || watch
    $('#browser-forward').disabled = !a?.canGoForward || watch
    for (const id of ['reload','fill']) $('#browser-' + id).disabled = !a || watch || !!a.file
    $('#browser-go').disabled = watch || !!a?.file
    $('#browser-external').disabled = !a?.url || !!a.file
    $('#browser-watch').classList.toggle('hidden', !watch)
    $('#browser-owner').textContent = t('browser.owner', { owner: a?.owner || '' })
    $('#browser-mode').textContent = watch ? t('browser.watching') : a?.file ? t('file.readOnly') : t('browser.personal')
    $('#browser-progress').classList.toggle('loading', !!a?.loading)
    $('#browser-progress').setAttribute('aria-valuetext', a?.loading ? t('browser.loading') : '')
    $('#browser-message').textContent = errorText || (a?.loading ? t('browser.loading') : '')
    const download = state.downloads?.at(-1)
    $('#browser-downloads').textContent = download ? t('browser.download', { name: download.name || download.filename || download.path || '' }) : ''
    bounds()
    const pending = state.pending?.find(p => p.id !== lastPrompt)
    if (pending) prompt(pending)
  }
  async function displayFile(file) {
    if (file.kind === 'view') { await open(); return }
    $('#file-heading').textContent = file.name
    const content = $('#file-content'); content.innerHTML = file.kind === 'markdown' ? window.renderMarkdown(file.content || '') : `<pre><code>${escape(file.content || '')}</code></pre>`
    for (const link of content.querySelectorAll('.lnk[data-href]')) {
      link.tabIndex = 0; link.setAttribute('role','link')
      const go = () => { if (/^https?:\/\//i.test(link.dataset.href)) { $('#file-modal').classList.add('hidden'); open(link.dataset.href).catch(() => {}) } }
      link.onclick = go; link.onkeydown = e => { if (e.key === 'Enter') go() }
    }
    $('#file-reveal').onclick = () => api.reveal(file.path)
    $('#file-modal').classList.remove('hidden'); visibility(); content.scrollTop = 0
  }
  async function openFile(path) {
    try { const f = await command('file', { path }); await displayFile(f); return f }
    catch (e) {
      $('#file-heading').textContent = String(path).split(/[\\/]/).at(-1)
      $('#file-content').textContent = errorText; $('#file-modal').classList.remove('hidden'); visibility()
      throw e
    }
  }
  let confirmationResolve = null
  async function confirm(title, text, origin = '') {
    if (confirmationResolve) return false
    $('#browser-confirm-heading').textContent = title; $('#browser-confirm-text').textContent = text; $('#browser-confirm-origin').textContent = origin
    $('#browser-confirm-origin').classList.toggle('hidden', !origin)
    $('#browser-confirm-modal').classList.remove('hidden'); visibility()
    return new Promise(resolve => { confirmationResolve = allow => { $('#browser-confirm-modal').classList.add('hidden'); confirmationResolve = null; visibility(); resolve(allow) } })
  }
  $('#browser-confirm-no').onclick = () => confirmationResolve?.(false)
  $('#browser-confirm-yes').onclick = () => confirmationResolve?.(true)
  async function prompt(p) {
    if (lastPrompt === p.id || confirmationResolve) return
    lastPrompt = p.id
    const allow = await confirm(t(p.kind === 'save' ? 'browser.saveTitle' : 'browser.loginTitle'), t(p.kind === 'save' ? 'browser.saveText' : 'browser.loginText'), p.origin)
    try { await command('confirm', { id: p.id, allow }); await refresh() } catch {}
  }
  async function vault() {
    $('#vault-modal').classList.remove('hidden'); visibility()
    try {
      const info = await command('credentials'), list = $('#vault-sites'); list.replaceChildren()
      $('#vault-status').textContent = info.available ? '' : t('vault.unavailable'); $('#vault-export').disabled = !info.available || !info.sites.length
      if (!info.sites.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = t('vault.empty'); list.append(empty) }
      for (const site of info.sites) {
        const row = document.createElement('div'); row.className = 'vault-site'
        const label = document.createElement('div'); label.className = 'site-label'; label.innerHTML = `<strong>${escape(site.origin)}</strong><small>${escape(site.username)}</small>`; row.append(label)
        for (const action of ['fill','copy','delete']) {
          const b = document.createElement('button'); b.className = 'pill-btn'; b.textContent = t('vault.' + action)
          b.onclick = async () => { try {
            if (action === 'delete' && !await confirm(t('vault.deleteTitle'), t('vault.deleteText'), site.origin)) return
            if (action === 'fill') {
              const current = active(); let origin = ''; try { origin = new URL(current?.url).origin } catch {}
              if (origin !== site.origin || current?.owner || current?.file) {
                const matching = state.tabs.find(tab => { try { return !tab.owner && !tab.file && new URL(tab.url).origin === site.origin } catch { return false } })
                await command(matching ? 'select' : 'new', matching ? { id: matching.id } : { url: site.origin }); await refresh()
              }
            }
            await command(action, action === 'fill' ? { credentialId: site.id, origin: site.origin } : { id: site.id })
            if (action === 'copy') $('#vault-status').textContent = t('vault.copied')
            else if (action === 'delete') await vault()
            else { $('#vault-modal').classList.add('hidden'); await open() }
          } catch {} }
          row.append(b)
        }
        list.append(row)
      }
    } catch {}
  }
  $('#vault-export').onclick = async () => {
    if (!await confirm(t('vault.exportTitle'), t('vault.exportText'))) return
    if (!await confirm(t('vault.exportAgainTitle'), t('vault.exportAgainText'))) return
    try { const path = `${settings.workspace}/downloads/vault-backup-${Date.now()}.json`; await command('export', { confirmed: true, secondConfirmation: true, path }); $('#vault-status').textContent = t('vault.exported', { path }) } catch {}
  }
  function fillSettings(s) {
    settings = s; const b = { ...OfficeParameters.DEFAULT_BROWSER, ...s.browser }
    $('#set-search').value = b.searchEngine; $('#set-search-template').value = b.searchTemplate
    $('#set-browser-pages').value = b.maxPages; $('#set-browser-minutes').value = b.maxTaskMs / 60000
    $('#set-browser-private').checked = b.allowPrivate; $('#set-browser-blocked').value = b.blockedDomains.join('\n')
  }
  function readSettings() { return OfficeParameters.normalizeBrowser({ searchEngine: $('#set-search').value, searchTemplate: $('#set-search-template').value.trim(), allowPrivate: $('#set-browser-private').checked, blockedDomains: $('#set-browser-blocked').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean), maxPages: Number($('#set-browser-pages').value), maxTaskMs: Number($('#set-browser-minutes').value) * 60000 }) }
  $('#btn-browser').onclick = () => open().catch(() => {})
  $('#browser-hide').onclick = () => { $('#browser-modal').classList.add('hidden'); visibility() }
  $('#browser-new').onclick = async () => { try { await command('new'); errorText = ''; await refresh(); $('#browser-address').focus() } catch {} }
  $('#browser-nav').onsubmit = async e => { e.preventDefault(); errorText = ''; try { if (!active()) await command('new'); await command('navigate', { url: $('#browser-address').value }); await refresh() } catch {} }
  for (const action of ['back','forward','reload','external']) $('#browser-' + action).onclick = async () => { try { errorText = ''; await command(action); await refresh() } catch {} }
  $('#browser-fill').onclick = () => command('fill').catch(() => {})
  $('#browser-takeover').onclick = async () => { try { await command('takeover', { id: state.activeId }); await refresh() } catch {} }
  $('#browser-vault').onclick = vault; $('#set-vault').onclick = vault
  new ResizeObserver(bounds).observe($('#browser-viewport'))
  const observer = new MutationObserver(() => {
    if (confirmationResolve && $('#browser-confirm-modal').classList.contains('hidden')) confirmationResolve(false)
    visibility()
  })
  for (const modal of document.querySelectorAll('.modal')) observer.observe(modal, { attributes: true, attributeFilter: ['class'] })
  document.addEventListener('office:settings', e => fillSettings(e.detail))
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && confirmationResolve) { e.preventDefault(); e.stopImmediatePropagation(); confirmationResolve(false) } else if (e.key === 'Escape') visibility() }, true)
  $('#btn-lang').addEventListener('click', () => { render(); if (!$('#vault-modal').classList.contains('hidden')) vault() })
  api.onEvent(ev => { if (ev.type === 'browser-state') { state = ev.state; render() } else if (ev.type === 'browser-prompt') prompt(ev); else if (ev.type === 'file-open') displayFile(ev.file).catch(fail) })
  window.OfficeBrowser = { open, openFile, readSettings, fillSettings, refresh, vault, confirm }
  api.init().then(d => fillSettings(d.settings)).catch(fail)
})()
