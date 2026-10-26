'use strict'
// Stable workspace navigation around the pixel office; existing button actions stay in app.js.
;(() => {
  const I = window.I18N, t = key => I.t(key)
  Object.assign(I.zh, { 'tb.workspace': '办公室导航', 'tb.modelControls': '模型与工作模式' })
  Object.assign(I.en, { 'tb.workspace': 'Office navigation', 'tb.modelControls': 'Models and work mode' })
  const panels = [['btn-projects','project-modal'], ['btn-browser','browser-modal'], ['btn-archive','archive-modal'], ['btn-chat','chat-modal']]
  const tray = document.getElementById('fruits'), status = document.getElementById('status-text')
  function update() {
    document.querySelector('.workspace-nav').setAttribute('aria-label', t('tb.workspace'))
    document.querySelector('.office-controls').setAttribute('aria-label', t('tb.modelControls'))
    tray.setAttribute('aria-label', t('tray.label'))
    for (const fruit of tray.children) fruit.title = fruit.querySelector('.fname')?.textContent || ''
    document.getElementById('status-pill').title = status.textContent || ''
    for (const [buttonId, panelId] of panels) {
      const button = document.getElementById(buttonId), panel = document.getElementById(panelId)
      const expanded = !!panel && !panel.classList.contains('hidden')
      button.setAttribute('aria-expanded', String(expanded))
      button.classList.toggle('is-active', expanded)
    }
  }
  const contentObserver = new MutationObserver(update)
  contentObserver.observe(tray, { childList: true, subtree: true })
  contentObserver.observe(status, { childList: true, subtree: true, characterData: true })
  const panelObserver = new MutationObserver(update)
  for (const [, id] of panels) panelObserver.observe(document.getElementById(id), { attributes: true, attributeFilter: ['class'] })
  tray.addEventListener('wheel', event => {
    if (tray.scrollWidth > tray.clientWidth && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault()
      tray.scrollLeft += event.deltaY
    }
  }, { passive: false })
  document.getElementById('btn-lang').addEventListener('click', () => queueMicrotask(update))
  update()
})()
