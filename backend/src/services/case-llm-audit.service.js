/**
 * PUB-GEO · 案例审核模型（与生成/润色分离）
 * 真实性只看素材；痛点加分仅在真实性 ≥60 后计算，永不凑及格（G1）。
 */
const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')
const { assessPublicCaseQuality } = require('./public-case-quality.service')
const { buildMerchantChecklistView } = require('./album-checklist.service')
const {
  CASE_GEO_AUTHENTICITY_PASS,
  CASE_GEO_AUDIT_PROMPT_VERSION,
} = require('../constants/case-geo-audit')
const { prisma } = require('../lib/prisma')

function getAuditLlmConfig() {
  const llm = config.geoLlm || {}
  const enabled =
    process.env.CASE_GEO_AUDIT_ENABLED === 'true' ||
    process.env.GEO_LLM_ENABLED === 'true' ||
    llm.enabled === true
  const dryRun =
    process.env.CASE_GEO_AUDIT_DRY_RUN === 'true' ||
    process.env.GEO_LLM_DRY_RUN === 'true' ||
    (!enabled && llm.dryRun !== false && !llm.enabled)
  return {
    enabled,
    dryRun,
    apiKey: String(
      process.env.CASE_GEO_AUDIT_API_KEY ||
        process.env.GEO_LLM_API_KEY ||
        llm.apiKey ||
        process.env.DASHSCOPE_API_KEY ||
        '',
    ).trim(),
    model: String(
      process.env.CASE_GEO_AUDIT_MODEL || process.env.GEO_LLM_MODEL || llm.model || 'qwen-plus',
    ).trim(),
    timeoutMs: Number(process.env.CASE_GEO_AUDIT_TIMEOUT_MS || llm.timeoutMs || 90000),
  }
}

function parseLlmJson(text) {
  const raw = String(text || '').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch (_) {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1))
      } catch (e) {
        return {}
      }
    }
    return {}
  }
}

function clampScore(n, fallback = 0) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(0, Math.min(100, Math.round(v)))
}

async function loadVisionNotes(albumId, limit = 24) {
  const rows = await prisma.albumImageVisionCache.findMany({
    where: { albumId: String(albumId) },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })
  return (rows || [])
    .map((r) => ({
      imageId: r.imageId,
      description: String(r.description || '').trim(),
    }))
    .filter((r) => r.description)
}

function collectMaterialFacts(album, albumView = {}) {
  const checklist = buildMerchantChecklistView(album, album.images || [])
  const items = Array.isArray(checklist.items) ? checklist.items : []
  const evidenced = items.filter((it) => {
    const imgs = Array.isArray(it.images) ? it.images : []
    const keyed = (album.images || []).filter(
      (img) => String(img.checklistItemKey || '') === String(it.itemKey || ''),
    )
    return imgs.length > 0 || keyed.length > 0 || String(it.note || '').trim()
  })
  const withOutcome = evidenced.filter((it) => String(it.outcome || '').trim())
  const missingOutcome = evidenced
    .filter((it) => !String(it.outcome || '').trim())
    .map((it) => ({
      itemKey: it.itemKey,
      label: it.label || it.itemKey,
      reason: '有留证未点选结论',
    }))
  return {
    items,
    evidenced,
    withOutcome,
    missingOutcome,
    serviceName: albumView.serviceName || album.serviceName || '',
    vehicleDisplay: albumView.vehicleDisplay || '',
  }
}

function collectDraftClaims(draft = {}) {
  const claims = []
  const push = (text, source) => {
    const t = String(text || '').trim()
    if (!t || t.length < 4) return
    claims.push({ text: t.slice(0, 120), source })
  }
  push(draft.caseSummary, 'summary')
  ;(draft.faq || []).forEach((row, i) => {
    push(row && row.a, `faq:${i}`)
  })
  ;(draft.sections || []).forEach((sec) => {
    push(sec && sec.body, `section:${(sec && sec.key) || ''}`)
  })
  return claims
}

