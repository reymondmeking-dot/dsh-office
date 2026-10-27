'use strict'
;(() => {
  const $ = s => document.querySelector(s), api = window.office, t = (k,v) => I18N.t(k,v)
  const el = (tag, props = {}, ...kids) => { const n = document.createElement(tag); Object.assign(n, props); n.append(...kids.filter(k => k != null)); return n }
  const CATS = ['code','cloud','deploy','ai','runtime','lang','data','media','tool','custom']

  // ---------- CLI resources ----------
  let enabled = {}, custom = [], detected = [], working = false
  const msg = value => { $('#cli-message').textContent = value || '' }
  const usable = r => r.installed && (r.modes?.includes('full') ? true : (r.authenticated || r.credentialAvailable))
  const modeOf = r => { const v = enabled[r.id]; if (!v) return ''; if (v === 'read' || v === 'full') return v; return (r.modes || ['read'])[0] }
  function render() {
    const list = $('#cli-list'); list.replaceChildren()
    const showMissing = $('#cli-missing').checked
    const rows = detected.filter(r => r.installed || enabled[r.id] || showMissing)
    $('#cli-count').textContent = detected.length ? t('cli.count', { n: detected.filter(r => r.installed).length, m: Object.values(enabled).filter(Boolean).length }) : ''
    if (!rows.length) { list.append(el('p', { className: 'hint', textContent: t('cli.empty') })); return }
    for (const cat of CATS) {
      const group = rows.filter(r => (r.category || 'tool') === cat)
      if (!group.length) continue
      list.append(el('div', { className: 'cli-category', textContent: t('cat.' + cat) }))
      for (const r of group) {
        const check = el('input', { type: 'checkbox', checked: !!enabled[r.id], disabled: !usable(r) && !enabled[r.id] })
        const mode = el('select', { disabled: !(r.modes || []).includes('read') })
        for (const m of (r.modes || ['full'])) mode.append(el('option', { value: m, textContent: t(m === 'read' ? 'cli.modeRead' : 'cli.modeFull') }))
        mode.value = modeOf(r) || (r.modes || ['full'])[0]
        check.onchange = () => { enabled[r.id] = check.checked ? mode.value : false; msg(''); render() }
        mode.onchange = () => { if (check.checked) enabled[r.id] = mode.value }
        const status = !r.installed ? t('cli.not-installed') : r.status === 'installed' ? `${t('cli.installed')} · ${r.path || ''}` : t('cli.' + (r.status || 'unknown'))
        const label = el('label', { className: 'cli-resource-label' }, check, el('span', {}, el('strong', { textContent: r.name || r.id }), el('small', { textContent: status })))
        const head = el('div', { className: 'cli-resource-head' }, label, mode)
        if (r.custom) head.append(el('button', { className: 'pill-btn', textContent: t('cli.remove'), onclick: () => { custom = custom.filter(c => c.id !== r.id); delete enabled[r.id]; detected = detected.filter(x => x.id !== r.id); render(); msg(t('env.applyNext')) } }))
        const row = el('div', { className: 'cli-resource' }, head)
        if (r.installed && r.commands?.length) row.append(el('details', {}, el('summary', { textContent: t('cli.scope') }), el('code', { textContent: r.commands.join(' · ') })))
        list.append(row)
      }
    }
  }
  async function detect() {
    if (working) return; working = true; $('#cli-detect').disabled = true; msg(t('cli.detecting'))
    try { const r = await api.detectCli(); detected = r.resources; for (const x of detected) if (x.mode) enabled[x.id] = x.mode; render(); msg('') } catch (e) { msg(e.message) } finally { working = false; $('#cli-detect').disabled = false }
  }
  $('#cli-detect').onclick = detect
  $('#cli-missing').onchange = render
  $('#cli-all').onclick = () => { for (const r of detected) if (usable(r) && !enabled[r.id]) enabled[r.id] = (r.modes || ['full'])[0]; render() }
  $('#cli-custom-add').onclick = () => {
    const id = $('#cli-custom-id').value.trim().toLowerCase(), file = $('#cli-custom-path').value.trim()
    if (!id || !file) return
    custom = [...custom.filter(c => c.id !== id), { id, name: id, path: file }]
    detected = [...detected.filter(r => r.id !== id), { id, name: id, category: 'custom', custom: true, installed: true, path: file, modes: ['full'], status: 'installed' }]
    enabled[id] = 'full'; $('#cli-custom-id').value = ''; $('#cli-custom-path').value = ''; render()
  }
  $('#cli-grant').onclick = async () => {
    const chosen = Object.fromEntries(Object.entries(enabled).filter(([, v]) => v).map(([id]) => [id, modeOf(detected.find(r => r.id === id) || { id, modes: ['full'] })]))
    const names = Object.keys(chosen).map(id => `${detected.find(r => r.id === id)?.name || id} (${t(chosen[id] === 'read' ? 'cli.modeRead' : 'cli.modeFull')})`).join(', ')
    if (!await OfficeBrowser.confirm(t('cli.confirmTitle'), t('cli.confirmText'), names || '—')) return
    try { const saved = await api.saveCliResources({ enabled: chosen, custom, confirmed: true }); enabled = { ...saved }; render(); msg(t('cli.saved')) } catch (e) { msg(e.message) }
  }

  // ---------- environment variables ----------
  let candidates = [], envVars = []
  const envMsg = v => { $('#env-message').textContent = v || '' }
  function renderEnv(info) {
    const list = $('#env-list'); list.replaceChildren()
    envVars = info?.vars || []
    $('#env-count').textContent = info?.available === false ? '' : t('env.count', { n: envVars.length })
    if (info?.available === false) { list.append(el('p', { className: 'hint', textContent: t('env.unavailable') })); $('#env-scan').disabled = true; return }
    if (!envVars.length) { list.append(el('p', { className: 'hint', textContent: t('env.empty') })); return }
    for (const v of envVars) {
      const on = el('input', { type: 'checkbox', checked: v.enabled, title: t('cli.enable') })
      on.onchange = async () => { try { renderEnv(await api.envUpdate(v.name, { enabled: on.checked })); envMsg(t('env.applyNext')) } catch (e) { envMsg(e.message) } }
      const scope = el('select')
      for (const [value, key] of [['all', 'env.scopeAll'], ['dsh', 'env.scopeDsh'], ['codex', 'env.scopeCodex']]) scope.append(el('option', { value, textContent: t(key) }))
      scope.value = v.scope
      scope.onchange = async () => { try { renderEnv(await api.envUpdate(v.name, { scope: scope.value })); envMsg(t('env.applyNext')) } catch (e) { envMsg(e.message) } }
      const del = el('button', { className: 'pill-btn', textContent: t('env.delete') })
      del.onclick = async () => { try { renderEnv(await api.envDelete(v.name)) } catch (e) { envMsg(e.message) } }
      list.append(el('div', { className: 'env-row' }, on, el('code', { textContent: v.name }), el('span', { className: 'env-value', textContent: v.masked }), el('small', { textContent: v.source === 'system' ? t('env.system') : v.source, title: v.source }), scope, del))
    }
  }
  const loadEnv = () => api.envList().then(renderEnv).catch(e => envMsg(e.message))
  function renderPick() {
    const box = $('#env-pick'); box.replaceChildren()
    const q = $('#env-filter').value.trim().toUpperCase(), onlySecret = $('#env-only-secret').checked
    const shown = candidates.filter(c => (!q || c.name.toUpperCase().includes(q)) && (!onlySecret || c.secret))
    let source = null
    for (const c of shown) {
      if (c.source !== source) { source = c.source; box.append(el('div', { className: 'env-source', textContent: source === 'system' ? t('env.system') : source })) }
      const check = el('input', { type: 'checkbox', checked: !!c.picked })
      check.onchange = () => { c.picked = check.checked }
      box.append(el('div', { className: 'env-row' }, el('label', {}, check, el('code', { textContent: c.name }), el('span', { className: 'env-value', textContent: c.masked })), c.stored ? el('small', { textContent: t('env.stored') }) : null))
    }
    if (!shown.length) box.append(el('p', { className: 'hint', textContent: t('env.empty') }))
  }
  $('#env-scan').onclick = async () => {
    try { candidates = await api.envScan() } catch (e) { envMsg(e.message); return }
    $('#env-paste').value = ''; $('#env-pick-msg').textContent = ''; $('#env-filter').value = ''
    renderPick(); $('#env-modal').classList.remove('hidden')
  }
  $('#env-filter').oninput = renderPick
  $('#env-only-secret').onchange = renderPick
  $('#env-import').onclick = async () => {
    const ids = candidates.filter(c => c.picked).map(c => c.id), text = $('#env-paste').value
    if (!ids.length && !text.trim()) { $('#env-pick-msg').textContent = t('env.empty'); return }
    const names = [...candidates.filter(c => c.picked).map(c => c.name), ...(text.trim() ? ['…'] : [])].join(', ')
    if (!await OfficeBrowser.confirm(t('env.confirmTitle'), t('env.confirmText'), names)) return
    try {
      const scope = $('#env-scope').value
      let added = 0, skipped = 0, info
      if (ids.length) { info = await api.envImport({ ids, scope, confirmed: true }); added += info.added.length; skipped += info.skipped.length }
      if (text.trim()) { info = await api.envImport({ text, scope, confirmed: true }); added += info.added.length; skipped += info.skipped.length }
      $('#env-paste').value = ''
      renderEnv(info); envMsg(t('env.done', { n: added, s: skipped })); $('#env-modal').classList.add('hidden')
    } catch (e) { $('#env-pick-msg').textContent = e.message }
  }
  $('#env-clear').onclick = async () => {
    if (!envVars.length || !await OfficeBrowser.confirm(t('env.clear'), t('env.applyNext'), t('env.count', { n: envVars.length }))) return
    try { renderEnv(await api.envDelete('*')) } catch (e) { envMsg(e.message) }
  }

  // ---------- autopilot fields (saved with the main Settings button) ----------
  function fillAuto(s) {
    const a = s.autopilot || {}
    $('#set-ask-timeout').value = a.askTimeoutSec ?? 0; $('#set-retries').value = a.retries ?? 2
    $('#set-resume').checked = a.resume !== false; $('#set-notify').checked = a.notify !== false; $('#set-network').checked = s.networkAccess !== false
  }
  window.OfficeAutopilot = { read: () => ({ autopilot: { askTimeoutSec: Number($('#set-ask-timeout').value) || 0, retries: Number($('#set-retries').value) || 0, resume: $('#set-resume').checked, notify: $('#set-notify').checked }, networkAccess: $('#set-network').checked }) }

  $('#set-about').onclick = () => $('#about-modal').classList.remove('hidden')
  for (const link of document.querySelectorAll('[data-office-link]')) link.onclick = e => { e.preventDefault(); $('#about-modal').classList.add('hidden'); OfficeBrowser.open(link.dataset.officeLink).catch(e => msg(e.message)) }
  $('#btn-lang').addEventListener('click', () => { render(); loadEnv() })
  document.addEventListener('office:settings', e => { enabled = { ...e.detail.cliResources }; custom = [...(e.detail.cliCustom || [])]; fillAuto(e.detail); render(); loadEnv(); if (!detected.length) detect() })
  api.init().then(d => { enabled = { ...d.settings.cliResources }; custom = [...(d.settings.cliCustom || [])]; fillAuto(d.settings); render() })
})()
