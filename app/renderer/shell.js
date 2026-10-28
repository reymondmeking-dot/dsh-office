'use strict'
// Small, shared popovers keep secondary actions out of the task path.
;(() => {
  const $ = s => document.querySelector(s), I = window.I18N
  Object.assign(I.zh, { 'shell.more': '更多', 'shell.workMode': '模型与工作模式', 'shell.modelHint': '将模型拖给员工，或调整默认推理强度', 'shell.stopProject': '停止项目', 'shell.stopping': '正在停止…', 'shell.stopped': '已停止，已有文件已保留' })
  Object.assign(I.en, { 'shell.more': 'More', 'shell.workMode': 'Models & work mode', 'shell.modelHint': 'Drag a model to an employee, or adjust the default reasoning effort', 'shell.stopProject': 'Stop project', 'shell.stopping': 'Stopping…', 'shell.stopped': 'Stopped. Existing files are preserved.' })
  const bindings = new WeakMap(); let active = null
  const items = menu => [...menu.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(x => x.getClientRects().length)
  function closeAll(restoreFocus = false) {
    if (!active) return
    const { trigger, menu } = active; active = null
    if (menu.matches(':popover-open')) menu.hidePopover()
    menu.classList.add('hidden'); trigger.setAttribute('aria-expanded', 'false')
    if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true })
  }
  function position() {
    if (!active) return
    const { trigger, menu } = active
    if (!trigger.isConnected || !menu.isConnected || trigger.closest('.modal.hidden')) { closeAll(); return }
    const r = trigger.getBoundingClientRect(), box = menu.getBoundingClientRect(), margin = 12
    menu.style.left = Math.max(margin, Math.min(innerWidth - box.width - margin, r.right - box.width)) + 'px'
    menu.style.top = Math.max(margin, Math.min(innerHeight - box.height - margin, r.bottom + 8)) + 'px'
  }
  function bind(trigger, menu, options = {}) {
    if (typeof trigger === 'string') trigger = $(trigger)
    if (typeof menu === 'string') menu = $(menu)
    if (!trigger || !menu || bindings.has(trigger)) return
    bindings.set(trigger, menu); menu.setAttribute('popover', 'manual')
    trigger.setAttribute('aria-expanded', 'false')
    if (menu.id) trigger.setAttribute('aria-controls', menu.id)
    function open(focus = false, last = false) {
      if (active?.trigger === trigger) { if (focus) (last ? items(menu).at(-1) : items(menu)[0])?.focus(); else closeAll(); return }
      closeAll(); active = { trigger, menu, options }; menu.classList.remove('hidden'); menu.showPopover(); trigger.setAttribute('aria-expanded', 'true'); position()
      if (focus) (last ? items(menu).at(-1) : items(menu)[0])?.focus()
    }
    trigger.addEventListener('click', e => open(e.detail === 0))
    trigger.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); open(true, e.key === 'ArrowUp') } })
    menu.addEventListener('click', e => { if (options.closeOnSelect !== false && e.target.closest('button, [role="menuitem"]')) closeAll() })
  }
  document.addEventListener('pointerdown', e => { if (active && !active.menu.contains(e.target) && !active.trigger.contains(e.target)) closeAll() }, true)
  document.addEventListener('keydown', e => {
    if (!active) return
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeAll(true); return }
    if (!active.menu.contains(e.target) || active.options.closeOnSelect === false) return
    const list = items(active.menu), index = list.indexOf(document.activeElement)
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (index + (e.key === 'ArrowUp' ? -1 : 1) + list.length) % list.length; list[next]?.focus() }
  }, true)
  document.addEventListener('focusin', e => { if (active && !active.menu.contains(e.target) && !active.trigger.contains(e.target)) closeAll() })
  window.addEventListener('resize', position)
  document.addEventListener('scroll', position, true)
  // A hidden parent must never leave an orphan in Chromium's top layer.
  new MutationObserver(() => { if (active && (!active.trigger.isConnected || active.trigger.closest('.hidden'))) closeAll() }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
  window.OfficeMenus = { bind, closeAll }
  for (const [trigger, menu] of [['#btn-more', '#office-more-menu'], ['#chat-more', '#chat-more-menu'], ['#ext-skill-more', '#skill-more-menu'], ['#project-more', '#project-more-menu']]) bind(trigger, menu)
  bind('#btn-work-mode', '#work-mode-menu', { closeOnSelect: false })

  // Settings keeps one category visible and all edits mounted until Save/Cancel.
  let category = 'set-workspace'
  const categories = ['set-workspace', 'set-providers-section', 'cli-settings', 'env-settings', 'auto-settings', 'context-settings', 'browser-settings', 'set-harness-section']
  function selectSettings(id) {
    if (!categories.includes(id)) id = category
    category = id
    const groups = [...document.querySelectorAll('#settings-modal .settings-body > .group')]
    const chosen = document.getElementById(id)?.closest('.group')
    groups.forEach(group => group.classList.toggle('hidden', group !== chosen && !(id === 'set-workspace' && group === groups[1])))
    document.querySelectorAll('#settings-modal [data-setting-jump]').forEach(button => { const selected = button.dataset.settingJump === id; button.classList.toggle('is-active', selected); if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current') })
    const body = $('#settings-modal .settings-body'); body.scrollTop = 0
  }
  document.addEventListener('click', e => { const button = e.target.closest('[data-setting-jump]'); if (button) selectSettings(button.dataset.settingJump) }, true)
  document.addEventListener('office:settings', () => selectSettings(category))
  $('#btn-about').onclick = () => $('#about-modal').classList.remove('hidden')
  $('#btn-resources').onclick = () => { $('#btn-settings').click(); selectSettings('cli-settings') }
  window.OfficeShell = { selectSettings }
})()