/**
 * 规则机审（无 LLM / dryRun 时使用）
 * 真实性：有证项+结论+可公示图；不足声称：有证无结论、文稿关键词无法回溯。
 */
function auditAuthenticityByRules({ album, albumView, draft, visionNotes = [] }) {
  const quality = assessPublicCaseQuality(albumView || {})
  const hardBlocks = (quality.privacyBlocks || []).map((b) => ({
    kind: b.kind || 'privacy',
    issue: b.issue || '',
    message: b.message || '',
    itemKey: '',
  }))
  const facts = collectMaterialFacts(album, albumView)
  const unsupportedClaims = [...facts.missingOutcome]

  let score = 25
  if (facts.evidenced.length >= 1) score += 15
  if (facts.evidenced.length >= 3) score += 10
  if (facts.withOutcome.length >= 1) score += 15
  if (facts.withOutcome.length >= 3) score += 10
  if (facts.missingOutcome.length === 0 && facts.evidenced.length > 0) score += 10
  if (!(hardBlocks || []).some((b) => b.issue && String(b.issue).includes('no_public_media'))) {
    score += 10
  }
  if (visionNotes.length >= 1) score += 5
  if (visionNotes.length >= 3) score += 5

  const claimTexts = collectDraftClaims(draft)
  const materialBlob = [
    ...facts.evidenced.map((it) => `${it.label || ''} ${it.outcomeLabel || ''} ${it.note || ''}`),
    ...visionNotes.map((v) => v.description),
  ]
    .join(' ')
    .toLowerCase()

  claimTexts.forEach((c) => {
    const keywords = String(c.text)
      .replace(/[，。；、：:\s]+/g, ' ')
      .split(' ')
      .map((w) => w.trim())
      .filter((w) => w.length >= 2)
      .slice(0, 6)
    const hit = keywords.some((w) => materialBlob.includes(w.toLowerCase()))
    if (!hit && keywords.length >= 2) {
      unsupportedClaims.push({
        itemKey: '',
        label: c.text.slice(0, 40),
        reason: '预览稿主张难以回溯到素材',
        source: c.source,
      })
      score -= 4
    }
  })

  const authenticityScore = clampScore(score, 40)
  let painPointBonus = 0
  if (authenticityScore >= CASE_GEO_AUTHENTICITY_PASS) {
    const summary = String((draft && draft.caseSummary) || '')
    if (/为什么|顾虑|担心|异响|漏油|抖动|费油|噪音/.test(summary)) {
      painPointBonus = 8
    } else if (summary.length >= 40) {
      painPointBonus = 4
    }
  }

  const passed =
    authenticityScore >= CASE_GEO_AUTHENTICITY_PASS && hardBlocks.length === 0

  return {
    authenticityScore,
    painPointBonus,
    unsupportedClaims: unsupportedClaims.slice(0, 20),
    hardBlocks,
    draftStale: false,
    passed,
    source: 'rules',
    promptVersion: CASE_GEO_AUDIT_PROMPT_VERSION,
  }
}

const AUDIT_SYSTEM = `你是汽车维修案例「真实性」审核模型，与写稿模型分离。
只根据素材判断「本单声称的检查/处理是否有证据」，不要评价文笔。
禁止护短；不要编造画面里没有的内容。
输出严格 JSON：
{
  "authenticityScore": 0-100,
  "unsupportedClaims": [{"itemKey":"","label":"","reason":""}],
  "draftStale": false,
  "painPointBonus": 0-20,
  "notes": ""
}
规则：painPointBonus 仅在 authenticityScore>=60 时才可>0；否则必须为 0。`

