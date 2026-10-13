/* Pixel sprites: people, fruits. World coordinates are logical pixels; art uses half-pixel ("fine") units. */
'use strict'
window.Sprites = (() => {
  const SKIN = ['#f9dcc4', '#eab78f', '#b97a52']
  const HAIR = ['#2b2833', '#5a3a26', '#8a5a33', '#c8a165', '#3d4d7a', '#a8485a', '#6b6b73']
  const SHIRT = ['#5b8def', '#3dbd8a', '#f2a541', '#9b6ef3', '#ef6b73', '#2fb9c9', '#ff8fab', '#7ac74f', '#e9c46a', '#8d99ae']
  const OUT = '#2b2635'

  const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h) }

  /** Make fillRect snap to whole device pixels (ctx.__s = device px per world px, transform already scaled). */
  function snap(ctx) {
    const raw = CanvasRenderingContext2D.prototype.fillRect
    ctx.fillRect = function (x, y, w, h) {
      if (w <= 0 || h <= 0) return
      const s = this.__s || 1
      const x0 = Math.round(x * s), y0 = Math.round(y * s)
      const x1 = Math.max(x0 + 1, Math.round((x + w) * s)), y1 = Math.max(y0 + 1, Math.round((y + h) * s))
      raw.call(this, x0 / s, y0 / s, (x1 - x0) / s, (y1 - y0) / s)
    }
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16)
    const R_ = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255
    const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)))
    return `rgb(${f(R_)},${f(G)},${f(B)})`
  }

  function look(c) {
    const l = c.look || {}
    let shirt = SHIRT[(l.shirt ?? 0) % SHIRT.length]
    let hair = HAIR[(l.hair ?? 0) % HAIR.length]
    if (c.role === 'ceo') { shirt = '#27304d'; hair = '#2b2833' }
    if (c.role === 'hr') { shirt = '#ff8fab'; hair = '#7a3f2a' }
    return { skin: SKIN[(l.skin ?? 0) % SKIN.length], hair, shirt, style: c.role === 'hr' ? 1 : c.role === 'ceo' ? 0 : (l.hair ?? 0) % 3 }
  }

  /** Super-Saiyan aura (drawn behind the person), world coords, feet at (x, y). */
  function aura(ctx, x, y, t, sit) {
    const cy = y - (sit ? 9 : 11)
    const g = ctx.createRadialGradient(x, cy, 1, x, cy, 17)
    g.addColorStop(0, 'rgba(255,244,140,0.55)')
    g.addColorStop(0.55, 'rgba(255,205,40,0.22)')
    g.addColorStop(1, 'rgba(255,180,0,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.ellipse(x, cy, 12, 17, 0, 0, Math.PI * 2); ctx.fill()
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2
      const ph = t * 9 + i * 1.7
      const rx = 8 + Math.sin(ph) * 1.5, ry = 13 + Math.sin(ph * 1.3) * 2
      const fx = x + Math.cos(a) * rx
      const fy = cy + Math.sin(a) * ry - ((t * 24 + i * 3) % 4)
      R(ctx, fx, fy, 0.5, 1.5, i % 3 === 0 ? '#fffbe0' : i % 3 === 1 ? '#ffe14d' : '#ffb300')
    }
    for (let i = 0; i < 7; i++) {
      const fx = x - 6 + i * 2
      const h = 2 + (Math.sin(t * 14 + i * 2.1) + 1) * 2.2
      R(ctx, fx, cy - 15 - h, 0.5, h, 'rgba(255,225,77,0.85)')
    }
  }

  /**
   * Draw a person with feet at (c.x, c.y).
   * c: { role, look, dir, pose: 'stand'|'walk'|'sit', typing, talking, carry, carryColor, rush, seed }
   */
  function person(ctx, c, t) {
    const X = Math.round(c.x * 2) / 2, Y = Math.round(c.y * 2) / 2
    const sit = c.pose === 'sit', walking = c.pose === 'walk', rush = !!c.rush
    const dir = c.dir || 'down', side = dir === 'left' || dir === 'right'
    const L = look(c)
    const hair = rush ? '#ffd83d' : L.hair, hairHi = rush ? '#fff6b8' : shade(L.hair, 0.3), hairSh = rush ? '#f0a800' : shade(L.hair, -0.25)
    const skin = L.skin, skinSh = shade(L.skin, -0.12)
    const shirt = L.shirt, shirtSh = shade(L.shirt, -0.22), shirtHi = shade(L.shirt, 0.2)
    const pants = c.role === 'ceo' ? '#1f2538' : '#3a4256', pantsSh = shade(pants, -0.25), shoes = '#1d1a22'
    const step = walking ? Math.floor(t * (rush ? 20 : 8)) % 4 : 0
    const bob = walking && (step === 1 || step === 3) ? -1 : 0

    if (rush) aura(ctx, X, Y, t, sit)
    // soft shadow
    R(ctx, X - 4.5, Y - 1, 9, 1.5, 'rgba(25,25,45,0.14)')
    R(ctx, X - 3.5, Y - 1.5, 7, 2.5, 'rgba(25,25,45,0.12)')

    const parts = []
    const P = (x, y, w, h, col, o = true) => parts.push([x, y, w, h, col, o])

    // ---- legs ----
    if (!sit) {
      if (!side) {
        const l1 = walking && step === 1 ? 2 : 0, l2 = walking && step === 3 ? 2 : 0
        P(-5, -11, 4, 9 - l1, pants); P(1, -11, 4, 9 - l2, pants)
        P(-6, -2 - l1, 5, 2, shoes); P(1, -2 - l2, 5, 2, shoes)
      } else {
        const s = walking ? [0, 2, 0, -2][step] : 0
        P(-2 - s, -11, 4, 9, pantsSh); P(-2 - s, -2, 5, 2, shoes)
        P(-2 + s, -11, 4, 9, pants); P(-2 + s, -2, 5, 2, shoes)
      }
    }

    // ---- arms behind torso (side view back arm) ----
    const sw = walking ? [0, 2, 0, -2][step] : 0
    const typing = c.typing, tk = typing ? Math.floor(t * (rush ? 26 : 10)) % 2 : 0

    // ---- torso ----
    const tw = side ? 10 : 14, tx = -tw / 2
    P(tx, -25, tw, 15, shirt)
    P(tx + tw - 3, -24, 3, 14, shirtSh, false)
    P(tx, -25, tw, 1, shirtHi, false)
    P(tx, -12, tw, 2, shade(pants, 0.1), false)
    if (dir === 'down') {
      if (c.role === 'ceo') {
        P(-5, -24, 2, 9, shade(shirt, 0.12), false); P(3, -24, 2, 9, shade(shirt, 0.12), false)
        P(-3, -25, 6, 3, '#ffffff', false); P(-1, -24, 2, 2, '#b8322b', false); P(-1, -22, 2, 8, '#d9463b', false)
        P(4, -21, 2, 1, '#ffffff', false)
      } else if (c.role === 'hr') {
        P(-4, -25, 8, 2, '#ffffff', false); P(-1, -23, 2, 1, '#ffd23f', false); P(-5, -18, 10, 1, shirtSh, false)
      } else {
        P(-3, -25, 6, 2, shirtHi, false); P(-1, -23, 1, 4, 'rgba(255,255,255,0.55)', false)
        P(1, -20, 4, 4, '#ffffff', false); P(1, -20, 4, 1, '#4d96ff', false)
      }
    } else if (side && c.role === 'ceo') {
      P(2, -25, 2, 2, '#ffffff', false); P(3, -23, 1, 6, '#d9463b', false)
    }

    // ---- arms ----
    if (side) {
      P(-2 - sw, -24, 4, 10, shirtSh); P(-2 - sw, -14, 4, 3, skin)
    } else if (typing && dir === 'down') {
      P(-10, -24, 3, 7, shirtSh); P(7, -24, 3, 7, shirtSh)
      P(-8, -18 - tk, 4, 3, skin); P(4, -18 - (1 - tk), 4, 3, skin)
    } else if (typing && dir === 'up') {
      P(-10, -24, 3, 8, shirtSh); P(7, -24, 3, 8, shirtSh)
      P(-10, -17 - tk, 3, 2, skin); P(7, -17 - (1 - tk), 3, 2, skin)
    } else {
      P(-10, -24, 3, 10, shirtSh); P(7, -24, 3, 10, shirtSh)
      P(-10, -14 + sw / 2, 3, 3, skin); P(7, -14 - sw / 2, 3, 3, skin)
    }

    // ---- carried item ----
    const cx = side ? 3 : 4
    if (c.carry === 'paper') {
      P(cx, -21, 6, 8, '#fdfdfd'); P(cx + 1, -19, 4, 1, '#9fb0c0', false); P(cx + 1, -17, 3, 1, '#9fb0c0', false); P(cx + 1, -15, 4, 1, '#9fb0c0', false)
    } else if (c.carry === 'book') {
      const bc = c.carryColor || '#c0392b'
      P(cx - 1, -21, 8, 6, bc); P(cx - 1, -21, 8, 1, 'rgba(255,255,255,0.5)', false); P(cx + 6, -20, 1, 4, '#f3eadb', false); P(cx + 1, -19, 3, 1, '#ffd23f', false)
    } else if (c.carry === 'coffee') {
      if (c.sip) { P(cx - 2, -29, 4, 5, '#ffffff'); P(cx - 2, -29, 4, 1, '#6b3e26', false); P(cx - 3, -26, 3, 3, skin) }
      else { P(cx + 2, -17, 4, 5, '#ffffff'); P(cx + 2, -17, 4, 1, '#6b3e26', false); P(cx + 6, -16, 1, 2, '#ffffff') }
    } else if (c.carry === 'paddle') {
      const up = c.swing ? -5 : 0, fx = side ? cx + 3 + (c.swing ? 2 : 0) : cx
      P(fx + 1, -16 + up, 2, 4, '#8b5a2b'); P(fx - 1, -23 + up, 6, 7, '#d64545'); P(fx, -22 + up, 2, 2, '#ff8a80', false)
      P(fx, -14 + up, 3, 3, skin)
    }

    // ---- neck + head ----
    P(-2, -27, 4, 3, skinSh)
    if (dir === 'down') {
      P(-8, -35, 2, 3, skinSh); P(6, -35, 2, 3, skinSh)
      P(-6, -41, 12, 15, skin); P(-7, -40, 14, 13, skin)
      // hair
      if (L.style === 1) { P(-8, -41, 2, 13, hair); P(6, -41, 2, 13, hair) }
      P(-7, -43, 14, 6, hair); P(-6, -44, 12, 2, hair)
      P(-8, -41, 2, 8, hair); P(6, -41, 2, 8, hair)
      if (L.style === 2 && !rush) { P(-7, -45, 3, 2, hair); P(-2, -46, 4, 2, hair); P(4, -45, 3, 2, hair) }
      P(-6, -38, 5, 2, hair, false); P(2, -38, 3, 1, hair, false)
      P(-4, -43, 4, 1, hairHi, false); P(1, -42, 2, 1, hairHi, false)
      // face
      const blinkPhase = (t * 0.45 + (c.seed || 0)) % 4
      const blink = blinkPhase < 0.08
      if (c.role === 'ceo') {
        P(-6, -36, 5, 3, '#15151c', false); P(1, -36, 5, 3, '#15151c', false); P(-1, -35, 2, 1, '#15151c', false)
        P(-5, -36, 2, 1, '#6c7690', false); P(2, -36, 2, 1, '#6c7690', false)
      } else if (blink) {
        P(-5, -33, 3, 1, '#2a2238', false); P(2, -33, 3, 1, '#2a2238', false)
      } else {
        P(-5, -35, 3, 4, '#2a2238', false); P(2, -35, 3, 4, '#2a2238', false)
        P(-5, -35, 1, 1, '#ffffff', false); P(2, -35, 1, 1, '#ffffff', false)
      }
      P(-6, -31, 2, 1, 'rgba(255,110,120,0.5)', false); P(4, -31, 2, 1, 'rgba(255,110,120,0.5)', false)
      if (c.talking && Math.floor(t * 10) % 2 === 0) P(-1, -31, 3, 2, '#7a2e33', false)
      else P(-1, -30, 3, 1, '#a0524f', false)
    } else if (dir === 'up') {
      P(-8, -35, 2, 3, skinSh); P(6, -35, 2, 3, skinSh)
      P(-6, -41, 12, 15, skin); P(-7, -40, 14, 13, skin)
      P(-7, -43, 14, 13, hair); P(-6, -44, 12, 2, hair)
      if (L.style === 1) { P(-7, -32, 14, 4, hair) }
      if (L.style === 2 && !rush) { P(-7, -45, 3, 2, hair); P(-2, -46, 4, 2, hair); P(4, -45, 3, 2, hair) }
      P(-4, -42, 5, 1, hairHi, false); P(-6, -32, 12, 1, hairSh, false)
    } else {
      P(-5, -41, 11, 15, skin); P(-6, -40, 13, 13, skin); P(7, -34, 1, 2, skin)
      P(-6, -43, 12, 5, hair); P(-5, -44, 10, 2, hair); P(-7, -41, 5, 10, hair)
      if (L.style === 1) P(-7, -33, 4, 6, hair)
      if (L.style === 2 && !rush) { P(-5, -46, 3, 2, hair); P(0, -46, 4, 2, hair) }
      P(-2, -35, 2, 3, skinSh, false)
      P(-3, -43, 5, 1, hairHi, false)
      if (c.role === 'ceo') { P(1, -36, 6, 3, '#15151c', false); P(2, -36, 2, 1, '#6c7690', false) }
      else { P(3, -35, 2, 4, '#2a2238', false); P(3, -35, 1, 1, '#ffffff', false) }
      P(3, -31, 2, 1, 'rgba(255,110,120,0.5)', false)
      P(5, -30, 2, 1, c.talking && Math.floor(t * 10) % 2 === 0 ? '#7a2e33' : '#a0524f', false)
    }
    // role hair extras
    if (c.role === 'hr' && !rush) {
      if (side) P(-8, -47, 6, 5, hair); else P(-3, -48, 6, 5, hair)
      if (!side) P(-2, -47, 2, 1, hairHi, false)
    }
    if (rush) {
      if (side) { P(-8, -46, 4, 4, hair); P(-5, -50, 3, 8, hair); P(-1, -49, 3, 7, hair); P(2, -46, 3, 4, hair); P(-10, -43, 3, 3, hair) }
      else { P(-9, -45, 3, 4, hair); P(-6, -50, 3, 8, hair); P(-2, -53, 4, 11, hair); P(3, -50, 3, 8, hair); P(7, -45, 3, 4, hair) }
      P(-1, -51, 1, 5, '#ffffff', false); P(-5, -48, 1, 3, '#fffbe0', false)
    }

    // ---- render: outline pass, then fill pass ----
    const FX = X * 2, FY = Y * 2 + (sit ? 5 : 0) + bob
    const mir = dir === 'left'
    const pr = (x, y, w, h, col) => R(ctx, (FX + (mir ? -(x + w) : x)) / 2, (FY + y) / 2, w / 2, h / 2, col)
    for (const [x, y, w, h, , o] of parts) if (o) pr(x - 1, y - 1, w + 2, h + 2, OUT)
    for (const [x, y, w, h, col] of parts) pr(x, y, w, h, col)
    // steam from coffee
    if (c.carry === 'coffee' && !walking) {
      const k = (t * 2) % 1
      R(ctx, X + (mir ? -4 : 4) * (c.sip ? -0.2 : 1), Y - (c.sip ? 16 : 10) - k * 3, 0.5, 1.5, `rgba(255,255,255,${0.7 - k * 0.6})`)
    }
  }

  /** 12x12 pixel fruits, drawn at x,y with pixel size s (world units). */
  const FRUITS = {
    orange: { get name() { return window.I18N.t('fruit.orange') }, draw: (r) => { r(3, 2, 6, 1, '#3d2a1a'); r(2, 3, 8, 8, '#3d2a1a'); r(1, 4, 10, 6, '#3d2a1a'); r(3, 3, 6, 7, '#ff9f1c'); r(2, 4, 8, 5, '#ff9f1c'); r(7, 4, 2, 5, '#f08a00'); r(3, 9, 5, 1, '#f08a00'); r(4, 4, 2, 2, '#ffd08a'); r(5, 0, 1, 3, '#6b4226'); r(6, 1, 3, 2, '#3fa34d'); r(7, 1, 1, 1, '#7bd389') } },
    grape: { get name() { return window.I18N.t('fruit.grape') }, draw: (r) => { const g = '#8e5bd6', d = '#5f3a9e'; for (const [x, y] of [[3, 3], [6, 3], [4, 5], [7, 5], [2, 5], [5, 7], [3, 7], [6, 8], [4, 9]]) { r(x - 0.5, y - 0.5, 4, 4, '#2d1a4a') } for (const [x, y] of [[3, 3], [6, 3], [4, 5], [7, 5], [2, 5], [5, 7], [3, 7], [6, 8], [4, 9]]) { r(x, y, 3, 3, g); r(x + 2, y + 2, 1, 1, d); r(x, y, 1, 1, '#d8bdfb') } r(5, 0, 1, 3, '#6b4226'); r(6, 1, 3, 2, '#3fa34d') } },
    apple: { get name() { return window.I18N.t('fruit.apple') }, draw: (r) => { r(1.5, 2.5, 9, 9, '#4a1512'); r(2, 3, 8, 8, '#e8413b'); r(3, 2, 2, 1, '#e8413b'); r(7, 2, 2, 1, '#e8413b'); r(3, 10, 6, 1, '#c22f2a'); r(8, 4, 2, 6, '#c22f2a'); r(3, 4, 2, 2, '#ff9a96'); r(5, 0, 1, 3, '#6b4226'); r(6, 0, 3, 2, '#3fa34d') } },
    cherry: { get name() { return window.I18N.t('fruit.cherry') }, draw: (r) => { r(0.5, 5.5, 5, 5, '#4a0d16'); r(5.5, 6.5, 5, 5, '#4a0d16'); r(1, 6, 4, 4, '#d7263d'); r(6, 7, 4, 4, '#d7263d'); r(2, 7, 1, 1, '#ff9aa6'); r(7, 8, 1, 1, '#ff9aa6'); r(3, 2, 1, 4, '#4f7d2b'); r(8, 3, 1, 4, '#4f7d2b'); r(4, 1, 4, 1, '#4f7d2b'); r(7, 0, 3, 2, '#3fa34d') } },
    peach: { get name() { return window.I18N.t('fruit.peach') }, draw: (r) => { r(1.5, 2.5, 9, 8.5, '#5a2a22'); r(2, 3, 8, 7, '#ffb4a2'); r(3, 2, 6, 1, '#ffb4a2'); r(5, 3, 1, 6, '#f08a7a'); r(7, 4, 2, 4, '#ff8f80'); r(3, 4, 1, 2, '#ffe0d6'); r(6, 1, 3, 2, '#3fa34d') } },
    lemon: { get name() { return window.I18N.t('fruit.lemon') }, draw: (r) => { r(0.5, 3.5, 11, 6, '#5a4a00'); r(2, 4, 8, 5, '#ffe14d'); r(1, 5, 10, 3, '#ffe14d'); r(3, 3, 6, 1, '#ffe14d'); r(3, 9, 6, 1, '#f2c200'); r(3, 5, 2, 1, '#fff6b0'); r(5, 1, 3, 2, '#3fa34d') } },
    strawberry: { get name() { return window.I18N.t('fruit.strawberry') }, draw: (r) => { r(1.5, 2.5, 9, 6, '#5a0f17'); r(2.5, 8, 7, 3, '#5a0f17'); r(2, 3, 8, 4, '#f0384a'); r(3, 7, 6, 2, '#f0384a'); r(4, 9, 4, 1, '#f0384a'); r(5, 10, 2, 1, '#f0384a'); for (const [x, y] of [[3, 4], [6, 4], [8, 5], [4, 6], [7, 7], [5, 8]]) r(x, y, 1, 1, '#ffe08a'); r(3, 1, 6, 2, '#3fa34d'); r(5, 0, 2, 1, '#3fa34d') } },
    watermelon: { get name() { return window.I18N.t('fruit.watermelon') }, draw: (r) => { r(0.5, 2.5, 11, 9, '#103d1a'); r(1, 3, 10, 7, '#2f9e44'); r(2, 2, 8, 1, '#2f9e44'); r(2, 10, 8, 1, '#2f9e44'); for (let i = 0; i < 4; i++) r(2 + i * 2 + 1, 3, 1, 7, '#1b6b2c'); r(2, 3, 2, 1, '#7bd389') } },
    banana: { get name() { return window.I18N.t('fruit.banana') }, draw: (r) => { r(1.5, 6.5, 8, 3, '#5a4500'); r(2, 7, 7, 2, '#ffd23f'); r(1, 5, 2, 3, '#ffd23f'); r(8, 4, 2, 4, '#ffd23f'); r(3, 9, 5, 1, '#e3b505'); r(9, 2, 1, 2, '#6b4226') } },
    pear: { get name() { return window.I18N.t('fruit.pear') }, draw: (r) => { r(1.5, 4.5, 9, 6.5, '#3a4a10'); r(4, 2, 4, 4, '#b5d33d'); r(2, 5, 8, 5, '#b5d33d'); r(3, 10, 6, 1, '#93b02b'); r(3, 6, 2, 2, '#e5f5a0'); r(6, 0, 1, 2, '#6b4226') } },
  }
  const FRUIT_KEYS = Object.keys(FRUITS)

  function fruit(ctx, kind, x, y, s = 1) {
    const f = FRUITS[kind] || FRUITS.orange
    f.draw((fx, fy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + fx * s, y + fy * s, w * s, h * s) })
  }

  const cache = new Map()
  /** Crisp data URL of a fruit icon; `css` = displayed CSS size (rendered 1:1 at device pixels). */
  function fruitURL(kind, css = 36) {
    const dpr = window.devicePixelRatio || 1
    const key = `${kind}@${css}@${dpr}`
    if (!cache.has(key)) {
      const N = Math.round(css * dpr), k = N / 24 // device px per half-unit
      const cv = document.createElement('canvas'); cv.width = N; cv.height = N
      const ctx = cv.getContext('2d')
      FRUITS[kind]?.draw((fx, fy, w, h, c) => {
        const x0 = Math.round(fx * 2 * k), y0 = Math.round(fy * 2 * k)
        ctx.fillStyle = c; ctx.fillRect(x0, y0, Math.max(1, Math.round((fx + w) * 2 * k) - x0), Math.max(1, Math.round((fy + h) * 2 * k) - y0))
      })
      cache.set(key, cv.toDataURL())
    }
    return cache.get(key)
  }

  /** Data URL portrait of an agent (for popovers): 22x30 world px at `s` CSS px each, device-res. */
  function portraitURL(agent, s = 4) {
    const dpr = window.devicePixelRatio || 1
    const k = s * dpr
    const cv = document.createElement('canvas'); cv.width = Math.round(22 * k); cv.height = Math.round(30 * k)
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false
    ctx.__s = k; ctx.setTransform(k, 0, 0, k, 0, 0); snap(ctx)
    person(ctx, { ...agent, x: 11, y: 28.5, dir: 'down', pose: 'stand', rush: false, seed: 1 }, 0.3)
    return cv.toDataURL()
  }

  return { person, fruit, fruitURL, portraitURL, FRUITS, FRUIT_KEYS, shade, R, snap, OUT }
})()
