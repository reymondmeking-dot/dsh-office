'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { RunScope, isStopped, containsProject, terminateTree } = require('../app/project-runs.cjs')

test('stopping interrupts long waits promptly and rejects later work', async () => {
  const scope = new RunScope({ id: 'task' })
  const waiting = scope.delay(60000)
  await scope.stop()
  await assert.rejects(waiting, isStopped)
  assert.throws(() => scope.check(), isStopped)
  assert.throws(() => scope.delay(10), isStopped)
})

test('a completed result arriving after stop cannot be accepted or leak an unhandled rejection', async () => {
  const scope = new RunScope({})
  let reject
  const work = scope.wait(new Promise((_, j) => { reject = j }))
  await scope.stop()
  await assert.rejects(work, isStopped)
  reject(new Error('late transport error'))
  await new Promise(r => setImmediate(r))
})

test('cleanup runs once, waits for all resources and cancellation stays isolated', async () => {
  const a = new RunScope({}), b = new RunScope({})
  let cleanup = 0
  a.addCleanup(async () => { await new Promise(r => setTimeout(r, 10)); cleanup++ })
  a.addCleanup(() => { throw new Error('already exited') })
  await Promise.all([a.stop(), a.stop()])
  assert.equal(cleanup, 1)
  assert.equal(await b.wait(Promise.resolve('unrelated project')), 'unrelated project')
})

test('removed cleanup does not close a successfully finished resource again', async () => {
  const scope = new RunScope({})
  let count = 0
  scope.addCleanup(() => count++)()
  await scope.stop()
  assert.equal(count, 0)
})

test('project selection includes descendants but excludes sibling names and traversal', () => {
  const parent = { dir: path.resolve('workspace', 'alpha') }
  assert.equal(containsProject(parent, parent), true)
  assert.equal(containsProject(parent, { dir: path.join(parent.dir, 'tasks', 'child') }), true)
  assert.equal(containsProject(parent, { dir: parent.dir + '-other' }), false)
  assert.equal(containsProject(parent, { dir: path.resolve(parent.dir, '..') }), false)
})

test('runtime teardown terminates a real owned process and its child', async () => {
  const root = process.platform === 'win32' ? 'D:\\AI' : require('node:os').tmpdir()
  const folder = fs.mkdtempSync(path.join(root, 'office-stop-unit-'))
  const marker = path.join(folder, 'child.pid')
  const childSource = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid));setInterval(()=>{},1000)`
  const source = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childSource)}],{windowsHide:true,stdio:'ignore'});setInterval(()=>{},1000)`
  const proc = spawn(process.execPath, ['-e', source], { windowsHide: true, detached: process.platform !== 'win32', stdio: 'ignore' })
  try {
    for (let i = 0; i < 100 && !fs.existsSync(marker); i++) await new Promise(r => setTimeout(r, 25))
    assert.ok(fs.existsSync(marker))
    const pid = Number(fs.readFileSync(marker, 'utf8'))
    await terminateTree(proc)
    assert.ok(proc.exitCode !== null || proc.signalCode)
    await new Promise(r => setTimeout(r, 100))
    assert.throws(() => process.kill(pid, 0))
  } finally {
    await terminateTree(proc)
    assert.ok(path.resolve(folder).startsWith(path.resolve(root) + path.sep))
    fs.rmSync(folder, { recursive: true, force: true })
  }
})
