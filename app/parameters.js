// Shared by Electron's main process and the settings renderer.
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.OfficeParameters = api
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict'
  const DEFAULT_CONTEXT_WINDOW = 200000
  const DEFAULT_COMPACTION = Object.freeze({
    auto: true, thresholdRatio: 0.8, headroomTokens: 8192, maxTokens: 8192,
    retainRatio: 0.16, compactionRetries: 1, maxOverflowRetries: 1,
    summarizationProvider: '', summarizationModel: '',
  })
  function integer(value, name, min = 1) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) throw new Error(`${name}必须是${min === 0 ? '非负' : '正'}整数`)
    return value
  }
  function ratio(value, name, allowZero = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value > 1 || value < 0 || (!allowZero && value === 0)) throw new Error(`${name}必须在${allowZero ? '0' : '大于 0'}至 1 之间`)
    return value
  }
  function normalizeCompaction(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('压缩参数必须是对象')
    for (const key of Object.keys(raw)) if (!Object.prototype.hasOwnProperty.call(DEFAULT_COMPACTION, key)) throw new Error(`未知压缩参数：${key}`)
    const c = { ...DEFAULT_COMPACTION, ...raw }
    if (typeof c.auto !== 'boolean') throw new Error('自动压缩开关必须是布尔值')
    ratio(c.thresholdRatio, '压缩触发比例')
    ratio(c.retainRatio, '近期原文保留比例', true)
    if (c.retainRatio >= c.thresholdRatio) throw new Error('近期原文保留比例必须小于压缩触发比例')
    integer(c.headroomTokens, '压缩预留 token', 0)
    integer(c.maxTokens, '摘要输出上限')
    integer(c.compactionRetries, '压缩重试次数', 0)
    integer(c.maxOverflowRetries, '溢出恢复次数', 0)
    if (c.compactionRetries > 10 || c.maxOverflowRetries > 10) throw new Error('压缩和溢出重试次数不能超过 10 次')
    for (const key of ['summarizationProvider', 'summarizationModel']) {
      if (typeof c[key] !== 'string') throw new Error('摘要服务商和模型必须是字符串')
      c[key] = c[key].trim()
    }
    if (!!c.summarizationProvider !== !!c.summarizationModel) throw new Error('摘要服务商和模型必须一起设置，或一起留空')
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
    if (!model || typeof model !== 'object' || Array.isArray(model)) throw new Error('模型参数必须是对象')
    const m = { ...model }
    const label = String(m.name || m.model || '模型')
    if (m.contextWindow === undefined || m.contextWindow === null || m.contextWindow === '') m.contextWindow = DEFAULT_CONTEXT_WINDOW
    integer(m.contextWindow, `${label}的上下文窗口`)
    for (const key of ['outputLimit', 'inputLimit']) {
      if (m[key] === undefined || m[key] === null || m[key] === '' || m[key] === 0) delete m[key]
      else integer(m[key], `${label}的${key === 'outputLimit' ? '已知最大输出' : '已知最大输入'}`)
    }
    if (m.maxTokens === undefined || m.maxTokens === null || m.maxTokens === '' || m.maxTokens === 0) m.maxTokens = recommendModel(m).maxTokens
    integer(m.maxTokens, `${label}的单次输出上限`)
    if (m.maxTokens >= m.contextWindow) throw new Error(`${label}的单次输出上限必须小于上下文窗口`)
    if (m.outputLimit && m.maxTokens > m.outputLimit) throw new Error(`${label}的单次输出上限不能超过已知模型能力 ${m.outputLimit}`)
    if (m.detectedLimits !== undefined) {
      if (!m.detectedLimits || typeof m.detectedLimits !== 'object' || Array.isArray(m.detectedLimits)) throw new Error('模型检测参数必须是对象')
      m.detectedLimits = { ...m.detectedLimits }
      for (const key of ['contextWindow', 'outputLimit', 'inputLimit']) {
        if (m.detectedLimits[key] === undefined || m.detectedLimits[key] === null) delete m.detectedLimits[key]
        else integer(m.detectedLimits[key], `${label}检测到的 ${key}`)
      }
      if (m.detectedLimits.contextWindow && m.contextWindow > m.detectedLimits.contextWindow) throw new Error(`${label}的上下文窗口不能超过检测到的模型能力 ${m.detectedLimits.contextWindow}`)
      if (m.detectedLimits.outputLimit && m.maxTokens > m.detectedLimits.outputLimit) throw new Error(`${label}的单次输出上限不能超过检测到的模型能力 ${m.detectedLimits.outputLimit}`)
      if (m.detectedLimits.outputLimit) m.outputLimit = Math.min(m.outputLimit || Infinity, m.detectedLimits.outputLimit)
    }
    if (m.vision !== undefined && typeof m.vision !== 'boolean') throw new Error(`${label}的图片输入开关必须是布尔值`)
    if (m.limitSources !== undefined) {
      if (!m.limitSources || typeof m.limitSources !== 'object' || Array.isArray(m.limitSources)) throw new Error('参数来源必须是对象')
      m.limitSources = Object.fromEntries(Object.entries(m.limitSources).filter(([, v]) => typeof v === 'string'))
    }
    if (m.limitsCheckedAt !== undefined && typeof m.limitsCheckedAt !== 'string') throw new Error('参数检测时间必须是字符串')
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
  function validateSettings(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('设置必须是对象')
    if (raw.models !== undefined && !Array.isArray(raw.models)) throw new Error('模型列表必须是数组')
    const result = { ...raw, compaction: normalizeCompaction(raw.compaction), models: (raw.models || []).map(validateModel) }
    const c = result.compaction
    const summaryModel = c.summarizationProvider && result.models.find(m => m.provider === c.summarizationProvider && m.model === c.summarizationModel)
    if (c.summarizationProvider && !summaryModel) throw new Error('摘要模型必须选用已配置的服务商和模型')
    for (const m of result.models) {
      const b = modelBudget(m, c), label = m.name || m.model || '模型'
      if (b.thresholdTokens <= 0) throw new Error(`${label}的输出上限与压缩预留耗尽了上下文窗口，请调小预留或输出`)
      if (b.retainTokens >= b.thresholdTokens) throw new Error(`${label}的近期原文保留量必须小于实际压缩触发量`)
      const summary = summaryModel || m
      if (c.maxTokens >= summary.contextWindow || (summary.outputLimit && c.maxTokens > summary.outputLimit)) throw new Error(`${summary.name || summary.model}的摘要上限超过模型能力，请调小摘要输出上限`)
      if (b.thresholdTokens + c.maxTokens >= summary.contextWindow) throw new Error(`${label}的实际压缩触发量与摘要输出上限超出摘要模型窗口，请调小摘要上限或触发比例，或增加压缩预留`)
    }
    return result
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
  return Object.freeze({ DEFAULT_CONTEXT_WINDOW, DEFAULT_COMPACTION, normalizeCompaction, recommendModel, getRecommendations: recommendModel, validateModel, modelBudget, validateSettings, migrateSettings })
})
