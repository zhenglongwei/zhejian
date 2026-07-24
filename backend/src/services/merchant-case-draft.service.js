/**
 * PKG-COACH-P1-03 · 商家案例草稿（结构化正文 + 脱敏配图嵌入）
 * - 正文：仅节点文字 / scrub 后字段 → 规则或 LLM（图不进模型）
 * - 配图：域内选公开池图 + pre-mask 脱敏 URL 嵌入
 */
const { scrubPiiText } = require('../utils/scrub-pii-text')
const {
  MERCHANT_CASE_SECTION_KEYS,
  MEDIA_SECTION_BY_NODE,
  AMOUNT_PATTERN,
} = require('../constants/merchant-case-draft')
const {
  PUBLIC_MEDIA_KEYFRAME_DEFAULT,
  VISIBILITY,
  PUBLIC_GATE_STATUS,
} = require('../constants/album-public-visibility-policy')
const { resolvePublicCaseMediaUrl, resolveDisplayMediaUrl } = require('../lib/media-url')
const { stripUrlQuery } = require('../lib/media-signed-url')
const { rewriteMediaUrlForCurrentBase } = require('../lib/media-storage')

function normalizeUrl(url = '') {
  return stripUrlQuery(rewriteMediaUrlForCurrentBase(String(url || '').trim()))
}

function stripAmountText(text = '') {
  let value = String(text || '')
  value = value.replace(/方案参考费用约[^。；;\n]*/gu, '')
  value = value.replace(/参考\s*\d[\d,]*(?:\.\d+)?\s*元/gu, '')
  value = value.replace(AMOUNT_PATTERN, '')
  value = value.replace(/[，,]\s*[，,]/g, '，')
  value = value.replace(/^\s*[，,；;]\s*/u, '')
  return scrubPiiText(value).replace(/\s{2,}/g, ' ').trim()
}

function findNode(nodes, stageId) {
  return (nodes || []).find((n) => String(n.id || n.nodeId) === stageId) || null
}

function noteForStages(nodes, stageIds = []) {
  const parts = []
  stageIds.forEach((id) => {
    const node = findNode(nodes, id)
    const note = stripAmountText(node && node.note)
    if (note) parts.push(note)
  })
  return parts.join('。').slice(0, 500)
}

function buildTitle(albumView = {}) {
  const city = scrubPiiText(albumView.store?.city || albumView.city || '')
  const vehicle = scrubPiiText(albumView.vehicleDisplay || '')
  const service = scrubPiiText(albumView.serviceName || '维修服务')
  const head = [city, vehicle].filter(Boolean).join('｜')
  if (head) return `${head}｜${service}过程记录`.slice(0, 80)
  return `${service}过程记录`.slice(0, 80)
}

function buildRuleSections(albumView = {}) {
  const nodes = albumView.nodes || []
  const partsNames = (albumView.planParts || [])
    .map((row) => scrubPiiText(row.name || ''))
    .filter(Boolean)
    .slice(0, 8)

  return MERCHANT_CASE_SECTION_KEYS.map((def) => {
    let body = noteForStages(nodes, def.stageIds)
    if (def.key === 'plan' && partsNames.length) {
      const partLine = `主要项目：${partsNames.join('、')}`
      body = body ? `${body}。${partLine}` : partLine
    }
    if (def.key === 'handover' && !body) {
      body = '旧件与交车确认以门店留档为准。'
    }
    return {
      key: def.key,
      title: def.title,
      body: stripAmountText(body).slice(0, 600),
    }
  })
}

function listPublicImageMeta(albumView = {}) {
  const meta = Array.isArray(albumView.imageMeta) ? albumView.imageMeta : []
  return meta
    .filter(
      (row) =>
        row.visibility === VISIBILITY.PUBLIC &&
        row.publicGateStatus === PUBLIC_GATE_STATUS.PASSED,
    )
    .sort((a, b) => {
      const c = String(a.nodeId).localeCompare(String(b.nodeId))
      if (c !== 0) return c
      return Number(a.idx || 0) - Number(b.idx || 0)
    })
}

