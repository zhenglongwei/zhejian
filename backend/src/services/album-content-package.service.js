/**
 * USER-PUB · 完工异步内容包：一次 LLM 产出质量建议 + 五平台长文
 * 仅完工触发；车主 social-copy 读缓存。
 */
const fs = require('fs')
const path = require('path')
const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')
const { findGeoLlmViolation, sanitizeGeoLlmText } = require('../constants/geo-llm-compliance')
const {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LIST,
} = require('../constants/album-social-platforms')
const {
  CONTENT_PACKAGE_STATUS,
  CONTENT_PACKAGE_SOURCE,
} = require('../constants/album-content-package')
const {
  normalizeAlbumContentPackage,
  emptyGeneratingPackage,
  isPackageReady,
  isPackageGenerating,
  isPackageSkipped,
} = require('../schemas/album-content-package.schema')
const { resolveShared } = require('../utils/resolve-shared')

const PROMPT_PATH = path.join(__dirname, '../prompts/album-content-package.md')
const runningAlbums = new Set()

/**
 * 与商家完工弹窗同一口径：留痕清单任一缺项 → 不值得调 LLM
 *（商家可「仍要完工」，但跳过大模型文案）
 */
function collectMissingFromPanels(panels = []) {
  const items = []
  ;(panels || []).forEach((panel) => {
    ;(panel.rows || []).forEach((row) => {
      if (row.present || !row.label) return
      items.push({
        id: row.id,
        label: row.label,
        panelTitle: panel.title || '',
        importanceLabel: row.importanceLabel || '',
      })
    })
  })
  return items
}

function isAlbumEligibleForLlmContentPackage(albumView = {}) {
  try {
    const { buildAlbumInspectionView } = resolveShared('utils/album-inspection-view.js')
    const view = buildAlbumInspectionView(albumView, {
      audience: 'merchant',
      completenessOnly: true,
    })
    const missing = collectMissingFromPanels(
      view && view.completeness && view.completeness.panels
    )
    return missing.length === 0
  } catch (e) {
    console.warn(
      '[album-content-package] eligibility check failed, skip llm',
      e && e.message
    )
    return false
  }
}

async function persistSkippedIncompletePackage(albumId) {
  const triggeredAt = new Date().toISOString()
  return persistPackage(
    albumId,
    {
      status: CONTENT_PACKAGE_STATUS.SKIPPED,
      source: CONTENT_PACKAGE_SOURCE.SKIPPED_INCOMPLETE,
      factSummary: '',
      qualitySuggestions: [],
      drafts: {},
      generatedAt: triggeredAt,
      error: 'incomplete_evidence',
    },
    triggeredAt
  )
}

function getPackageLlmConfig() {
  const llm = config.geoLlm || {}
  const enabled = process.env.GEO_LLM_ENABLED === 'true' || llm.enabled === true
  const dryRun =
    process.env.GEO_LLM_DRY_RUN === 'true' || (!enabled && llm.dryRun !== false && !llm.enabled)
  return {
    enabled,
    dryRun,
    apiKey: String(process.env.GEO_LLM_API_KEY || llm.apiKey || process.env.DASHSCOPE_API_KEY || '').trim(),
    model: String(process.env.GEO_LLM_MODEL || llm.model || 'qwen3.6-plus').trim(),
    timeoutMs: Number(process.env.GEO_LLM_TIMEOUT_MS || llm.timeoutMs || 90000),
  }
}

function readSystemPrompt() {
  try {
    return fs.readFileSync(PROMPT_PATH, 'utf8')
  } catch {
    return '你是车主写手与文案质检助手，只输出 JSON，禁止编造事实与营销话术。'
  }
}

function parseLlmJson(text) {
  const raw = String(text || '').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1))
      } catch {
        return {}
      }
    }
    return {}
  }
}

function scrubAiTaste(text) {
  const markers = [
    '值得一提的是',
    '在当今',
    '作为一名车主',
    '希望对大家有所帮助',
    '干货满满',
    '赋能',
    '沉浸式',
    '绝绝子',
    '家人们谁懂啊',
  ]
  let value = String(text || '')
  for (const marker of markers) {
    value = value.split(marker).join('')
  }
  return value.replace(/\n{3,}/g, '\n\n').trim()
}

function composeCopy(title, body) {
  const t = String(title || '').trim()
  const b = String(body || '').trim()
  if (t && b) return `${t}\n\n${b}`
  return t || b
}

function sanitizeDraft(raw, platformId) {
  const meta = SOCIAL_PLATFORMS[platformId] || SOCIAL_PLATFORMS.xiaohongshu
  if (!raw || typeof raw !== 'object') return null
  let title = scrubAiTaste(sanitizeGeoLlmText(raw.title || ''))
  let body = scrubAiTaste(sanitizeGeoLlmText(raw.body || raw.content || ''))
  let tips = sanitizeGeoLlmText(raw.tips || '').slice(0, 40)
  const joined = composeCopy(title, body)
  if (!joined) return null
  const violation = findGeoLlmViolation(joined)
  if (violation) return null
  if (joined.length > meta.maxChars) {
    body = body.slice(0, Math.max(80, meta.maxChars - (title ? title.length + 2 : 0)))
  }
  return {
    title,
    body,
    tips: tips || `可粘贴到${meta.label}`,
  }
}

