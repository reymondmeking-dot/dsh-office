// DSH Office plugin: forward the variables the user imported in Office Settings
// into every model shell command of this runtime. DSH scrubs credential-shaped
// names (KEY/TOKEN/SECRET/PASSWORD) from inherited child environments; Office
// passes the user's explicit selection as ordinary per-command env entries,
// which DSH merges after the scrub. Values come only from this process's
// environment (set by Office at spawn time) and are never written to disk.
export const name = 'office-env-inject'
export const inject = ['shell']

const names = () => String(process.env.DSH_OFFICE_ENV_NAMES || '').split(',').map(s => s.trim()).filter(s => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s))

export function apply(ctx) {
  const list = names()
  if (!list.length) return
  const env = {}
  for (const key of list) if (typeof process.env[key] === 'string') env[key] = process.env[key]
  const shell = ctx.shell?.[Symbol.for('cordis.original')] || ctx.shell
  if (!shell || typeof shell.resolve !== 'function') return
  const resolve = shell.resolve
  shell.resolve = function (request) {
    return resolve.call(this, { ...request, env: { ...env, ...(request?.env || {}) } })
  }
  ctx.effect?.(() => () => { if (shell.resolve !== resolve) shell.resolve = resolve })
}