async function auditAuthenticityWithLlm({ album, albumView, draft, visionNotes }) {
  const cfg = getAuditLlmConfig()
  const ruleBase = auditAuthenticityByRules({ album, albumView, draft, visionNotes })
  if (!cfg.enabled || cfg.dryRun || !cfg.apiKey) {
    return { ...ruleBase, source: cfg.dryRun ? 'rules_dry_run' : 'rules' }
  }

  const facts = collectMaterialFacts(album, albumView)
  const userPayload = {
    serviceName: facts.serviceName,
    vehicleDisplay: facts.vehicleDisplay,
    evidencedItems: facts.evidenced.map((it) => ({
      itemKey: it.itemKey,
      label: it.label,
      outcome: it.outcome,
      outcomeLabel: it.outcomeLabel,
      note: it.note || '',
    })),
    visionNotes: visionNotes.slice(0, 12),
    draftPreview: {
      title: draft.title || '',
      caseSummary: draft.caseSummary || '',
      faq: (draft.faq || []).slice(0, 8),
      sectionKeys: (draft.sections || []).map((s) => s.key),
    },
    hardBlocks: ruleBase.hardBlocks,
  }

  try {
    const result = await chatCompletion({
      apiKey: cfg.apiKey,
      model: cfg.model,
      timeoutMs: cfg.timeoutMs,
      temperature: 0.1,
      responseFormat: { type: 'json_object' },
      messages: [
        { role: 'system', content: AUDIT_SYSTEM },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
    })
    const parsed = parseLlmJson(result.text)
    let authenticityScore = clampScore(parsed.authenticityScore, ruleBase.authenticityScore)
    let painPointBonus = clampScore(parsed.painPointBonus, 0)
    if (authenticityScore < CASE_GEO_AUTHENTICITY_PASS) painPointBonus = 0
    const unsupportedClaims = Array.isArray(parsed.unsupportedClaims)
      ? parsed.unsupportedClaims
          .map((row) => ({
            itemKey: String((row && row.itemKey) || ''),
            label: String((row && row.label) || '').slice(0, 80),
            reason: String((row && row.reason) || '').slice(0, 120),
          }))
          .filter((row) => row.label || row.reason)
      : ruleBase.unsupportedClaims

    const hardBlocks = ruleBase.hardBlocks
    const passed =
      authenticityScore >= CASE_GEO_AUTHENTICITY_PASS && hardBlocks.length === 0

    return {
      authenticityScore,
      painPointBonus,
      unsupportedClaims: unsupportedClaims.slice(0, 20),
      hardBlocks,
      draftStale: Boolean(parsed.draftStale),
      passed,
      source: 'llm',
      promptVersion: CASE_GEO_AUDIT_PROMPT_VERSION,
      notes: String(parsed.notes || '').slice(0, 300),
      model: cfg.model,
    }
  } catch (err) {
    return {
      ...ruleBase,
      source: 'rules_fallback',
      notes: `LLM 机审失败，已用规则机审：${(err && err.message) || 'unknown'}`.slice(0, 300),
    }
  }
}

/**
 * 整单机审入口
 */
async function auditMerchantCaseDraft({ album, albumView, draft }) {
  const visionNotes = await loadVisionNotes(album.id)
  const result = await auditAuthenticityWithLlm({
    album,
    albumView,
    draft,
    visionNotes,
  })
  try {
    const { emitCaseGeoObs } = require('../utils/case-geo-obs')
    emitCaseGeoObs('case.audit', {
      albumId: album && album.id,
      authenticityScore: result.authenticityScore,
      passed: result.passed,
      source: result.source,
      hardBlockCount: (result.hardBlocks || []).length,
      claimCount: (result.unsupportedClaims || []).length,
      painPointBonus: result.painPointBonus || 0,
    })
  } catch (_) {
    /* ignore */
  }
  return {
    ...result,
    auditedAt: new Date().toISOString(),
    threshold: CASE_GEO_AUTHENTICITY_PASS,
  }
}

module.exports = {
  CASE_GEO_AUTHENTICITY_PASS,
  getAuditLlmConfig,
  auditAuthenticityByRules,
  auditMerchantCaseDraft,
  collectMaterialFacts,
  loadVisionNotes,
}