function buildRulePackage(albumView, ruleQuality, merchantCaseDraft = null) {
  const { buildFacts, buildRuleDraft } = require('./album-social-copy.service')
  const facts = buildFacts(albumView)
  const drafts = {}
  Object.keys(SOCIAL_PLATFORMS).forEach((platformId) => {
    drafts[platformId] = buildRuleDraft(facts, platformId)
  })
  return {
    status: CONTENT_PACKAGE_STATUS.READY,
    source: CONTENT_PACKAGE_SOURCE.RULE,
    factSummary: [
      facts.serviceName,
      facts.vehicleLabel,
      [facts.city, facts.storeName].filter(Boolean).join(' · '),
    ]
      .filter(Boolean)
      .join('｜')
      .slice(0, 800),
    qualitySuggestions: (ruleQuality && ruleQuality.suggestions) || [],
    drafts,
    merchantCaseDraft,
    generatedAt: new Date().toISOString(),
    error: '',
  }
}

async function buildLlmPackage(albumView, ruleQuality, merchantCaseDraft = null) {
  const cfg = getPackageLlmConfig()
  if (!cfg.enabled || cfg.dryRun || !cfg.apiKey) return null

  const { buildFacts, buildRuleDraft } = require('./album-social-copy.service')
  const {
    mergeLlmSectionsIntoDraft,
  } = require('./merchant-case-draft.service')
  const facts = buildFacts(albumView)
  const platforms = SOCIAL_PLATFORM_LIST.map((p) => ({
    id: p.id,
    label: p.label,
    styleBrief: SOCIAL_PLATFORMS[p.id].styleBrief,
    maxChars: SOCIAL_PLATFORMS[p.id].maxChars,
  }))

  const userPayload = {
    task: 'album_content_package',
    facts,
    platforms,
    ruleQualityHints: (ruleQuality && ruleQuality.suggestions) || [],
    merchantCaseDraftHint: {
      title: merchantCaseDraft && merchantCaseDraft.title,
      sectionKeys: ['symptom', 'diagnosis', 'plan', 'process', 'handover'],
      note: '可选：输出 merchantCaseDraft（仅文字章节，禁止金额与图片 URL）',
    },
  }

  const completion = await chatCompletion({
    apiKey: cfg.apiKey,
    model: cfg.model,
    timeoutMs: cfg.timeoutMs,
    temperature: 0.7,
    enableThinking: false,
    messages: [
      { role: 'system', content: readSystemPrompt() },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
  })

  const parsed = parseLlmJson(completion.text)
  const drafts = {}
  const rawDrafts = parsed.drafts && typeof parsed.drafts === 'object' ? parsed.drafts : {}
  Object.keys(SOCIAL_PLATFORMS).forEach((platformId) => {
    const draft = sanitizeDraft(rawDrafts[platformId], platformId)
    if (draft) drafts[platformId] = draft
  })

  if (Object.keys(drafts).length < 3) {
    return null
  }

  Object.keys(SOCIAL_PLATFORMS).forEach((platformId) => {
    if (!drafts[platformId]) {
      drafts[platformId] = buildRuleDraft(facts, platformId)
    }
  })

  const qualitySuggestions = Array.isArray(parsed.qualitySuggestions)
    ? parsed.qualitySuggestions
    : []

  let nextMerchantDraft = merchantCaseDraft
  if (parsed.merchantCaseDraft && merchantCaseDraft) {
    nextMerchantDraft = mergeLlmSectionsIntoDraft(
      merchantCaseDraft,
      parsed.merchantCaseDraft,
    )
  }

  return {
    status: CONTENT_PACKAGE_STATUS.READY,
    source: CONTENT_PACKAGE_SOURCE.LLM,
    factSummary: sanitizeGeoLlmText(parsed.factSummary || '').slice(0, 800),
    qualitySuggestions,
    drafts,
    merchantCaseDraft: nextMerchantDraft,
    generatedAt: new Date().toISOString(),
    error: '',
  }
}

async function persistPackage(albumId, packageData, triggeredAt) {
  const normalized = normalizeAlbumContentPackage({
    ...packageData,
    triggeredAt: triggeredAt || packageData.triggeredAt || new Date().toISOString(),
  })
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: normalized },
  })
  return normalized
}

function readPackageFromAlbum(album) {
  return normalizeAlbumContentPackage(album && album.contentPackageJson)
}