function resolveMaskedFromTask(task, nodeId, idx, rawUrl) {
  const assets = (task && (task.rawAssets || task.assets)) || []
  const normalized = normalizeUrl(rawUrl)
  let matched = assets.find(
    (asset) =>
      String(asset.nodeId || '') === String(nodeId) &&
      Number(asset.idx != null ? asset.idx : asset.index ?? 0) === Number(idx),
  )
  if (!matched && normalized) {
    matched = assets.find(
      (asset) => normalizeUrl(asset.rawUrl || asset.url || '') === normalized,
    )
  }
  return resolvePublicCaseMediaUrl(matched?.maskedUrl || matched?.preMaskedUrl || '')
}

/**
 * 域内选关键帧并挂到小节（图不进 LLM）
 * 确认脱敏前可用 previewUrl（原图预览位）；脱敏后写 maskedUrl
 */
function pickDraftMedia(albumView = {}, preMaskTask = null, options = {}) {
  const softCap = options.softCap != null ? options.softCap : PUBLIC_MEDIA_KEYFRAME_DEFAULT
  const rows = listPublicImageMeta(albumView).slice(0, softCap)
  const nodes = albumView.nodes || []
  return rows
    .map((row) => {
      const previewUrl =
        resolveDisplayMediaUrl(row.rawUrl || '') ||
        rewriteMediaUrlForCurrentBase(String(row.rawUrl || '').trim())
      const maskedUrl = resolveMaskedFromTask(
        preMaskTask,
        row.nodeId,
        row.idx,
        row.rawUrl,
      )
      if (!maskedUrl && !previewUrl) return null
      const node = findNode(nodes, row.nodeId)
      return {
        nodeId: row.nodeId,
        idx: Number(row.idx || 0),
        maskedUrl: maskedUrl || '',
        previewUrl: previewUrl || maskedUrl || '',
        caption: stripAmountText(node && node.note).slice(0, 48),
        sectionKey: MEDIA_SECTION_BY_NODE[row.nodeId] || 'process',
      }
    })
    .filter(Boolean)
}

function buildRuleCaseSummary(draftLike = {}, albumView = {}) {
  const title = stripAmountText(draftLike.title || buildTitle(albumView) || '')
  const sections = Array.isArray(draftLike.sections) ? draftLike.sections : []
  const bits = []
  sections.forEach((sec) => {
    const body = stripAmountText(sec && sec.body)
    if (body) bits.push(body)
  })
  let summary = bits.join('。').replace(/。+/g, '。').trim()
  if (!summary && title) summary = title
  if (summary && !/[。！？]$/u.test(summary)) summary = `${summary}。`
  // 目标约 100–250 字；过短保留，过长截断
  return stripAmountText(summary).slice(0, 250)
}

/** SEO meta description：由案例摘要派生，不另起炉灶 */
function deriveSeoDescriptionFromSummary(caseSummary = '') {
  const text = stripAmountText(caseSummary)
  if (!text) return ''
  if (text.length <= 160) return text
  return `${text.slice(0, 157)}…`
}

