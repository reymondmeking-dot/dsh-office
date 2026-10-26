'use strict'
const fs = require('node:fs')
const path = require('node:path')
const dns = require('node:dns').promises
const net = require('node:net')
const I = require('./renderer/i18n.js')
const L = (zh,en) => I.getLang() === 'en' ? en : zh
const DEFAULT_BROWSER = Object.freeze({ searchEngine: 'bing', searchTemplate: '', allowPrivate: false, blockedDomains: [], maxPages: 20, maxTaskMs: 600000 })
function policy(raw = {}) { return { ...DEFAULT_BROWSER, ...raw } }
function within(root, target) {
  const relative = path.relative(root, target)
  return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}
function workspacePath(workspace, input, { create = false } = {}) {
  const root = fs.realpathSync(workspace)
  const target = path.resolve(root, String(input || ''))
  if (!within(root, target)) throw new Error(L('文件不在工作区内', 'File is outside the workspace'))
  let resolved
  if (create && !fs.existsSync(target)) {
    let ancestor = path.dirname(target)
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor)
    const realAncestor = fs.realpathSync(ancestor)
    if (!within(root, realAncestor)) throw new Error(L('文件链接指向工作区外', 'File link points outside the workspace'))
    resolved = path.join(realAncestor, path.relative(ancestor, target))
  } else resolved = fs.realpathSync(target)
  if (!within(root, resolved)) throw new Error(L('文件链接指向工作区外', 'File link points outside the workspace'))
  return resolved
}
function privateAddress(input) {
  const s = String(input).toLowerCase().replace(/^\[|\]$/g, '')
  if (s === 'localhost' || s.endsWith('.localhost') || s.endsWith('.local') || !s.includes('.') && !s.includes(':')) return true
  if (net.isIP(s) === 4) {
    const a = s.split('.').map(Number)
    return a[0] === 0 || a[0] === 10 || a[0] === 127 || a[0] >= 224 || a[0] === 169 && a[1] === 254 || a[0] === 172 && a[1] >= 16 && a[1] <= 31 || a[0] === 192 && (a[1] === 168 || a[1] === 0) || a[0] === 100 && a[1] >= 64 && a[1] <= 127 || a[0] === 198 && (a[1] === 18 || a[1] === 19)
  }
  if (s.includes(':')) {
    if (s.startsWith('::ffff:')) {
      const tail = s.slice(7)
      if (tail.includes('.')) return privateAddress(tail)
      const pair = tail.split(':')
      if (pair.length === 2) { const a = parseInt(pair[0],16), b = parseInt(pair[1],16); return privateAddress([a >>> 8,a & 255,b >>> 8,b & 255].join('.')) }
      return true
    }
    return !/^[23]/.test(s) || s.startsWith('2001:db8:')
  }
  return false
}
async function assertURL(input, raw = {}, resolver = host => dns.lookup(host, { all: true })) {
  const p = policy(raw)
  let url
  try { url = new URL(input) } catch { throw new Error(L('请输入有效网址', 'Enter a valid URL')) }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(L('只允许无凭据的 HTTP(S) 网址', 'Only HTTP(S) URLs without embedded credentials are allowed'))
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '')
  if ((p.blockedDomains || []).some(x => host === String(x).toLowerCase() || host.endsWith('.' + String(x).toLowerCase()))) throw new Error(L('该域名已被阻止', 'This domain is blocked'))
  if (!p.allowPrivate) {
    if (privateAddress(host)) throw new Error(L('内网访问已禁用，可在设置中启用', 'Private network access is disabled; enable it in Settings'))
    const ips = net.isIP(host) ? [{ address: host }] : await resolver(host)
    if (!ips.length || ips.some(x => privateAddress(x.address))) throw new Error(L('目标解析到内网地址', 'Destination resolves to a private address'))
  }
  return url.href
}
function searchURL(query, raw = {}) {
  const p = policy(raw), q = encodeURIComponent(String(query || '').trim())
  const templates = { bing: 'https://www.bing.com/search?q={q}', duckduckgo: 'https://html.duckduckgo.com/html/?q={q}', google: 'https://www.google.com/search?q={q}' }
  const template = p.searchEngine === 'custom' ? p.searchTemplate : templates[p.searchEngine] || templates.bing
  if (!template.includes('{q}') || !/^https?:\/\//i.test(template)) throw new Error(L('搜索模板必须是含 {q} 的 HTTP(S) URL', 'Search template must be an HTTP(S) URL containing {q}'))
  return template.replaceAll('{q}', q)
}
function addressURL(input, raw = {}) {
  const s = String(input || '').trim()
  if (/^[a-z][a-z\d+.-]*:/i.test(s)) return s
  if (/^(localhost|[^\s/]+\.[^\s/]+)(:\d+)?([/?#]|$)/i.test(s)) return 'https://' + s
  return searchURL(s, raw)
}
function decodeResultURL(raw) {
  try {
    const u = new URL(raw)
    if (u.hostname.endsWith('duckduckgo.com') && u.searchParams.has('uddg')) return u.searchParams.get('uddg')
    if (u.hostname.endsWith('google.com') && u.pathname === '/url') return u.searchParams.get('q') || u.searchParams.get('url') || raw
    if (u.hostname.endsWith('bing.com') && u.pathname.startsWith('/ck/')) {
      const b = u.searchParams.get('u') || ''
      if (b.startsWith('a1')) return Buffer.from(b.slice(2), 'base64url').toString('utf8')
    }
  } catch {}
  return raw
}
function parseSearchResults(rows, count = 5) {
  const out = [], seen = new Set()
  for (const row of rows || []) {
    const url = decodeResultURL(row.url || '')
    if (!/^https?:\/\//i.test(url) || seen.has(url) || !String(row.title || '').trim()) continue
    seen.add(url); out.push({ title: String(row.title).trim().slice(0, 250), url, snippet: String(row.snippet || '').trim().slice(0, 700) })
    if (out.length >= Math.min(10, Math.max(1, count))) break
  }
  return out
}
function redactResult(value, secrets) {
  const clean = x => {
    if (typeof x === 'string') {
      for (const secret of secrets) if (secret) for (const variant of [secret, encodeURIComponent(secret), encodeURI(secret), new URLSearchParams({x:secret}).toString().slice(2)]) x = x.split(variant).join('[redacted]')
      return x
    }
    if (Array.isArray(x)) return x.map(clean)
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k,v]) => [k,clean(v)]))
    return x
  }
  return clean(value)
}
module.exports = { redactResult, DEFAULT_BROWSER, policy, within, workspacePath, privateAddress, assertURL, searchURL, addressURL, parseSearchResults, decodeResultURL }