async function runAlbumContentPackage(albumId) {
  const id = String(albumId || '').trim()
  if (!id || runningAlbums.has(id)) return null
  runningAlbums.add(id)

  try {
    const { loadAlbum, buildMerchantView } = require('./service-album.service')
    const { assessCopyQuality } = require('./copy-quality.service')
    const album = await loadAlbum(id)
    if (!album) return null

    const existing = normalizeAlbumContentPackage(album.contentPackageJson)
    const triggeredAt =
      (existing && existing.triggeredAt) || new Date().toISOString()

    const albumView = buildMerchantView(album)
    const ruleQuality = assessCopyQuality(albumView)

    if (!isAlbumEligibleForLlmContentPackage(albumView)) {
      return persistSkippedIncompletePackage(id)
    }

    let preMaskTask = null
    try {
      const { findPreMaskTask } = require('./desensitize.service')
      preMaskTask = await findPreMaskTask(id)
    } catch (_) {
      preMaskTask = null
    }

    const {
      buildRuleMerchantCaseDraft,
    } = require('./merchant-case-draft.service')
    const merchantCaseDraft = buildRuleMerchantCaseDraft(albumView, preMaskTask)

    let packageData = null
    try {
      packageData = await buildLlmPackage(albumView, ruleQuality, merchantCaseDraft)
    } catch (e) {
      console.warn('[album-content-package] llm failed', id, e && e.message)
      packageData = null
    }

    if (!packageData) {
      packageData = buildRulePackage(albumView, ruleQuality, merchantCaseDraft)
      packageData.source = CONTENT_PACKAGE_SOURCE.RULE_FALLBACK
      packageData.error = 'llm_unavailable_or_failed'
    }

    if (!packageData.merchantCaseDraft) {
      packageData.merchantCaseDraft = merchantCaseDraft
    }

    packageData.triggeredAt = triggeredAt
    return persistPackage(id, packageData, triggeredAt)
  } catch (error) {
    console.warn('[album-content-package] run failed', id, error && error.message)
    try {
      const { loadAlbum, buildMerchantView } = require('./service-album.service')
      const { assessCopyQuality } = require('./copy-quality.service')
      const album = await loadAlbum(id)
      if (album) {
        const albumView = buildMerchantView(album)
        const ruleQuality = assessCopyQuality(albumView)
        const rulePkg = buildRulePackage(albumView, ruleQuality)
        rulePkg.source = CONTENT_PACKAGE_SOURCE.RULE_FALLBACK
        rulePkg.error = String(error.message || error).slice(0, 500)
        return persistPackage(id, rulePkg, rulePkg.triggeredAt || new Date().toISOString())
      }
    } catch (persistErr) {
      console.warn('[album-content-package] persist failed', id, persistErr && persistErr.message)
    }
    return null
  } finally {
    runningAlbums.delete(id)
  }
}

async function markContentPackageGenerating(albumId) {
  const triggeredAt = new Date().toISOString()
  const pkg = emptyGeneratingPackage(triggeredAt)
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: pkg },
  })
  return pkg
}

function scheduleAlbumContentPackage(albumId) {
  const id = String(albumId || '').trim()
  if (!id) return
  setImmediate(() => {
    runAlbumContentPackage(id).catch((error) => {
      console.warn('[album-content-package] async failed', id, error && error.message)
    })
  })
}

async function triggerContentPackageOnComplete(albumId) {
  const id = String(albumId || '').trim()
  if (!id) return { skipped: true, reason: 'empty_id' }

  const { loadAlbum, buildMerchantView } = require('./service-album.service')
  const album = await loadAlbum(id)
  if (!album) return { skipped: true, reason: 'not_found' }

  const albumView = buildMerchantView(album)
  if (!isAlbumEligibleForLlmContentPackage(albumView)) {
    await persistSkippedIncompletePackage(id)
    console.info('[album-content-package] skip llm (incomplete evidence)', id)
    return { skipped: true, reason: 'incomplete_evidence' }
  }

  await markContentPackageGenerating(id)
  scheduleAlbumContentPackage(id)
  return { skipped: false }
}

function mergeQualitySuggestionsIntoCopyQuality(copyQuality, packageData) {
  if (!copyQuality || !packageData || !isPackageReady(packageData)) return copyQuality
  const llmTips = packageData.qualitySuggestions || []
  if (!llmTips.length) return copyQuality
  const existing = Array.isArray(copyQuality.suggestions) ? copyQuality.suggestions : []
  const messages = new Set(existing.map((s) => String(s.message || '').trim()).filter(Boolean))
  const extra = llmTips.filter((s) => s.message && !messages.has(s.message))
  if (!extra.length) return copyQuality
  return {
    ...copyQuality,
    suggestions: [...existing, ...extra],
    llmTipsCount: extra.length,
  }
}

module.exports = {
  triggerContentPackageOnComplete,
  scheduleAlbumContentPackage,
  runAlbumContentPackage,
  markContentPackageGenerating,
  readPackageFromAlbum,
  isPackageReady,
  isPackageGenerating,
  isPackageSkipped,
  isAlbumEligibleForLlmContentPackage,
  collectMissingFromPanels,
  mergeQualitySuggestionsIntoCopyQuality,
  buildRulePackage,
  normalizeAlbumContentPackage,
}