function normalizeMerchantCaseDraft(raw) {
  if (!raw || typeof raw !== 'object') return null
  const sectionsIn = Array.isArray(raw.sections) ? raw.sections : []
  const byKey = {}
  sectionsIn.forEach((sec) => {
    if (!sec || !sec.key) return
    byKey[sec.key] = {
      key: String(sec.key),
      title: stripAmountText(sec.title || '').slice(0, 40),
      body: stripAmountText(sec.body || '').slice(0, 800),
    }
  })
  const sections = MERCHANT_CASE_SECTION_KEYS.map((def) => {
    const hit = byKey[def.key]
    return {
      key: def.key,
      title: (hit && hit.title) || def.title,
      body: (hit && hit.body) || '',
    }
  })
  const media = Array.isArray(raw.media)
    ? raw.media
        .map((item) => {
          if (!item) return null
          const maskedUrl = resolvePublicCaseMediaUrl(item.maskedUrl || '')
          // 确认脱敏前允许原图预览位；公开/导出仍优先 maskedUrl
          const previewRaw = String(item.previewUrl || item.rawUrl || '').trim()
          const previewUrl =
            resolveDisplayMediaUrl(previewRaw) ||
            rewriteMediaUrlForCurrentBase(previewRaw) ||
            maskedUrl
          if (!maskedUrl && !previewUrl) return null
          return {
            nodeId: String(item.nodeId || ''),
            idx: Number(item.idx || 0),
            maskedUrl: maskedUrl || '',
            previewUrl: previewUrl || '',
            caption: stripAmountText(item.caption || '').slice(0, 48),
            sectionKey: String(item.sectionKey || MEDIA_SECTION_BY_NODE[item.nodeId] || 'process'),
          }
        })
        .filter(Boolean)
        .slice(0, PUBLIC_MEDIA_KEYFRAME_DEFAULT)
    : []

  const title = stripAmountText(raw.title || '').slice(0, 80)
  let caseSummary = stripAmountText(raw.caseSummary || raw.summary || '').slice(0, 250)
  if (!caseSummary) {
    caseSummary = buildRuleCaseSummary({ title, sections })
  }

  return {
    version: 1,
    title,
    caseSummary,
    sections,
    media,
    source: String(raw.source || 'rule').slice(0, 32),
    generatedAt: String(raw.generatedAt || ''),
    confirmedAt: String(raw.confirmedAt || ''),
  }
}

function buildRuleMerchantCaseDraft(albumView = {}, preMaskTask = null, options = {}) {
  const sections = buildRuleSections(albumView)
  const title = buildTitle(albumView)
  const draft = {
    version: 1,
    title,
    sections,
    caseSummary: buildRuleCaseSummary({ title, sections }, albumView),
    media: pickDraftMedia(albumView, preMaskTask, options),
    source: 'rule',
    generatedAt: new Date().toISOString(),
    confirmedAt: '',
  }
  return normalizeMerchantCaseDraft(draft)
}

function mergeLlmSectionsIntoDraft(baseDraft, llmDraft) {
  if (!llmDraft || typeof llmDraft !== 'object') return baseDraft
  const nextSections = llmDraft.sections || baseDraft.sections
  const nextTitle = llmDraft.title || baseDraft.title
  // 正文润色不写入 caseSummary；摘要由规则拼接 + 摘要专用润色处理
  const caseSummary =
    stripAmountText(baseDraft.caseSummary || '').slice(0, 250) ||
    buildRuleCaseSummary({ title: nextTitle, sections: nextSections })
  return normalizeMerchantCaseDraft({
    ...baseDraft,
    title: nextTitle,
    sections: nextSections,
    caseSummary,
    media: baseDraft.media,
    source: 'llm',
    generatedAt: new Date().toISOString(),
    confirmedAt: baseDraft.confirmedAt || '',
  })
}

function draftToPlainText(draft) {
  const normalized = normalizeMerchantCaseDraft(draft)
  if (!normalized) return ''
  const parts = [normalized.title]
  if (normalized.caseSummary) parts.push(normalized.caseSummary)
  normalized.sections.forEach((sec) => {
    if (!sec.body) return
    parts.push(`【${sec.title}】${sec.body}`)
  })
  return parts.filter(Boolean).join('\n\n').slice(0, 2000)
}

function draftToAiSummary(draft) {
  const normalized = normalizeMerchantCaseDraft(draft)
  if (!normalized) return ''
  if (normalized.caseSummary) return normalized.caseSummary.slice(0, 250)
  return draftToPlainText(draft).slice(0, 250)
}

module.exports = {
  stripAmountText,
  buildRuleMerchantCaseDraft,
  normalizeMerchantCaseDraft,
  mergeLlmSectionsIntoDraft,
  pickDraftMedia,
  draftToPlainText,
  draftToAiSummary,
  buildTitle,
  buildRuleCaseSummary,
  deriveSeoDescriptionFromSummary,
}
