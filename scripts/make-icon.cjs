// Generate a pixel-art app icon (PNG -> ICO) using Electron offscreen canvas-free raw pixel writing.
'use strict'
const fs = require('node:fs')
const zlib = require('node:zlib')

function png(size, pixels) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4) }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// 32x32 logical art
const G = 32
const art = Array.from({ length: G }, () => Array(G).fill(null))
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255]
const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < G && j < G) art[j][i] = hex(c) }
// rounded squircle background
for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
  const dx = Math.abs(x + 0.5 - 16) / 15.5, dy = Math.abs(y + 0.5 - 16) / 15.5
  if (dx ** 4 + dy ** 4 <= 1) { const t = y / G; art[y][x] = [Math.round(90 + 40 * t), Math.round(170 - 50 * t), 255, 255] }
}
// building
rect(7, 9, 18, 18, '#f5f2ea'); rect(7, 9, 18, 2, '#ffffff'); rect(24, 9, 1, 18, '#d6d0c4')
for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) rect(9 + c * 4, 12 + r * 4, 3, 3, (r + c) % 3 === 0 ? '#ffd23f' : '#5b8def')
rect(14, 23, 4, 4, '#5b3a29'); rect(5, 26, 22, 2, '#3e4a63')
// orange fruit badge
rect(20, 3, 8, 7, '#ff9f1c'); rect(19, 4, 10, 5, '#ff9f1c'); rect(21, 4, 2, 2, '#ffd08a'); rect(26, 5, 2, 3, '#f08a00'); rect(23, 1, 1, 2, '#6b4226'); rect(24, 1, 3, 2, '#3fa34d')

function render(size) {
  const px = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = art[Math.floor(y * G / size)][Math.floor(x * G / size)]
    if (c) px.set(c, (y * size + x) * 4)
  }
  return png(size, px)
}
const sizes = [16, 32, 48, 64, 128, 256]
const imgs = sizes.map(render)
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)
let offset = 6 + 16 * sizes.length
const dir = sizes.map((s, i) => { const e = Buffer.alloc(16); e[0] = s === 256 ? 0 : s; e[1] = s === 256 ? 0 : s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(imgs[i].length, 8); e.writeUInt32LE(offset, 12); offset += imgs[i].length; return e })
fs.writeFileSync(process.argv[2], Buffer.concat([header, ...dir, ...imgs]))
fs.writeFileSync(process.argv[2].replace(/\.ico$/, '.png'), imgs[sizes.length - 1])
// optional crisp pixel-perfect large PNG: node make-icon.cjs icon.ico out.png 1024
if (process.argv[3]) fs.writeFileSync(process.argv[3], render(Number(process.argv[4]) || 1024))
console.log('icon written')
