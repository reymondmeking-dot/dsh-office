'use strict'
// Keep existing click handlers and modal classes; add keyboard semantics around them.
;(() => {
  const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'
  const opened = new Map()
  let active = null
  const visible = el => el && !el.closest('.hidden') && el.getClientRects().length > 0
  function sync() {
    const modals = [...document.querySelectorAll('.modal')]
    for (const modal of modals) {
      const shown = !modal.classList.contains('hidden')
      modal.setAttribute('role', 'dialog')
      modal.setAttribute('aria-modal', 'true')
      modal.setAttribute('aria-hidden', String(!shown))
      const heading = modal.querySelector('.sheet-head .h1')
      if (heading) {
        if (!heading.id) heading.id = `${modal.id || 'office-dialog'}-heading`
        modal.setAttribute('aria-labelledby', heading.id)
      }
      if (shown && !opened.has(modal)) opened.set(modal, { previous: document.activeElement, at: performance.now() })
      if (!shown && opened.has(modal)) {
        const prior = opened.get(modal).previous
        opened.delete(modal)
        if (active === modal && visible(prior) && typeof prior.focus === 'function') prior.focus({ preventScroll: true })
      }
    }
    const next = modals.filter(m => opened.has(m)).sort((a,b) => opened.get(a).at - opened.get(b).at).at(-1) || null
    if (next !== active) {
      active = next
      if (active) {
        const target = [...active.querySelectorAll(focusable)].find(visible)
        if (target) target.focus({ preventScroll: true })
        else { active.tabIndex = -1; active.focus({ preventScroll: true }) }
      }
    }
    for (const el of document.querySelectorAll('button[data-i18n-title], .tl, button.x')) {
      if (el.title) el.setAttribute('aria-label', el.title)
      else if (el.classList.contains('x')) {
        const label = window.I18N?.t('tb.close')
        if (label) el.setAttribute('aria-label', label)
      }
    }
    for (const el of document.querySelectorAll('.file, .book, .file-chip, .file-link')) {
      if (el.matches('a, button')) continue
      el.tabIndex = 0
      el.setAttribute('role', 'button')
      if (el.title) el.setAttribute('aria-label', el.title)
    }
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Tab' && active) {
      const items = [...active.querySelectorAll(focusable)].filter(visible)
      const first = items[0], last = items.at(-1)
      if (!items.length) { e.preventDefault(); active.focus(); return }
      if (e.shiftKey && (document.activeElement === first || !active.contains(document.activeElement))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (document.activeElement === last || !active.contains(document.activeElement))) { e.preventDefault(); first.focus() }
    }
    const target = e.target.closest('.file, .book, .file-chip, .file-link')
    if (target && target.getAttribute('role') === 'button' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      target.click()
    }
  })
  let queued = false
  const observer = new MutationObserver(() => {
    if (queued) return
    queued = true
    queueMicrotask(() => { queued = false; sync() })
  })
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'title'] })
  sync()
})()
