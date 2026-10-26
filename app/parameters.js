// Shared by Electron's main process and the settings renderer.
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.OfficeParameters = api
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict'
  // Messages follow the UI language (I18N in the renderer, renderer/i18n.js in the main process).
  const isEn = () => {
    try {
      const I = (typeof globalThis === 'object' && globalThis.I18N) || (typeof require === 'function' ? require('./renderer/i18n.js') : null)
      return !!I && I.getLang() === 'en'
    } catch { return false }
  }
  const M = (zh, en) => isEn() ? en : zh
  const DEFAULT_CONTEXT_WINDOW = 200000
  const DEFAULT_COMPACTION = Object.freeze({
    auto: true, thresholdRatio: 0.8, headroomTokens: 8192, maxTokens: 8192,
    retainRatio: 0.16, compactionRetries: 1, maxOverflowRetries: 1,
    summarizationProvider: '', summarizationModel: '',
  })
  function integer(value, name, min = 1) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) throw new Error(M(`${name}必须是${min === 0 ? '非负' : '正'}整数`, `${name} must be a ${min === 0 ? 'non-negative' : 'positive'} integer`))
    return value
  }
  function ratio(value, name, allowZero = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value > 1 || value < 0 || (!allowZero && value === 0)) throw new Error(M(`${name}必须在${allowZero ? '0' : '大于 0'}至 1 之间`, `${name} must be ${allowZero ? 'between 0' : 'above 0'} and 1`))
    return value
  }
  function normalizeCompaction(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(M('压缩参数必须是对象', 'Compaction settings must be an object'))
    for (const key of Object.keys(raw)) if (!Object.prototype.hasOwnProperty.call(DEFAULT_COMPACTION, key)) throw new Error(M(`未知压缩参数：${key}`, `Unknown compaction setting: ${key}`))
    const c = { ...DEFAULT_COMPACTION, ...raw }
    if (typeof c.auto !== 'boolean') throw new Error(M('自动压缩开关必须是布尔值', 'Auto compaction must be true or false'))
    ratio(c.thresholdRatio, M('压缩触发比例', 'Compaction trigger ratio'))
    ratio(c.retainRatio, M('近期原文保留比例', 'Recent-history retain ratio'), true)
    if (c.retainRatio >= c.thresholdRatio) throw new Error(M('近期原文保留比例必须小于压缩触发比例', 'The retain ratio must be smaller than the trigger ratio'))
    integer(c.headroomTokens, M('压缩预留 token', 'Compaction headroom tokens'), 0)
    integer(c.maxTokens, M('摘要输出上限', 'Summary output cap'))
    integer(c.compactionRetries, M('压缩重试次数', 'Compaction retries'), 0)
    integer(c.maxOverflowRetries, M('溢出恢复次数', 'Overflow recovery retries'), 0)
    if (c.compactionRetries > 10 || c.maxOverflowRetries > 10) throw new Error(M('压缩和溢出重试次数不能超过 10 次', 'Compaction and overflow retries cannot exceed 10'))
    for (const key of ['summarizationProvider', 'summarizationModel']) {
      if (typeof c[key] !== 'string') throw new Error(M('摘要服务商和模型必须是字符串', 'Summary provider and model must be strings'))
      c[key] = c[key].trim()
    }
    if (!!c.summarizationProvider !== !!c.summarizationModel) throw new Error(M('摘要服务商和模型必须一起设置，或一起留空', 'Set the summary provider and model together, or leave both empty'))
    return c
  }
  function recommendModel(model = {}) {
    const configuredWindow = Number.isSafeInteger(model.contextWindow) && model.contextWindow > 0 ? model.contextWindow : DEFAULT_CONTEXT_WINDOW
    const detectedWindow = model.detectedLimits?.contextWindow
    const contextWindow = Number.isSafeInteger(detectedWindow) && detectedWindow > 0 ? Math.min(configuredWindow, detectedWindow) : configuredWindow
    const knownLimits = [model.outputLimit, model.detectedLimits?.outputLimit].filter(value => Number.isSafeInteger(value) && value > 0)
    const outputLimit = knownLimits.length ? Math.min(...knownLimits) : Infinity
    const round = n => n >= 1024 ? Math.floor(n / 1024) * 1024 : Math.max(1, Math.floor(n))
    return {
      contextWindow,
      maxTokens: Math.min(outputLimit, round(Math.min(32768, contextWindow * 0.2))),
      headroomTokens: round(Math.min(8192, contextWindow / 16)),
      summaryMaxTokens: Math.min(outputLimit, round(Math.min(8192, contextWindow * 0.1))),
      thresholdRatio: 0.8, retainRatio: 0.16, compactionRetries: 1, maxOverflowRetries: 1,
    }
  }
  function validateModel(model) {
    if (!model || typeof model !== 'object' || Array.isArray(model)) throw new Error(M('模型参数必须是对象', 'Model settings must be an object'))
    const m = { ...model }
    const label = String(m.name || m.model || M('模型', 'Model'))
    const of = (zh, en) => M(`${label}的${zh}`, `${label}: ${en}`)
    if (m.contextWindow === undefined || m.contextWindow === null || m.contextWindow === '') m.contextWindow = DEFAULT_CONTEXT_WINDOW
    integer(m.contextWindow, of('上下文窗口', 'context window'))
    for (const key of ['outputLimit', 'inputLimit']) {
      if (m[key] === undefined || m[key] === null || m[key] === '' || m[key] === 0) delete m[key]
      else integer(m[key], key === 'outputLimit' ? of('已知最大输出', 'known max output') : of('已知最大输入', 'known max input'))
    }
    if (m.maxTokens === undefined || m.maxTokens === null || m.maxTokens === '' || m.maxTokens === 0) m.maxTokens = recommendModel(m).maxTokens
    integer(m.maxTokens, of('单次输出上限', 'per-request output cap'))
    if (m.maxTokens >= m.contextWindow) throw new Error(of('单次输出上限必须小于上下文窗口', 'the output cap must be smaller than the context window'))
    if (m.outputLimit && m.maxTokens > m.outputLimit) throw new Error(of(`单次输出上限不能超过已知模型能力 ${m.outputLimit}`, `the output cap cannot exceed the known model limit ${m.outputLimit}`))
    if (m.detectedLimits !== undefined) {
      if (!m.detectedLimits || typeof m.detectedLimits !== 'object' || Array.isArray(m.detectedLimits)) throw new Error(M('模型检测参数必须是对象', 'Detected model limits must be an object'))
      m.detectedLimits = { ...m.detectedLimits }
      for (const key of ['contextWindow', 'outputLimit', 'inputLimit']) {
        if (m.detectedLimits[key] === undefined || m.detectedLimits[key] === null) delete m.detectedLimits[key]
        else integer(m.detectedLimits[key], M(`${label}检测到的 ${key}`, `${label}: detected ${key}`))
      }
      if (m.detectedLimits.contextWindow && m.contextWindow > m.detectedLimits.contextWindow) throw new Error(of(`上下文窗口不能超过检测到的模型能力 ${m.detectedLimits.contextWindow}`, `the context window cannot exceed the detected limit ${m.detectedLimits.contextWindow}`))
      if (m.detectedLimits.outputLimit && m.maxTokens > m.detectedLimits.outputLimit) throw new Error(of(`单次输出上限不能超过检测到的模型能力 ${m.detectedLimits.outputLimit}`, `the output cap cannot exceed the detected limit ${m.detectedLimits.outputLimit}`))
      if (m.detectedLimits.outputLimit) m.outputLimit = Math.min(m.outputLimit || Infinity, m.detectedLimits.outputLimit)
    }
    if (m.vision !== undefined && typeof m.vision !== 'boolean') throw new Error(of('图片输入开关必须是布尔值', 'image input must be true or false'))
    if (m.limitSources !== undefined) {
      if (!m.limitSources || typeof m.limitSources !== 'object' || Array.isArray(m.limitSources)) throw new Error(M('参数来源必须是对象', 'Limit sources must be an object'))
      m.limitSources = Object.fromEntries(Object.entries(m.limitSources).filter(([, v]) => typeof v === 'string'))
    }
    if (m.limitsCheckedAt !== undefined && typeof m.limitsCheckedAt !== 'string') throw new Error(M('参数检测时间必须是字符串', 'Limit check time must be a string'))
    return m
  }
  function modelBudget(model, rawCompaction = {}) {
    const m = validateModel(model), c = normalizeCompaction(rawCompaction)
    const thresholdTokens = Math.floor(Math.min(m.contextWindow * c.thresholdRatio, m.contextWindow - m.maxTokens - c.headroomTokens))
    return {
      contextWindow: m.contextWindow, requestMaxTokens: m.maxTokens, outputLimit: m.outputLimit || null,
      headroomTokens: c.headroomTokens, thresholdTokens,
      thresholdRatio: thresholdTokens / m.contextWindow, requestedThresholdRatio: c.thresholdRatio,
      retainTokens: Math.floor((m.contextWindow - m.maxTokens) * c.retainRatio),
      summaryMaxTokens: c.maxTokens,
      limitedByOutput: m.contextWindow - m.maxTokens - c.headroomTokens < m.contextWindow * c.thresholdRatio,
    }
  }
  const DEFAULT_BROWSER = Object.freeze({ searchEngine: 'bing', searchTemplate: 'https://www.bing.com/search?q={q}', allowPrivate: false, blockedDomains: [], maxPages: 20, maxTaskMs: 600000 })
  function normalizeBrowser(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(M('浏览器设置必须是对象', 'Browser settings must be an object'))
    const b = { ...DEFAULT_BROWSER, ...raw }
    if (!['bing', 'duckduckgo', 'google', 'custom'].includes(b.searchEngine)) throw new Error(M('未知搜索引擎', 'Unknown search engine'))
    if (typeof b.allowPrivate !== 'boolean') throw new Error(M('内网访问开关必须是布尔值', 'Private network access must be true or false'))
    if (typeof b.searchTemplate !== 'string' || !b.searchTemplate.includes('{q}') || !/^https?:\/\//i.test(b.searchTemplate)) throw new Error(M('搜索模板需要 HTTP(S) 地址及 {q}', 'Search template needs an HTTP(S) URL and {q}'))
    try { const u = new URL(b.searchTemplate.replace('{q}', 'test')); if (u.username || u.password) throw new Error() } catch { throw new Error(M('搜索模板无效', 'Invalid search template')) }
    if (!Array.isArray(b.blockedDomains) || b.blockedDomains.some(d => typeof d !== 'string' || !/^(?:\*\.)?[a-z0-9.-]+$/i.test(d))) throw new Error(M('黑名单请逐行填写域名', 'Enter one domain per blacklist line'))
    b.blockedDomains = [...new Set(b.blockedDomains.map(d => d.toLowerCase().replace(/^\*\./, '')))]
    integer(b.maxPages, M('任务页面上限', 'Task page limit')); integer(b.maxTaskMs, M('任务时间上限', 'Task time limit'))
    if (b.maxPages > 100 || b.maxTaskMs < 1000 || b.maxTaskMs > 3600000) throw new Error(M('浏览限制应为 1–100 页，1 秒–60 分钟', 'Browser limits must be 1–100 pages and 1 second–60 minutes'))
    return b
  }
  function validateSettings(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(M('设置必须是对象', 'Settings must be an object'))
    if (raw.models !== undefined && !Array.isArray(raw.models)) throw new Error(M('模型列表必须是数组', 'The model list must be an array'))
    const result = { ...raw, browser: normalizeBrowser(raw.browser), compaction: normalizeCompaction(raw.compaction), models: (raw.models || []).map(validateModel) }
    if (raw.cliResources !== undefined) {
      if (!raw.cliResources || typeof raw.cliResources !== 'object' || Array.isArray(raw.cliResources) || Object.entries(raw.cliResources).some(([k,v]) => !['github','taptap'].includes(k) || typeof v !== 'boolean')) throw new Error(M('CLI 授权必须是有效的资源开关', 'CLI grants must contain valid resource switches'))
      result.cliResources = { ...raw.cliResources }
    }
    const c = result.compaction
    const summaryModel = c.summarizationProvider && result.models.find(m => m.provider === c.summarizationProvider && m.model === c.summarizationModel)
    if (c.summarizationProvider && !summaryModel) throw new Error(M('摘要模型必须选用已配置的服务商和模型', 'The summary model must be a configured provider and model'))
    for (const m of result.models) {
      const b = modelBudget(m, c), label = m.name || m.model || M('模型', 'Model')
      if (b.thresholdTokens <= 0) throw new Error(M(`${label}的输出上限与压缩预留耗尽了上下文窗口，请调小预留或输出`, `${label}: the output cap plus compaction headroom use up the context window; lower the headroom or the output cap`))
      if (b.retainTokens >= b.thresholdTokens) throw new Error(M(`${label}的近期原文保留量必须小于实际压缩触发量`, `${label}: the retained recent history must be smaller than the actual compaction trigger`))
      const summary = summaryModel || m
      if (c.maxTokens >= summary.contextWindow || (summary.outputLimit && c.maxTokens > summary.outputLimit)) throw new Error(M(`${summary.name || summary.model}的摘要上限超过模型能力，请调小摘要输出上限`, `${summary.name || summary.model}: the summary cap exceeds the model limit; lower the summary output cap`))
      if (b.thresholdTokens + c.maxTokens >= summary.contextWindow) throw new Error(M(`${label}的实际压缩触发量与摘要输出上限超出摘要模型窗口，请调小摘要上限或触发比例，或增加压缩预留`, `${label}: the compaction trigger plus the summary cap exceed the summary model window; lower the summary cap or trigger ratio, or raise the headroom`))
    }
    if (raw.mcpServers !== undefined) {
      if (!Array.isArray(raw.mcpServers)) throw new Error(M('MCP 服务器列表必须是数组', 'The MCP server list must be an array'))
      result.mcpServers = raw.mcpServers.map(normalizeMcpServer)
      const seen = new Set()
      for (const s of result.mcpServers) {
        if (seen.has(s.name.toLowerCase())) throw new Error(M(`MCP 服务器名称重复：${s.name}`, `Duplicate MCP server name: ${s.name}`))
        seen.add(s.name.toLowerCase())
      }
    }
    if (raw.experts !== undefined) {
      if (!Array.isArray(raw.experts)) throw new Error(M('专家列表必须是数组', 'The expert list must be an array'))
      result.experts = raw.experts.map(normalizeExpert)
      const seen = new Set()
      for (const e of result.experts) {
        if (seen.has(e.id)) throw new Error(M(`专家 ID 重复：${e.id}`, `Duplicate expert id: ${e.id}`))
        seen.add(e.id)
      }
    }
    for (const key of ['plugins', 'pluginMcp', 'skillToggles']) {
      if (raw[key] === undefined) continue
      const o = raw[key]
      if (!o || typeof o !== 'object' || Array.isArray(o) || Object.values(o).some(v => typeof v !== 'boolean')) throw new Error(M('插件开关必须是 { id: true/false }', 'Plugin switches must be { id: true/false }'))
      result[key] = { ...o }
    }
    return result
  }

  // ---------- MCP servers ----------
  const strMap = (o, label) => {
    if (o === undefined || o === null || o === '') return {}
    if (typeof o !== 'object' || Array.isArray(o)) throw new Error(M(`${label}必须是键值对象`, `${label} must be a key/value object`))
    const out = {}
    for (const [k, v] of Object.entries(o)) {
      if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(k)) throw new Error(M(`${label}的键名不合法：${k}`, `${label}: invalid key ${k}`))
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') throw new Error(M(`${label}的值必须是文本：${k}`, `${label}: value of ${k} must be text`))
      out[k] = String(v)
    }
    return out
  }
  /** One MCP server: { name, transport: stdio|streamable-http, command/args/env/cwd | url/headers, timeoutMs, enabled, description }. */
  function normalizeMcpServer(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(M('MCP 服务器必须是对象', 'An MCP server must be an object'))
    const name = String(raw.name || raw.serverName || '').trim()
    // Same rule as dsh-mcp-client serverName; also a valid Codex TOML key.
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) throw new Error(M(`MCP 服务器名称只能用字母、数字、- 和 _（1-32 位）：${name || '（空）'}`, `MCP server names use letters, digits, - and _ (1-32 chars): ${name || '(empty)'}`))
    let transport = String(raw.transport || (raw.url ? 'streamable-http' : 'stdio'))
    if (transport === 'http') transport = 'streamable-http'
    if (transport !== 'stdio' && transport !== 'streamable-http') throw new Error(M(`${name}：传输方式只能是 stdio 或 streamable-http`, `${name}: transport must be stdio or streamable-http`))
    const timeoutMs = raw.timeoutMs === undefined || raw.timeoutMs === '' ? 60000 : Number(raw.timeoutMs)
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) throw new Error(M(`${name}：超时必须在 1000-600000 毫秒之间`, `${name}: timeout must be 1000-600000 ms`))
    const s = { name, transport, enabled: raw.enabled !== false, description: String(raw.description || '').slice(0, 300), timeoutMs }
    if (transport === 'stdio') {
      s.command = String(raw.command || '').trim()
      if (!s.command) throw new Error(M(`${name}：stdio 方式需要填写启动命令`, `${name}: stdio needs a command`))
      const args = raw.args === undefined ? [] : raw.args
      if (!Array.isArray(args) || args.some(a => typeof a !== 'string' && typeof a !== 'number')) throw new Error(M(`${name}：参数必须是文本数组`, `${name}: args must be a list of strings`))
      s.args = args.map(String)
      s.env = strMap(raw.env, M(`${name} 的环境变量`, `${name} env`))
      s.cwd = String(raw.cwd || '').trim()
    } else {
      s.url = String(raw.url || '').trim()
      if (!/^https?:\/\/\S+$/.test(s.url.replace(/\$\{[A-Za-z_][A-Za-z0-9_]*\}/g, 'x'))) throw new Error(M(`${name}：需要 http(s) 地址`, `${name}: needs an http(s) URL`))
      s.headers = strMap(raw.headers, M(`${name} 的请求头`, `${name} headers`))
    }
    return s
  }

  // ---------- experts ----------
  const text = (v, max) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = {}
      for (const l of ['zh', 'en']) if (v[l] !== undefined) o[l] = String(v[l]).slice(0, max)
      return o
    }
    return String(v ?? '').slice(0, max)
  }
  const filled = v => v && typeof v === 'object' ? Object.values(v).some(x => String(x).trim()) : String(v || '').trim() !== ''
  /** One expert template: { id, name, title, skills, prompt, mcp[], icon } — name/title/skills/prompt may be { zh, en }. */
  function normalizeExpert(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(M('专家必须是对象', 'An expert must be an object'))
    const id = String(raw.id || '').trim()
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) throw new Error(M(`专家 ID 只能用小写字母、数字和 -：${id || '（空）'}`, `Expert ids use lowercase letters, digits and -: ${id || '(empty)'}`))
    const e = { id, name: text(raw.name, 40), title: text(raw.title, 40), skills: text(raw.skills, 300), prompt: text(raw.prompt, 8000), icon: String(raw.icon || '').slice(0, 4) }
    if (!filled(e.title)) throw new Error(M(`专家 ${id} 需要职位名称`, `Expert ${id} needs a title`))
    if (!filled(e.prompt)) throw new Error(M(`专家 ${id} 需要专家设定（提示词）`, `Expert ${id} needs an expert prompt`))
    const mcp = raw.mcp === undefined ? [] : raw.mcp
    if (!Array.isArray(mcp) || mcp.some(x => !/^[A-Za-z0-9_-]{1,32}$/.test(String(x)))) throw new Error(M(`专家 ${id} 的 MCP 列表不合法`, `Expert ${id}: invalid MCP list`))
    e.mcp = mcp.map(String)
    const sk = raw.skillset === undefined ? [] : raw.skillset
    if (!Array.isArray(sk) || sk.some(x => !/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(x)))) throw new Error(M(`专家 ${id} 的技能列表不合法`, `Expert ${id}: invalid skill list`))
    e.skillset = sk.map(String)
    return e
  }
  // Missing/zero legacy output caps become explicit, predictable request budgets.
  function migrateSettings(raw) {
    const next = { ...raw }
    if (!raw.compaction && raw.models?.length) {
      const recommended = raw.models.map(recommendModel)
      next.compaction = { ...DEFAULT_COMPACTION,
        headroomTokens: Math.min(...recommended.map(r => r.headroomTokens)),
        maxTokens: Math.min(...recommended.map(r => r.summaryMaxTokens)),
      }
    }
    return validateSettings(next)
  }
  return Object.freeze({ DEFAULT_CONTEXT_WINDOW, DEFAULT_COMPACTION, DEFAULT_BROWSER, normalizeBrowser, normalizeCompaction, recommendModel, getRecommendations: recommendModel, validateModel, modelBudget, validateSettings, migrateSettings, normalizeMcpServer, normalizeExpert, msg: M })
})
