'use strict'
const path = require('node:path')
const { execFile } = require('node:child_process')

class ProjectStoppedError extends Error {
  constructor() { super('Project stopped by user'); this.name = 'ProjectStoppedError'; this.code = 'OFFICE_PROJECT_STOPPED' }
}
const isStopped = err => err?.code === 'OFFICE_PROJECT_STOPPED'

/** One task/turn owns its waits and cleanup; cancellation cannot leak into a later task. */
class RunScope {
  constructor(project) {
    this.project = project; this.controller = new AbortController(); this.cleanups = new Set(); this.cleanup = null
    this.finished = new Promise(resolve => { this.finish = resolve })
  }
  get stopped() { return this.controller.signal.aborted }
  check() { if (this.stopped) throw new ProjectStoppedError() }
  addCleanup(fn) { this.check(); this.cleanups.add(fn); return () => this.cleanups.delete(fn) }
  wait(promise) {
    this.check()
    const signal = this.controller.signal
    return new Promise((resolve, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(new ProjectStoppedError()) }
      signal.addEventListener('abort', abort, { once: true })
      Promise.resolve(promise).then(value => { signal.removeEventListener('abort', abort); this.stopped ? reject(new ProjectStoppedError()) : resolve(value) }, err => { signal.removeEventListener('abort', abort); reject(this.stopped ? new ProjectStoppedError() : err) })
    })
  }
  delay(ms) {
    this.check()
    let timer
    return this.wait(new Promise(resolve => { timer = setTimeout(resolve, Math.max(0, ms)) })).finally(() => clearTimeout(timer))
  }
  stop() {
    if (this.cleanup) return this.cleanup
    this.controller.abort()
    this.cleanup = Promise.allSettled([...this.cleanups].map(fn => Promise.resolve().then(fn)))
    return this.cleanup
  }
}

/** Segment-aware containment, never `foo` matching `foobar`. Call with trusted canonical project paths. */
function containsProject(parent, candidate) {
  const rel = path.relative(path.resolve(parent.dir), path.resolve(candidate.dir))
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep))
}

/** Kill only the runtime-owned process and its descendants, never another office process. */
async function terminateTree(proc) {
  if (!proc?.pid || proc.exitCode !== null || proc.signalCode) return
  if (process.platform === 'win32') {
    await new Promise(resolve => execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => resolve()))
  } else {
    try { process.kill(-proc.pid, 'SIGKILL') } catch { try { proc.kill('SIGKILL') } catch {} }
  }
  if (proc.exitCode === null && !proc.signalCode) {
    await new Promise(resolve => {
      const done = () => { clearTimeout(timer); proc.removeListener('exit', done); resolve() }
      const timer = setTimeout(done, 3000)
      proc.once('exit', done)
    })
  }
}

module.exports = { RunScope, ProjectStoppedError, isStopped, containsProject, terminateTree }
