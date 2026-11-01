/**
 * 完工内容包：质量建议 + 案例稿。不再产出五平台长文。
 * 短图文在读取时现算，见 album-social-card。
 */
const fs = require('fs')
const path = require('path')
const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')
const { sanitizeGeoLlmText } = require('../constants/geo-llm-compliance')
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

const PROMPT_PATH = path.join(__dirname, '../prompts/album-content-package.md')
const runningAlbums = new Set()

/**
 * 留痕清单缺项汇总（纯函数，供读侧展示用）
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

/**
 * 完工内容包是否值得调 LLM。
 * 旧口径：留痕清单任一缺项 → 跳过（依赖已下线的旧留痕矩阵）。
 * 2026-09-28：旧留痕矩阵整套下线删除，缺项判定失去依据；
 * 内容包仅在完工后触发，此时相册必有内容，故不再做留痕门槛拦截。
 */
function isAlbumEligibleForLlmContentPackage() {
  return true
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
    model: String(process.env.GEO_LLM_MODEL || llm.model || 'qwen3.7-flash').trim(),
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

function buildRulePackage(albumView, ruleQuality, merchantCaseDraft = null) {
  const { buildFacts } = require('./album-social-copy.service')
  const facts = buildFacts(albumView)
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
    drafts: {},
    merchantCaseDraft,
    generatedAt: new Date().toISOString(),
    error: '',
  }
}

async function buildLlmPackage(albumView, ruleQuality, merchantCaseDraft = null) {
  const cfg = getPackageLlmConfig()
  if (!cfg.enabled || cfg.dryRun || !cfg.apiKey) return null

  const { buildFacts } = require('./album-social-copy.service')
  const {
    mergeLlmSectionsIntoDraft,
  } = require('./merchant-case-draft.service')
  const facts = buildFacts(albumView)

  const userPayload = {
    task: 'album_content_package',
    facts,
    ruleQualityHints: (ruleQuality && ruleQuality.suggestions) || [],
    merchantCaseDraftHint: {
      title: merchantCaseDraft && merchantCaseDraft.title,
      sectionKeys: ['symptom', 'diagnosis', 'plan', 'process', 'handover'],
      note: '可选：输出 merchantCaseDraft（仅文字章节，禁止金额与图片 URL）。不要写社交媒体长文。',
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
  const qualitySuggestions = Array.isArray(parsed.qualitySuggestions)
    ? parsed.qualitySuggestions
    : []
  const factSummary = sanitizeGeoLlmText(parsed.factSummary || '').slice(0, 800)
  if (!qualitySuggestions.length && !parsed.merchantCaseDraft && !factSummary) return null

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
    factSummary,
    qualitySuggestions,
    drafts: {},
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
    // 已确认的公示案例稿不得被社交内容包的规则/LLM 结果覆盖
    const preservedConfirmed =
      existing &&
      existing.merchantCaseDraft &&
      existing.merchantCaseDraft.confirmedAt
        ? existing.merchantCaseDraft
        : null
    const merchantCaseDraft =
      preservedConfirmed || buildRuleMerchantCaseDraft(albumView, preMaskTask)

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

    if (preservedConfirmed) {
      packageData.merchantCaseDraft = preservedConfirmed
    } else if (!packageData.merchantCaseDraft) {
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
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { contentPackageJson: true },
  })
  const existing = normalizeAlbumContentPackage(album && album.contentPackageJson)
  const preservedDraft =
    existing &&
    existing.merchantCaseDraft &&
    existing.merchantCaseDraft.confirmedAt
      ? existing.merchantCaseDraft
      : null
  const pkg = emptyGeneratingPackage(triggeredAt)
  if (preservedDraft) pkg.merchantCaseDraft = preservedDraft
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
