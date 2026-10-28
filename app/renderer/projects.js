'use strict'
;(() => {
  const api = window.office, $ = selector => document.querySelector(selector), t = (key, vars) => I18N.t(key, vars)
  let projects = [], currentId = '', conversations = [], files = [], detailRevision = 0
  let creating = false, conversationBusy = false, previewRevision = 0, previewTimer = 0, folderEdited = false, verifiedLocation = null
  let newSources = new Set(), editedSources = new Set(), editedConversationId = '', refreshTimer = 0
  let stopTarget = null, stopPending = false, stopReturnFocus = null
  const current = () => projects.find(p => p.id === currentId)
  const visible = id => !document.getElementById(id).classList.contains('hidden')
  const errorText = error => String(error?.message || error).replace(/^Error invoking remote method[^:]+:\s*/, '')
  function message(text = '', error = false, target = '#project-message') { const el = $(target); el.textContent = text; el.classList.toggle('error', error) }
  function failure(error, target) { message(t('projects.error', { message: errorText(error) }), true, target) }
  function need(name) { if (typeof api[name] !== 'function') throw Error(t('projects.unavailable')); return api[name] }
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node }
  function button(text, callback, className = 'pill-btn mini') { const b = el('button', className, text); b.type = 'button'; b.onclick = callback; return b }
  const date = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(I18N.getLang() === 'en' ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  const size = bytes => Number(bytes) >= 1048576 ? (Number(bytes) / 1048576).toFixed(1) + ' MB' : Number(bytes) >= 1024 ? Math.round(Number(bytes) / 1024) + ' KB' : (Number(bytes) || 0) + ' B'
  const canChat = p => !!p && ['done', 'failed', 'stopped'].includes(p.status)
  const status = p => t('projects.status.' + (['done', 'failed', 'queued', 'stopped', 'stopping'].includes(p?.status) ? p.status : 'active'))
  const activity = p => p?.activity || {}
  const canStop = p => activity(p).canStop === true
  const activityStatus = p => activity(p).stopping ? t('projects.status.stopping') : canStop(p) ? t('projects.status.active') : status(p)
  function updateActivity(incoming) {
    if (!Array.isArray(incoming)) return
    projects = incoming
    // Activity events are frequent. Update only state text and controls: keep the
    // detail scroll, files, open menus and unsaved conversation forms intact.
    for (const row of document.querySelectorAll('#project-list [data-project-id]')) {
      const p = projects.find(item => item.id === row.dataset.projectId), state = row.querySelector('.project-list-state')
      if (p && state) { state.textContent = activityStatus(p); state.classList.toggle('is-running', canStop(p)) }
    }
    renderHeader()
  }
  function hideOtherPanels() { for (const id of ['browser-modal', 'archive-modal', 'chat-modal']) document.getElementById(id)?.classList.add('hidden') }
  function renderList() {
    const list = $('#project-list'), query = $('#project-search').value.trim().toLocaleLowerCase(), selected = current()
    list.replaceChildren()
    const matches = projects.filter(p => !p.parentProjectId && (!query || `${p.title || ''} ${p.dir || ''}`.toLocaleLowerCase().includes(query)))
    if (!matches.length) { list.append(el('p', 'project-empty', t(projects.length ? 'projects.noMatch' : 'projects.emptyText'))); return }
    for (const p of matches) {
      const b = button('', () => selectProject(p.id).catch(failure), 'project-list-item')
      b.dataset.projectId = p.id; b.title = p.dir || ''; b.setAttribute('aria-current', String(p.id === currentId || p.id === selected?.parentProjectId))
      b.append(el('strong', '', p.title || p.id), el('small', '', p.dir || ''))
      const meta = el('span', 'project-list-meta'), state = el('span', 'project-list-state', activityStatus(p))
      state.classList.toggle('is-running', canStop(p)); meta.append(state, el('span', '', date(p.createdAt))); b.append(meta); list.append(b)
    }
  }
  function renderHeader() {
    const p = current(); if (!p) return
    $('#project-conversation-new').disabled = !canChat(p); $('#project-conversation-new').title = canChat(p) ? '' : t('chat.notReady')
    $('#project-name').textContent = p.title || p.id
    $('#project-folder-path').textContent = p.dir || ''; $('#project-folder-path').title = p.dir || ''
    const a = activity(p)
    $('#project-status').textContent = activityStatus(p)
    $('#project-status').classList.toggle('busy', canStop(p) || a.stopping || !['done', 'failed', 'stopped'].includes(p.status)); $('#project-status').classList.toggle('warn', ['failed', 'stopped'].includes(p.status))
    $('#project-stop').disabled = !canStop(p) || a.stopping || stopPending
    $('#project-stop').textContent = t(a.stopping || stopPending ? 'projects.stopping' : 'projects.stop')
    $('#project-stop').title = canStop(p) ? t('projects.stopHint') : t('projects.noActivity')
    $('#project-activity').textContent = canStop(p) || a.stopping ? t('projects.activity', { tasks: Number(a.runningTasks || 0), queued: Number(a.queuedTasks || 0), chats: Number(a.chatCount || 0) }) : t('projects.noActivity')
    $('#project-back-parent').classList.toggle('hidden', !p.parentProjectId)
    $('#project-back-parent').onclick = () => selectProject(p.parentProjectId).catch(failure)
    $('#project-reveal').onclick = () => api.reveal(p.dir).catch(failure)
  }
  function sources() { return projects.filter(p => p.id !== currentId && p.status === 'done') }
  function renderSources(target, chosen) {
    const list = $(target); list.replaceChildren()
    const available = sources(), rows = [...available]
    for (const id of chosen) if (!available.some(p => p.id === id)) rows.push({ id, unavailable: true })
    if (!rows.length) { list.append(el('p', 'project-empty', t('projects.referenceEmpty'))); return }
    for (const source of rows) {
      const label = el('label', 'project-source'), input = document.createElement('input'); input.type = 'checkbox'; input.value = source.id; input.checked = chosen.has(source.id)
      input.onchange = () => input.checked ? chosen.add(source.id) : chosen.delete(source.id)
      const copy = el('span', 'source-copy'); copy.append(el('strong', '', source.unavailable ? t('projects.unavailableSource', { id: source.id }) : source.title || source.id), el('small', '', source.unavailable ? t('projects.removeUnavailable') : source.dir || ''))
      label.append(input, copy); list.append(label)
    }
  }
  function renderFiles() {
    const list = $('#project-files'); list.replaceChildren(); $('#project-file-count').textContent = files.length ? String(files.length) : ''
    if (!files.length) { list.append(el('p', 'project-empty', t('projects.filesEmpty'))); return }
    for (const file of files) {
      const b = button('', async () => { try { if (window.OfficeBrowser?.openFile) await OfficeBrowser.openFile(file.path); else await api.open(file.path) } catch (error) { failure(error) } }, 'project-file-button')
      b.title = file.path || file.rel; b.dataset.filePath = file.path || ''
      b.append(el('span', 'project-file-name', file.rel || file.name || file.path), el('small', '', size(file.size))); list.append(b)
    }
  }
  function openChat(projectId, conversationId) {
    $('#project-modal').classList.add('hidden'); $('#newproject-modal').classList.add('hidden')
    document.dispatchEvent(new CustomEvent('office:open-project-chat', { detail: { id: projectId, conversationId: conversationId || 'default' } }))
  }
  function renderConversations() {
    const list = $('#project-conversation-list'); list.replaceChildren(); $('#project-conversation-count').textContent = t('projects.conversationCount', { n: conversations.length })
    if (!conversations.length) { list.append(el('p', 'project-empty', t('projects.conversationEmpty'))); return }
    for (const c of conversations) {
      const row = el('div', 'project-conversation'); row.dataset.conversationId = c.id
      const info = el('div', 'project-conversation-main'); info.append(el('strong', '', c.title || t('projects.untitledConversation')), el('small', '', [date(c.updatedAt || c.createdAt), t('projects.referenceCount', { n: (c.sourceProjectIds || []).length })].filter(Boolean).join(' · ')))
      const manage = button(t('projects.editReferences'), () => editReferences(c.id), 'menu-item'); manage.dataset.action = 'references'; manage.setAttribute('role', 'menuitem')
      const open = button(t('projects.openConversation'), () => openChat(currentId, c.id)); open.dataset.action = 'open'
      for (const b of [manage, open]) { b.disabled = !canChat(current()); b.title = canChat(current()) ? '' : t('chat.notReady') }
      const actions = el('div', 'project-row-actions'), more = button(t('projects.more'), null), menu = el('div', 'action-menu hidden')
      more.dataset.action = 'more'; more.setAttribute('aria-label', t('projects.conversationMore', { title: c.title || t('projects.untitledConversation') })); menu.setAttribute('role', 'menu'); menu.append(manage)
      actions.append(open, more, menu); row.append(info, actions); list.append(row)
      window.OfficeMenus?.bind(more, menu)
    }
  }
  function renderTasks() {
    const list = $('#project-tasks'), tasks = projects.filter(p => p.parentProjectId === currentId); list.replaceChildren(); $('#project-tasks-section').classList.toggle('hidden', !tasks.length)
    for (const task of tasks) {
      const row = el('div', 'project-task-row'), info = el('div'); info.append(el('strong', '', task.title || task.id), el('small', '', status(task)))
      const view = button(t('projects.viewTask'), () => selectProject(task.id).catch(failure)); view.dataset.taskId = task.id
      row.append(info, view); list.append(row)
    }
  }
  async function selectProject(id, { preserveForms = false } = {}) {
    const revision = ++detailRevision, p = projects.find(p => p.id === id); currentId = p?.id || ''
    $('#project-detail').classList.toggle('hidden', !p); $('#project-detail-empty').classList.toggle('hidden', !!p)
    if (!preserveForms) { $('#project-conversation-form').classList.add('hidden'); $('#project-reference-editor').classList.add('hidden'); editedConversationId = ''; newSources = new Set() }
    renderList(); if (!p) return
    renderHeader(); renderTasks(); message(t('projects.loading')); $('#project-files').replaceChildren(el('p', 'project-empty', t('projects.loadFiles')))
    const result = await Promise.allSettled([need('conversations')(p.id), api.files(p.id)])
    if (revision !== detailRevision) return
    conversations = result[0].status === 'fulfilled' ? (Array.isArray(result[0].value) ? result[0].value : result[0].value?.conversations || []) : []
    files = result[1].status === 'fulfilled' ? (Array.isArray(result[1].value) ? result[1].value : result[1].value?.files || []) : []
    renderConversations(); renderFiles()
    const rejected = result.find(r => r.status === 'rejected'); if (rejected) failure(rejected.reason); else message()
  }
  async function refresh(id = currentId, { preserveForms = false } = {}) {
    try {
      const value = await api.projects(); projects = Array.isArray(value) ? value : value?.projects || []
      const desired = projects.some(p => p.id === id) ? id : projects.find(p => !p.parentProjectId)?.id
      if (visible('project-modal')) await selectProject(desired, { preserveForms: preserveForms && desired === currentId })
      else renderList()
      return projects
    } catch (error) { failure(error); throw error }
  }
  async function open(id) {
    hideOtherPanels(); $('#project-modal').classList.remove('hidden'); message(t('projects.loading'))
    await refresh(id || currentId)
  }
  function createStopConfirmation() {
    const modal = el('section', 'modal hidden'); modal.id = 'project-stop-modal'; modal.setAttribute('aria-labelledby', 'project-stop-heading')
    const sheet = el('div', 'sheet project-stop-sheet'), head = el('div', 'sheet-head'), heading = el('div', 'h1', t('projects.stopTitle')); heading.id = 'project-stop-heading'; heading.dataset.i18n = 'projects.stopTitle'
    const close = button('×', () => closeStop(), 'x'); close.dataset.i18nTitle = 'projects.cancel'; close.title = t('projects.cancel'); head.append(heading, close)
    const name = el('strong', 'project-stop-name'); name.id = 'project-stop-name'
    const copy = el('p', 'project-stop-copy', t('projects.stopDescription')); copy.dataset.i18n = 'projects.stopDescription'
    const location = el('div', 'project-stop-path'); location.id = 'project-stop-path'
    const error = el('p', 'hint'); error.id = 'project-stop-message'; error.setAttribute('role', 'status')
    const foot = el('div', 'sheet-foot'), cancel = button(t('projects.cancel'), () => closeStop()), confirm = button(t('projects.confirmStop'), () => confirmStop(), 'pill-btn danger'); cancel.id = 'project-stop-cancel'; cancel.dataset.i18n = 'projects.cancel'; confirm.id = 'project-stop-confirm'; confirm.dataset.i18n = 'projects.confirmStop'; foot.append(cancel, confirm)
    sheet.append(head, name, copy, location, error, foot); modal.append(sheet); document.body.append(modal)
    modal.addEventListener('click', event => { if (event.target === modal) closeStop() })
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && visible('project-stop-modal')) { event.preventDefault(); event.stopImmediatePropagation(); closeStop() } }, true)
  }
  function restoreStopFocus() {
    const target = stopReturnFocus; stopReturnFocus = null
    queueMicrotask(() => {
      const shown = node => node?.isConnected && !node.disabled && !node.closest('.hidden') && node.getClientRects().length > 0
      const fallback = target?.closest('.modal')?.querySelector('textarea:not(:disabled), button:not(:disabled), input:not(:disabled)')
      const next = shown(target) ? target : shown(fallback) ? fallback : $('#btn-projects')
      if (shown(next)) next.focus({ preventScroll: true })
    })
  }
  function closeStop() { if (stopPending) return; $('#project-stop-modal').classList.add('hidden'); stopTarget = null; restoreStopFocus() }
  function askStop(id = currentId) {
    const p = projects.find(item => item.id === id); if (!p || !canStop(p) || stopPending) return
    window.OfficeMenus?.closeAll(); stopTarget = { id: p.id, title: p.title || p.id, dir: p.dir }; $('#project-stop-name').textContent = stopTarget.title; $('#project-stop-path').textContent = stopTarget.dir
    message('', false, '#project-stop-message'); $('#project-stop-confirm').disabled = false; $('#project-stop-cancel').disabled = false; $('#project-stop-modal').classList.remove('hidden')
  }
  async function requestStop(id = currentId) {
    stopReturnFocus = document.activeElement
    try {
      const value = await api.projects(); projects = Array.isArray(value) ? value : value?.projects || []
      askStop(id)
    } catch (error) {
      failure(error)
      document.dispatchEvent(new CustomEvent('office:project-stop-result', { detail: { id, error: true, message: t('projects.error', { message: errorText(error) }) } }))
    }
  }
  async function confirmStop() {
    if (!stopTarget || stopPending) return
    const target = stopTarget; stopPending = true; $('#project-stop-confirm').disabled = true; $('#project-stop-cancel').disabled = true; message(t('projects.stopping'), false, '#project-stop-message'); renderHeader()
    try {
      await need('stopProject')(target.id); $('#project-stop-modal').classList.add('hidden'); stopTarget = null; restoreStopFocus(); await refresh(currentId, { preserveForms: true })
      const text = t('projects.stopSuccess', { title: target.title }); message(text)
      document.dispatchEvent(new CustomEvent('office:project-stop-result', { detail: { id: target.id, title: target.title, message: text } }))
    } catch (error) { failure(error, '#project-stop-message') }
    finally { stopPending = false; $('#project-stop-confirm').disabled = false; $('#project-stop-cancel').disabled = false; renderHeader() }
  }
  function showConversationForm() {
    if (!canChat(current())) { message(t('chat.notReady'), true); return }
    newSources = new Set(); $('#project-conversation-title').value = ''; message('', false, '#project-conversation-message')
    $('#project-reference-editor').classList.add('hidden'); $('#project-conversation-form').classList.remove('hidden'); renderSources('#project-conversation-sources', newSources)
    $('#project-conversation-form').scrollIntoView({ block: 'nearest', behavior: 'instant' }); $('#project-conversation-title').focus()
  }
  function editReferences(id) {
    if (!canChat(current())) { message(t('chat.notReady'), true); return }
    const c = conversations.find(c => c.id === id); if (!c) return
    editedConversationId = id; editedSources = new Set(c.sourceProjectIds || [])
    $('#project-conversation-form').classList.add('hidden'); $('#project-reference-editor').classList.remove('hidden')
    $('#project-reference-heading').textContent = t('projects.referencesFor', { title: c.title || t('projects.untitledConversation') })
    renderSources('#project-reference-sources', editedSources); $('#project-reference-editor').scrollIntoView({ block: 'nearest', behavior: 'instant' }); $('#project-reference-save').focus()
  }
  $('#project-conversation-form').onsubmit = async event => {
    event.preventDefault(); if (conversationBusy || !canChat(current())) return
    const title = $('#project-conversation-title').value.trim(); if (!title) return message(t('projects.needConversationTitle'), true, '#project-conversation-message')
    const projectId = currentId; conversationBusy = true; $('#project-conversation-create').disabled = true; message(t('projects.creatingConversation'), false, '#project-conversation-message')
    try {
      const value = await need('createConversation')(projectId, { title, sourceProjectIds: [...newSources] }), c = value?.conversation || value
      if (!c?.id) throw Error(t('projects.unavailable'))
      await refresh(projectId); openChat(projectId, c.id)
    } catch (error) { failure(error, '#project-conversation-message') }
    finally { conversationBusy = false; $('#project-conversation-create').disabled = false }
  }
  $('#project-reference-save').onclick = async () => {
    if (conversationBusy || !editedConversationId || !canChat(current())) return
    const id = currentId, cid = editedConversationId; conversationBusy = true; $('#project-reference-save').disabled = true
    try { await need('setConversationReferences')(id, cid, [...editedSources]); await refresh(id); message(t('projects.referencesSaved')) }
    catch (error) { failure(error) }
    finally { conversationBusy = false; $('#project-reference-save').disabled = false }
  }
  function resetCreate() {
    clearTimeout(previewTimer); previewRevision++; creating = false; folderEdited = false; verifiedLocation = null
    $('#newproject-title').value = ''; $('#newproject-folder').value = ''; $('#newproject-location').textContent = t('projects.previewPending'); $('#newproject-create').disabled = true
    $('#newproject-title').disabled = false; $('#newproject-folder').disabled = false; $('#newproject-pick').disabled = false; message('', false, '#newproject-message')
  }
  function newProject() { resetCreate(); $('#newproject-modal').classList.remove('hidden'); $('#newproject-title').focus() }
  async function previewLocation() {
    const revision = ++previewRevision, title = $('#newproject-title').value.trim(); verifiedLocation = null; $('#newproject-create').disabled = true
    if (!title) { $('#newproject-location').textContent = t('projects.previewPending'); message('', false, '#newproject-message'); return }
    $('#newproject-location').textContent = t('projects.checkingFolder'); message('', false, '#newproject-message')
    try {
      const request = { title }; if (folderEdited && $('#newproject-folder').value.trim()) request.folder = $('#newproject-folder').value.trim()
      const result = await need('projectPreview')(request); if (revision !== previewRevision) return
      $('#newproject-folder').value = result.dir; $('#newproject-location').textContent = result.dir; verifiedLocation = { ...result, title }; $('#newproject-create').disabled = false
    } catch (error) { if (revision === previewRevision) { $('#newproject-location').textContent = '—'; failure(error, '#newproject-message') } }
  }
  function schedulePreview() { clearTimeout(previewTimer); verifiedLocation = null; $('#newproject-create').disabled = true; previewTimer = setTimeout(previewLocation, 240) }
  $('#newproject-title').oninput = schedulePreview
  $('#newproject-folder').oninput = () => { folderEdited = true; schedulePreview() }
  $('#newproject-pick').onclick = async () => { try { const selected = await api.pickDir(); if (selected) { folderEdited = true; $('#newproject-folder').value = selected; await previewLocation() } } catch (error) { failure(error, '#newproject-message') } }
  $('#newproject-form').onsubmit = async event => {
    event.preventDefault(); if (creating) return
    const title = $('#newproject-title').value.trim(), folder = $('#newproject-folder').value.trim()
    if (!title) { message(t('projects.needTitle'), true, '#newproject-message'); $('#newproject-title').focus(); return }
    if (!verifiedLocation || verifiedLocation.title !== title || verifiedLocation.dir !== folder) { await previewLocation(); return }
    creating = true; $('#newproject-create').disabled = true; $('#newproject-title').disabled = true; $('#newproject-folder').disabled = true; $('#newproject-pick').disabled = true
    try {
      const preview = await need('projectPreview')({ title, folder })
      if (preview.dir !== verifiedLocation.dir) { verifiedLocation = { ...preview, title }; $('#newproject-folder').value = preview.dir; $('#newproject-location').textContent = preview.dir; message(t('projects.locationChanged'), false, '#newproject-message'); return }
      message(t('projects.creating'), false, '#newproject-message')
      const value = await need('createProject')({ title, folder: preview.dir, confirmed: true }), p = value?.project || value
      $('#newproject-modal').classList.add('hidden'); await open(p.id); message(t('projects.createSuccess'))
    } catch (error) { failure(error, '#newproject-message') }
    finally { creating = false; $('#newproject-title').disabled = false; $('#newproject-folder').disabled = false; $('#newproject-pick').disabled = false; $('#newproject-create').disabled = !verifiedLocation }
  }
  $('#btn-projects').onclick = () => open().catch(() => {})
  createStopConfirmation()
  $('#project-stop').onclick = () => requestStop()
  window.OfficeMenus?.bind($('#project-more'), $('#project-more-menu'))
  $('#project-new').onclick = newProject; $('#project-empty-new').onclick = newProject
  $('#project-refresh').onclick = () => refresh().catch(() => {})
  $('#project-search').oninput = renderList
  $('#project-conversation-new').onclick = showConversationForm
  $('#project-conversation-cancel').onclick = () => $('#project-conversation-form').classList.add('hidden')
  $('#project-reference-cancel').onclick = () => $('#project-reference-editor').classList.add('hidden')
  $('#btn-lang').addEventListener('click', () => queueMicrotask(() => { if (visible('newproject-modal') && verifiedLocation) $('#newproject-location').textContent = verifiedLocation.dir; renderList(); if (current()) { renderHeader(); renderConversations(); renderFiles(); renderTasks(); renderSources('#project-conversation-sources', newSources); if (editedConversationId) { const c = conversations.find(c => c.id === editedConversationId); $('#project-reference-heading').textContent = t('projects.referencesFor', { title: c?.title || t('projects.untitledConversation') }); renderSources('#project-reference-sources', editedSources) } } }))
  api.onEvent(event => {
    if (event.type === 'project-activity') { updateActivity(event.projects); return }
    if (event.type === 'project' && event.project) {
      const p = event.project, index = projects.findIndex(item => item.id === p.id)
      if (index >= 0) projects[index] = { ...projects[index], ...p }; else projects.push(p)
      updateActivity(projects)
      if (visible('project-modal') && !visible('newproject-modal') && !visible('project-conversation-form') && !visible('project-reference-editor') && !conversationBusy) { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refresh().catch(() => {}), 250) }
    }
  })
  window.OfficeProjects = { open, refresh, newProject, requestStop, async newConversation(id) { await open(id); showConversationForm() }, async references(id, conversationId) { await open(id); editReferences(conversationId) } }
})()
