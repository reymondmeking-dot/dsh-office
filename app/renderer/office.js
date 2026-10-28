/* Office scene: tile map, furniture, pathfinding, characters and choreography. */
'use strict'
window.Office = (() => {
  const T = 8, W = 50, H = 29, PW = W * T, PH = H * T
  const S = window.Sprites
  let lang = 'zh'
  const tr = (k, v) => window.I18N.t(k, v)
  const pickT = k => { const v = window.I18N.t(k); return Array.isArray(v) ? v : [v] }
  const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h) }

  // ---------- map ----------
  const solid = Array.from({ length: H }, () => Array(W).fill(false))
  const region = Array.from({ length: H }, () => Array(W).fill('open'))
  const block = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (y >= 0 && y < H && x >= 0 && x < W) solid[y][x] = true }
  const open = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) solid[y][x] = false }
  const setRegion = (name, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) region[y][x] = name }

  setRegion('ceo', 1, 0, 13, 9); setRegion('hr', 15, 0, 26, 9); setRegion('meet', 28, 0, 48, 9); setRegion('archive', 37, 12, 48, 27)
  setRegion('lounge', 28, 12, 35, 27)
  // outer walls + back wall face rows
  block(0, 0, W - 1, 1); block(0, 0, 0, H - 1); block(W - 1, 0, W - 1, H - 1); block(0, H - 1, W - 1, H - 1)
  // room dividers
  block(0, 10, W - 1, 10); block(14, 0, 14, 10); block(27, 0, 27, 10)
  block(36, 11, 36, H - 1); block(36, 11, W - 1, 11)
  const DOORS = { ceo: [7, 10], hr: [20, 10], meet: [37, 10], archive: [36, 18], entrance: [15, 28] }
  open(7, 10, 8, 10); open(20, 10, 21, 10); open(37, 10, 38, 10); open(36, 17, 36, 18); open(14, 28, 16, 28)

  // ---------- furniture ----------
  const furniture = []
  const add = (f) => { furniture.push(f); if (f.block) block(...f.block); return f }

  const DESKS = []
  const DESK_COLS = [3, 10, 17, 24], DESK_ROWS = [15, 22]
  for (const dy of DESK_ROWS) for (const dx of DESK_COLS) {
    const d = add({ kind: 'desk', tx: dx, ty: dy, w: 4, h: 2, block: [dx, dy, dx + 3, dy + 1], seat: [dx + 2, dy - 1], face: 'down' })
    DESKS.push(d)
  }
  const CEO_DESK = add({ kind: 'desk', boss: true, tx: 5, ty: 5, w: 5, h: 2, block: [5, 5, 9, 6], seat: [7, 4], face: 'down' })
  const HR_DESK = add({ kind: 'desk', tx: 18, ty: 5, w: 4, h: 2, block: [18, 5, 21, 6], seat: [20, 4], face: 'down' })
  const MEET_TABLE = add({ kind: 'table', tx: 31, ty: 5, w: 15, h: 2, block: [31, 5, 45, 6] })
  const MEET_SEATS = []
  for (const x of [32, 35, 38, 41, 44]) MEET_SEATS.push({ t: [x, 4], face: 'down' })
  for (const x of [32, 35, 38, 41, 44]) MEET_SEATS.push({ t: [x, 7], face: 'up' })
  const MEET_HEAD = { t: [30, 5], face: 'right' }, MEET_HR = { t: [46, 5], face: 'left' }

  // decor
  add({ kind: 'plant', tx: 1, ty: 2, block: [1, 2, 1, 2] }); add({ kind: 'plant', tx: 13, ty: 2, block: [13, 2, 13, 2] })
  add({ kind: 'shelf', tx: 2, ty: 1, w: 3 }); add({ kind: 'trophy', tx: 10, ty: 1 })
  add({ kind: 'sofa', tx: 2, ty: 8, w: 3, block: [2, 8, 4, 8] })
  add({ kind: 'rug', tx: 4, ty: 3, w: 7, h: 6, color: '#c9a77c' })
  add({ kind: 'plant', tx: 15, ty: 2, block: [15, 2, 15, 2] }); add({ kind: 'cabinet', tx: 24, ty: 2, w: 2, block: [24, 2, 25, 2] })
  add({ kind: 'board', tx: 16, ty: 1, w: 4 }); add({ kind: 'plant', tx: 26, ty: 9, block: [26, 9, 26, 9] })
  add({ kind: 'rug', tx: 17, ty: 3, w: 6, h: 6, color: '#f3c6cf' })
  add({ kind: 'whiteboard', tx: 34, ty: 1, w: 8 }); add({ kind: 'plant', tx: 28, ty: 2, block: [28, 2, 28, 2] }); add({ kind: 'plant', tx: 48, ty: 2, block: [48, 2, 48, 2] })
  add({ kind: 'tv', tx: 44, ty: 1, w: 3 })
  const COFFEE = add({ kind: 'coffee', tx: 29, ty: 12, block: [29, 12, 29, 12], brewUntil: 0 }); add({ kind: 'cooler', tx: 31, ty: 12, block: [31, 12, 31, 12] })
  add({ kind: 'vending', tx: 33, ty: 12, w: 2, block: [33, 12, 34, 12] })
  add({ kind: 'sofa', back: true, tx: 29, ty: 25, w: 4, block: [29, 25, 32, 25] }); add({ kind: 'plant', tx: 35, ty: 27, block: [35, 27, 35, 27] })
  add({ kind: 'loungetv', tx: 29, ty: 23, w: 4, block: [29, 23, 32, 23] })
  add({ kind: 'plant', tx: 1, ty: 27, block: [1, 27, 1, 27] }); add({ kind: 'plant', tx: 1, ty: 12, block: [1, 12, 1, 12] })
  add({ kind: 'pingpong', tx: 29, ty: 18, w: 5, h: 3, block: [29, 18, 33, 20] })
  add({ kind: 'mat', tx: 13, ty: 26, w: 5, h: 2 })
  // archive shelves
  const SHELVES = [
    add({ kind: 'bookshelf', tx: 38, ty: 12, w: 5, h: 2, block: [38, 12, 42, 13] }),
    add({ kind: 'bookshelf', tx: 43, ty: 12, w: 5, h: 2, block: [43, 12, 47, 13] }),
    add({ kind: 'bookshelf', tx: 39, ty: 17, w: 8, h: 2, block: [39, 17, 46, 18] }),
    add({ kind: 'bookshelf', tx: 39, ty: 22, w: 8, h: 2, block: [39, 22, 46, 23] }),
  ]
  add({ kind: 'readtable', tx: 38, ty: 26, w: 3, block: [38, 26, 40, 26] }); add({ kind: 'plant', tx: 48, ty: 27, block: [48, 27, 48, 27] })
  add({ kind: 'lamp', tx: 47, ty: 26, block: [47, 26, 47, 26] })

  const SPOTS = {
    ceoVisit: [7, 8], ceoQueue: [[4, 7], [10, 7], [4, 9], [10, 9], [6, 9], [9, 9]],
    hrVisit: [20, 8], hrQueue: [[17, 8], [23, 8], [16, 9], [24, 9], [18, 9], [22, 9]], ceoFromHr: [8, 8], entrance: [15, 27], outside: [15, 28], hrWelcome: [16, 25],
    archive: [43, 20], coffee: [29, 13], water: [31, 13], vending: [33, 13],
    wander: [[30, 15], [34, 16], [34, 24], [34, 23], [12, 13], [22, 19], [6, 19], [27, 26], [20, 13], [33, 22]],
  }
  // leisure spots: sofa seats facing the lounge TV, ping-pong ends
  const TV_SEATS = [[29, 25], [30, 25], [31, 25], [32, 25]]
  const tvSeat = TV_SEATS.map(() => null)
  const PP_ENDS = [{ t: [28, 19], face: 'right' }, { t: [34, 19], face: 'left' }]
  let match = null // live ping-pong match { ids, ready:Set, live, t0, dur, winner }
  const flyers = [] // rush coffee cups in flight

  // ---------- pathfinding ----------
  function bfs(from, to) {
    const key = (x, y) => y * W + x
    const [sx, sy] = from, [tx, ty] = to
    if (sx === tx && sy === ty) return []
    const prev = new Int32Array(W * H).fill(-1)
    const q = [key(sx, sy)]; prev[key(sx, sy)] = key(sx, sy)
    const passable = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (!solid[y][x] || (x === tx && y === ty))
    while (q.length) {
      const k = q.shift(); const x = k % W, y = (k / W) | 0
      if (x === tx && y === ty) break
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (!passable(nx, ny)) continue
        const nk = key(nx, ny)
        if (prev[nk] !== -1) continue
        prev[nk] = k; q.push(nk)
      }
    }
    if (prev[key(tx, ty)] === -1) return null
    const path = []
    for (let k = key(tx, ty); k !== key(sx, sy); k = prev[k]) path.push([k % W, (k / W) | 0])
    return path.reverse()
  }
  const tileOf = c => [Math.max(0, Math.min(W - 1, Math.floor(c.x / T))), Math.max(0, Math.min(H - 1, Math.floor((c.y - 1) / T)))]
  const center = ([x, y]) => [x * T + T / 2, y * T + T - 1]

  // ---------- characters ----------
  const chars = new Map()
  const particles = []
  let rush = false
  let projects = []
  let meetingTitle = ''
  let hoverId = null, dropHoverId = null
  let models = []
  let time = 0
  const listeners = { bubble: () => {} }

  function homeOf(c) {
    if (c.role === 'ceo') return { t: CEO_DESK.seat, face: 'down', desk: CEO_DESK }
    if (c.role === 'hr') return { t: HR_DESK.seat, face: 'down', desk: HR_DESK }
    const d = DESKS[c.deskIndex ?? 0] || DESKS[0]
    return { t: d.seat, face: 'down', desk: d }
  }

  function makeChar(a, at) {
    const c = {
      ...a, x: 0, y: 0, dir: 'down', pose: 'stand', path: [], token: 0, alpha: 1, seed: Math.random() * 10,
      bubble: null, typingUntil: 0, carry: null, idleAt: performance.now() + 4000 + Math.random() * 8000, busyScript: false,
    }
    const t = at || homeOf(c).t
    ;[c.x, c.y] = center(t)
    chars.set(c.id, c)
    return c
  }

  function freeDesk() {
    const used = new Set([...chars.values()].filter(c => c.role === 'employee').map(c => c.deskIndex))
    for (let i = 0; i < DESKS.length; i++) if (!used.has(i)) return i
    return 0
  }

  const sleep = ms => new Promise(r => setTimeout(r, rush ? ms / 2.5 : ms))
  class Cancelled extends Error {}

  /** Start an async script on a character, cancelling any previous script. */
  function script(c, fn) {
    const token = ++c.token
    c.busyScript = true
    const guard = () => { if (c.token !== token || !chars.has(c.id)) throw new Cancelled() }
    const api = {
      walk: async (t) => { guard(); await walkTo(c, t, guard); guard() },
      wait: async ms => { guard(); await sleep(ms); guard() },
      sit: (face) => { guard(); c.pose = 'sit'; c.dir = face || 'down' },
      face: d => { guard(); c.dir = d },
      say: (text, ms) => { guard(); bubble(c, text, ms) },
      guard,
    }
    return fn(api).catch(e => { if (!(e instanceof Cancelled)) console.error(e) }).finally(() => { if (c.token === token) c.busyScript = false })
  }

  function walkTo(c, t, guard) {
    return new Promise((resolve, reject) => {
      const p = bfs(tileOf(c), t)
      c.pose = 'stand'
      if (!p) { [c.x, c.y] = center(t); return resolve() }
      c.path = p.map(center)
      c.arrive = () => resolve()
      c.guard = () => { try { guard() } catch (e) { c.path = []; reject(e) } }
    })
  }

  function bubble(c, text, ms = 3000) {
    if (!c) return
    c.bubble = { text: String(text), until: performance.now() + (rush ? Math.max(1200, ms * 0.6) : ms) }
  }

  function goHome(c, extra) {
    return script(c, async a => {
      const h = homeOf(c)
      await a.walk(h.t); a.sit(h.face)
      if (extra) await extra(a)
    })
  }

  // ---------- event choreography ----------
  let ceoVisitBusy = Promise.resolve()

  const handlers = {
    'summon-hr'(ev) {
      const ceo = chars.get('ceo'), hr = chars.get('hr')
      script(ceo, async a => {
        ceo.carry = 'paper'
        a.say(tr('story.goalSet', { title: ev.title }), 1800); await a.wait(1600)
        await a.walk(SPOTS.hrVisit); a.face('up')
        a.say(tr('story.goalToHr', { hr: hr.name || 'HR', text: (ev.text || tr('story.goalFallback')).slice(0, 60) }), 3000)
        await a.wait(2800); ceo.carry = null
        bubble(hr, tr('story.hrGot'), 2400)
        await a.wait(2000)
        const h = homeOf(ceo); await a.walk(h.t); a.sit('down')
      })
    },
    'hr-hiring'() {
      const hr = chars.get('hr'); if (!hr) return
      hr.typingUntil = performance.now() + 60000
      bubble(hr, tr('story.screening'), 4000)
      hr.hiring = true
    },
    hired(ev) {
      const hr = chars.get('hr')
      if (hr) { hr.hiring = false; hr.typingUntil = 0 }
      ev.agents.forEach((a, i) => {
        setTimeout(() => {
          const c = makeChar({ ...a, deskIndex: freeDesk() }, SPOTS.outside)
          c.alpha = 0; c.fadeIn = true
          script(c, async s => {
            await s.walk(SPOTS.entrance)
            s.say(tr('story.intro', { name: c.name, title: c.title }), 2400)
            await s.wait(900)
            const h = homeOf(c); await s.walk(h.t); s.sit(h.face)
          })
        }, i * 700)
      })
      if (hr) script(hr, async s => {
        await s.walk(SPOTS.hrWelcome); s.face('down')
        s.say(tr('story.welcome', { n: ev.agents.length }), 3000)
        await s.wait(3200 + ev.agents.length * 500)
        const h = homeOf(hr); await s.walk(h.t); s.sit('down')
      })
    },
    'meeting-start'(ev) {
      let seat = 0
      for (const id of ev.ids) {
        const c = chars.get(id); if (!c) continue
        const hostHr = ev.host === 'hr'
        const spot = c.role === 'ceo' ? (hostHr ? MEET_HR : MEET_HEAD) : c.role === 'hr' ? (hostHr ? MEET_HEAD : MEET_HR) : MEET_SEATS[seat++ % MEET_SEATS.length]
        script(c, async a => { await a.wait(Math.random() * 600); await a.walk(spot.t); a.sit(spot.face) })
      }
      meetingTitle = ev.title || meetingTitle
    },
    'meeting-end'(ev) {
      for (const id of ev.ids) { const c = chars.get(id); if (c) setTimeout(() => goHome(c), Math.random() * 700) }
    },
    say(ev) {
      setTimeout(() => bubble(chars.get(ev.id), ev.text, ev.ms), ev.delay || 0)
    },
    'work-start'(ev) {
      const c = chars.get(ev.id); if (!c) return
      goHome(c, async a => { c.typingUntil = performance.now() + 3600_000 })
    },
    typing(ev) {
      const c = chars.get(ev.id); if (c && c.pose === 'sit') c.typingUntil = Math.max(c.typingUntil, performance.now() + 4000)
    },
    report(ev) {
      const c = chars.get(ev.id), toHr = ev.to === 'hr', boss = chars.get(toHr ? 'hr' : 'ceo'); if (!c) return
      c.typingUntil = 0
      const queue = toHr ? SPOTS.hrQueue : SPOTS.ceoQueue, visit = toHr ? SPOTS.hrVisit : SPOTS.ceoVisit
      const queueSpot = queue[Math.floor(Math.random() * queue.length)]
      const tagged = { done: tr('story.tagDone'), partial: tr('story.tagPartial'), blocked: tr('story.tagBlocked') }[ev.status] || (ev.ok ? tr('story.tagDone') : tr('story.tagIssue'))
      script(c, async a => {
        c.carry = 'paper'
        a.say(tr('story.goReport', { tag: tagged, boss: toHr ? (boss?.name || 'HR') : (lang === 'en' ? 'the boss' : '老板') }), 1500)
        await a.wait(600)
        await a.walk(queueSpot); a.face('up')
        let release
        const prev = ceoVisitBusy
        ceoVisitBusy = new Promise(r => (release = r))
        try {
          await prev; a.guard()
          await a.walk(visit); a.face('up')
          const short = ev.text.replace(/\s+/g, ' ').slice(0, 90) + (ev.text.length > 90 ? '…' : '')
          a.say(`📣 ${short}`, 4200)
          if (boss) { boss.dir = 'down'; boss.talking = true }
          await a.wait(3800)
          c.carry = null
          if (boss) { boss.talking = false; if (toHr) bubble(boss, tr('story.bossLook', { name: c.name }), 2400); else bubble(boss, ev.ok ? tr('story.bossThanks', { name: c.name }) : tr('story.bossHandle'), 2000) }
          if (toHr) { c.awaitReview = true; let n = 0; while (c.awaitReview && n++ < 400) await a.wait(300) } // wait for HR's verdict
          else await a.wait(1500)
        } finally { release() }
        c.carry = null
        const h = homeOf(c); await a.walk(h.t); a.sit('down')
        if (!toHr) a.say(tr('story.doneCoffee'), 1500)
      })
    },
    review(ev) {
      const c = chars.get(ev.id), hr = chars.get(ev.by || 'hr'); if (!c) return
      const short = (ev.comment || '').replace(/\s+/g, ' ').slice(0, 70)
      if (hr) bubble(hr, ev.pass ? tr('story.passShort', { text: short }) : tr('story.returnShort', { text: short }), 4500)
      c.awaitReview = false
      setTimeout(() => bubble(c, ev.pass ? tr('story.celebrate') : tr('story.goFix'), 1800), 900)
      if (ev.pass) setTimeout(() => burst(c.x, c.y - 20, 8, ['#7ee787', '#fff', '#ffd23f']), 600)
    },
    handover() {
      const hr = chars.get('hr'), ceo = chars.get('ceo'); if (!hr) return
      script(hr, async a => {
        hr.carry = 'book'; hr.carryColor = '#4d96ff'
        a.say(tr('story.reviewDone'), 1800)
        await a.walk(SPOTS.ceoFromHr); a.face('up')
        if (ceo) bubble(ceo, tr('story.bossAccept'), 2000)
        await a.wait(2200); hr.carry = null
        const h = homeOf(hr); await a.walk(h.t); a.sit('down')
      })
    },
    archive(ev) {
      const ceo = chars.get('ceo'); if (!ceo) return
      const color = (projects.find(p => p.id === ev.project)?.color) ?? 0
      script(ceo, async a => {
        ceo.carry = 'book'; ceo.carryColor = BOOK_COLORS[color % BOOK_COLORS.length]
        a.say(tr('story.sendArchive'), 1800)
        await a.walk(SPOTS.archive); a.face('up')
        await a.wait(1200)
        ceo.carry = null
        burst(ceo.x, ceo.y - 20, 14, ['#ffe14d', '#fff', '#9be7ff'])
        a.say(tr('story.archived'), 1500)
        listeners.archived?.(ev.project)
        await a.wait(800)
        const h = homeOf(ceo); await a.walk(h.t); a.sit('down')
      })
    },
    dismiss(ev) {
      for (const id of ev.ids) {
        const c = chars.get(id); if (!c) continue
        script(c, async a => {
          a.say(tr('story.offWork'), 1800)
          await a.wait(400 + Math.random() * 800)
          await a.walk(SPOTS.entrance); await a.walk(SPOTS.outside)
          c.fadeOut = true
        })
      }
    },
    celebrate() {
      for (let i = 0; i < 6; i++) setTimeout(() => burst(PW * (0.15 + Math.random() * 0.7), PH * (0.2 + Math.random() * 0.5), 26, ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff']), i * 220)
    },
    rush(ev) { setRush(ev.on) },
  }

  function setRush(on) {
    rush = !!on
    for (const c of chars.values()) if (on) burst(c.x, c.y - 12, 10, ['#ffe14d', '#fff3b0', '#ffb300'])
    if (on) setTimeout(rushCoffee, 700)
  }

  function burst(x, y, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 60
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 1 + Math.random(), c: colors[i % colors.length] })
    }
  }

  // ---------- idle life ----------
  const pick = arr => arr[Math.floor(Math.random() * arr.length)]
  const idle = c => !c.busyScript && c.status !== 'busy' && c.status !== 'reporting'
  const freeUp = c => { const i = tvSeat.indexOf(c.id); if (i >= 0) tvSeat[i] = null; c.sip = false; c.swing = false; if (c.carry === 'paddle') c.carry = null }
  async function sipLoop(a, c, ms) {
    const end = performance.now() + ms
    while (performance.now() < end) { await a.wait(1600 + Math.random() * 1600); c.sip = true; await a.wait(700); c.sip = false }
  }
  async function brewCoffee(a, c) {
    await a.walk(SPOTS.coffee); a.face('up')
    COFFEE.brewUntil = performance.now() + (rush ? 900 : 2400)
    await a.wait(rush ? 900 : 2400)
    c.carry = 'coffee'
  }
  function backToDesk(c, a) { const h = homeOf(c); return a.walk(h.t).then(() => a.sit('down')) }

  const activities = {
    async coffee(a, c) {
      await brewCoffee(a, c)
      a.say(pick(pickT('flavor.coffee')), 1500)
      await backToDesk(c, a); await sipLoop(a, c, 9000); c.carry = null
    },
    async tv(a, c) {
      const i = tvSeat.findIndex(s => !s); if (i < 0) return activities.coffee(a, c)
      tvSeat[i] = c.id
      try {
        if (Math.random() < 0.5) { await brewCoffee(a, c) }
        await a.walk(TV_SEATS[i]); a.sit('up')
        await a.wait(1500); a.say(pick(pickT('flavor.tv')), 1800)
        if (c.carry === 'coffee') await sipLoop(a, c, 9000); else await a.wait(9000)
        if (Math.random() < 0.4) { a.say(pick(['😆', '👏', '😮']), 1000); await a.wait(3000) }
      } finally { tvSeat[i] = null }
      await backToDesk(c, a); c.carry = null
    },
    async pingpong(a, c) {
      if (match) return script(c, b => activities.tv(b, c).finally(() => freeUp(c)))
      const rival = pick([...chars.values()].filter(o => o !== c && idle(o) && (o.role === 'employee' || Math.random() < 0.5)))
      if (!rival) return script(c, b => activities.tv(b, c).finally(() => freeUp(c)))
      const m = match = { ids: [c.id, rival.id], ready: new Set(), live: false, t0: 0 }
      bubble(c, tr('story.pingpong', { name: rival.name }), 1800)
      const play = (p, end) => script(p, async b => {
        try {
          await b.walk(end.t); b.face(end.face); p.carry = 'paddle'
          m.ready.add(p.id)
          while (m.ready.size < 2) { await b.wait(200); if (match !== m) return }
          if (!m.live) { m.live = true; m.t0 = time }
          const dur = 12000 + Math.random() * 6000, start = performance.now()
          while (performance.now() - start < dur) {
            await b.wait(80)
            const k = m.k ?? 0.5, mine = end.face === 'right' ? k < 0.12 : k > 0.88
            p.swing = mine
          }
          p.swing = false; m.live = false
          if (p === c) { const win = pick([c, rival]); bubble(win, pick(pickT('flavor.win')), 2000); bubble(win === c ? rival : c, pick(pickT('flavor.lose')), 2000) }
          await b.wait(1600)
          p.carry = null
          await backToDesk(p, b)
        } finally { freeUp(p) }
      })
      play(rival, PP_ENDS[1])
      return play(c, PP_ENDS[0])
    },
    async wander(a, c) {
      await a.walk(pick(SPOTS.wander))
      a.say(pick(pickT('flavor.idle')), 1600)
      await a.wait(2200); await backToDesk(c, a)
    },
    async drink(a, c) {
      await a.walk(pick([SPOTS.water, SPOTS.vending])); a.face('up'); await a.wait(1800)
      c.carry = 'coffee'; a.say(pick(pickT('flavor.water')), 1400)
      await backToDesk(c, a); await sipLoop(a, c, 6000); c.carry = null
    },
  }

  function idleTick(now) {
    if (match && !match.ids.every(id => chars.get(id)?.busyScript)) match = null
    for (const c of chars.values()) {
      if (!idle(c) || now < c.idleAt) continue
      c.idleAt = now + (rush ? 6000 : 10000) + Math.random() * 14000
      const boss = c.role === 'ceo' || c.role === 'hr'
      if (boss && Math.random() > 0.35) continue
      const r = Math.random()
      const kind = rush ? (r < 0.6 ? 'coffee' : null)
        : boss ? (r < 0.5 ? 'coffee' : r < 0.75 ? 'tv' : 'drink')
          : r < 0.25 ? 'coffee' : r < 0.45 ? 'tv' : r < 0.62 ? 'pingpong' : r < 0.8 ? 'wander' : r < 0.9 ? 'drink' : null
      if (!kind) continue
      if (kind === 'pingpong') { activities.pingpong(null, c); continue }
      script(c, a => activities[kind](a, c).finally(() => freeUp(c)))
    }
  }

  /** Rush: the coffee machine fires a cup to everyone; they sip it at their seat. */
  function rushCoffee() {
    COFFEE.brewUntil = performance.now() + 1800
    const [mx, my] = [COFFEE.tx * T + 4, COFFEE.ty * T - 4]
    let i = 0
    for (const c of chars.values()) {
      if (c.fadeOut) continue
      const d = i++ * 140
      setTimeout(() => flyers.push({ id: c.id, x0: mx, y0: my, t: 0, dur: 0.75 + Math.random() * 0.3 }), d)
    }
  }
  function stepFlyers(dt) {
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i]; f.t += dt
      const c = chars.get(f.id); if (!c) { flyers.splice(i, 1); continue }
      if (f.t >= f.dur) {
        flyers.splice(i, 1)
        c.carry = 'coffee'; burst(c.x, c.y - 16, 8, ['#7b4b2a', '#fff', '#ffd23f'])
        bubble(c, pick(pickT('flavor.thanks')), 1600)
        const token = c.token
        setTimeout(() => { if (c.token === token && c.carry === 'coffee') c.sip = true }, 900)
        setTimeout(() => { c.sip = false }, 1700)
        setTimeout(() => { if (c.carry === 'coffee' && !c.busyScript) c.carry = null }, 14000)
      }
    }
  }
  function drawFlyers(ctx) {
    for (const f of flyers) {
      const c = chars.get(f.id); if (!c) continue
      const k = Math.min(1, f.t / f.dur), tx = c.x + 3, ty = c.y - 16
      const x = f.x0 + (tx - f.x0) * k, y = f.y0 + (ty - f.y0) * k - Math.sin(k * Math.PI) * 26
      ctx.fillStyle = 'rgba(255,214,90,0.35)'; ctx.beginPath(); ctx.arc(x + 1.25, y + 1.5, 3, 0, Math.PI * 2); ctx.fill()
      ob(ctx, x, y, 2.5, 3, '#ffffff'); R(ctx, x, y, 2.5, 0.75, '#6b3e26'); R(ctx, x + 2.5, y + 0.75, 0.75, 1.25, '#ffffff')
      R(ctx, x + 1, y - 1.5 - (time * 6 % 1), 0.5, 1, 'rgba(255,255,255,0.7)')
    }
  }

  // ---------- drawing ----------
  const BOOK_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e84393', '#34495e']
  const FLOOR = {
    ceo: (x, y) => ((x + y) % 2 ? '#c49a6c' : '#bd9363'),
    hr: (x, y) => ((x + y) % 2 ? '#d8b48d' : '#d1ac84'),
    meet: (x, y) => ((x * 3 + y) % 5 === 0 ? '#9fb3c8' : '#a9bdd1'),
    archive: (x, y) => ((x + y) % 2 ? '#a68b6d' : '#9f8466'),
    lounge: (x, y) => ((x + y) % 2 ? '#e3ecd9' : '#dbe6cf'),
    open: (x, y) => ((x + y) % 2 ? '#eceae4' : '#e6e3dc'),
  }

  let floorCache = null, floorK = 0, devK = 1
  function drawFloor(ctx) {
    if (!floorCache || floorK !== devK) {
      floorK = devK
      floorCache = document.createElement('canvas'); floorCache.width = Math.round(PW * devK); floorCache.height = Math.round(PH * devK)
      const f = floorCache.getContext('2d'); f.__s = devK; f.setTransform(devK, 0, 0, devK, 0, 0); S.snap(f)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        R(f, x * T, y * T, T, T, FLOOR[region[y][x]](x, y))
        if (region[y][x] === 'ceo' || region[y][x] === 'hr' || region[y][x] === 'archive') R(f, x * T, y * T + 7, T, 1, 'rgba(0,0,0,0.06)')
        if (region[y][x] === 'open') { R(f, x * T, y * T, T, 0.5, 'rgba(0,0,0,0.05)'); R(f, x * T, y * T, 0.5, T, 'rgba(0,0,0,0.05)') }
        if (region[y][x] === 'ceo' || region[y][x] === 'hr' || region[y][x] === 'archive') { R(f, x * T + ((y % 2) ? 0 : 4), y * T, 0.5, T, 'rgba(0,0,0,0.07)'); R(f, x * T + 1, y * T + 1, 2, 0.5, 'rgba(255,255,255,0.12)') }
        if (region[y][x] === 'meet') R(f, x * T + ((x * 7 + y * 3) % 6), y * T + ((x + y * 5) % 6), 0.5, 0.5, 'rgba(255,255,255,0.3)')
        if (region[y][x] === 'lounge') R(f, x * T, y * T, T, 0.5, 'rgba(0,0,0,0.04)')
      }
    }
    ctx.drawImage(floorCache, 0, 0, PW, PH)
  }

  function skyColor() {
    const h = new Date().getHours() + new Date().getMinutes() / 60
    if (h < 5 || h >= 20) return ['#1b2448', '#2d3a6b']
    if (h < 7) return ['#f7a072', '#ffd4a3']
    if (h < 17) return ['#8ecbff', '#c9e8ff']
    return ['#ff9a6b', '#ffc78f']
  }

  function drawWalls(ctx) {
    const [sky1, sky2] = skyColor()
    const night = sky1 === '#1b2448'
    // back wall faces (rows 0-1) with wainscot + baseboard
    for (let x = 0; x < W; x++) {
      const reg = region[2][x]
      const wall = reg === 'meet' ? '#e3ebf3' : reg === 'hr' ? '#f8e9ec' : reg === 'ceo' ? '#efe6d6' : '#efe9df'
      R(ctx, x * T, 0, T, 2 * T, wall)
      R(ctx, x * T, 9, T, 5, shadeC(wall, -0.06))
      R(ctx, x * T, 9, T, 0.5, shadeC(wall, 0.4))
      if (x % 2 === 0) R(ctx, x * T, 9.5, 0.5, 4.5, shadeC(wall, -0.12))
    }
    R(ctx, 0, 2 * T - 2, PW, 2, '#b9afa0'); R(ctx, 0, 2 * T - 2, PW, 0.5, '#d9d1c4'); R(ctx, 0, 2 * T, PW, 1, 'rgba(0,0,0,0.12)')
    // windows on back wall
    const win = (x, w) => {
      R(ctx, x - 0.5, 1.5, w + 1, 8.5, S.OUT)
      R(ctx, x, 2, w, 7.5, '#f4f1ea')
      R(ctx, x + 1, 3, w - 2, 5.5, sky1); R(ctx, x + 1, 6, w - 2, 2.5, sky2)
      if (night) { R(ctx, x + 3, 4, 0.5, 0.5, '#fff'); R(ctx, x + w - 4, 5, 0.5, 0.5, '#fffbd0'); R(ctx, x + w / 2 + 3, 3.5, 1.5, 1.5, '#fff6c8') }
      else {
        R(ctx, x + 2, 4, 3, 1, 'rgba(255,255,255,0.9)'); R(ctx, x + 3, 3.5, 2, 0.5, 'rgba(255,255,255,0.9)')
        // distant skyline
        for (let i = 0; i < w - 2; i += 3) R(ctx, x + 1 + i, 8.5 - ((i * 7) % 3 + 1), 2, (i * 7) % 3 + 1, 'rgba(90,120,160,0.35)')
      }
      R(ctx, x + w / 2 - 0.25, 3, 0.5, 5.5, '#f4f1ea'); R(ctx, x + 1, 5.5, w - 2, 0.5, '#f4f1ea')
      R(ctx, x + 1.5, 3.5, 0.5, 2, 'rgba(255,255,255,0.6)')
      R(ctx, x - 1, 9.5, w + 2, 1, '#d9d1c4'); R(ctx, x - 1, 10.5, w + 2, 0.5, 'rgba(0,0,0,0.15)')
    }
    win(5 * T, 20); win(21 * T, 18); win(29 * T, 16); win(47 * T - 4, 12)
    // clock in CEO office, framed picture in HR office
    R(ctx, 11.5 * T - 0.5, 2.5, 6, 6, S.OUT); R(ctx, 11.5 * T, 3, 5, 5, '#ffffff')
    const hh = new Date().getHours() % 12, mm = new Date().getMinutes()
    const cx = 11.5 * T + 2.5, cy = 5.5
    for (let i = 0; i < 4; i++) R(ctx, cx + Math.cos(i * Math.PI / 2) * 2 - 0.25, cy + Math.sin(i * Math.PI / 2) * 2 - 0.25, 0.5, 0.5, '#888')
    ctx.strokeStyle = '#2b2635'; ctx.lineWidth = 0.4; ctx.beginPath()
    ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin((hh + mm / 60) / 12 * Math.PI * 2) * 1.2, cy - Math.cos((hh + mm / 60) / 12 * Math.PI * 2) * 1.2)
    ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(mm / 60 * Math.PI * 2) * 1.9, cy - Math.cos(mm / 60 * Math.PI * 2) * 1.9); ctx.stroke()
    R(ctx, 24 * T - 0.5, 1.5, 9, 7, S.OUT); R(ctx, 24 * T, 2, 8, 6, '#c79a63'); R(ctx, 24 * T + 1, 3, 6, 4, '#bfe3c7'); R(ctx, 24 * T + 1, 5, 6, 2, '#6fbf73'); R(ctx, 24 * T + 4.5, 3.5, 1.5, 1.5, '#ffd23f')

    // divider walls (top-down "thick" walls with cap and side shading)
    const wallV = (x, y0, y1, glass) => {
      for (let y = y0; y <= y1; y++) if (solid[y][x]) {
        if (glass) {
          R(ctx, x * T + 2.5, y * T, 3, T, 'rgba(170,215,255,0.5)'); R(ctx, x * T + 2, y * T, 0.5, T, '#8aa4bd'); R(ctx, x * T + 5.5, y * T, 0.5, T, '#8aa4bd')
          R(ctx, x * T + 3, y * T + ((y * 3) % 5), 0.5, 3, 'rgba(255,255,255,0.85)')
        } else {
          R(ctx, x * T + 0.5, y * T, 7, T, S.OUT); R(ctx, x * T + 1, y * T, 6, T, '#e6dfd3'); R(ctx, x * T + 1, y * T, 1, T, '#f7f3ec'); R(ctx, x * T + 6, y * T, 1, T, '#c6bdaf')
        }
      }
    }
    const wallH = (y, x0, x1, glassFn) => {
      for (let x = x0; x <= x1; x++) if (solid[y][x]) {
        if (glassFn?.(x)) {
          R(ctx, x * T, y * T + 2.5, T, 3, 'rgba(170,215,255,0.5)'); R(ctx, x * T, y * T + 2, T, 0.5, '#8aa4bd'); R(ctx, x * T, y * T + 5.5, T, 0.5, '#8aa4bd')
          if (x % 3 === 0) R(ctx, x * T + 2, y * T + 3, 3, 0.5, 'rgba(255,255,255,0.85)')
        } else {
          R(ctx, x * T, y * T - 0.5, T, 9, S.OUT); R(ctx, x * T, y * T, T, 4, '#f2ede4'); R(ctx, x * T, y * T + 4, T, 4, '#d3cabb'); R(ctx, x * T, y * T + 7.5, T, 0.5, '#b3a998')
        }
      }
    }
    wallV(14, 2, 10); wallV(27, 2, 10, true); wallV(36, 12, 28)
    wallH(10, 0, W - 1, x => x > 27 && x < 49); wallH(11, 36, W - 1)
    wallV(0, 2, 28); wallV(W - 1, 2, 28)
    wallH(H - 1, 0, W - 1, x => x >= 10 && x <= 21)
    // door thresholds
    const doorH = (x, y, w) => { R(ctx, x * T, y * T + 1, w * T, 6, '#cbbfa9'); R(ctx, x * T, y * T + 1, w * T, 0.5, '#e8dfcf'); R(ctx, x * T, y * T + 6.5, w * T, 0.5, '#a89b84') }
    doorH(7, 10, 2); doorH(20, 10, 2); doorH(37, 10, 2)
    R(ctx, 14 * T, 28 * T, 3 * T, T, '#8d99a6'); R(ctx, 14 * T, 28 * T, 3 * T, 0.5, '#c6ced6')
    R(ctx, 36 * T + 1, 17 * T, 6, 2 * T, '#cbbfa9')
  }

  function shadeC(c, k) { return S.shade(c, k) }

  const FONT = '"Microsoft YaHei UI", "PingFang SC", "Segoe UI", sans-serif'
  function label(ctx, text, x, y, color = null, pill = true) {
    ctx.font = `600 4.2px ${FONT}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    if (pill) {
      const w = ctx.measureText(text).width + 5, h = 6.5
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 3.25); ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.3; ctx.stroke()
    }
    ctx.fillStyle = color || 'rgba(40,44,60,0.88)'; ctx.fillText(text, x, y + 0.2)
    ctx.textBaseline = 'alphabetic'
  }

  function miniFruit(ctx, kind, x, y) { S.fruit(ctx, kind, x, y, 0.5) }
  /** Outlined box. */
  const ob = (ctx, x, y, w, h, c, o = S.OUT) => { R(ctx, x - 0.5, y - 0.5, w + 1, h + 1, o); R(ctx, x, y, w, h, c) }
  /** Bevelled box: outline, fill, top highlight, bottom shade. */
  const bev = (ctx, x, y, w, h, c) => { ob(ctx, x, y, w, h, c); R(ctx, x, y, w, 0.5, S.shade(c, 0.35)); R(ctx, x, y + h - 0.5, w, 0.5, S.shade(c, -0.25)) }

  function ownerOf(desk) {
    for (const c of chars.values()) {
      if (desk === CEO_DESK && c.role === 'ceo') return c
      if (desk === HR_DESK && c.role === 'hr') return c
      if (c.role === 'employee' && DESKS[c.deskIndex] === desk) return c
    }
    return null
  }

  function plant(ctx, x, y, big) {
    R(ctx, x + 0.5, y + 7, 7, 1, 'rgba(0,0,0,0.12)')
    bev(ctx, x + 1.5, y + 3.5, 5, 4, '#d58a5a'); R(ctx, x + 1, y + 3, 6, 1.5, '#e9a77a'); R(ctx, x + 1, y + 3, 6, 0.5, S.OUT)
    const leaves = big ? [[1, -5], [4, -6], [-1, -2], [5, -2], [2, -3], [0, 0], [5, 0.5], [3, -8]] : [[1, -3], [4, -4], [-0.5, -0.5], [5, -0.5], [2.5, -1.5]]
    for (const [lx, ly] of leaves) R(ctx, x + lx - 0.5, y + ly - 0.5, 4, 4, '#1f4d2b')
    for (const [lx, ly] of leaves) { R(ctx, x + lx, y + ly, 3, 3, '#3f9b52'); R(ctx, x + lx, y + ly, 1.5, 1, '#79c97f'); R(ctx, x + lx + 2, y + ly + 2, 1, 1, '#2d7a3e') }
  }

  function drawFurniture(f, ctx) {
    const x = f.tx * T, y = f.ty * T
    switch (f.kind) {
      case 'desk': {
        const w = f.w * T, owner = ownerOf(f)
        // chair (drawn first, behind desk)
        const [sx, sy] = f.seat
        const chair = f.boss ? '#2a2a33' : '#55607a'
        ob(ctx, sx * T + 0.5, sy * T - 3, 7, 5, chair); R(ctx, sx * T + 1, sy * T - 2.5, 6, 1, S.shade(chair, 0.3))
        R(ctx, sx * T + 3.5, sy * T + 2, 1, 2, '#333'); R(ctx, sx * T + 1.5, sy * T + 3.5, 5, 0.5, '#333')
        // desk body
        const top = f.boss ? '#6b4430' : '#f4f1ea', front = f.boss ? '#4a2d1f' : '#d6cfc2'
        R(ctx, x + 1, y + 15, w - 2, 1, 'rgba(0,0,0,0.15)')
        ob(ctx, x + 1, y + 2, w - 2, 12, top)
        R(ctx, x + 1, y + 10, w - 2, 4, front); R(ctx, x + 1, y + 10, w - 2, 0.5, S.shade(front, -0.25))
        R(ctx, x + 1, y + 2, w - 2, 0.5, S.shade(top, 0.4))
        if (f.boss) { for (let i = 0; i < 3; i++) R(ctx, x + 4 + i * 12, y + 11.5, 8, 1.5, '#5b3826'); for (let i = 0; i < 3; i++) R(ctx, x + 7 + i * 12, y + 12, 2, 0.5, '#d9b26a') }
        else { R(ctx, x + w - 10, y + 11, 8, 2.5, S.shade(front, -0.08)); R(ctx, x + w - 7, y + 12, 2, 0.5, '#8d8579') }
        // monitor
        const busy = owner && (owner.status === 'busy' || owner.typingUntil > performance.now())
        const mx = x + 3, my = y - 5
        R(ctx, mx + 4, my + 9, 3, 2, '#9aa0aa'); R(ctx, mx + 2.5, my + 10.5, 6, 1, '#80868f')
        ob(ctx, mx, my, 11, 9, '#d4d7dd'); R(ctx, mx, my, 11, 0.5, '#eef0f3')
        R(ctx, mx + 1, my + 1, 9, 6.5, busy ? '#151a28' : '#2e3442')
        if (busy) {
          const off = Math.floor(time * (rush ? 14 : 5))
          for (let i = 0; i < 5; i++) {
            const lw = 1.5 + ((i + off) * 7) % 6
            R(ctx, mx + 1.5 + ((i + off) % 3) * 0.5, my + 1.5 + i * 1.2, lw, 0.5, ['#7ee787', '#79c0ff', '#ffa657', '#d2a8ff', '#ff7b72'][(i + off) % 5])
          }
          if (Math.floor(time * 3) % 2) R(ctx, mx + 7, my + 6.5, 1, 0.5, '#fff')
          ctx.fillStyle = rush ? 'rgba(255,230,80,0.16)' : 'rgba(120,180,255,0.13)'
          ctx.beginPath(); ctx.ellipse(mx + 5.5, my + 5, 10, 7, 0, 0, Math.PI * 2); ctx.fill()
        } else { R(ctx, mx + 1.5, my + 1.5, 3, 0.5, 'rgba(255,255,255,0.15)'); R(ctx, mx + 1.5, my + 2, 1, 2, 'rgba(255,255,255,0.1)') }
        // keyboard, mouse, mug, papers
        const kx = x + w / 2 + 1
        ob(ctx, kx, y + 6, 9, 2.5, '#e6e8ec'); for (let i = 0; i < 8; i++) R(ctx, kx + 0.5 + i * 1.05, y + 6.5, 0.6, 0.5, '#b5bac3'); for (let i = 0; i < 7; i++) R(ctx, kx + 1 + i * 1.05, y + 7.5, 0.6, 0.5, '#b5bac3')
        ob(ctx, kx + 10.5, y + 6.5, 1.5, 2, '#e6e8ec')
        if (!f.boss) { ob(ctx, x + w - 6.5, y + 3, 3, 3.5, '#ffffff'); R(ctx, x + w - 6.5, y + 3, 3, 1, '#7b4b2a'); R(ctx, x + w - 3.5, y + 4, 1, 1.5, '#ffffff') }
        R(ctx, x + 15, y + 3.5, 5, 6, '#ffffff'); R(ctx, x + 15.5, y + 3, 5, 6, '#fbfbf7'); R(ctx, x + 16.5, y + 4.5, 3, 0.5, '#bcc3cc'); R(ctx, x + 16.5, y + 5.5, 2.5, 0.5, '#bcc3cc')
        if (owner) miniFruit(ctx, modelFruit(owner), x + w - 9.5, y + 2.5)
        if (f.boss) {
          ob(ctx, x + 25, y + 3, 4, 3, '#e8d9a8'); R(ctx, x + 25.5, y + 4, 3, 0.5, '#b39b5b')
          ob(ctx, x + 32, y + 2.5, 3, 4, '#2b2f3a'); R(ctx, x + 32.5, y + 3, 2, 3, '#4d96ff')
          R(ctx, x + 34, y + 7, 4, 1.5, '#d9b26a')
        }
        break
      }
      case 'table': {
        const w = f.w * T
        R(ctx, x + 1, y + 15, w - 2, 1.5, 'rgba(0,0,0,0.15)')
        ob(ctx, x, y + 1, w, 14, '#f7f5f0'); R(ctx, x, y + 11, w, 4, '#d8d1c4'); R(ctx, x, y + 11, w, 0.5, '#b7ae9e'); R(ctx, x, y + 1, w, 0.5, '#ffffff')
        R(ctx, x + 3, y + 3, w - 6, 0.5, 'rgba(0,0,0,0.04)')
        for (let i = 0; i < 5; i++) {
          const nx = x + 9 + i * 24
          R(ctx, nx, y + 4, 6, 4.5, '#ffffff'); R(ctx, nx + 0.5, y + 3.5, 6, 4.5, '#fdfcf8'); R(ctx, nx + 1.5, y + 5, 3, 0.5, '#b8bfc8'); R(ctx, nx + 1.5, y + 6, 4, 0.5, '#b8bfc8')
          R(ctx, nx + 7.5, y + 4, 0.5, 4, '#4d96ff')
          ob(ctx, nx + 2, y + 9, 2, 1.5, '#ffffff')
        }
        ob(ctx, x + w / 2 - 6, y + 4, 12, 6, '#2b2f3a'); R(ctx, x + w / 2 - 5.5, y + 4.5, 11, 5, meetingTitle ? '#4d96ff' : '#3b4252')
        if (meetingTitle) { R(ctx, x + w / 2 - 4.5, y + 5.5, 6, 0.5, '#fff'); R(ctx, x + w / 2 - 4.5, y + 6.5, 8, 0.5, 'rgba(255,255,255,0.6)'); R(ctx, x + w / 2 - 4.5, y + 7.5, 4, 0.5, 'rgba(255,255,255,0.6)') }
        break
      }
      case 'plant': plant(ctx, x, y, false); break
      case 'shelf': {
        ob(ctx, x, y + 0.5, f.w * T, 7, '#8b6a4f'); R(ctx, x, y + 6.5, f.w * T, 1, '#6b4f39')
        for (let i = 0; i < f.w * 3; i++) { const bh = 4 + (i * 5) % 3; R(ctx, x + 0.5 + i * 2.6, y + 6.5 - bh, 2, bh, BOOK_COLORS[(i * 3) % 8]); R(ctx, x + 0.5 + i * 2.6, y + 6.5 - bh, 2, 0.5, 'rgba(255,255,255,0.4)') }
        break
      }
      case 'trophy':
        ob(ctx, x + 1.5, y + 2, 5, 4, '#ffd23f'); R(ctx, x + 2, y + 2.5, 1, 2.5, '#fff3b0'); R(ctx, x + 0.5, y + 2.5, 1, 2, '#e0b020'); R(ctx, x + 6.5, y + 2.5, 1, 2, '#e0b020')
        R(ctx, x + 3.5, y + 6, 1, 1.5, '#c9a227'); ob(ctx, x + 2, y + 7.5, 4, 1.5, '#6b4f39'); break
      case 'sofa': {
        const w = f.w * T
        if (f.back) { // seen from behind: viewers sit in it facing the TV
          R(ctx, x, y + 8, w, 1, 'rgba(0,0,0,0.15)')
          ob(ctx, x - 1, y + 1, 2, 7, '#4f73a6'); ob(ctx, x + w - 1, y + 1, 2, 7, '#4f73a6')
          ob(ctx, x, y + 2, w, 6, '#5a7cb0'); R(ctx, x, y + 2, w, 0.5, '#9cbbe4'); R(ctx, x, y + 6.5, w, 1.5, '#46669a')
          for (let i = 1; i < f.w; i++) R(ctx, x + i * T, y + 3, 0.5, 3.5, '#4a6a9e')
          break
        }
        R(ctx, x, y + 7, w, 1, 'rgba(0,0,0,0.15)')
        ob(ctx, x, y - 4, w, 5, '#4f73a6'); ob(ctx, x, y, w, 7, '#6c8ebf'); ob(ctx, x - 1, y - 2, 2, 8, '#4f73a6'); ob(ctx, x + w - 1, y - 2, 2, 8, '#4f73a6')
        for (let i = 1; i < f.w; i++) R(ctx, x + i * T, y + 0.5, 0.5, 5, '#5a7cb0')
        R(ctx, x + 1, y + 0.5, w - 2, 0.5, '#9cbbe4'); R(ctx, x + 3, y - 3, 4, 3, '#ffd23f'); R(ctx, x + 3, y - 3, 4, 0.5, '#fff1a8')
        break
      }
      case 'rug': {
        const w = f.w * T, h = f.h * T
        R(ctx, x, y, w, h, S.shade(f.color, -0.12)); R(ctx, x + 1, y + 1, w - 2, h - 2, f.color)
        R(ctx, x + 3, y + 3, w - 6, h - 6, S.shade(f.color, 0.2)); R(ctx, x + 4, y + 4, w - 8, h - 8, f.color)
        for (let i = 0; i < w; i += 2) { R(ctx, x + i, y - 1, 0.5, 1, S.shade(f.color, -0.2)); R(ctx, x + i, y + h, 0.5, 1, S.shade(f.color, -0.2)) }
        break
      }
      case 'cabinet': {
        const w = f.w * T
        ob(ctx, x, y - 7, w, 15, '#c3cad6'); R(ctx, x, y - 7, w, 0.5, '#e4e8ee')
        for (let i = 0; i < 3; i++) { R(ctx, x + 1, y - 6 + i * 4.8, w - 2, 4, '#b4bcca'); R(ctx, x + 1, y - 6 + i * 4.8, w - 2, 0.5, '#d6dce5'); ob(ctx, x + w / 2 - 1.5, y - 4.5 + i * 4.8, 3, 0.5, '#7d8696') }
        break
      }
      case 'board': {
        const w = f.w * T
        ob(ctx, x, y + 1.5, w, 11, '#b8875a'); R(ctx, x + 1, y + 2.5, w - 2, 9, '#e3bd8b')
        for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) R(ctx, x + 2 + j * 1.5 + (i * 7) % 3, y + 4 + i * 4, 0.5, 0.5, '#c79a63')
        const notes = ['#fff59d', '#ffffff', '#b3e5fc', '#ffccbc', '#c8e6c9']
        for (let i = 0; i < 5; i++) { const nx = x + 2.5 + i * 6, ny = y + 3.5 + (i % 2) * 3; R(ctx, nx + 0.5, ny + 0.5, 4, 4.5, 'rgba(0,0,0,0.15)'); R(ctx, nx, ny, 4, 4.5, notes[i]); R(ctx, nx + 1.5, ny - 0.5, 1, 1, '#e74c3c'); R(ctx, nx + 0.5, ny + 1.5, 3, 0.5, '#9aa3ad'); R(ctx, nx + 0.5, ny + 2.5, 2, 0.5, '#9aa3ad') }
        break
      }
      case 'whiteboard': {
        const w = f.w * T
        ob(ctx, x, y + 1, w, 12, '#aab2bc'); R(ctx, x + 1, y + 2, w - 2, 10, '#fbfdff'); R(ctx, x + 1, y + 2, w - 2, 0.5, '#ffffff')
        R(ctx, x + 2, y + 13, w - 4, 1, '#8a929c'); R(ctx, x + 5, y + 12.5, 3, 0.5, '#e74c3c'); R(ctx, x + 9, y + 12.5, 3, 0.5, '#4d96ff')
        if (meetingTitle) {
          ctx.font = `700 3px ${FONT}`; ctx.fillStyle = '#2b5fd9'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
          const t = meetingTitle.length > 18 ? meetingTitle.slice(0, 17) + '…' : meetingTitle
          ctx.fillText(t, x + 3, y + 3); ctx.textBaseline = 'alphabetic'
          R(ctx, x + 3, y + 7.5, 22, 0.5, '#9aa3ad'); R(ctx, x + 3, y + 9, 30, 0.5, '#9aa3ad'); R(ctx, x + 3, y + 10.5, 18, 0.5, '#9aa3ad')
          ob(ctx, x + 47, y + 6.5, 13, 4.5, '#ffd93d'); R(ctx, x + 40, y + 8.5, 6, 0.5, '#e74c3c'); R(ctx, x + 45, y + 8, 1, 1.5, '#e74c3c')
        } else { R(ctx, x + 4, y + 5, 10, 0.5, 'rgba(150,160,170,0.35)'); R(ctx, x + 20, y + 7, 14, 0.5, 'rgba(150,160,170,0.25)') }
        break
      }
      case 'tv': {
        const w = f.w * T
        ob(ctx, x, y + 2, w, 10, '#22252e'); R(ctx, x + 1, y + 3, w - 2, 8, rush ? '#ff5d5d' : '#2f6fdb')
        if (rush) label(ctx, 'RUSH', x + w / 2, y + 7, '#fff', false)
        else { R(ctx, x + 2, y + 9, 3, 1, '#7ee787'); R(ctx, x + 6, y + 7, 3, 3, '#ffd23f'); R(ctx, x + 10, y + 5, 3, 5, '#ff7b72'); R(ctx, x + 14, y + 4, 3, 6, '#79c0ff'); R(ctx, x + 1, y + 3, w - 2, 0.5, 'rgba(255,255,255,0.25)') }
        break
      }
      case 'loungetv': {
        const w = f.w * T
        R(ctx, x + 2, y + 7, w - 4, 1, 'rgba(0,0,0,0.15)')
        ob(ctx, x + 3, y + 2, w - 6, 5, '#6b4f39'); R(ctx, x + 3, y + 2, w - 6, 0.5, '#8b6a4f') // cabinet
        R(ctx, x + w / 2 - 1.5, y, 3, 2, '#2a2d36')
        const sx = x + 2, sy = y - 15, sw = w - 4, sh = 15
        ob(ctx, sx, sy, sw, sh, '#1b1d24')
        const ix = sx + 1, iy = sy + 1, iw = sw - 2, ih = sh - 2.5
        const watchers = tvSeat.filter(Boolean).length
        if (rush) {
          R(ctx, ix, iy, iw, ih, '#b3261e'); label(ctx, tr('rush.banner'), ix + iw / 2, iy + 5, '#fff', false)
          const off = (time * 12) % (iw + 20); R(ctx, ix, iy + ih - 3, iw, 3, '#7a1712')
          ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip(); label(ctx, tr('rush.bannerText'), ix + iw - off + 10, iy + ih - 1.5, '#ffd23f', false); ctx.restore()
        } else if (!watchers) {
          R(ctx, ix, iy, iw, ih, '#222733'); R(ctx, ix + 1, iy + 1, 6, 0.5, 'rgba(255,255,255,0.12)')
          R(ctx, ix + iw - 2, iy + ih - 1.5, 1, 1, Math.floor(time) % 2 ? '#ff5d5d' : '#5a2020')
        } else {
          const ch = Math.floor(time / 9) % 3
          if (ch === 0) { // football
            R(ctx, ix, iy, iw, ih, '#3d9a4f'); for (let i = 0; i < 4; i++) R(ctx, ix + i * iw / 4, iy, iw / 8, ih, '#46a858')
            R(ctx, ix + iw / 2 - 0.25, iy, 0.5, ih, '#e9f5e9'); R(ctx, ix, iy + ih / 2 - 0.25, 1.5, 0.5, '#fff')
            const bx = ix + iw / 2 + Math.sin(time * 1.7) * (iw / 2 - 3), by = iy + ih / 2 + Math.sin(time * 2.9) * (ih / 2 - 2)
            R(ctx, bx, by, 1.5, 1.5, '#fff')
            for (let i = 0; i < 3; i++) { R(ctx, ix + 4 + i * 6 + Math.sin(time * 2 + i) * 2, iy + 3 + i * 3, 1.5, 2, '#e74c3c'); R(ctx, ix + iw - 6 - i * 6 + Math.cos(time * 2 + i) * 2, iy + 4 + i * 2.5, 1.5, 2, '#3f6fd8') }
          } else if (ch === 1) { // cartoon: hopping cat
            R(ctx, ix, iy, iw, ih, '#8fd3ff'); R(ctx, ix, iy + ih - 3, iw, 3, '#7ccf7c')
            const cx = ix + 3 + ((time * 6) % (iw - 8)), cy = iy + ih - 6 - Math.abs(Math.sin(time * 5)) * 3
            R(ctx, cx, cy, 4, 3, '#ffb84d'); R(ctx, cx + 3, cy - 1.5, 2, 2, '#ffb84d'); R(ctx, cx + 3.5, cy - 2, 0.5, 0.5, '#ffb84d'); R(ctx, cx + 4, cy - 1, 0.5, 0.5, '#222')
            R(ctx, ix + iw - 7, iy + 2, 4, 4, '#ffe066')
          } else { // news / charts
            R(ctx, ix, iy, iw, ih, '#1f3b73'); R(ctx, ix, iy + ih - 3, iw, 3, '#f0f3f8')
            for (let i = 0; i < 5; i++) { const bh = 2 + ((Math.sin(time * 1.3 + i * 1.7) + 1) * 2.5); R(ctx, ix + 3 + i * 4.5, iy + ih - 4 - bh, 3, bh, ['#7ee787', '#79c0ff', '#ffa657', '#d2a8ff', '#ff7b72'][i]) }
            R(ctx, ix + 2, iy + ih - 2, (time * 8) % (iw - 4), 0.5, '#1f3b73')
          }
          R(ctx, ix, iy, iw, 0.5, 'rgba(255,255,255,0.2)')
          ctx.fillStyle = 'rgba(140,200,255,0.10)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + 14, 22, 14, 0, 0, Math.PI * 2); ctx.fill()
        }
        break
      }
      case 'coffee': {
        const brewing = f.brewUntil > performance.now()
        if (brewing) { ctx.fillStyle = rush ? 'rgba(255,200,60,0.25)' : 'rgba(255,220,160,0.18)'; ctx.beginPath(); ctx.ellipse(x + 4, y - 1, 9, 9, 0, 0, Math.PI * 2); ctx.fill() }
        R(ctx, x, y + 7, 8, 1, 'rgba(0,0,0,0.15)')
        ob(ctx, x, y - 7, 8, 14, '#3b3f4a'); R(ctx, x, y - 7, 8, 0.5, '#5a606e')
        ob(ctx, x + 1, y - 5.5, 6, 3, '#9ad0ff'); R(ctx, x + 1.5, y - 5, 2, 0.5, '#e3f4ff')
        R(ctx, x + 2, y - 1.5, 4, 1, '#1d1f25'); ob(ctx, x + 2.5, y + 1.5, 3, 3, '#ffffff'); R(ctx, x + 2.5, y + 1.5, 3, 0.5, '#7b4b2a')
        R(ctx, x + 6, y - 1, 1, 1, Math.floor(time * 2) % 2 ? '#7ee787' : '#2c6b3a')
        if (Math.floor(time * 3) % 3) R(ctx, x + 3.5, y - 0.5 - (time * 4 % 2), 0.5, 1.5, 'rgba(255,255,255,0.7)')
        if (brewing) {
          R(ctx, x + 3.75, y - 0.5, 0.5, 2, '#6b3e26') // pouring stream
          for (let i = 0; i < 3; i++) { const k = (time * 1.5 + i / 3) % 1; R(ctx, x + 2 + i * 1.5 + Math.sin(time * 4 + i) * 0.7, y - 8 - k * 7, 0.7, 1.5, `rgba(255,255,255,${0.75 - k * 0.7})`) }
        }
        break
      }
      case 'cooler':
        R(ctx, x, y + 7, 8, 1, 'rgba(0,0,0,0.15)')
        ob(ctx, x + 1.5, y - 9, 5, 6, '#8fd3ff'); R(ctx, x + 2, y - 8.5, 1, 4, '#d6f1ff')
        R(ctx, x + 2 + ((time * 2) % 3), y - 5 - ((time * 3) % 3), 0.5, 0.5, '#ffffff')
        ob(ctx, x + 1, y - 3, 6, 10, '#eef1f5'); R(ctx, x + 1, y - 3, 6, 0.5, '#ffffff')
        R(ctx, x + 2, y, 1.5, 1, '#3d8bfd'); R(ctx, x + 4.5, y, 1.5, 1, '#ef5350')
        break
      case 'vending': {
        R(ctx, x, y + 7, 16, 1, 'rgba(0,0,0,0.15)')
        ob(ctx, x, y - 9, 16, 16, '#e84a5f'); R(ctx, x, y - 9, 16, 0.5, '#ff8a99')
        ob(ctx, x + 1.5, y - 7.5, 9, 11, '#1f2430'); R(ctx, x + 2, y - 7, 1, 10, 'rgba(255,255,255,0.12)')
        for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { R(ctx, x + 2.5 + i * 2.8, y - 6.5 + j * 2.6, 2, 2, BOOK_COLORS[(i + j * 3) % 8]); R(ctx, x + 2.5 + i * 2.8, y - 6.5 + j * 2.6, 2, 0.5, 'rgba(255,255,255,0.5)') }
        ob(ctx, x + 12, y - 6, 2.5, 4, '#cfd5dc'); for (let i = 0; i < 3; i++) R(ctx, x + 12.5, y - 5.5 + i * 1.2, 1.5, 0.5, '#7d8696')
        R(ctx, x + 2, y + 4, 8.5, 2, '#141820')
        break
      }
      case 'pingpong': {
        const w = f.w * T, h = f.h * T - 2
        R(ctx, x + 1, y + h, w - 2, 1.5, 'rgba(0,0,0,0.15)')
        ob(ctx, x, y, w, h, '#2e7d5b'); R(ctx, x, y + h - 2, w, 2, '#226046')
        R(ctx, x + 0.5, y + 0.5, w - 1, 0.5, '#ffffff'); R(ctx, x + 0.5, y + h - 2.5, w - 1, 0.5, '#ffffff'); R(ctx, x + 0.5, y + 0.5, 0.5, h - 3, '#ffffff'); R(ctx, x + w - 1, y + 0.5, 0.5, h - 3, '#ffffff')
        R(ctx, x + w / 2 - 0.5, y - 1, 1, h, '#e8ecf1'); R(ctx, x + w / 2 - 0.25, y - 1, 0.5, h, '#9aa3ad')
        R(ctx, x + 1, y + (h - 2) / 2, w - 2, 0.5, 'rgba(255,255,255,0.6)')
        if (match?.live) {
          const p = ((time - match.t0) * (rush ? 1.6 : 0.9)) % 2, k = p < 1 ? p : 2 - p // 0..1 left→right→left
          const bx = x - 1 + k * (w + 1), arc = Math.sin(k * Math.PI), by = y + 4 - arc * 7 + (Math.abs(k - 0.5) < 0.04 ? 0 : 0)
          match.k = k
          R(ctx, bx, y + 5 + (1 - arc) * 1, 1.5, 0.5, 'rgba(0,0,0,0.25)'); ob(ctx, bx, by, 1.5, 1.5, '#ffffff')
          if (rush) R(ctx, bx - (p < 1 ? 3 : -3), by + 0.5, 2.5, 0.5, 'rgba(255,220,80,0.7)')
        } else {
          R(ctx, x + w / 2 + 6, y + 7, 1.5, 0.5, 'rgba(0,0,0,0.25)'); ob(ctx, x + w / 2 + 6, y + 6, 1.5, 1.5, '#ffffff')
          ob(ctx, x + 3, y + 3, 2, 3, '#d64545'); ob(ctx, x + w - 5, y + 8, 2, 3, '#3f6fd8')
        }
        break
      }
      case 'mat': ob(ctx, f.tx * T, f.ty * T, f.w * T, f.h * T, '#6f7d8c'); R(ctx, x + 1, y + 1, f.w * T - 2, f.h * T - 2, '#7b8a99'); label(ctx, 'WELCOME', x + f.w * T / 2, y + 8, '#f1f4f7', false); break
      case 'readtable': {
        const w = f.w * T
        R(ctx, x + 1, y + 9, w - 2, 1, 'rgba(0,0,0,0.15)')
        ob(ctx, x, y + 1, w, 8, '#8b6a4f'); R(ctx, x, y + 6, w, 3, '#6b4f39'); R(ctx, x, y + 1, w, 0.5, '#a88565')
        R(ctx, x + 3, y + 2, 7, 4, '#ffffff'); R(ctx, x + 6.25, y + 2, 0.5, 4, '#ccc'); R(ctx, x + 4, y + 3, 2, 0.5, '#999'); R(ctx, x + 7, y + 3, 2, 0.5, '#999')
        ob(ctx, x + 14, y + 2, 4, 3, '#2f6fdb')
        break
      }
      case 'lamp':
        R(ctx, x + 1, y + 6, 6, 1, 'rgba(0,0,0,0.15)')
        ob(ctx, x + 3.5, y - 6, 1, 12, '#555'); ob(ctx, x + 2, y + 5, 4, 1, '#444')
        ob(ctx, x + 1, y - 10, 6, 4.5, '#ffe9a8'); R(ctx, x + 1, y - 10, 6, 0.5, '#fff6d6')
        ctx.fillStyle = 'rgba(255,233,168,0.15)'; ctx.beginPath(); ctx.ellipse(x + 4, y - 4, 10, 8, 0, 0, Math.PI * 2); ctx.fill()
        break
      case 'bookshelf': {
        const w = f.w * T
        R(ctx, x + 1, y + 14, w - 2, 1.5, 'rgba(0,0,0,0.18)')
        ob(ctx, x, y - 6.5, w, 20.5, '#7a5a40'); R(ctx, x, y - 6.5, w, 0.5, '#a07a58')
        R(ctx, x + 1, y - 5.5, w - 2, 18.5, '#4a3424')
        for (let row = 0; row < 3; row++) { R(ctx, x + 1, y - 5 + row * 6 + 5, w - 2, 1, '#8f6c4f'); R(ctx, x + 1, y - 5 + row * 6 + 5, w - 2, 0.5, '#b08a68') }
        // filler books (dim) where slots are empty
        for (const s of SLOTS) if (s.shelf === f && !s.used) { const k = (s.x * 13 + s.y * 7) % 9; if (k < 3) { R(ctx, s.x, s.y + 2, 2, 3, 'rgba(255,255,255,0.08)') } }
        // project books
        for (const b of f.books || []) {
          const bh = 4.5 + (b.h || 0) * 0.5
          R(ctx, b.x - 0.25, b.y + (5 - bh) - 0.25, 2.5, bh + 0.25, S.OUT)
          R(ctx, b.x, b.y + (5 - bh), 2, bh, b.color)
          R(ctx, b.x, b.y + (5 - bh) + 1, 2, 0.5, 'rgba(255,255,255,0.6)'); R(ctx, b.x, b.y + 3.5, 2, 0.5, 'rgba(255,255,255,0.4)')
          R(ctx, b.x + 1.5, b.y + (5 - bh), 0.5, bh, 'rgba(0,0,0,0.2)')
          if (b.status !== 'done') R(ctx, b.x + 0.5, b.y + (5 - bh) - 1.5, 1, 1, b.status === 'stopped' ? '#8b929e' : b.status === 'failed' ? '#ff4d4d' : (Math.floor(time * 3) % 2 ? '#ffd93d' : '#ffb300'))
        }
        break
      }
    }
  }

  // book slots on shelves
  const SLOTS = []
  for (const sh of SHELVES) {
    const x0 = sh.tx * T + 2, y0 = sh.ty * T - 5
    for (let row = 0; row < 3; row++) for (let i = 0; i < Math.floor((sh.w * T - 4) / 3); i++) SLOTS.push({ shelf: sh, x: x0 + i * 3, y: y0 + row * 6 })
  }
  function layoutBooks() {
    for (const sh of SHELVES) sh.books = []
    for (const s of SLOTS) s.used = false
    const sorted = [...projects].sort((a, b) => a.createdAt - b.createdAt)
    sorted.forEach((p, i) => {
      const s = SLOTS[i]; if (!s) return
      s.used = true
      s.shelf.books.push({ id: p.id, x: s.x, y: s.y, color: BOOK_COLORS[(p.color ?? i) % BOOK_COLORS.length], h: (i * 7) % 2, status: p.status, hover: false })
    })
  }

  function modelFruit(c) {
    const m = models.find(m => m.key === c.effectiveModel) || models[0]
    return m?.fruit || 'orange'
  }

  function drawPeople(ctx, now) {
    const list = []
    for (const f of furniture) {
      if (f.kind === 'rug' || f.kind === 'mat') continue
      const base = f.kind === 'desk' ? (f.ty + f.h) * T - 1 : f.block ? (f.block[3] + 1) * T - 1 : (f.ty + 1) * T
      list.push({ y: base, draw: () => drawFurniture(f, ctx) })
    }
    for (const c of chars.values()) {
      list.push({
        y: c.y + (c.pose === 'sit' ? -4 : 0), draw: () => {
          ctx.globalAlpha = c.alpha
          if (c.id === hoverId || c.id === dropHoverId) {
            ctx.fillStyle = c.id === dropHoverId ? 'rgba(255,200,0,0.55)' : 'rgba(77,150,255,0.35)'
            ctx.beginPath(); ctx.ellipse(c.x, c.y - 0.5, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill()
            ctx.strokeStyle = c.id === dropHoverId ? '#ffb300' : '#4d96ff'; ctx.lineWidth = 0.5; ctx.stroke()
          }
          S.person(ctx, { ...c, typing: c.pose === 'sit' && c.typingUntil > now, rush }, time + c.seed)
          if (rush && c.pose === 'walk') {
            ctx.fillStyle = 'rgba(255,225,77,0.6)'
            for (let i = 0; i < 3; i++) ctx.fillRect(c.x - (c.dir === 'right' ? 10 + i * 3 : -6 - i * 3), c.y - 14 + i * 4, 4, 0.5)
          }
          ctx.globalAlpha = 1
        },
      })
    }
    list.sort((a, b) => a.y - b.y)
    for (const d of list) d.draw()
    for (const f of furniture) if (f.kind === 'rug' || f.kind === 'mat') { /* drawn earlier */ }
  }

  function step(dt, now) {
    time += dt
    const speed = rush ? 75 : 30
    for (const c of [...chars.values()]) {
      if (c.fadeIn) { c.alpha = Math.min(1, c.alpha + dt * 2); if (c.alpha >= 1) c.fadeIn = false }
      if (c.fadeOut) { c.alpha -= dt * 2; if (c.alpha <= 0) { chars.delete(c.id); continue } }
      if (c.path.length) {
        c.guard?.()
        if (!c.path.length) continue
        c.pose = 'walk'
        let [tx, ty] = c.path[0]
        const dx = tx - c.x, dy = ty - c.y, dist = Math.hypot(dx, dy)
        const mv = speed * dt
        if (Math.abs(dx) > Math.abs(dy)) c.dir = dx > 0 ? 'right' : 'left'; else if (dist > 0.01) c.dir = dy > 0 ? 'down' : 'up'
        if (dist <= mv) { c.x = tx; c.y = ty; c.path.shift(); if (!c.path.length) { c.pose = 'stand'; const f = c.arrive; c.arrive = null; f?.() } }
        else { c.x += dx / dist * mv; c.y += dy / dist * mv }
      }
      if (c.bubble && now > c.bubble.until) c.bubble = null
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.vy += 90 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt
      if (p.life <= 0) particles.splice(i, 1)
    }
    // rush sparkles
    if (rush) for (const c of chars.values()) if (Math.random() < dt * 8) particles.push({ x: c.x + (Math.random() - 0.5) * 12, y: c.y - 10 - Math.random() * 12, vx: 0, vy: -30, life: 0.5, c: Math.random() < 0.5 ? '#fff6b0' : '#ffd23f', spark: true })
    stepFlyers(dt)
    idleTick(now)
  }

  function render(ctx, now) {
    ctx.imageSmoothingEnabled = false
    drawFloor(ctx)
    for (const f of furniture) if (f.kind === 'rug' || f.kind === 'mat') drawFurniture(f, ctx)
    drawWalls(ctx)
    drawPeople(ctx, now)
    drawFlyers(ctx)
    for (const p of particles) { ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, Math.min(1, p.life)); ctx.fillRect(p.x, p.y, p.spark ? 0.5 : 1.5, p.spark ? 1.5 : 1.5) }
    ctx.globalAlpha = 1
    // room labels
    label(ctx, tr('room.ceo'), 11.5 * T, 9.4 * T); label(ctx, tr('room.hr'), 24 * T, 9.4 * T); label(ctx, tr('room.meeting'), 32 * T, 9.4 * T)
    label(ctx, tr('room.archive'), 44.5 * T, 27.4 * T); label(ctx, tr('room.lounge'), 32.5 * T, 27.4 * T); label(ctx, tr('room.open'), 5 * T, 27.4 * T)
    if (rush) { ctx.fillStyle = `rgba(255,200,0,${0.05 + Math.sin(time * 6) * 0.03})`; ctx.fillRect(0, 0, PW, PH) }
  }

  // ---------- hit testing ----------
  function charAt(x, y) {
    let best = null
    for (const c of chars.values()) {
      const top = c.y - (c.pose === 'sit' ? 20 : 24), bottom = c.y + 2
      if (x >= c.x - 6 && x <= c.x + 6 && y >= top && y <= bottom) if (!best || c.y > best.y) best = c
    }
    return best
  }
  function bookAt(x, y) {
    for (const sh of SHELVES) for (const b of sh.books || []) if (x >= b.x - 1 && x <= b.x + 2 && y >= b.y - 1 && y <= b.y + 5) return b
    return null
  }
  function shelfAt(x, y) {
    for (const sh of SHELVES) if (x >= sh.tx * T && x <= (sh.tx + sh.w) * T && y >= sh.ty * T - 6 && y <= sh.ty * T + 14) return sh
    return null
  }
  function areaAt(x, y) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T)
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null
    if (ty <= 1 && tx >= 34 && tx <= 41) return 'whiteboard'
    return region[ty][tx]
  }

  // ---------- public API ----------
  function init(agents, opts) {
    models = opts.models; rush = !!opts.rush; projects = opts.projects || []
    chars.clear()
    let idx = 0
    for (const a of agents) {
      const c = makeChar({ ...a, deskIndex: a.role === 'employee' ? idx++ : undefined })
      const h = homeOf(c); c.pose = 'sit'; c.dir = h.face
    }
    layoutBooks()
  }

  function updateAgent(a) {
    const c = chars.get(a.id); if (!c) return
    Object.assign(c, { name: a.name, title: a.title, model: a.model, effectiveModel: a.effectiveModel, status: a.status, activity: a.activity, log: a.log })
    if (a.status === 'busy' && c.pose === 'sit') c.typingUntil = performance.now() + 3600_000
    if (a.status !== 'busy' && a.role !== 'hr') c.typingUntil = Math.min(c.typingUntil, performance.now() + 1500)
  }

  return {
    PW, PH, setDeviceScale(k) { devK = k }, setLang(l) { lang = l === 'en' ? 'en' : 'zh' }, init, step, render, handlers, updateAgent, chars, charAt, bookAt, shelfAt, areaAt, listeners,
    setProjects(p) { projects = p; layoutBooks() }, setModels(m) { models = m },
    setHover(id) { hoverId = id }, setDropHover(id) { dropHoverId = id }, setMeetingTitle(t) { meetingTitle = t },
    isRush: () => rush, setRush, burst, rushCoffee, debug: { activities, chars, script, get match() { return match } }, BOOK_COLORS,
  }
})()
