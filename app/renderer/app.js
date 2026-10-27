/* DSH Office renderer app: canvas loop, overlays, fruit drag, popovers, modals. */
'use strict'
;(async () => {
  const $ = s => document.querySelector(s)
  const O = window.Office, S = window.Sprites, I18N = window.I18N
  const api = window.office, P = window.OfficeParameters

  // ---------- i18n ----------
  let lang = localStorage.getItem('dsh-office-lang') || (navigator.language && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en')
  I18N.setLang(lang)
  api.setLang(lang).catch(() => {})
  const t = (k, v) => I18N.t(k, v)
  const tp = text => I18N.phaseText(String(text || ''), lang)
  const andJoin = arr => arr.join(lang === 'en' ? ', ' : '、')
  const fruitName = f => t('fruit.' + f)
  function applyStaticI18n() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    $('#btn-lang').textContent = t('lang.switch')
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n)
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle)
    for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh)
    for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml)
  }
  $('#btn-lang').onclick = () => {
    lang = lang === 'zh' ? 'en' : 'zh'
    localStorage.setItem('dsh-office-lang', lang)
    I18N.setLang(lang); api.setLang(lang).catch(() => {})
    applyStaticI18n()
    setStatus(); renderTopEffort(); renderFruits(); fillDefault()
    if (!$('#settings-modal').classList.contains('hidden')) { renderProviders(); renderContextBudget(); renderCodex(); $('#set-harness').options[0].textContent = `CEO ${agents.get('ceo')?.name || ''}`; $('#set-harness').options[1].textContent = `HR ${agents.get('hr')?.name || ''}` }
    if (!$('#prov-modal').classList.contains('hidden') && pv) { openProvider(pv.existing ? pv.route : null); if (!pv.existing) { $('#pv-route').value = pv.route; $('#pv-url').value = '' } }
    if (!$('#imp-modal').classList.contains('hidden')) renderImport()
    if (!$('#ext-modal').classList.contains('hidden')) renderExt()
    if (!$('#chat-modal').classList.contains('hidden') && chat) { fillChatProjects(chatable(), chat.id); renderChat() }
    if (popAgent) renderPop()
  }
  applyStaticI18n()

  let data = await api.init()
  let settings = data.settings
  let projects = data.projects
  const agents = new Map(data.agents.map(a => [a.id, a]))

  // ---------- canvas ----------
  const canvas = $('#office'), ctx = canvas.getContext('2d', { alpha: false }), stage = $('#stage')
  O.setLang(lang)
  S.snap(ctx)
  let scale = 3, devK = 3
  function fit() {
    const dpr = window.devicePixelRatio || 1
    const w = stage.clientWidth - 24, h = stage.clientHeight - 24
    // integer device pixels per world pixel*2 (half-pixel art stays crisp)
    devK = Math.max(2, Math.floor(Math.min(w / O.PW, h / O.PH) * dpr * 2) / 2)
    scale = devK / dpr
    canvas.width = Math.round(O.PW * devK); canvas.height = Math.round(O.PH * devK)
    canvas.style.width = `${canvas.width / dpr}px`; canvas.style.height = `${canvas.height / dpr}px`
    ctx.__s = devK; ctx.setTransform(devK, 0, 0, devK, 0, 0); ctx.imageSmoothingEnabled = false
    O.setDeviceScale(devK)
  }
  window.addEventListener('resize', fit); fit()
  matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener?.('change', fit)

  O.init(data.agents, { models: settings.models, rush: data.rush, projects })
  document.body.classList.toggle('rush', data.rush)
  $('#btn-rush').classList.toggle('on', data.rush)

  // ---------- thinking effort (DSH reasoningEffort levels) ----------
  const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
  const DEFAULT_EFFORTS = ['off', 'low', 'medium', 'high']
  const effName = l => t('effort.' + l)
  const EFFORT_ICON = { off: '💤', minimal: '🙂', low: '🤔', medium: '🧠', high: '🧠🧠', xhigh: '🔥', max: '🤯' }
  const EFFORT_NAMES = new Proxy({}, { get: (_t, l) => effName(l) })
  const effortOptions = (levels, sel) => levels.map(l => `<option value="${l}" ${l === sel ? 'selected' : ''}>${EFFORT_ICON[l]} ${effName(l)}</option>`).join('')
  const effortSummary = efs => !efs?.length ? t('effort.nonReasoning') : efs.filter(e => e !== 'off').map(e => effName(e)).join('/')
  /** Every level any configured model offers, in escalation order. */
  const anyLevels = () => LEVELS.filter(l => settings.models.some(m => (m.efforts || []).includes(l)))
  function renderTopEffort() {
    const levels = anyLevels()
    $('#effort-pill').classList.toggle('hidden', !levels.length)
    $('#top-effort').innerHTML = effortOptions(levels.includes(settings.defaultEffort) ? levels : [...levels, settings.defaultEffort].filter(Boolean), settings.defaultEffort)
  }
  renderTopEffort()
  $('#top-effort').onchange = async e => {
    settings = await api.setDefaultEffort(e.target.value)
    toast(t('effort.defaultToast', { icon: EFFORT_ICON[e.target.value], name: effName(e.target.value) }))
    for (const c of O.chars.values()) if (!agents.get(c.id)?.effort) O.handlers.say({ id: c.id, text: t('effort.ack', { icon: EFFORT_ICON[e.target.value], name: effName(e.target.value) }), ms: 1600 })
  }

  // ---------- overlays (bubbles, name tags) ----------
  const bubbleLayer = $('#bubbles')
  const overlay = new Map()
  function toScreen(x, y) {
    const r = canvas.getBoundingClientRect(), sr = stage.getBoundingClientRect()
    return [r.left - sr.left + x * (r.width / O.PW), r.top - sr.top + y * (r.height / O.PH)]
  }
  function syncOverlays() {
    const seen = new Set()
    for (const c of O.chars.values()) {
      seen.add(c.id)
      let o = overlay.get(c.id)
      if (!o) {
        o = { tag: document.createElement('div'), bub: document.createElement('div'), ico: document.createElement('div') }
        o.tag.className = `nametag ${c.role}`; o.bub.className = 'bubble'; o.ico.className = 'status-ico'
        bubbleLayer.append(o.tag, o.bub, o.ico); overlay.set(c.id, o)
      }
      const headY = c.y - (c.pose === 'sit' ? 22 : 25) - (O.isRush() ? 7 : 0)
      const [sx, sy] = toScreen(c.x, headY)
      const [tx, ty] = toScreen(c.x, c.y + 1)
      o.tag.textContent = c.name
      o.tag.style.left = `${tx}px`; o.tag.style.top = `${ty}px`; o.tag.style.opacity = c.alpha
      if (c.bubble) {
        if (o.bub.textContent !== c.bubble.text) { o.bub.textContent = c.bubble.text; o.bub.style.animation = 'none'; void o.bub.offsetWidth; o.bub.style.animation = '' }
        o.bub.className = `bubble ${c.role === 'ceo' ? 'ceo' : ''} ${O.isRush() && c.role !== 'ceo' ? 'rush' : ''}`
        o.bub.style.display = ''; o.bub.style.left = `${sx}px`; o.bub.style.top = `${sy - 4}px`
      } else o.bub.style.display = 'none'
      const icon = c.bubble ? '' : c.status === 'busy' ? (O.isRush() ? '🔥' : '💭') : c.status === 'reporting' ? '📣' : c.hiring ? '📇' : ''
      o.ico.textContent = icon; o.ico.style.display = icon ? '' : 'none'
      o.ico.style.left = `${sx}px`; o.ico.style.top = `${sy}px`
    }
    for (const [id, o] of overlay) if (!seen.has(id)) { o.tag.remove(); o.bub.remove(); o.ico.remove(); overlay.delete(id) }
  }

  // ---------- loop ----------
  let last = performance.now()
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    O.step(dt, now)
    O.render(ctx, now)
    syncOverlays()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  // ---------- status / ticker ----------
  function ticker(html, ms = 7000) {
    const el = document.createElement('div'); el.className = 'tick'
    const d = new Date()
    el.innerHTML = `${html}<span class="tm">${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span>`
    $('#ticker-list').append(el)
    while ($('#ticker-list').children.length > 5) $('#ticker-list').firstChild.remove()
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500) }, ms)
  }
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  function toast(x, ms = 2400) {
    const el = $('#toast'); el.textContent = x; el.classList.remove('hidden')
    clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.add('hidden'), ms)
  }
  function setStatus() {
    const cur = projects.find(p => !['done', 'failed'].includes(p.status) && p.status !== 'queued')
    const queued = projects.filter(p => p.status === 'queued').length
    $('#status-pill').classList.toggle('busy', !!cur)
    $('#status-text').textContent = cur
      ? t('status.busy', { title: cur.title, phase: tp(cur.phase) }) + (queued ? t('status.queued', { n: queued }) : '')
      : t('status.idle')
    $('#status-pill').title = $('#status-text').textContent
  }
  setStatus()

  // ---------- events from main ----------
  const seenFinal = new Set(projects.filter(p => ['done', 'failed'].includes(p.status)).map(p => p.id))
  api.onEvent(ev => {
    const h = O.handlers[ev.type]
    if (h) h(ev)
    switch (ev.type) {
      case 'project': {
        const i = projects.findIndex(p => p.id === ev.project.id)
        if (i >= 0) projects[i] = ev.project; else projects.unshift(ev.project)
        O.setProjects(projects); setStatus()
        if (ev.project.status === 'meeting') O.setMeetingTitle(ev.project.title)
        if (ev.project.status === 'done') { O.setMeetingTitle(''); ticker(t('tick.archived', { title: esc(ev.project.title) }), 10000) }
        if (['done', 'failed'].includes(ev.project.status) && !seenFinal.has(ev.project.id)) {
          seenFinal.add(ev.project.id)
          if (ev.project.status === 'done') {
            $('#btn-chat').classList.add('ping'); toast(t('chat.ready', { title: ev.project.title }), 6000)
            // the end result of a task is the conversation window: pop it open unless the boss is busy in another dialog
            const busyModal = [...document.querySelectorAll('.modal')].some(m => !m.classList.contains('hidden'))
            if (!busyModal) setTimeout(() => { if (![...document.querySelectorAll('.modal')].some(m => !m.classList.contains('hidden'))) openChat(ev.project.id) }, 1800)
          }
        }
        if (!$('#chat-modal').classList.contains('hidden')) fillChatProjects(chatable(), chat?.id)
        if (ev.project.status === 'failed') ticker(t('tick.failed', { title: esc(ev.project.title), phase: esc(tp(ev.project.phase)) }), 12000)
        if (!$('#archive-modal').classList.contains('hidden')) renderBookcase()
        break
      }
      case 'chat-status': if (chat && chat.id === ev.project && chatSending.has(ev.project)) setChatStatus(ev.text); break
      case 'summon-hr': ticker(t('tick.summonHr', { title: esc(ev.title) })); break
      case 'ask': showAsk(ev); break
      case 'ask-done': hideAsk(); break
      case 'review': ticker(ev.pass
        ? t('tick.reviewPass', { name: esc(agents.get(ev.id)?.name), comment: esc((ev.comment || '').slice(0, 60)) })
        : t('tick.reviewFail', { name: esc(agents.get(ev.id)?.name), comment: esc((ev.comment || '').slice(0, 60)) }), 9000); break
      case 'handover': ticker(t('tick.handover')); break
      case 'hired': ticker(t('tick.hired', { n: ev.agents.length, list: ev.agents.map(a => `<b>${esc(a.name)}</b>·${esc(a.title)}`).join(lang === 'en' ? ', ' : '、') }), 9000); for (const a of ev.agents) agents.set(a.id, a); break
      case 'meeting-start': ticker(t('tick.kickoff')); break
      case 'report': ticker(t('tick.report', { name: esc(agents.get(ev.id)?.name), to: ev.to === 'hr' ? t('role.hr') : t('role.ceo'), text: esc(ev.text.slice(0, 60)) }), 9000); break
      case 'dismiss': for (const id of ev.ids) agents.delete(id); break
      case 'rush': document.body.classList.toggle('rush', ev.on); $('#btn-rush').classList.toggle('on', ev.on); break
    }
  })
  api.onAgent(a => {
    agents.set(a.id, a); O.updateAgent(a)
    if (popAgent === a.id) renderPop()
  })

  // ---------- fruits ----------
  function renderFruits() {
    const box = $('#fruits'); box.innerHTML = ''
    for (const m of settings.models) {
      const el = document.createElement('div')
      el.className = `fruit ${m.key === settings.defaultModel ? 'default' : ''}`
      el.innerHTML = `<img src="${S.fruitURL(m.fruit, 32)}" /><span class="fname">${esc(fruitName(m.fruit))} · ${esc(m.name)}</span>`
      el.addEventListener('pointerdown', e => startDrag(e, m))
      box.append(el)
    }
  }
  renderFruits()
  O.setModels(settings.models)

  const canvasPoint = e => {
    const r = canvas.getBoundingClientRect()
    return [(e.clientX - r.left) * (O.PW / r.width), (e.clientY - r.top) * (O.PH / r.height)]
  }

  function startDrag(e, model) {
    e.preventDefault()
    const ghost = $('#drag-ghost')
    ghost.innerHTML = `<img src="${S.fruitURL(model.fruit, 48)}" />`
    ghost.classList.remove('hidden'); document.body.classList.add('dragging')
    const move = ev => {
      ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`
      const c = O.charAt(...canvasPoint(ev)); O.setDropHover(c?.id || null)
    }
    move(e)
    const up = async ev => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      ghost.classList.add('hidden'); document.body.classList.remove('dragging'); O.setDropHover(null)
      const c = O.charAt(...canvasPoint(ev))
      if (!c) return
      const a = await api.setModel(c.id, model.key)
      if (a) {
        agents.set(a.id, a); O.updateAgent(a)
        O.burst(c.x, c.y - 14, 16, ['#ffd23f', '#ff9f1c', '#7ac74f', '#fff'])
        O.handlers.say({ id: c.id, text: t('bubble.yum', { model: model.name }), ms: 2200 })
        toast(t('toast.modelSet', { name: a.name, model: model.name }))
        if (popAgent === a.id) renderPop()
      }
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // ---------- hover / click on canvas ----------
  const tip = $('#tooltip')
  canvas.addEventListener('pointermove', e => {
    const [x, y] = canvasPoint(e)
    const c = O.charAt(x, y)
    O.setHover(c?.id || null)
    let text = ''
    if (c) {
      const a = agents.get(c.id) || c
      const m = settings.models.find(m => m.key === a.effectiveModel)
      text = t('tip.agent', {
        name: esc(a.name), title: esc(a.title), activity: esc(tp(a.activity) || t('tip.idle')),
        model: esc(m?.name || ''),
        effort: a.effectiveEffort ? t('tip.effort', { icon: EFFORT_ICON[a.effectiveEffort], name: effName(a.effectiveEffort) }) : '',
      })
    } else {
      const b = O.bookAt(x, y)
      if (b) { const p = projects.find(p => p.id === b.id); text = t('tip.book', { title: esc(p?.title), phase: esc(tp(p?.phase)) }) }
      else if (O.shelfAt(x, y)) text = t('tip.shelf')
    }
    canvas.style.cursor = text ? 'pointer' : 'default'
    if (text) { tip.innerHTML = text; tip.classList.remove('hidden'); tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY + 14}px` }
    else tip.classList.add('hidden')
  })
  canvas.addEventListener('pointerleave', () => { O.setHover(null); tip.classList.add('hidden') })
  canvas.addEventListener('click', e => {
    const [x, y] = canvasPoint(e)
    const c = O.charAt(x, y)
    if (c) return openPop(c.id, e.clientX, e.clientY)
    const b = O.bookAt(x, y)
    if (b) return openArchive(b.id)
    if (O.shelfAt(x, y) || O.areaAt(x, y) === 'archive') return openArchive()
    closePop()
  })

  // ---------- agent popover ----------
  let popAgent = null
  window.__office = { openPop: (id, x, y) => openPop(id, x, y) } // CDP smoke tests
  function openPop(id, cx, cy) {
    popAgent = id; renderPop()
    const pop = $('#agent-pop'); pop.classList.remove('hidden')
    const w = 320, h = pop.offsetHeight || 420
    pop.style.left = `${Math.min(window.innerWidth - w - 12, Math.max(12, cx + 16))}px`
    pop.style.top = `${Math.min(window.innerHeight - h - 12, Math.max(64, cy - 60))}px`
  }
  function closePop() { popAgent = null; $('#agent-pop').classList.add('hidden') }
  function startRename() {
    const a = agents.get(popAgent); if (!a) return
    const el = $('#ap-name'); if (el.querySelector('input')) return
    el.innerHTML = `<input class="name-edit" maxlength="12" value="${esc(a.name)}" />`
    const inp = el.querySelector('input'); inp.focus(); inp.select()
    let done = false
    const commit = async save => {
      if (done) return; done = true
      const n = inp.value.trim()
      if (save && n && n !== a.name) {
        const r = await api.rename(a.id, n)
        if (r) { agents.set(r.id, r); O.updateAgent(r); O.handlers.say({ id: r.id, text: t('bubble.renamed', { name: r.name }), ms: 2200 }) }
      }
      renderPop()
    }
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') commit(true); if (e.key === 'Escape') commit(false) }
    inp.onblur = () => commit(true)
  }
  $('#ap-name').onclick = startRename
  $('#ap-rename').onclick = startRename
  async function pickEffort(a, level) {
    const r = await api.setEffort(a.id, level); if (!r) return
    agents.set(r.id, r); O.updateAgent(r); renderPop()
    const c = O.chars.get(r.id)
    if (c) {
      const hot = ['xhigh', 'max'].includes(r.effectiveEffort)
      O.burst(c.x, c.y - 16, hot ? 18 : 10, hot ? ['#ff6b6b', '#ffd23f', '#fff'] : ['#9ad1ff', '#c3b6ff', '#fff'])
      O.handlers.say({ id: r.id, text: level
        ? t('effort.mode', { icon: EFFORT_ICON[r.effectiveEffort] || '🧠', name: effName(r.effectiveEffort) })
        : t('effort.follow', { icon: EFFORT_ICON[r.effectiveEffort] || '🧠', name: effName(r.effectiveEffort) || '—' }), ms: 1800 })
    }
  }
  function renderPop() {
    const a = agents.get(popAgent); if (!a) return closePop()
    $('#ap-portrait').src = S.portraitURL(a)
    $('#ap-name').textContent = a.name
    $('#ap-title').textContent = a.role === 'ceo' ? t('pop.titleCeo') : a.role === 'hr' ? t('pop.titleHr') : `${a.expert ? `${a.expert.icon || '🧠'} ${t('pop.expert')} · ` : ''}${a.title} · ${a.skills || ''}`
    const st = $('#ap-status'); st.className = `chip ${a.status}`
    st.textContent = a.status === 'busy' ? t('pop.busy') : a.status === 'reporting' ? t('pop.reporting') : t('pop.idle')
    const grid = $('#ap-models'); grid.innerHTML = ''
    const opts = [{ key: null, name: t('effort.followShort'), fruit: settings.models.find(m => m.key === settings.defaultModel)?.fruit }, ...settings.models]
    for (const m of opts) {
      const b = document.createElement('button')
      const sel = (a.model || null) === m.key
      b.className = `model-opt ${sel ? 'sel' : ''}`
      const sub = m.key ? (m.key === settings.defaultModel ? t('pop.defaultModel') : m.model) : settings.models.find(x => x.key === settings.defaultModel)?.name
      b.innerHTML = `<img src="${S.fruitURL(m.fruit || 'orange', 24)}" /><span>${esc(m.name)}<small>${esc(sub)}</small></span>`
      b.onclick = async () => { const r = await api.setModel(a.id, m.key); if (r) { agents.set(r.id, r); O.updateAgent(r); renderPop() } }
      grid.append(b)
    }
    $('#ap-duty-wrap').classList.toggle('hidden', a.role !== 'employee')
    const seg = $('#ap-effort'); seg.innerHTML = ''
    const mod = settings.models.find(m => m.key === a.effectiveModel)
    const offered = LEVELS.filter(l => (mod?.efforts || []).includes(l))
    if (!offered.length) seg.innerHTML = `<div class="hint">${t('pop.notReasoning', { model: esc(mod?.name || '') })}</div>`
    else {
      const def = document.createElement('button')
      def.className = `seg-btn ${!a.effort ? 'sel' : ''}`
      def.innerHTML = `${EFFORT_ICON[a.effectiveEffort] || '🧠'}<small>${t('effort.followShort')}</small>`
      def.title = t('effort.followTitle', { name: effName(a.effectiveEffort) || '—' })
      def.onclick = () => pickEffort(a, null)
      seg.append(def)
      for (const l of offered) {
        const b = document.createElement('button')
        b.className = `seg-btn ${a.effort === l ? 'sel' : ''} ${a.effectiveEffort === l ? 'eff' : ''}`
        b.innerHTML = `${EFFORT_ICON[l]}<small>${effName(l)}</small>`
        b.title = t('effort.thinkTitle', { name: effName(l), level: l })
        b.onclick = () => pickEffort(a, l)
        seg.append(b)
      }
    }
    $('#ap-duty').textContent = a.task || a.duty || ''
    const log = $('#ap-log'); log.innerHTML = ''
    for (const l of [...(a.log || [])].reverse().slice(0, 12)) {
      const d = new Date(l.t)
      log.insertAdjacentHTML('beforeend', `<div><span class="tm">${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span>${esc(l.text)}</div>`)
    }
    if (!log.children.length) log.innerHTML = `<div>${esc(a.activity || t('pop.noActivity'))}</div>`
    const act = $('#ap-actions'); act.innerHTML = ''
    if (a.role !== 'employee') {
      const b = document.createElement('button'); b.className = 'pill-btn'; b.style.marginTop = '12px'
      b.textContent = t('pop.editHarness')
      b.onclick = () => { closePop(); openSettings(a.role) }
      act.append(b)
    }
  }

  // ---------- generic close ----------
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-close]')
    if (c) { const id = c.dataset.close; id === 'agent-pop' ? closePop() : $(`#${id}`).classList.add('hidden') }
  })
  for (const m of document.querySelectorAll('.modal')) m.addEventListener('mousedown', e => { if (e.target === m) m.classList.add('hidden') })
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePop(); for (const m of document.querySelectorAll('.modal')) m.classList.add('hidden') }
  })

  // ---------- title bar ----------
  $('#btn-close').onclick = () => api.win.close()
  $('#btn-min').onclick = () => api.win.min()
  $('#btn-max').onclick = () => api.win.max()
  $('#titlebar').addEventListener('dblclick', e => { if (e.target.id === 'titlebar' || e.target.classList.contains('spacer')) api.win.max() })
  $('#btn-rush').onclick = async () => {
    const on = await api.rush(!O.isRush())
    toast(on ? t('rush.on') : t('rush.off'))
  }

  // ---------- CEO asks the boss ----------
  let ask = null
  function showAsk(ev) {
    ask = ev; document.body.classList.add('asking')
    $('#ask-sub').textContent = t('ask.sub', { title: ev.title })
    const list = $('#ask-list'); list.innerHTML = ''
    ev.questions.forEach((q, i) => {
      const d = document.createElement('div'); d.className = 'ask-item'
      d.innerHTML = `<div class="q">${i + 1}. ${esc(q.q)}</div><div class="opts"></div><textarea rows="2" placeholder="${esc(t('ask.placeholder'))}"></textarea>`
      const ta = d.querySelector('textarea')
      for (const o of q.options || []) {
        const b = document.createElement('button'); b.className = 'opt'; b.textContent = o
        b.onclick = () => { const on = !b.classList.contains('on'); d.querySelectorAll('.opt').forEach(x => x.classList.remove('on')); if (on) { b.classList.add('on'); ta.value = o } else ta.value = '' }
        d.querySelector('.opts').appendChild(b)
      }
      list.appendChild(d)
    })
    $('#ask-modal').classList.remove('hidden')
    clearInterval(askTimer); $('#ask-countdown')?.remove()
    if (ev.deadline) {
      const cd = document.createElement('div'); cd.id = 'ask-countdown'; cd.className = 'ask-countdown'; $('#ask-sub').after(cd)
      const tick = () => { const s = Math.max(0, Math.round((ev.deadline - Date.now()) / 1000)); cd.textContent = t('auto.countdown', { s }); if (!s) clearInterval(askTimer) }
      tick(); askTimer = setInterval(tick, 1000)
    }
    O.handlers.say({ id: 'ceo', text: t('bubble.ask'), ms: 4000 })
    setTimeout(() => list.querySelector('textarea')?.focus(), 60)
  }
  let askTimer = null
  function hideAsk() { clearInterval(askTimer); $('#ask-countdown')?.remove(); ask = null; document.body.classList.remove('asking'); $('#ask-modal').classList.add('hidden') }
  $('#ask-submit').onclick = () => { if (!ask) return hideAsk(); api.answer([...document.querySelectorAll('#ask-list textarea')].map(x => x.value.trim())) }
  $('#ask-skip').onclick = () => api.answer(null)
  $('#ask-later').onclick = () => $('#ask-modal').classList.add('hidden')
  $('#btn-ask').onclick = () => { if (ask) $('#ask-modal').classList.remove('hidden') }
  if (data.ask) showAsk(data.ask)

  // ---------- attachments (drag & drop / picker) ----------
  let atts = []
  const fileIcon = a => a.dir ? '📁' : /\.pdf$/i.test(a.name) ? '📕' : /\.(mp4|mov|mkv|webm|avi|m4v|flv|wmv)$/i.test(a.name) ? '🎬' : /\.(mp3|wav|m4v|flac|aac|ogg)$/i.test(a.name) ? '🎵' : /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i.test(a.name) ? '🖼️' : /\.(docx?|pages|rtf)$/i.test(a.name) ? '📘' : /\.(xlsx?|csv|numbers)$/i.test(a.name) ? '📗' : /\.(pptx?|key)$/i.test(a.name) ? '📙' : /\.(zip|rar|7z|tar|gz)$/i.test(a.name) ? '🗜️' : '📄'
  const sizeTxt = b => !b ? '' : b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(1)} GB` : b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
  function renderAtts() {
    const box = $('#task-atts'); box.innerHTML = ''
    $('#task-drop').classList.toggle('has', atts.length > 0)
    $('#task-dz-empty').innerHTML = atts.length ? t('task.dropMore', { n: atts.length }) : t('task.dropEmpty')
    atts.forEach((a, i) => {
      const d = document.createElement('div'); d.className = 'att-item'; d.title = a.path
      d.innerHTML = `<span class="ic">${fileIcon(a)}</span><span class="nm">${esc(a.name)}</span><span class="sz">${a.dir ? t('att.folder') : sizeTxt(a.size)}</span><button class="rm" title="${esc(t('att.removeTitle'))}">✕</button>`
      d.querySelector('.rm').onclick = e => { e.stopPropagation(); atts.splice(i, 1); renderAtts() }
      d.onclick = e => e.stopPropagation()
      box.appendChild(d)
    })
  }
  function addAtts(list) {
    for (const a of list) if (a && a.path && !atts.some(x => x.path === a.path)) atts.push(a)
    renderAtts()
  }
  async function addDropped(dt) {
    const paths = [...(dt?.files || [])].map(f => api.pathOf(f)).filter(Boolean)
    if (!paths.length) return toast(t('att.noPath'))
    addAtts(await api.statPaths(paths))
  }
  const dz = $('#task-drop')
  dz.onclick = async () => addAtts(await api.pickFiles())
  dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dz.click() } }
  // whole window: dropping files anywhere opens the task sheet with them attached
  let dragDepth = 0
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files')
  window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); if (dragDepth++ === 0 && $('#task-modal').classList.contains('hidden')) $('#drop-overlay').classList.remove('hidden') })
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').classList.add('hidden') } })
  window.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dz.classList.toggle('over', dz.contains(e.target)) })
  window.addEventListener('drop', async e => {
    if (!hasFiles(e)) return
    e.preventDefault(); dragDepth = 0; $('#drop-overlay').classList.add('hidden'); dz.classList.remove('over')
    if ($('#task-modal').classList.contains('hidden')) openTaskSheet()
    await addDropped(e.dataTransfer)
  })

  // ---------- new task ----------
  let taskLocation = null, taskPlanSerial = 0
  async function updateTaskLocation() {
    const serial = ++taskPlanSerial; taskLocation = null; $('#task-location-confirm').checked = false
    $('#task-location').textContent = t('task.planning')
    try {
      const plan = await api.taskLocation({ title: $('#task-title').value.trim() || 'task', projectId: $('#task-project').value || null })
      if (serial !== taskPlanSerial) return
      taskLocation = plan; $('#task-location').textContent = plan.dir
    } catch (e) { $('#task-location').textContent = errText(e) }
  }
  $('#task-title').addEventListener('input', updateTaskLocation)
  $('#task-project').onchange = updateTaskLocation
  $('#btn-new').onclick = () => openTaskSheet()
  function openTaskSheet() {
    if (!$('#task-modal').classList.contains('hidden')) return
    $('#task-modal').classList.remove('hidden'); renderAtts(); $('#task-rush').checked = O.isRush()
    $('#task-project').innerHTML = `<option value="">${esc(t('task.standalone'))}</option>` + projects.filter(p => p.kind === 'workspace').map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')
    updateTaskLocation()
    const sel = $('#task-continue'); sel.innerHTML = `<option value="">${t('task.fresh')}</option>`
    for (const p of projects.filter(p => p.status === 'done' || p.status === 'failed' || p.status === 'integrating')) {
      const o = document.createElement('option'); o.value = p.id
      o.textContent = p.status === 'done'
        ? t('task.contOptDone', { title: p.title, date: new Date(p.createdAt).toLocaleDateString() })
        : t('task.contOpt', { title: p.title, date: new Date(p.createdAt).toLocaleDateString() })
      sel.appendChild(o)
    }
    sel.onchange = () => { const p = projects.find(x => x.id === sel.value); if (p && !$('#task-title').value.trim()) $('#task-title').value = t('task.sequel', { title: p.title }) }
    setTimeout(() => $('#task-title').focus(), 50)
  }
  $('#task-submit').onclick = async () => {
    const title = $('#task-title').value.trim()
    if (!title) { $('#task-title').focus(); return toast(t('task.needTitle')) }
    if (!taskLocation || !$('#task-location-confirm').checked) return toast(t('task.needLocation'))
    const btn = $('#task-submit'); if (btn.disabled) return
    btn.disabled = true; btn.textContent = atts.length ? t('task.copying') : t('task.submitting')
    let p
    try { p = await api.submit({ title, brief: $('#task-brief').value.trim(), rush: $('#task-rush').checked, continueOf: $('#task-continue').value || null, projectId: $('#task-project').value || null, location: taskLocation, locationConfirmed: true, attachments: atts.map(a => a.path) }) } finally { btn.disabled = false; btn.textContent = t('task.submit') }
    $('#task-modal').classList.add('hidden'); $('#task-title').value = ''; $('#task-brief').value = ''; atts = []; renderAtts()
    const bad = (p.attachments || []).filter(a => a.error); if (bad.length) toast(t('task.attFailToast', { n: bad.length, names: andJoin(bad.map(a => a.name)) }), 5000)
    if (p.status === 'queued' && projects.some(x => x.id !== p.id && !['done', 'failed', 'queued'].includes(x.status))) toast(t('task.queued'))
  }
  $('#task-title').addEventListener('keydown', e => { if (e.key === 'Enter') $('#task-brief').focus() })

  // ---------- archive ----------
  $('#btn-archive').onclick = () => openArchive()
  function openArchive(id) {
    $('#archive-modal').classList.remove('hidden')
    if (id) openBook(id); else { $('#book-view').classList.add('hidden'); $('#bookcase').classList.remove('hidden'); renderBookcase() }
  }
  function renderBookcase() {
    const bc = $('#bookcase'); bc.innerHTML = ''
    if (!projects.length) { bc.innerHTML = `<div class="shelf-row"><div class="empty-shelf">${t('archive.emptyShelf')}</div></div>`; return }
    const per = 14
    for (let i = 0; i < projects.length; i += per) {
      const row = document.createElement('div'); row.className = 'shelf-row'
      for (const p of projects.slice(i, i + per)) {
        const b = document.createElement('div'); b.className = 'book'
        const color = O.BOOK_COLORS[(p.color ?? 0) % O.BOOK_COLORS.length]
        b.style.background = `linear-gradient(90deg, ${S.shade(color, -0.15)}, ${color} 30%, ${S.shade(color, 0.12)})`
        b.style.height = `${120 + ((p.title.length * 7) % 22)}px`
        const st = p.status === 'done' ? '✓' : p.status === 'failed' ? '✕' : '…'
        b.innerHTML = `<div class="band t"></div><div class="spine">${esc(p.title)}</div><div class="band b"></div><div class="st">${st}</div>`
        b.title = `${p.title}\n${new Date(p.createdAt).toLocaleString()}\n${tp(p.phase)}`
        b.onclick = () => openBook(p.id)
        row.append(b)
      }
      bc.append(row)
    }
  }
  let bookId = null
  async function openBook(id) {
    bookId = id
    projects = await api.projects(); O.setProjects(projects)
    const p = projects.find(x => x.id === id); if (!p) return
    $('#bookcase').classList.add('hidden'); $('#book-view').classList.remove('hidden')
    $('#bv-title').textContent = `📖 ${p.title}`
    $('#bv-meta').textContent = t('archive.meta', { date: new Date(p.createdAt).toLocaleString(), phase: tp(p.phase), n: p.team?.length || 0, rush: p.rush ? t('archive.rush') : '' })
    $('#bv-folder').onclick = () => api.open(p.dir)
    const files = await api.files(id)
    const list = $('#bv-files'); list.innerHTML = ''
    const overview = document.createElement('div'); overview.className = 'file summary sel'
    overview.innerHTML = `<span>🗂️</span><span class="fn">${t('archive.overview')}</span>`
    overview.onclick = () => { select(overview); showOverview(p) }
    list.append(overview)
    files.sort((a, b) => a.rel.localeCompare(b.rel, lang === 'zh' ? 'zh' : 'en'))
    for (const f of files) {
      const el = document.createElement('div'); el.className = `file ${/总结|summary/i.test(f.rel) ? 'summary' : ''}`
      const ext = f.rel.split('.').pop().toLowerCase()
      const ico = { md: '📝', txt: '📄', html: '🌐', py: '🐍', js: '📜', ts: '📜', json: '🧾', csv: '📊', xlsx: '📊', docx: '📘', pptx: '📙', png: '🖼️', jpg: '🖼️', svg: '🖼️', pdf: '📕' }[ext] || '📄'
      el.innerHTML = `<span>${ico}</span><span class="fn" title="${esc(f.rel)}">${esc(f.rel)}</span><span class="sz">${f.size > 1024 ? `${(f.size / 1024).toFixed(1)}K` : `${f.size}B`}</span>`
      el.onclick = () => { select(el); showFile(f) }
      el.ondblclick = () => api.open(f.path)
      list.append(el)
    }
    if (!files.length) list.insertAdjacentHTML('beforeend', `<div class="hint" style="padding:10px">${t('archive.noFiles')}</div>`)
    showOverview(p)
  }
  function select(el) { for (const x of document.querySelectorAll('#bv-files .file')) x.classList.remove('sel'); el.classList.add('sel') }
  const repTag = r => ({ done: t('rep.done'), partial: t('rep.partial'), blocked: t('rep.blocked') })[r.status] || (r.ok ? '' : ' ❌')
  function showOverview(p) {
    const pv = $('#bv-preview')
    const members = (p.assignments?.length ? p.assignments : p.team || [])
    const teamCards = members.map(x => `<div class="team-card"><b>${esc(x.name)}</b> · ${esc(x.title)}${x.expert ? ` <span class="chip">🧠 ${esc(x.expert)}</span>` : ''}${x.after?.length ? t('archive.after', { names: esc(andJoin(x.after)) }) : ''}<br>${esc(x.task || x.duty || '')}<br><span style="color:#6e6e73">→ ${esc(x.deliverable || '')}</span></div>`).join('')
    const reports = (p.reports || []).map(r => `<blockquote><b>${esc(r.name)}</b>（${esc(r.title)}）${r.round ? t('archive.round', { n: r.round + 1 }) : ''} ${repTag(r)}<br>${esc(r.report)}${r.review ? t('archive.reviewHr', { cls: r.review.pass ? 'ok' : 'bad', verdict: r.review.pass ? t('archive.pass') : t('archive.return'), comment: esc(r.review.comment) }) : ''}</blockquote>`).join('')
    pv.innerHTML = `<h1>${esc(p.title)}</h1>
      <p style="color:#6e6e73">${esc(p.brief || t('archive.briefEmpty'))}</p>
      <h3>${t('archive.team')}</h3><div class="team-cards">${teamCards || `<span class="hint">${t('archive.none')}</span>`}</div>
      ${p.attachments?.length ? `<h3>${t('archive.bossAtts')}</h3><div>${p.attachments.map(a => `<span class="att-chip" data-open="${esc(a.path || '')}" title="${esc(a.error || a.from || '')}">${fileIcon(a)} ${esc(a.name)}${a.error ? ' ⚠️' : ''}</span>`).join('')}</div>` : ''}${p.goal ? `<h3>${t('archive.goal')}</h3><blockquote>${esc(p.goal.goal)}${p.goal.acceptance?.length ? t('archive.acceptance', { list: p.goal.acceptance.map(esc).join(lang === 'en' ? '; ' : '；') }) : ''}</blockquote>` : ''}<h3>${t('archive.reports')}</h3>${reports || `<span class="hint">${t('archive.none')}</span>`}
      ${p.summary ? `<h3>${t('archive.summary')}</h3>${renderMarkdown(p.summary)}` : ''}`
    for (const c of pv.querySelectorAll('.att-chip[data-open]')) if (c.dataset.open) { c.onclick = () => api.open(c.dataset.open); c.oncontextmenu = e => { e.preventDefault(); api.reveal(c.dataset.open) } }
  }
  async function showFile(f) { try { await window.OfficeBrowser.openFile(f.path) } catch {} }
  $('#bv-back').onclick = () => { $('#book-view').classList.add('hidden'); $('#bookcase').classList.remove('hidden'); renderBookcase() }

  // ---------- project chat (talk to the CEO with context; click deliverables to read) ----------
  let chat = null // { id, title, status, messages, products, sel }
  const chatSending = new Set()
  const chatable = () => projects.filter(p => ['done', 'failed'].includes(p.status))
  const ceoName = () => agents.get('ceo')?.name || 'CEO'
  const flatProducts = pr => [pr?.summary, ...(pr?.main || []), ...(pr?.others || [])].filter(Boolean)
  const kb = n => n > 1024 ? `${(n / 1024).toFixed(1)}K` : `${n}B`
  const fileIco = rel => fileIcon({ name: rel })
  /** Map a link / mentioned file name from chat text to a real project file. */
  function findProduct(ref) {
    if (!chat || !ref) return null
    let r = String(ref).trim()
    try { r = decodeURI(r) } catch {}
    r = r.replace(/\\/g, '/').replace(/^file:\/+/, '').replace(/^\.\//, '').replace(/[#?].*$/, '')
    const all = flatProducts(chat.products)
    const base = x => x.split('/').pop()
    return all.find(f => f.rel === r) || all.find(f => r.endsWith('/' + f.rel)) || all.find(f => f.rel.endsWith('/' + r)) || all.find(f => base(f.rel) === base(r)) || null
  }
  function fillChatProjects(list, sel) {
    $('#chat-proj').innerHTML = list.map(p => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${p.status === 'failed' ? '✕ ' : '✓ '}${esc(p.title)}</option>`).join('')
  }
  async function openChat(id, conversationId = 'default') {
    projects = await api.projects(); O.setProjects(projects)
    const list = chatable()
    if (id && !list.some(p => p.id === id)) return toast(t('chat.notReady'), 3200)
    if (!list.length) return toast(projects.length ? t('chat.notReady') : t('chat.noProject'), 3200)
    const pid = id || (chat && list.some(p => p.id === chat.id) ? chat.id : list[0].id)
    $('#btn-chat').classList.remove('ping')
    $('#chat-modal').classList.remove('hidden')
    fillChatProjects(list, pid)
    await loadChat(pid, conversationId)
    setTimeout(() => $('#chat-text').focus(), 60)
  }
  async function loadChat(pid, conversationId = 'default') {
    const h = await api.chatHistory(pid, conversationId); if (!h) return
    chat = { ...h, sel: null }
    $('#chat-side-view').classList.add('hidden'); $('#chat-side-list').classList.remove('hidden')
    renderChat()
    setChatStatus(chatSending.has(pid) || h.busy ? t('chat.thinking', { name: ceoName() }) : '')
  }
  function renderChat() {
    if (!chat) return
    $('#chat-title').textContent = `💬 ${t('chat.with', { name: ceoName() })}`
    $('#chat-conversation').innerHTML = (chat.conversations || []).map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')
    $('#chat-conversation').value = chat.conversationId || 'default'
    $('#chat-location').textContent = chat.dir || ''; $('#chat-location').title = chat.dir || ''
    $('#chat-references').textContent = `${t('chat.references')}${chat.references?.length ? ' · ' + chat.references.length : ''}`
    renderChatLog(true); renderChatSide()
    const busy = chatSending.has(chat.id) || chat.busy
    $('#chat-send').disabled = busy; $('#chat-text').disabled = false
  }
  function msgHtml(m) {
    if (m.role === 'user') return `<div class="msg me"><div class="who">${esc(t('chat.you'))}</div><div class="bub">${esc(m.text).replace(/\n/g, '<br>')}</div></div>`
    const files = m.seed ? [chat.products.summary, ...chat.products.main].filter(Boolean) : (m.files || [])
    const chips = files.map(f => `<span class="file-chip ${f.changed ? 'chg' : ''}" data-rel="${esc(f.rel)}" title="${esc(f.rel)}">${fileIco(f.rel)} ${esc(f.rel)}${f.changed ? ` · ${esc(t('chat.changed'))}` : ''}</span>`).join('')
    return `<div class="msg ceo ${m.error ? 'err' : ''}"><div class="who">${esc(ceoName())}</div><div class="bub md">${renderMarkdown(m.text)}${m.seed ? `<div class="hint seed">${esc(t('chat.seedNote'))}</div>` : ''}${chips ? `<div class="chips">${chips}</div>` : ''}</div></div>`
  }
  function renderChatLog(stick) {
    if (!chat) return
    const log = $('#chat-log')
    log.innerHTML = chat.messages.map(msgHtml).join('')
    bindFileRefs(log)
    if (stick) log.scrollTop = log.scrollHeight
  }
  /** Make chips, markdown links and `inline-code` file names clickable. */
  function bindFileRefs(root) {
    for (const c of root.querySelectorAll('.file-chip[data-rel]')) c.onclick = () => { const f = findProduct(c.dataset.rel); if (f) previewChatFile(f) }
    for (const l of root.querySelectorAll('.lnk[data-href]')) {
      const f = findProduct(l.dataset.href)
      if (f) { l.classList.add('file-link'); l.onclick = () => previewChatFile(f) }
    }
    for (const c of root.querySelectorAll('code')) {
      if (c.closest('pre')) continue
      const f = findProduct(c.textContent)
      if (f && /\.[A-Za-z0-9]{1,6}$/.test(c.textContent)) { c.classList.add('file-link'); c.onclick = () => previewChatFile(f) }
    }
  }
  function setChatStatus(text) {
    const el = $('#chat-status'); el.textContent = text || ''; el.classList.toggle('hidden', !text)
    if (text) $('#chat-log').scrollTop = $('#chat-log').scrollHeight
  }
  function renderChatSide() {
    if (!chat) return
    const pr = chat.products
    const row = (f, star) => `<div class="file ${star ? 'summary' : ''} ${chat.sel?.rel === f.rel ? 'sel' : ''}" data-rel="${esc(f.rel)}"><span>${star ? '⭐' : fileIco(f.rel)}</span><span class="fn" title="${esc(f.rel)}">${esc(f.rel)}</span><span class="sz">${kb(f.size)}</span></div>`
    const sec = (title, list, star) => list.length ? `<div class="sec-title">${esc(title)}</div>${list.map(f => row(f, star)).join('')}` : ''
    $('#chat-side-list').innerHTML = `<div class="sec-title first">${esc(t('chat.products'))}</div>`
      + (flatProducts(pr).length ? sec(t('chat.summary'), pr.summary ? [pr.summary] : [], true) + sec(t('chat.main'), pr.main) + sec(t('chat.other'), pr.others) : `<div class="hint" style="padding:10px">${esc(t('chat.noProducts'))}</div>`)
    for (const el of $('#chat-side-list').querySelectorAll('.file[data-rel]')) {
      const f = findProduct(el.dataset.rel)
      el.onclick = () => previewChatFile(f)
      el.ondblclick = () => api.open(f.path)
    }
  }
  async function previewChatFile(f) {
    if (!chat || !f) return
    try { await window.OfficeBrowser.openFile(f.path) } catch {}
  }
  async function sendChat() {
    if (!chat) return
    const pid = chat.id
    const cid = chat.conversationId || 'default'
    const text = $('#chat-text').value.trim()
    if (!text || chatSending.has(pid)) return
    chatSending.add(pid)
    $('#chat-text').value = ''; $('#chat-send').disabled = true
    chat.messages.push({ role: 'user', text, at: Date.now() }); renderChatLog(true)
    setChatStatus(t('chat.thinking', { name: ceoName() }))
    try {
      const r = await api.chatSend(pid, text, cid)
      if (chat?.id === pid && (chat.conversationId || 'default') === cid) {
        chat.messages.push(r.message); chat.products = r.products
        const sel = chat.sel && flatProducts(r.products).find(f => f.rel === chat.sel.rel)
        renderChatLog(true); renderChatSide()
        if (sel && r.message.files?.some(f => f.changed && f.rel === sel.rel) && !$('#chat-side-view').classList.contains('hidden')) previewChatFile(sel)
      }
    } catch (e) {
      if (chat?.id === pid && (chat.conversationId || 'default') === cid) { chat.messages.push({ role: 'ceo', text: t('chat.sendFail', { error: errText(e) }), at: Date.now(), error: true }); renderChatLog(true) }
    } finally {
      chatSending.delete(pid)
      if (chat?.id === pid) { setChatStatus(''); $('#chat-send').disabled = false; $('#chat-text').focus() }
    }
  }
  $('#btn-chat').onclick = () => openChat()
  $('#chat-conversation').onchange = () => { if (chat) loadChat(chat.id, $('#chat-conversation').value) }
  $('#chat-new-conversation').onclick = () => { if (chat) window.OfficeProjects?.newConversation(chat.id) }
  $('#chat-references').onclick = () => { if (chat) window.OfficeProjects?.references(chat.id, chat.conversationId || 'default') }
  document.addEventListener('office:open-project-chat', e => openChat(e.detail.id, e.detail.conversationId || 'default').catch(err => toast(errText(err))))
  document.addEventListener('office:project-references-updated', e => { if (chat?.id === e.detail.id) loadChat(chat.id, chat.conversationId || 'default') })
  $('#bv-chat').onclick = () => { if (bookId) { $('#archive-modal').classList.add('hidden'); openChat(bookId) } }
  $('#chat-proj').onchange = e => loadChat(e.target.value)
  $('#chat-send').onclick = sendChat
  $('#chat-text').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat() } })
  $('#cp-back').onclick = () => { if (chat) chat.sel = null; $('#chat-side-view').classList.add('hidden'); $('#chat-side-list').classList.remove('hidden'); renderChatSide() }
  $('#chat-folder').onclick = () => { const p = projects.find(x => x.id === chat?.id); if (p) api.open(p.dir) }
  window.__openChat = id => openChat(id) // CDP smoke tests

  // ---------- settings ----------
  $('#btn-settings').onclick = () => openSettings()
  let harnessName = 'ceo', harnessDirty = {}
  let pinfo = null
  let pv = null
  const errText = e => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  async function openSettings(focusHarness) {
    document.dispatchEvent(new CustomEvent('office:settings', { detail: settings }))
    $('#settings-modal').classList.remove('hidden'); $('#set-msg').textContent = ''
    $('#set-workspace').value = settings.workspace
    $('#set-dsh').value = settings.dshRoot
    $('#set-proxy').value = settings.proxyPort || ''
    $('#set-perm').value = settings.permissionMode
    $('#set-conc').value = settings.normalConcurrency
    $('#set-min').value = settings.minTeam; $('#set-max').value = settings.maxTeam
    fillCompaction(P.normalizeCompaction(settings.compaction))
    fillDefault()
    $('#set-effort').innerHTML = effortOptions(LEVELS, settings.defaultEffort)
    harnessDirty = {}
    harnessName = focusHarness || 'ceo'
    $('#set-harness').options[0].textContent = `CEO ${agents.get('ceo')?.name || ''}`
    $('#set-harness').options[1].textContent = `HR ${agents.get('hr')?.name || ''}`
    $('#set-harness').value = harnessName
    $('#set-harness-text').value = await api.harness(harnessName)
    pinfo = await api.providerInfo().catch(() => null)
    renderProviders()
    renderContextBudget()
    renderCodex(); scanCodex()
  }
  const tokenText = n => Number(n) > 0 ? Number(n).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN') : t('ctx.unknown')
  const sourceText = source => source ? t('ctx.source.' + source) : t('ctx.unknown')
  function fillCompaction(c) {
    $('#set-compact-auto').checked = c.auto
    for (const [id, key, scale] of [['threshold','thresholdRatio',100],['headroom','headroomTokens',1],['summary','maxTokens',1],['retain','retainRatio',100],['retries','compactionRetries',1],['overflow','maxOverflowRetries',1]]) $('#set-compact-' + id).value = Number((c[key] * scale).toFixed(6))
    $('#set-compact-provider').value = c.summarizationProvider || ''
    $('#set-compact-model').value = c.summarizationModel || ''
  }
  function readCompaction() {
    return P.normalizeCompaction({
      auto: $('#set-compact-auto').checked,
      thresholdRatio: Number($('#set-compact-threshold').value) / 100,
      headroomTokens: Number($('#set-compact-headroom').value),
      maxTokens: Number($('#set-compact-summary').value),
      retainRatio: Number($('#set-compact-retain').value) / 100,
      compactionRetries: Number($('#set-compact-retries').value),
      maxOverflowRetries: Number($('#set-compact-overflow').value),
      summarizationProvider: $('#set-compact-provider').value.trim(),
      summarizationModel: $('#set-compact-model').value.trim(),
    })
  }
  function renderContextBudget() {
    const box = $('#context-budget')
    let c
    try { c = readCompaction() } catch (e) { box.innerHTML = `<p class="parameter-error">${esc(errText(e))}</p>`; return }
    if (!settings.models.length) { box.innerHTML = `<p class="hint">${t('ctx.empty')}</p>`; return }
    const rows = settings.models.map(m => {
      try {
        const b = P.modelBudget(m, c)
        const invalid = b.thresholdTokens <= b.retainTokens || b.thresholdTokens <= 0
        return `<tr><th scope="row">${esc(m.name || m.model)}</th><td>${tokenText(b.contextWindow)}</td><td>${tokenText(b.requestMaxTokens)}</td><td class="${invalid ? 'parameter-error' : ''}">${invalid ? esc(t('ctx.invalidBudget')) : `<strong>${tokenText(b.thresholdTokens)}</strong> <span class="hint">(${(b.thresholdRatio * 100).toFixed(1)}%)</span>`}</td><td>${tokenText(b.retainTokens)}</td></tr>`
      } catch (e) { return `<tr><th scope="row">${esc(m.name || m.model)}</th><td colspan="4" class="parameter-error">${esc(errText(e))}</td></tr>` }
    }).join('')
    box.innerHTML = `${!c.auto ? `<p class="hint">${t('ctx.disabled')}</p>` : ''}<div class="budget-scroll"><table class="budget-table"><caption>${t('ctx.title')} · token</caption><thead><tr>${['model','window','output','trigger','retained'].map(k => `<th scope="col">${t('ctx.' + k)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`
  }
  $('#context-settings').addEventListener('input', renderContextBudget)
  for (const button of document.querySelectorAll('[data-setting-jump]')) button.onclick = () => {
    document.getElementById(button.dataset.settingJump).scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  $('#set-context-recommend').onclick = () => {
    const m = settings.models.find(m => m.key === $('#set-default').value) || settings.models[0] || {}
    const r = P.recommendModel(m)
    fillCompaction({ ...P.normalizeCompaction(settings.compaction), ...r, maxTokens: r.summaryMaxTokens })
    renderContextBudget(); $('#set-msg').textContent = t('ctx.recommended')
  }
  function fillDefault() {
    const sel = $('#set-default')
    sel.innerHTML = settings.models.map(m => `<option value="${esc(m.key)}">${esc(fruitName(m.fruit))} ${esc(m.name)}</option>`).join('')
    sel.value = settings.defaultModel
  }
  function renderProviders() {
    const box = $('#set-providers'); box.innerHTML = ''
    for (const [route, p] of Object.entries(settings.providers || {})) {
      const models = settings.models.filter(m => m.provider === route)
      const key = pinfo?.keys?.[p.apiKeyEnv]
      const card = document.createElement('div'); card.className = 'prov-card'
      card.innerHTML = `<div class="pc-head"><b>${esc(I18N.providerName(p.displayName || route, lang))}</b><code>${esc(route)}</code><span class="chip ${key ? 'ok' : 'warn'}">${key ? t('imp.keyMask', { mask: esc(key) }) : t('prov.noKey')}</span><div class="spacer"></div><button class="pill-btn">${t('prov.edit')}</button></div>
        <div class="pc-sub">${esc(p.api)} · ${esc(p.baseURL)}</div>
        <div class="pc-models">${models.map(m => `<span class="pc-model" data-k="${esc(m.key)}"><img src="${S.fruitURL(m.fruit, 20)}" />${esc(m.name)}<small>${esc(effortSummary(m.efforts))}</small><button class="pc-test">${t('prov.test')}</button><small class="test-res"></small></span>`).join('')}</div>`
      card.querySelector('button').onclick = () => openProvider(route)
      for (const el of card.querySelectorAll('.pc-model')) {
        const m = models.find(x => x.key === el.dataset.k)
        el.querySelector('.pc-test').onclick = () => {
          openProvider(route)
          const index = pv.models.findIndex(model => model.model === m.model)
          const row = $('#pv-models').children[index]
          if (row) { row.scrollIntoView({ block: 'nearest' }); testPvModel(pv.models[index], row) }
        }
      }
      box.append(card)
    }
    for (const m of settings.models.filter(m => m.engine !== 'codex' && !settings.providers?.[m.provider])) {
      box.insertAdjacentHTML('beforeend', `<div class="prov-card"><div class="pc-head"><b>${esc(I18N.providerName(m.provider, lang))}</b><span class="chip">${t('prov.builtin')}</span></div><div class="pc-models"><span class="pc-model"><img src="${S.fruitURL(m.fruit, 20)}" />${esc(m.name)}</span></div></div>`)
    }
  }
  $('#set-addprov').onclick = () => openProvider(null)

  // ---------- Codex CLI as an employee engine ----------
  let codexInfo = null
  const codexMsg = x => { $('#codex-msg').textContent = x || '' }
  function codexState() {
    const cur = settings.models.filter(m => m.engine === 'codex')
    const enabled = new Set(cur.map(m => m.model))
    const defaults = {}
    for (const m of codexInfo.models) {
      const c = cur.find(x => x.model === m.slug)
      defaults[m.slug] = c?.defaultEffort && m.efforts.includes(c.defaultEffort) ? c.defaultEffort : m.defaultEffort
    }
    return { enabled, defaults, fast: settings.codexFast ?? codexInfo.configFast }
  }
  /** Spreadsheet: top row = models (slide to enable a column), left column = thinking depth, corner = fast mode, tick = that model's default depth. */
  function renderCodex() {
    const st = $('#codex-state'), box = $('#codex-models'), r = codexInfo
    if (!r) { st.className = 'chip'; st.textContent = t('codex.unknown'); box.innerHTML = ''; return }
    if (!r.found) { st.className = 'chip warn'; st.textContent = t('codex.notFound'); box.innerHTML = `<div class="hint">${t('codex.installHint')}</div>`; return }
    st.className = `chip ${r.loggedIn ? 'ok' : 'warn'}`
    st.textContent = `v${r.version || '?'} · ${r.loggedIn ? t('codex.loggedIn') : t('codex.notLoggedIn')}`
    const s = codexState()
    const list = r.models.filter(m => m.visible || s.enabled.has(m.slug) || m.slug === r.configModel)
    if (!list.length) { box.innerHTML = `<div class="hint">${t('codex.noModels')}</div>`; return }
    const levels = ['low', 'medium', 'high', 'xhigh', 'max'].filter(l => list.some(m => m.efforts.includes(l)))
    const sw = (attrs, on) => `<label class="sw"><input type="checkbox" ${attrs} ${on ? 'checked' : ''} /><i></i></label>`
    const head = list.map(m => {
      const on = s.enabled.has(m.slug)
      return `<th class="cx-col ${on ? 'on' : ''}" scope="col"><div class="cx-name" title="${esc(m.name)}">${esc(m.name)}</div><code title="${esc(m.slug)}">${esc(m.slug)}</code><div class="cx-sw" title="${esc(t('codex.enableTip'))}">${sw(`data-en="${esc(m.slug)}"`, on)}</div>${m.contextWindow ? `<span class="chip">${fmtK(m.contextWindow)}</span>` : ''}${m.slug === r.configModel ? `<span class="chip ok">${t('codex.current')}</span>` : ''}</th>`
    }).join('')
    const body = levels.map(l => `<tr><th scope="row" class="cx-lv">${EFFORT_ICON[l]} ${effName(l)}</th>${list.map(m => {
      const on = s.enabled.has(m.slug), has = m.efforts.includes(l), sel = s.defaults[m.slug] === l
      return `<td class="cx-cell ${on ? 'on' : ''} ${has ? '' : 'na'}">${has ? `<button class="cx-tick ${sel ? 'sel' : ''}" data-slug="${esc(m.slug)}" data-l="${l}" ${on ? '' : 'disabled'} title="${esc(t('codex.defaultTip', { level: effName(l) }))}">${sel ? '✓' : ''}</button>` : '<span class="cx-na">–</span>'}</td>`
    }).join('')}</tr>`).join('')
    box.innerHTML = (r.loggedIn ? '' : `<div class="hint warn-t">${t('codex.loginHint')}</div>`)
      + `<div class="cx-scroll"><table class="cx-table"><thead><tr><th class="cx-corner" scope="col"><label class="cx-fast" title="${esc(t('codex.fastTip'))}">${sw('id="cx-fast"', s.fast)}<span>⚡ ${t('codex.fast')}</span></label></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`
  }
  async function scanCodex() {
    codexMsg(t('codex.scanning'))
    try { codexInfo = await api.codexScan(); codexMsg('') } catch (e) { codexMsg(errText(e)) }
    renderCodex()
  }
  $('#codex-scan').onclick = scanCodex
  let codexBusy = false
  /** Every change in the sheet applies immediately; the sheet re-renders from what was really saved. */
  async function codexCommit(mutate) {
    if (codexBusy || !codexInfo?.found) return
    const s = codexState(); mutate(s)
    codexBusy = true; codexMsg('')
    try { settings = await api.codexApply({ enabled: [...s.enabled], defaults: s.defaults, fast: s.fast }); await afterModelsChanged() }
    catch (e) { codexMsg(errText(e)) }
    finally { codexBusy = false; renderCodex() }
  }
  $('#codex-models').addEventListener('change', e => {
    const el = e.target
    if (el.id === 'cx-fast') return codexCommit(s => { s.fast = el.checked })
    if (el.dataset.en) return codexCommit(s => { el.checked ? s.enabled.add(el.dataset.en) : s.enabled.delete(el.dataset.en) })
  })
  $('#codex-models').addEventListener('click', e => {
    const b = e.target.closest('.cx-tick'); if (!b || b.disabled) return
    codexCommit(s => { s.defaults[b.dataset.slug] = b.dataset.l })
  })

  // ---------- provider editor (DSH custom-provider card semantics) ----------
  const ROUTE_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
  const deriveKeyRef = r => `${r.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
  function nextFruit(taken) { return S.FRUIT_KEYS.find(k => !taken.has(k)) || S.FRUIT_KEYS[taken.size % S.FRUIT_KEYS.length] }
  function takenFruits() { return new Set([...settings.models.filter(m => m.provider !== pv?.route).map(m => m.fruit), ...(pv?.models || []).map(m => m.fruit)]) }
  function openProvider(route) {
    const p = route ? settings.providers[route] : null
    pv = { existing: !!p, route: route || '', apiKeyEnv: p?.apiKeyEnv, models: route ? settings.models.filter(m => m.provider === route).map(m => ({ ...m, efforts: [...(m.efforts || [])] })) : [] }
    $('#prov-modal').classList.remove('hidden'); $('#pv-msg').textContent = ''; $('#pv-found').classList.add('hidden')
    $('#pv-head').textContent = p ? t('prov.headEdit', { name: I18N.providerName(p.displayName || route, lang) }) : t('prov.headAdd')
    $('#pv-route').value = route || ''; $('#pv-route').disabled = !!p
    $('#pv-name').value = p?.displayName || ''
    $('#pv-api').innerHTML = (pinfo?.protocols || ['openai-completions', 'openai-responses', 'anthropic-messages']).map(x => `<option>${x}</option>`).join('')
    $('#pv-api').value = p?.api || 'openai-completions'
    $('#pv-url').value = p?.baseURL || ''
    $('#pv-key').value = ''
    $('#pv-del').classList.toggle('hidden', !p)
    const imp = (pinfo?.dsh || []).filter(x => !settings.providers?.[x.route])
    $('#pv-import-wrap').classList.toggle('hidden', !!p || !imp.length)
    $('#pv-import').innerHTML = `<option value="">${t('prov.importOpt')}</option>` + imp.map(x => `<option value="${esc(x.route)}">${esc(I18N.providerName(x.displayName, lang))}${lang === 'en' ? ' (' : '（'}${esc(x.route)}${lang === 'en' ? ')' : '）'}</option>`).join('')
    keyHint(); renderPvModels()
  }
  function keyHint() {
    const route = $('#pv-route').value.trim()
    const ref = pv.apiKeyEnv || (route ? deriveKeyRef(route) : '')
    const stored = pinfo?.keys?.[ref]
    $('#pv-keyhint').innerHTML = ref ? t('prov.credRef', { ref: esc(ref) }) + (stored ? t('prov.credSaved', { mask: esc(stored) }) : '') : ''
    $('#pv-key').placeholder = stored ? t('prov.keyPhKeep') : t('prov.keyPhSk')
  }
  $('#pv-route').oninput = () => { if (!pv.existing) pv.apiKeyEnv = undefined; keyHint() }
  $('#pv-import').onchange = e => {
    const x = (pinfo?.dsh || []).find(d => d.route === e.target.value); if (!x) return
    $('#pv-route').value = x.route; $('#pv-name').value = x.displayName; $('#pv-api').value = x.api; $('#pv-url').value = x.baseURL
    pv.apiKeyEnv = x.apiKeyEnv
    const taken = takenFruits(); pv.models = []
    for (const m of x.models) {
      const f = nextFruit(taken); taken.add(f)
      const model = { name: m.name, model: m.id, contextWindow: m.contextWindow || P.DEFAULT_CONTEXT_WINDOW, outputLimit: m.outputLimit || undefined, fruit: f, fastModel: '', efforts: effortsFromDsh(m.reasoningEfforts), vision: Array.isArray(m.input) ? m.input.includes('image') : undefined, limitSources: { contextWindow: m.contextWindow ? 'configured' : 'default', outputLimit: m.outputLimit ? 'configured' : undefined } }
      model.maxTokens = P.recommendModel(model).maxTokens
      pv.models.push(model)
    }
    $('#pv-keyhint').innerHTML = t('prov.credReuseLong', { ref: esc(x.apiKeyEnv) })
    renderPvModels()
  }
  function effortsFromDsh(r) {
    if (r === false) return []
    if (r && typeof r === 'object') return LEVELS.filter(l => l in r)
    return [...DEFAULT_EFFORTS]
  }
  function renderPvModels() {
    const box = $('#pv-models'); box.innerHTML = ''
    if (!pv.models.length) { box.innerHTML = `<div class="hint empty-models">${t('prov.empty')}</div>`; return }
    pv.models.forEach((m, i) => {
      const row = document.createElement('div'); row.className = 'pm-row'
      row.innerHTML = `<button class="fruit-pick"><img src="${S.fruitURL(m.fruit, 28)}" /></button>
        <div class="pm-main">
          <div class="pm-line"><input data-f="name" value="${esc(m.name)}" placeholder="${esc(t('prov.namePh2'))}" aria-label="${esc(t('prov.namePh2'))}" /><input data-f="model" value="${esc(m.model)}" placeholder="${esc(t('prov.modelPh'))}" aria-label="${esc(t('prov.modelPh'))}" spellcheck="false" /><input data-f="fastModel" value="${esc(m.fastModel || '')}" placeholder="${esc(t('prov.fastPh'))}" aria-label="${esc(t('prov.fastPh'))}" spellcheck="false" /></div>
          <div class="model-limits"><label><span>${t('ctx.modelWindow')}</span><input data-f="contextWindow" value="${esc(m.contextWindow || '')}" placeholder="${esc(t('ctx.unknown'))}" type="number" min="1" step="1" /></label><label><span>${t('ctx.modelOutput')}</span><input data-f="maxTokens" value="${esc(m.maxTokens || '')}" type="number" min="1" step="1" /></label><label><span>${t('ctx.outputCapability')}</span><input data-f="outputLimit" value="${esc(m.outputLimit || '')}" placeholder="${esc(t('ctx.unknown'))}" type="number" min="1" step="1" /></label></div>
          <div class="pm-line efforts"><span class="hint">${t('pop.effort')}</span>${LEVELS.map(l => `<label class="eff ${m.efforts.includes(l) ? 'on' : ''}"><input type="checkbox" data-l="${l}" ${m.efforts.includes(l) ? 'checked' : ''} />${EFFORT_ICON[l]} ${effName(l)}</label>`).join('')}</div>
          <label class="check model-vision"><input type="checkbox" data-vision ${m.vision !== false ? 'checked' : ''} /><span>${t('ctx.vision')}</span></label>
          <div class="model-budget hint" aria-live="polite"></div><div class="model-metadata hint"></div>
          <div class="pm-test"><button class="pill-btn test-btn">${t('ctx.detect')}</button><button class="pill-btn recommend-btn">${t('ctx.useRecommended')}</button><span class="test-res ${m._test?.cls || ''}" title="${esc(m._test?.text || '')}" role="status">${esc(m._test?.text || '')}</span></div>
        </div><button class="del">✕</button>`
      row.querySelector('.fruit-pick').onclick = () => {
        const taken = takenFruits(); taken.delete(m.fruit)
        const i0 = S.FRUIT_KEYS.indexOf(m.fruit)
        for (let k = 1; k <= S.FRUIT_KEYS.length; k++) { const f = S.FRUIT_KEYS[(i0 + k) % S.FRUIT_KEYS.length]; if (!taken.has(f) || k === S.FRUIT_KEYS.length) { m.fruit = f; break } }
        renderPvModels()
      }
      for (const inp of row.querySelectorAll('input[data-f]')) inp.oninput = () => {
        const key = inp.dataset.f
        m[key] = inp.type === 'number' ? (inp.value === '' ? 0 : Number(inp.value)) : inp.value.trim()
        if (key === 'contextWindow' || key === 'outputLimit') m.limitSources = { ...m.limitSources, [key]: 'manual' }
        if (key === 'model') { delete m.detectedLimits; delete m.limitsCheckedAt; delete m.outputLimit; delete m.inputLimit; delete m._test; m.limitSources = { contextWindow: 'manual' }; row.querySelector('[data-f="outputLimit"]').value = ''; row.querySelector('.test-res').textContent = '' }
        updateModelBudget(row, m)
      }
      row.querySelector('[data-vision]').onchange = e => { m.vision = e.target.checked }
      for (const cb of row.querySelectorAll('input[data-l]')) cb.onchange = () => {
        m.efforts = LEVELS.filter(l => row.querySelector(`input[data-l="${l}"]`).checked)
        cb.parentElement.classList.toggle('on', cb.checked)
      }
      row.querySelector('.del').onclick = () => { pv.models.splice(i, 1); renderPvModels() }
      row.querySelector('.test-btn').onclick = () => testPvModel(m, row)
      row.querySelector('.recommend-btn').onclick = () => { m.maxTokens = P.recommendModel(m).maxTokens; renderPvModels(); $('#pv-msg').textContent = t('ctx.modelRecommended') }
      updateModelBudget(row, m)
      box.append(row)
    })
  }
  function updateModelBudget(row, m) {
    const budget = row.querySelector('.model-budget'), metadata = row.querySelector('.model-metadata')
    try {
      const c = readCompaction(), b = P.modelBudget(m, c), r = P.recommendModel(m)
      budget.classList.remove('parameter-error')
      budget.textContent = t('ctx.modelSummary', { tokens: tokenText(b.thresholdTokens), percent: (b.thresholdRatio * 100).toFixed(1), output: tokenText(r.maxTokens) })
    } catch (e) { budget.classList.add('parameter-error'); budget.textContent = errText(e) }
    const detected = m.detectedLimits || {}
    metadata.textContent = [t('ctx.detected', { context: tokenText(detected.contextWindow), input: tokenText(detected.inputLimit || m.inputLimit), output: tokenText(detected.outputLimit) }), t('ctx.detectSource', { context: sourceText(m.limitSources?.contextWindow), output: sourceText(m.limitSources?.outputLimit) }), m.limitsCheckedAt ? t('ctx.checked', { time: new Date(m.limitsCheckedAt).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN') }) : ''].filter(Boolean).join('\n')
  }
  function applyModelInfo(m, info) {
    if (!info || info.id !== m.model) return
    m.detectedLimits = { ...m.detectedLimits }
    m.limitSources = { ...m.limitSources }
    for (const key of ['contextWindow', 'inputLimit', 'outputLimit']) {
      if (!(Number.isSafeInteger(info[key]) && info[key] > 0)) continue
      if (info.sources?.[key] !== 'configured') m.detectedLimits[key] = info[key]
      if (key !== 'contextWindow' || m.limitSources.contextWindow !== 'manual') m[key] = info[key]
      if (key !== 'contextWindow' || m.limitSources.contextWindow !== 'manual') m.limitSources[key] = info.sources?.[key] || 'provider'
    }
    if (info.reasoningEfforts !== undefined) m.efforts = effortsFromDsh(info.reasoningEfforts)
    if (Array.isArray(info.input)) m.vision = info.input.includes('image')
    if (info.checkedAt || ['contextWindow', 'inputLimit', 'outputLimit', 'reasoningEfforts', 'input'].some(key => info[key] !== undefined)) m.limitsCheckedAt = info.checkedAt || new Date().toISOString()
    if (!m.maxTokens || m.maxTokens >= m.contextWindow || (m.outputLimit && m.maxTokens > m.outputLimit)) m.maxTokens = P.recommendModel(m).maxTokens
  }
  async function testPvModel(m, row) {
    const btn = row.querySelector('.test-btn'), res = row.querySelector('.test-res')
    const show = (cls, text) => { m._test = { cls, text }; res.className = `test-res ${cls}`; res.textContent = text; res.title = text }
    if (!m.model) return show('bad', t('prov.needModelId'))
    const testedId = m.model
    btn.disabled = true; show('run', t('prov.testing'))
    try {
      const route = $('#pv-route').value.trim()
      const r = await api.testModel({ route, apiKeyEnv: pv.apiKeyEnv, baseURL: $('#pv-url').value.trim(), api: $('#pv-api').value, apiKey: $('#pv-key').value, model: m.model })
      if (m.model !== testedId) return
      applyModelInfo(m, r.modelInfo)
      show('ok', t('prov.modelOk', { sec: (r.ms / 1000).toFixed(1), reply: r.reply ? t('prov.replyInline', { reply: r.reply }) : '' }))
      if (r.metadataWarning) $('#pv-msg').textContent = t('ctx.metadataMissing')
      renderPvModels()
    } catch (e) { show('bad', `✕ ${errText(e)}`) } finally { btn.disabled = false }
  }
  function addPvModel(id = '', name = '', ctx = 0, max = 0, metadata = {}) {
    const model = { name: name || id, model: id, contextWindow: ctx || P.DEFAULT_CONTEXT_WINDOW, outputLimit: metadata.outputLimit || max || undefined, fruit: nextFruit(takenFruits()), fastModel: '', efforts: [...DEFAULT_EFFORTS], limitSources: { contextWindow: ctx ? 'provider' : 'default', outputLimit: max ? 'provider' : undefined } }
    applyModelInfo(model, { ...metadata, id, contextWindow: ctx || undefined, outputLimit: metadata.outputLimit || max || undefined })
    model.maxTokens = P.recommendModel(model).maxTokens
    pv.models.push(model)
  }
  $('#pv-fetch').onclick = async () => {
    const btn = $('#pv-fetch'); btn.disabled = true; btn.textContent = t('prov.fetching'); $('#pv-msg').textContent = ''
    try {
      const route = $('#pv-route').value.trim()
      const list = await api.discover({ route: ROUTE_RE.test(route) ? route : undefined, apiKeyEnv: pv.apiKeyEnv, baseURL: $('#pv-url').value.trim(), api: $('#pv-api').value, apiKey: $('#pv-key').value })
      const have = new Set(pv.models.map(m => m.model))
      const found = $('#pv-found'); found.classList.remove('hidden')
      found.innerHTML = `<div class="row"><b style="white-space:nowrap">${t('prov.foundTitle', { n: list.length })}</b><input id="pv-filter" placeholder="${esc(t('prov.filterPh'))}" /><button id="pv-addsel" class="pill-btn primary">${t('prov.addSelected')}</button><button id="pv-closefound" class="pill-btn">${t('prov.collapse')}</button></div><div class="found-list"></div>`
      const fl = found.querySelector('.found-list')
      const draw = q => {
        fl.innerHTML = list.filter(x => !q || x.id.toLowerCase().includes(q) || String(x.name).toLowerCase().includes(q)).map(x =>
          `<label class="${have.has(x.id) ? 'had' : ''}"><input type="checkbox" value="${esc(x.id)}" ${have.has(x.id) ? 'disabled checked' : ''} /><span>${esc(x.id)}</span>${x.name && x.name !== x.id ? `<small>${esc(x.name)}</small>` : ''}</label>`).join('') || `<div class="hint">${t('prov.noMatch')}</div>`
      }
      draw('')
      found.querySelector('#pv-filter').oninput = e => draw(e.target.value.trim().toLowerCase())
      found.querySelector('#pv-closefound').onclick = () => found.classList.add('hidden')
      found.querySelector('#pv-addsel').onclick = () => {
        for (const cb of fl.querySelectorAll('input:checked:not(:disabled)')) {
          const x = list.find(y => y.id === cb.value); addPvModel(x.id, prettyName(x), x.contextWindow, x.maxTokens, x)
        }
        found.classList.add('hidden'); renderPvModels()
      }
    } catch (e) { $('#pv-msg').textContent = errText(e) } finally { btn.disabled = false; btn.textContent = t('prov.fetch') }
  }
  // One click: discover every model (with input/output limits), fill the form, then save + apply.
  $('#pv-fetch-apply').onclick = async () => {
    const btn = $('#pv-fetch-apply'), say2 = x => { $('#pv-msg').textContent = x }
    const route = $('#pv-route').value.trim()
    if (!ROUTE_RE.test(route)) return say2(t('prov.routeErr'))
    if (!pv.existing && settings.providers?.[route]) return say2(t('prov.exists', { route }))
    if (!/^https?:\/\/\S+$/.test($('#pv-url').value.trim())) return say2(t('prov.urlErr'))
    btn.disabled = true; btn.textContent = t('prov.applying'); say2(t('prov.querying'))
    try {
      const list = await api.discover({ route: ROUTE_RE.test(route) ? route : undefined, apiKeyEnv: pv.apiKeyEnv, baseURL: $('#pv-url').value.trim(), api: $('#pv-api').value, apiKey: $('#pv-key').value })
      if (!list.length) return say2(t('prov.emptyList'))
      const have = new Set(pv.models.map(m => m.model))
      let added = 0
      for (const x of list) {
        if (have.has(x.id)) {
          const m = pv.models.find(y => y.model === x.id)
          applyModelInfo(m, { ...x, outputLimit: x.outputLimit || x.maxTokens })
          continue
        }
        addPvModel(x.id, prettyName(x), x.contextWindow, x.maxTokens, x); added++
      }
      renderPvModels()
      say2(t('prov.fetched', { n: list.length, a: added }))
      $('#pv-save').click()
    } catch (e) { say2(errText(e)) } finally { btn.disabled = false; btn.textContent = t('prov.fetchApply') }
  }
  function prettyName(x) {
    if (x.name && x.name !== x.id) return x.name
    return x.id.replace(/^[a-z]+\//, '').split('-').map(w => /^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)).join(' ').replace(/(\d) (\d)/g, '$1.$2')
  }
  $('#pv-save').onclick = async () => {
    const route = $('#pv-route').value.trim()
    const say2 = x => { $('#pv-msg').textContent = x }
    if (!ROUTE_RE.test(route)) return say2(t('prov.routeErr'))
    if (!pv.existing && settings.providers?.[route]) return say2(t('prov.exists', { route }))
    if (!/^https?:\/\/\S+$/.test($('#pv-url').value.trim())) return say2(t('prov.urlErr'))
    if (!pv.models.length) return say2(t('prov.needOne'))
    if (pv.models.some(m => !m.model)) return say2(t('prov.missingId'))
    if (pv.models.some(m => m.efforts.length === 1 && m.efforts[0] === 'off')) return say2(t('prov.effortOnlyOff'))
    const btn = $('#pv-save'); btn.disabled = true
    try {
      settings = await api.saveProvider(route, { existing: pv.existing, displayName: $('#pv-name').value.trim() || route, api: $('#pv-api').value, baseURL: $('#pv-url').value.trim(), apiKeyEnv: pv.apiKeyEnv }, $('#pv-key').value, pv.models)
      await afterModelsChanged()
      $('#prov-modal').classList.add('hidden'); toast(t('prov.savedToast', { name: $('#pv-name').value.trim() || route }))
    } catch (e) { say2(errText(e)) } finally { btn.disabled = false }
  }
  $('#pv-del').onclick = async () => {
    if (!confirm(t('prov.delConfirm', { route: pv.route }))) return
    try { settings = await api.deleteProvider(pv.route); await afterModelsChanged(); $('#prov-modal').classList.add('hidden'); toast(t('prov.deletedToast')) } catch (e) { $('#pv-msg').textContent = errText(e) }
  }
  async function afterModelsChanged() {
    pinfo = await api.providerInfo().catch(() => pinfo)
    renderFruits(); O.setModels(settings.models); fillDefault(); renderProviders(); renderTopEffort(); renderContextBudget()
    data = await api.init(); for (const a of data.agents) { agents.set(a.id, a); O.updateAgent(a) }
    if (popAgent) renderPop()
  }

  // ---------- one-click import: DSH, Codex, Claude Code, Hermes, opencode, env/.env ----------
  let impScan = null
  const fmtK = n => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
  $('#set-import').onclick = () => { $('#imp-modal').classList.remove('hidden'); renderImport() }
  $('#imp-rescan').onclick = () => renderImport()
  async function renderImport() {
    const box = $('#imp-list'), sum = $('#imp-summary'), hints = $('#imp-hints'), msg2 = x => { $('#imp-msg').textContent = x }
    box.innerHTML = `<div class="hint">${t('imp.scanning')}</div>`; hints.innerHTML = ''; msg2('')
    let r
    try { r = await api.scanAgents() } catch (e) { box.innerHTML = ''; sum.textContent = ''; hints.textContent = t('imp.scanFail', { error: errText(e) }); return }
    impScan = r
    const configured = new Set((r.configured || []).map(x => x.route))
    const canImport = rec => !!rec.baseURL && !configured.has(rec.route) && (rec.hasKey || r.hasKey?.[rec.keyEnv])
    const good = r.records.filter(canImport)
    const skipped = r.records.filter(rec => !canImport(rec))
    sum.textContent = t('imp.summary', { total: r.records.length, good: good.length, sources: r.sources.filter(s => s.count).map(s => `${s.label} ${s.count}`).join(lang === 'en' ? ', ' : '、') || t('imp.sourcesNone') })
    hints.innerHTML = r.sources.flatMap(s => (s.hints || []).map(h => `· ${esc(s.label)}：${esc(h)}`)).join('<br>')
    const groups = {}
    for (const rec of good) (groups[rec.source] ??= []).push(rec)
    const row = rec => {
      const models = rec.models.slice(0, 8)
      const more = rec.models.length - models.length
      return `<label class="imp-row">
        <input type="checkbox" data-id="${esc(rec.id)}" checked />
        <div class="imp-main">
          <div class="imp-line"><b>${esc(I18N.providerName(rec.displayName, lang))}</b><code>${esc(rec.route)}</code><span class="chip">${esc(rec.api)}</span><span class="chip ${rec.hasKey ? 'ok' : 'warn'}">${rec.hasKey ? t('imp.keyMask', { mask: esc(rec.keyMask || '') }) : t('imp.credReuse')}</span><span class="chip">${t('imp.modelCount', { n: rec.models.length })}</span></div>
          <div class="imp-sub">${esc(rec.baseURL)}</div>
          ${rec.models.length ? `<div class="imp-models">${models.map(m => `<small title="${esc(t('imp.limitsTitle'))}">${esc(m.id)} <i>${m.contextWindow ? fmtK(m.contextWindow) : esc(t('ctx.unknown'))}${m.maxTokens ? '/' + fmtK(m.maxTokens) : ''}</i></small>`).join('')}${more > 0 ? `<small>${t('imp.more', { n: more })}</small>` : ''}</div>` : `<div class="hint">${t('imp.autoFetch')}</div>`}
          <div class="hint">${esc(rec.origin)} · ${esc(rec.keyFrom || t('imp.credSaved'))}${rec.otherSources.length ? t('imp.alsoIn', { sources: esc(andJoin(rec.otherSources)) }) : ''}</div>
        </div>
      </label>`
    }
    box.innerHTML = Object.entries(groups).map(([src, recs]) =>
      `<div class="imp-group"><div class="imp-gtitle">${esc(t('src.' + src))}</div>${recs.map(row).join('')}</div>`).join('')
      || `<div class="hint">${t('imp.none')}</div>`
    if (skipped.length) box.insertAdjacentHTML('beforeend', `<div class="hint" style="margin-top:8px">${t('imp.skipped', { n: skipped.length, items: esc(andJoin(skipped.map(x => `${x.sourceLabel}:${x.route}${x.needsURL ? t('imp.needUrl') : ''}`))) })}</div>`)
    const cbs = [...box.querySelectorAll('input[data-id]')]
    const syncAll = () => { $('#imp-all').checked = cbs.length > 0 && cbs.every(cb => cb.checked) }
    cbs.forEach(cb => cb.onchange = syncAll); syncAll()
  }
  $('#imp-all').onchange = e => { for (const cb of document.querySelectorAll('#imp-list input[data-id]')) cb.checked = e.target.checked }
  $('#imp-go').onclick = async () => {
    const r = impScan; if (!r) return
    const ids = [...document.querySelectorAll('#imp-list input[data-id]:checked')].map(cb => cb.dataset.id)
    const say2 = x => { $('#imp-msg').textContent = x }
    if (!ids.length) return say2(t('imp.needPick'))
    const btn = $('#imp-go'); btn.disabled = true
    const ok = [], fail = []
    const taken = new Set(settings.models.map(m => m.fruit))
    const pickFruit = () => { const f = S.FRUIT_KEYS.find(k => !taken.has(k)) || S.FRUIT_KEYS[taken.size % S.FRUIT_KEYS.length]; taken.add(f); return f }
    try {
      for (const rec of r.records.filter(x => ids.includes(x.id))) {
        try {
          let models = rec.models, fromDiscovery = false
          if (!models.length) {
            try { models = await api.discover({ keyFrom: rec.id, baseURL: rec.baseURL, api: rec.api }); fromDiscovery = true }
            catch (e) { throw new Error(t('imp.discoverFail', { error: errText(e) })) }
          }
          if (!models.length) throw new Error(t('imp.noModels'))
          const list = models.slice(0, 40).map(m => {
            const model = { name: m.name || m.id, model: m.id, contextWindow: m.contextWindow || P.DEFAULT_CONTEXT_WINDOW, outputLimit: m.outputLimit || undefined, fruit: pickFruit(), fastModel: '', efforts: effortsFromDsh(m.reasoningEfforts), vision: Array.isArray(m.input) ? m.input.includes('image') : undefined, limitSources: { contextWindow: m.contextWindow ? 'configured' : 'default', outputLimit: m.outputLimit ? 'configured' : undefined } }
            if (fromDiscovery) applyModelInfo(model, { ...m, id: m.id, outputLimit: m.outputLimit || m.maxTokens })
            model.maxTokens = P.recommendModel(model).maxTokens
            return model
          })
          settings = await api.saveProvider(rec.route, {
            existing: false, displayName: rec.displayName || rec.route, api: rec.api,
            baseURL: rec.baseURL, apiKeyEnv: rec.keyEnv, keyFrom: rec.hasKey ? rec.id : undefined,
          }, '', list)
          ok.push(rec.route)
        } catch (e) { fail.push(`${rec.route}: ${errText(e)}`) }
      }
      if (ok.length) await afterModelsChanged()
      let message
      if (ok.length) message = t('imp.okFail', { n: ok.length, ok: andJoin(ok), fail: fail.length ? t('imp.failPart', { fail: andJoin(fail) }) : '' })
      else message = t('imp.allFail', { fail: andJoin(fail) || t('imp.unknownFail') })
      if (ok.length && !fail.length) { $('#imp-modal').classList.add('hidden'); toast(t('imp.doneToast', { n: ok.length })) }
      else { await renderImport(); say2(message) }
    } finally { btn.disabled = false }
  }
  $('#set-pick').onclick = async () => { const d = await api.pickDir(); if (d) $('#set-workspace').value = d }
  $('#set-harness').onchange = async e => {
    harnessDirty[harnessName] = $('#set-harness-text').value
    harnessName = e.target.value
    $('#set-harness-text').value = harnessDirty[harnessName] ?? await api.harness(harnessName)
  }
  $('#set-openharness').onclick = () => api.harnessDir()

  // ---------- extension center: plugins / MCP / experts ----------
  let ext = null, extTab = 'plugins'
  const pk = v => v && typeof v === 'object' && !Array.isArray(v) ? String(v[lang] ?? v.zh ?? v.en ?? '') : String(v ?? '')
  const extMsg = (x, bad) => { const el = $('#ext-msg'); el.textContent = x || ''; el.classList.toggle('parameter-error', !!bad) }
  const srcName = s => s === 'user' ? t('ext.srcUser') : pk(ext?.plugins.find(p => p.id === s)?.name) || s
  async function openExt(tab) {
    $('#ext-modal').classList.remove('hidden'); extMsg('')
    if (tab) extTab = tab
    try { ext = await api.extInfo() } catch (e) { extMsg(errText(e), true); return }
    renderExt()
  }
  async function saveExt(patch, okText) {
    try { ext = await api.saveExt(patch); settings = { ...settings, ...patch }; renderExt(); extMsg(okText || t('ext.saved')); return true }
    catch (e) { extMsg(errText(e), true); return false }
  }
  function renderExt() {
    if (!ext) return
    for (const b of document.querySelectorAll('[data-ext-tab]')) b.classList.toggle('on', b.dataset.extTab === extTab)
    for (const p of document.querySelectorAll('.ext-pane')) p.classList.toggle('hidden', p.dataset.pane !== extTab)
    $('#ext-live').textContent = t('ext.live', { p: ext.plugins.filter(p => p.enabled).length, m: ext.live.mcp.length, e: ext.live.experts.length, s: ext.live.skills.length })
    renderPlugins(); renderMcpList(); renderSkills(); renderExperts()
  }
  const sw = (on, attrs = '') => `<label class="sw"><input type="checkbox" ${on ? 'checked' : ''} ${attrs}/><span></span></label>`
  function renderPlugins() {
    const box = $('#ext-plugins')
    if (!ext.plugins.length) { box.innerHTML = `<div class="empty-models hint">${t('ext.noPlugins')}</div>`; return }
    box.innerHTML = ext.plugins.map(p => {
      const parts = []
      if (p.experts.length) parts.push(t('ext.cExperts', { n: p.experts.length }))
      if (p.mcpServers.length) parts.push(t('ext.cMcp', { n: p.mcpServers.length }))
      if (p.skills.length) parts.push(t('ext.cSkills', { n: p.skills.length }))
      const mcpRows = p.mcpServers.map(s => {
        const k = `${p.id}/${s.name}`, o = ext.pluginMcp[k], on = typeof o === 'boolean' ? o : s.enabled
        const shadow = ext.live.skipped.some(x => x.name === s.name && x.source === p.id)
        return `<div class="ext-sub"><code>${esc(s.name)}</code><span class="hint">${esc(s.transport === 'stdio' ? [s.command, ...s.args].join(' ') : s.url)}</span>${shadow ? `<span class="chip warn">${t('ext.shadowed')}</span>` : ''}<div class="spacer"></div><button class="pill-btn mini" data-ptest="${esc(k)}">${t('mcp.test')}</button>${sw(on, `data-pmcp="${esc(k)}" ${p.enabled ? '' : 'disabled'}`)}</div><div class="ext-sub-res hint" data-pres="${esc(k)}"></div>`
      }).join('')
      return `<div class="prov-card ext-card${p.enabled ? ' on' : ''}" data-plugin="${esc(p.id)}">
        <div class="pc-head"><b>${esc(pk(p.name))}</b><code>${esc(p.id)}</code>${p.version ? `<span class="hint">v${esc(p.version)}</span>` : ''}<span class="chip ${p.builtin ? '' : 'busy'}">${p.builtin ? t('ext.builtin') : t('ext.userPlugin')}</span>${p.error ? `<span class="chip warn">${esc(p.error)}</span>` : ''}<div class="spacer"></div>${p.builtin ? '' : `<button class="pill-btn danger mini" data-premove="${esc(p.id)}">${t('ext.remove')}</button>`}${sw(p.enabled, `data-ptoggle="${esc(p.id)}" ${p.error ? 'disabled' : ''}`)}</div>
        <div class="pc-sub">${esc(pk(p.description))}</div>
        <div class="pc-models">${parts.map(x => `<span class="pc-model plain">${x}</span>`).join('')}${p.skills.map(s => `<span class="pc-model plain skill" title="${esc(s.description || '')}">📘 ${esc(s.name)}</span>`).join('')}</div>
        ${mcpRows}</div>`
    }).join('')
    for (const el of box.querySelectorAll('[data-ptoggle]')) el.onchange = () => saveExt({ plugins: { ...ext.plugins.reduce((o, p) => (o[p.id] = p.enabled, o), {}), [el.dataset.ptoggle]: el.checked } }, el.checked ? t('ext.pluginOn') : t('ext.pluginOff'))
    for (const el of box.querySelectorAll('[data-pmcp]')) el.onchange = () => saveExt({ pluginMcp: { ...ext.pluginMcp, [el.dataset.pmcp]: el.checked } })
    for (const el of box.querySelectorAll('[data-premove]')) el.onclick = async () => {
      if (!confirm(t('ext.removeConfirm', { id: el.dataset.premove }))) return
      try { ext = await api.removePlugin(el.dataset.premove); renderExt(); extMsg(t('ext.removed')) } catch (e) { extMsg(errText(e), true) }
    }
    for (const el of box.querySelectorAll('[data-ptest]')) el.onclick = async () => {
      const [pid, name] = el.dataset.ptest.split('/')
      const s = ext.plugins.find(p => p.id === pid).mcpServers.find(x => x.name === name)
      const res = box.querySelector(`[data-pres="${CSS.escape(el.dataset.ptest)}"]`)
      el.disabled = true; res.textContent = t('mcp.testing')
      const r = await api.testMcp(s).catch(e => ({ ok: false, error: errText(e) }))
      el.disabled = false; res.innerHTML = mcpResult(r)
    }
  }
  const mcpResult = r => r.ok ? `<span class="ok-text">✓ ${t('mcp.ok', { n: r.tools.length, server: esc(r.server?.title || r.server?.name || '') })}</span> ${r.tools.slice(0, 24).map(x => `<code title="${esc(x.description)}">${esc(x.name)}</code>`).join(' ')}` : `<span class="parameter-error">✕ ${esc(r.error || '')}</span>`
  function renderMcpList() {
    const box = $('#ext-mcp'), list = ext.mcpServers
    const fromPlugins = ext.live.mcp.filter(m => m.source !== 'user')
    box.innerHTML = (list.length ? list.map((s, i) => `<div class="prov-card ext-card${s.enabled ? ' on' : ''}"><div class="pc-head"><b>${esc(s.name)}</b><span class="chip">${s.transport === 'stdio' ? 'stdio' : 'HTTP'}</span><span class="hint ellipsis">${esc(s.transport === 'stdio' ? [s.command, ...s.args].join(' ') : s.url)}</span><div class="spacer"></div><button class="pill-btn mini" data-mtest="${i}">${t('mcp.test')}</button><button class="pill-btn mini" data-medit="${i}">${t('prov.edit')}</button>${sw(s.enabled, `data-mtoggle="${i}"`)}</div>${s.description ? `<div class="pc-sub">${esc(s.description)}</div>` : ''}<div class="ext-sub-res hint" data-mres="${i}"></div></div>`).join('')
      : `<div class="empty-models hint">${t('ext.noMcp')}</div>`)
      + (fromPlugins.length ? `<div class="hint ext-foot">${t('ext.mcpFromPlugins', { list: fromPlugins.map(m => `<code>${esc(m.name)}</code> ← ${esc(srcName(m.source))}`).join('　') })}</div>` : '')
    for (const el of box.querySelectorAll('[data-medit]')) el.onclick = () => openMcp(Number(el.dataset.medit))
    for (const el of box.querySelectorAll('[data-mtoggle]')) el.onchange = () => saveExt({ mcpServers: list.map((s, i) => i === Number(el.dataset.mtoggle) ? { ...s, enabled: el.checked } : s) })
    for (const el of box.querySelectorAll('[data-mtest]')) el.onclick = async () => {
      const res = box.querySelector(`[data-mres="${el.dataset.mtest}"]`)
      el.disabled = true; res.textContent = t('mcp.testing')
      const r = await api.testMcp(list[Number(el.dataset.mtest)]).catch(e => ({ ok: false, error: errText(e) }))
      el.disabled = false; res.innerHTML = mcpResult(r)
    }
  }
  function renderSkills() {
    const box = $('#ext-skills')
    const rows = [...ext.skills.map(s => ({ ...s, source: 'user' })), ...ext.plugins.filter(p => p.enabled).flatMap(p => p.skills.map(s => ({ ...s, source: p.id })))]
    if (!rows.length) { box.innerHTML = `<div class="empty-models hint">${t('ext.noSkills')}</div>`; return }
    const usedBy = n => [...ext.experts, ...ext.plugins.filter(p => p.enabled).flatMap(p => p.experts)].filter(e => (e.skillset || []).includes(n)).map(e => pk(e.title))
    box.innerHTML = rows.map((s, i) => {
      const k = `${s.source}/${s.name}`, on = ext.skillToggles[k] !== false
      const shadow = on && ext.live.skipped.some(x => x.kind === 'skill' && x.name === s.name && x.source === s.source)
      const users = usedBy(s.name)
      return `<div class="prov-card ext-card${on ? ' on' : ''}"><div class="pc-head"><span>📘</span><b>${esc(s.name)}</b><span class="chip ${s.source === 'user' ? 'busy' : ''}">${esc(srcName(s.source))}</span>${shadow ? `<span class="chip warn">${t('ext.shadowed')}</span>` : ''}<div class="spacer"></div><button class="pill-btn mini" data-skopen="${i}">${s.source === 'user' ? t('prov.edit') : t('sk.view')}</button>${sw(on, `data-sktoggle="${esc(k)}"`)}</div><div class="pc-sub">${esc(s.description || '')}</div>${users.length ? `<div class="hint">${t('sk.usedBy', { list: users.map(esc).join('、') })}</div>` : ''}</div>`
    }).join('')
    for (const el of box.querySelectorAll('[data-sktoggle]')) el.onchange = () => saveExt({ skillToggles: { ...ext.skillToggles, [el.dataset.sktoggle]: el.checked } })
    for (const el of box.querySelectorAll('[data-skopen]')) el.onclick = () => { const s = rows[Number(el.dataset.skopen)]; openSkill(s.source, s.name) }
  }
  // Skill editor: user skills are editable; plugin skills open read-only and can be copied.
  let skEdit = null
  async function openSkill(source, name) {
    let s = { name: '', description: '', body: '', source: 'user' }
    if (name) { try { s = await api.readSkill(source, name) } catch (e) { extMsg(errText(e), true); return } }
    const ro = source && source !== 'user'
    skEdit = name && !ro ? name : null
    $('#sk-head').textContent = t(ro ? 'sk.headView' : name ? 'sk.headEdit' : 'sk.headAdd')
    $('#sk-name').value = s.name || name || ''; $('#sk-desc').value = s.description; $('#sk-body').value = s.body
    for (const id of ['#sk-name', '#sk-desc', '#sk-body']) $(id).readOnly = ro
    $('#sk-source').textContent = ro ? t('sk.fromPlugin', { src: srcName(source) }) : ''
    $('#sk-del').classList.toggle('hidden', !skEdit)
    $('#sk-save').textContent = ro ? t('ex.copy') : t('set.save')
    $('#sk-save').dataset.copy = ro ? '1' : ''
    $('#sk-msg').textContent = ''
    $('#skill-modal').classList.remove('hidden')
  }
  $('#sk-save').onclick = async () => {
    if ($('#sk-save').dataset.copy) { // plugin skill → editable copy
      for (const id of ['#sk-name', '#sk-desc', '#sk-body']) $(id).readOnly = false
      $('#sk-name').value = `${$('#sk-name').value}-mine`.slice(0, 64); $('#sk-head').textContent = t('sk.headAdd'); $('#sk-source').textContent = ''
      $('#sk-save').dataset.copy = ''; $('#sk-save').textContent = t('set.save'); skEdit = null; return
    }
    try {
      ext = await api.saveSkill({ name: $('#sk-name').value.trim(), description: $('#sk-desc').value.trim(), body: $('#sk-body').value, oldName: skEdit || undefined })
      renderExt(); extMsg(t('sk.saved')); $('#skill-modal').classList.add('hidden')
    } catch (e) { $('#sk-msg').textContent = errText(e) }
  }
  $('#sk-del').onclick = async () => {
    if (!skEdit || !confirm(t('sk.delConfirm', { name: skEdit }))) return
    try { ext = await api.deleteSkill(skEdit); renderExt(); $('#skill-modal').classList.add('hidden') } catch (e) { $('#sk-msg').textContent = errText(e) }
  }
  $('#ext-skill-add').onclick = () => openSkill('user', '')
  $('#ext-skill-folder').onclick = () => api.skillDir()
  $('#ext-skill-reload').onclick = async () => { try { ext = await api.reloadSkills(); renderExt(); extMsg(t('sk.reloaded', { n: ext.live.skills.length })) } catch (e) { extMsg(errText(e), true) } }
  $('#ext-skill-import').onclick = async () => {
    try { const r = await api.importSkill('dir'); if (r) { ext = r; renderExt(); extMsg(t('sk.imported', { list: r.imported.join(', ') })) } } catch (e) { extMsg(errText(e), true) }
  }
  function renderExperts() {
    const box = $('#ext-experts')
    const custom = ext.experts.map(e => ({ ...e, source: 'user' }))
    const fromPlugins = ext.plugins.filter(p => p.enabled).flatMap(p => p.experts.map(e => ({ ...e, source: p.id })))
    const all = [...custom, ...fromPlugins]
    if (!all.length) { box.innerHTML = `<div class="empty-models hint">${t('ext.noExperts')}</div>`; return }
    box.innerHTML = `<div class="ex-grid">${all.map((e, i) => `<div class="ex-card${e.source === 'user' ? ' mine' : ''}" data-ex="${i}"><div class="ex-top"><span class="ex-icon">${esc(e.icon || '🧠')}</span><div><b>${esc(pk(e.title))}</b><div class="hint">${esc(pk(e.name) || '')} · <code>${esc(e.id)}</code></div></div></div><div class="ex-skills">${esc(pk(e.skills))}</div><div class="ex-foot"><span class="chip ${e.source === 'user' ? 'busy' : ''}">${esc(srcName(e.source))}</span>${e.mcp?.length ? `<span class="hint">MCP: ${e.mcp.map(esc).join(', ')}</span>` : ''}${e.skillset?.length ? `<span class="hint" title="${esc(e.skillset.join(', '))}">📘 ${e.skillset.length}</span>` : ''}<div class="spacer"></div><button class="pill-btn mini" data-exopen="${i}">${e.source === 'user' ? t('prov.edit') : t('ex.copy')}</button></div></div>`).join('')}</div>`
    for (const el of box.querySelectorAll('[data-exopen]')) el.onclick = () => {
      const e = all[Number(el.dataset.exopen)]
      if (e.source === 'user') openExpert(ext.experts.findIndex(x => x.id === e.id))
      else openExpert(-1, { ...e, id: `${e.id}-custom`, name: pk(e.name), title: pk(e.title), skills: pk(e.skills), prompt: pk(e.prompt), skillset: e.skillset || [] })
    }
  }
  for (const b of document.querySelectorAll('[data-ext-tab]')) b.onclick = () => { extTab = b.dataset.extTab; renderExt() }
  $('#btn-ext').onclick = () => openExt()
  $('#ext-plugin-folder').onclick = () => api.pluginDir()
  $('#ext-plugin-install').onclick = async () => {
    try { const r = await api.installPlugin(); if (r) { ext = r; renderExt(); extMsg(t('ext.installed')) } } catch (e) { extMsg(errText(e), true) }
  }

  // MCP editor. Command line is split shell-style: quotes group, so paths with spaces work.
  let mcpIdx = -1
  const splitCmd = s => (String(s).match(/"[^"]*"|'[^']*'|\S+/g) || []).map(x => /^(["']).*\1$/.test(x) ? x.slice(1, -1) : x)
  const joinCmd = a => a.map(x => /\s/.test(x) ? `"${x}"` : x).join(' ')
  const kvText = o => Object.entries(o || {}).map(([k, v]) => `${k}=${v}`).join('\n')
  const kvParse = s => { const o = {}; for (const line of String(s).split(/\r?\n/)) { const m = /^\s*([^=:\s]+)\s*[=:]\s*(.*)$/.exec(line); if (m) o[m[1]] = m[2].trim() } return o }
  function mcpTransportUi() {
    const http = $('#mcp-transport').value !== 'stdio'
    for (const el of document.querySelectorAll('.mcp-stdio')) el.classList.toggle('hidden', http)
    for (const el of document.querySelectorAll('.mcp-http')) el.classList.toggle('hidden', !http)
    $('#mcp-kv-label').textContent = t(http ? 'mcp.headers' : 'mcp.env')
    $('#mcp-kv').placeholder = http ? 'Authorization=Bearer ${MY_TOKEN}' : 'GITHUB_TOKEN=${GITHUB_TOKEN}'
  }
  function openMcp(i, preset) {
    mcpIdx = i
    const s = preset || (i >= 0 ? ext.mcpServers[i] : { name: '', transport: 'stdio', command: '', args: [], env: {}, enabled: true, timeoutMs: 60000 })
    $('#mcp-head').textContent = t(i >= 0 ? 'mcp.headEdit' : 'mcp.headAdd')
    $('#mcp-name').value = s.name; $('#mcp-transport').value = s.transport; $('#mcp-desc').value = s.description || ''
    $('#mcp-command').value = s.transport === 'stdio' ? joinCmd([s.command, ...(s.args || [])].filter(Boolean)) : ''
    $('#mcp-cwd').value = s.cwd || ''; $('#mcp-url').value = s.url || ''
    $('#mcp-kv').value = kvText(s.transport === 'stdio' ? s.env : s.headers)
    $('#mcp-timeout').value = Math.round((s.timeoutMs || 60000) / 1000); $('#mcp-enabled').checked = s.enabled !== false
    $('#mcp-del').classList.toggle('hidden', i < 0); $('#mcp-msg').textContent = ''; $('#mcp-test-res').textContent = ''; $('#mcp-tools').innerHTML = ''
    mcpTransportUi()
    $('#mcp-modal').classList.remove('hidden')
  }
  function readMcp() {
    const transport = $('#mcp-transport').value
    const s = { name: $('#mcp-name').value.trim(), transport, description: $('#mcp-desc').value.trim(), enabled: $('#mcp-enabled').checked, timeoutMs: Math.round(Number($('#mcp-timeout').value || 60) * 1000) }
    if (transport === 'stdio') { const parts = splitCmd($('#mcp-command').value.trim()); s.command = parts[0] || ''; s.args = parts.slice(1); s.env = kvParse($('#mcp-kv').value); s.cwd = $('#mcp-cwd').value.trim() }
    else { s.url = $('#mcp-url').value.trim(); s.headers = kvParse($('#mcp-kv').value) }
    return P.normalizeMcpServer(s)
  }
  $('#mcp-transport').onchange = mcpTransportUi
  $('#ext-mcp-add').onclick = () => openMcp(-1)
  $('#mcp-test').onclick = async () => {
    let s; try { s = readMcp() } catch (e) { $('#mcp-test-res').innerHTML = `<span class="parameter-error">${esc(errText(e))}</span>`; return }
    $('#mcp-test').disabled = true; $('#mcp-test-res').textContent = t('mcp.testing'); $('#mcp-tools').innerHTML = ''
    const r = await api.testMcp(s).catch(e => ({ ok: false, error: errText(e) }))
    $('#mcp-test').disabled = false
    $('#mcp-test-res').innerHTML = r.ok ? `<span class="ok-text">✓ ${t('mcp.ok', { n: r.tools.length, server: esc(r.server?.title || r.server?.name || '') })}</span>` : `<span class="parameter-error">✕ ${esc(r.error || '')}</span>`
    if (r.ok) $('#mcp-tools').innerHTML = r.tools.map(x => `<div><code>${esc(x.name)}</code> <span class="hint">${esc(x.description)}</span></div>`).join('')
  }
  $('#mcp-save').onclick = async () => {
    let s; try { s = readMcp() } catch (e) { $('#mcp-msg').textContent = errText(e); return }
    const list = [...ext.mcpServers]
    if (mcpIdx >= 0) list[mcpIdx] = s; else list.push(s)
    if (await saveExt({ mcpServers: list })) $('#mcp-modal').classList.add('hidden')
    else $('#mcp-msg').textContent = $('#ext-msg').textContent
  }
  $('#mcp-del').onclick = async () => {
    if (mcpIdx < 0 || !confirm(t('mcp.delConfirm', { name: ext.mcpServers[mcpIdx].name }))) return
    if (await saveExt({ mcpServers: ext.mcpServers.filter((_, i) => i !== mcpIdx) })) $('#mcp-modal').classList.add('hidden')
  }
  // Paste a Claude/Cursor-style {"mcpServers":{...}} JSON block to import many servers at once.
  $('#ext-mcp-paste').onclick = async () => {
    const raw = prompt(t('ext.mcpPastePrompt'))
    if (!raw) return
    try {
      let j = JSON.parse(raw); j = j.mcpServers || j.servers || j
      const add = Object.entries(j).map(([name, v]) => P.normalizeMcpServer({ name: name.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32), ...v, transport: v.url ? 'streamable-http' : 'stdio', enabled: v.disabled !== true }))
      const names = new Set(add.map(s => s.name.toLowerCase()))
      await saveExt({ mcpServers: [...ext.mcpServers.filter(s => !names.has(s.name.toLowerCase())), ...add] }, t('ext.mcpImported', { n: add.length }))
    } catch (e) { extMsg(errText(e), true) }
  }

  // Expert editor (custom experts; plugin experts can be copied into an editable one).
  let exIdx = -1
  function openExpert(i, preset) {
    exIdx = i
    const e = preset || (i >= 0 ? ext.experts[i] : { id: '', name: '', title: '', skills: '', prompt: '', icon: '', mcp: [], skillset: [] })
    $('#ex-head').textContent = t(i >= 0 ? 'ex.headEdit' : 'ex.headAdd')
    $('#ex-id').value = e.id; $('#ex-id').disabled = i >= 0
    $('#ex-icon').value = e.icon || ''; $('#ex-title').value = pk(e.title); $('#ex-name').value = pk(e.name); $('#ex-skills').value = pk(e.skills); $('#ex-prompt').value = pk(e.prompt)
    const names = [...new Set([...ext.live.mcp.map(m => m.name), ...(e.mcp || [])])]
    $('#ex-mcp').innerHTML = names.length ? names.map(n => `<label class="eff${(e.mcp || []).includes(n) ? ' on' : ''}"><input type="checkbox" value="${esc(n)}" ${(e.mcp || []).includes(n) ? 'checked' : ''}/>${esc(n)}</label>`).join('') : `<span class="hint">${t('ex.noMcp')}</span>`
    for (const l of $('#ex-mcp').querySelectorAll('label')) l.querySelector('input').onchange = ev => l.classList.toggle('on', ev.target.checked)
    const sks = [...new Set([...ext.live.skills.map(s => s.name), ...(e.skillset || [])])]
    $('#ex-skillset').innerHTML = sks.length ? sks.map(n => `<label class="eff${(e.skillset || []).includes(n) ? ' on' : ''}"><input type="checkbox" value="${esc(n)}" ${(e.skillset || []).includes(n) ? 'checked' : ''}/>📘 ${esc(n)}</label>`).join('') : `<span class="hint">${t('ex.noSkills')}</span>`
    for (const l of $('#ex-skillset').querySelectorAll('label')) l.querySelector('input').onchange = ev => l.classList.toggle('on', ev.target.checked)
    $('#ex-del').classList.toggle('hidden', i < 0); $('#ex-msg').textContent = ''
    $('#expert-modal').classList.remove('hidden')
  }
  $('#ext-expert-add').onclick = () => openExpert(-1)
  $('#ex-save').onclick = async () => {
    let e
    try {
      e = P.normalizeExpert({ id: $('#ex-id').value.trim(), icon: $('#ex-icon').value.trim(), title: $('#ex-title').value.trim(), name: $('#ex-name').value.trim(), skills: $('#ex-skills').value.trim(), prompt: $('#ex-prompt').value.trim(), mcp: [...$('#ex-mcp').querySelectorAll('input:checked')].map(x => x.value), skillset: [...$('#ex-skillset').querySelectorAll('input:checked')].map(x => x.value) })
    } catch (err) { $('#ex-msg').textContent = errText(err); return }
    const list = [...ext.experts]
    if (exIdx >= 0) list[exIdx] = e
    else { if (list.some(x => x.id === e.id)) { $('#ex-msg').textContent = t('ex.dup', { id: e.id }); return } list.push(e) }
    if (await saveExt({ experts: list })) $('#expert-modal').classList.add('hidden')
    else $('#ex-msg').textContent = $('#ext-msg').textContent
  }
  $('#ex-del').onclick = async () => {
    if (exIdx < 0 || !confirm(t('ex.delConfirm', { id: ext.experts[exIdx].id }))) return
    if (await saveExt({ experts: ext.experts.filter((_, i) => i !== exIdx) })) $('#expert-modal').classList.add('hidden')
  }
  $('#set-log').onclick = () => api.openLog()
  $('#set-save').onclick = async () => {
    const btn = $('#set-save'); btn.disabled = true
    harnessDirty[harnessName] = $('#set-harness-text').value
    try {
      const compaction = readCompaction()
      P.validateSettings({ ...settings, compaction })
      for (const [n, x] of Object.entries(harnessDirty)) await api.saveHarness(n, x)
      settings = await api.saveSettings({
        browser: window.OfficeBrowser.readSettings(),
        workspace: $('#set-workspace').value.trim() || settings.workspace,
        dshRoot: $('#set-dsh').value.trim() || settings.dshRoot,
        proxyPort: Number($('#set-proxy').value) || 0,
        permissionMode: $('#set-perm').value,
        normalConcurrency: Math.max(1, Number($('#set-conc').value) || 3),
        minTeam: Math.max(1, Number($('#set-min').value) || 2),
        maxTeam: Math.max(1, Number($('#set-max').value) || 5),
        defaultModel: $('#set-default').value,
        defaultEffort: $('#set-effort').value,
        compaction,
        ...(window.OfficeAutopilot ? window.OfficeAutopilot.read() : {}),
      })
      renderFruits(); O.setModels(settings.models)
      data = await api.init(); for (const a of data.agents) { agents.set(a.id, a); O.updateAgent(a) }
      projects = data.projects; O.setProjects(projects)
      $('#settings-modal').classList.add('hidden'); toast(t('set.saved'))
    } catch (e) { $('#set-msg').textContent = errText(e) } finally { btn.disabled = false }
  }

  // greeting
  if (!settings.models?.length) setTimeout(() => { O.handlers.say({ id: 'ceo', text: t('greet.noModel'), ms: 7000 }); toast(t('greet.noModelToast')) }, 1200)
  else setTimeout(() => O.handlers.say({ id: 'ceo', text: t('greet.ready'), ms: 5000 }), 1200)
  setTimeout(() => O.handlers.say({ id: 'hr', text: t('greet.hr'), ms: 3500 }), 3000)
})()
