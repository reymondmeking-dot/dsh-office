'use strict'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const I = require('./renderer/i18n.js')
const L = (zh,en) => I.getLang() === 'en' ? en : zh
// Every field other than the version is encrypted. The renderer only receives
// explicitly requested site metadata; workers never receive either key or value.
class Vault {
  constructor(file, safeStorage) { this.file = file; this.storage = safeStorage }
  available() { return !!this.storage?.isEncryptionAvailable() && this.storage.getSelectedStorageBackend?.() !== 'basic_text' }
  assertAvailable() { if (!this.available()) throw new Error(L('系统加密不可用；密码不会保存。请启用系统凭据存储后重试。', 'System encryption is unavailable. Passwords were not saved; enable the OS credential store and retry.')) }
  read() {
    this.assertAvailable()
    if (!fs.existsSync(this.file)) return []
    const disk = JSON.parse(fs.readFileSync(this.file, 'utf8'))
    if (disk.version !== 1 || typeof disk.ciphertext !== 'string') throw new Error(L('密码库格式无效', 'Invalid password vault format'))
    return JSON.parse(this.storage.decryptString(Buffer.from(disk.ciphertext, 'base64')))
  }
  write(entries) {
    this.assertAvailable()
    const cipher = this.storage.encryptString(JSON.stringify(entries)).toString('base64')
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const temp = this.file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp'
    try { fs.writeFileSync(temp, JSON.stringify({ version: 1, ciphertext: cipher }), { mode: 0o600 }); fs.renameSync(temp, this.file) }
    finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
  }
  list() { return this.read().map(({ id, origin, username }) => ({ id, origin, username })) }
  save({ origin, username = '', password }) {
    const u = new URL(origin)
    if (!['https:', 'http:'].includes(u.protocol) || !password) throw new Error(L('登录凭据无效', 'Invalid login credentials'))
    const all = this.read(), old = all.find(e => e.origin === u.origin && e.username === username)
    const entry = { id: old?.id || crypto.randomUUID(), origin: u.origin, username: String(username).slice(0, 1000), password: String(password), updatedAt: new Date().toISOString() }
    if (old) all.splice(all.indexOf(old), 1, entry); else all.push(entry)
    this.write(all)
    return { id: entry.id, origin: entry.origin, username: entry.username }
  }
  get(id, origin) { return this.read().find(e => (!id || e.id === id) && (!origin || e.origin === origin)) || null }
  delete(id) { this.write(this.read().filter(e => e.id !== id)); return true }
  exportEncrypted(file) { this.assertAvailable(); if (!fs.existsSync(this.file)) this.write([]); fs.copyFileSync(this.file, file); return file }
}
module.exports = { Vault }
