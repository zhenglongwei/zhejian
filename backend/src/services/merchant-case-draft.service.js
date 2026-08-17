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
  isAlwaysPrivateStage,
} = require('../constants/album-public-visibility-policy')
const { resolvePublicCaseMediaUrl, resolveDisplayMediaUrl } = require('../lib/media-url')
const { stripUrlQuery } = require('../lib/media-signed-url')
const { rewriteMediaUrlForCurrentBase } = require('../lib/media-storage')
const { extractJobFaqs, normalizeFaqItems } = require('../utils/merchant-case-job-faq')

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

/** 案例正文：只写做成的检查项；跟进最多一句总述（18 §7.3） */
function buildChecklistCaseHints(albumView = {}) {
  try {
    const {
      buildMerchantChecklistView,
      filterChecklistItemsForCase,
      buildCaseFollowUpSummary,
    } = require('./album-checklist.service')
    const images = Array.isArray(albumView.imageMeta)
      ? albumView.imageMeta.map((row) => ({
          id: row.id,
          rawUrl: row.rawUrl || row.url || '',
          url: row.url || row.rawUrl || '',
          caption: row.caption || '',
          nodeId: row.nodeId || '',
          checklistItemKey: row.checklistItemKey || '',
        }))
      : []
    const view = buildMerchantChecklistView(
      {
        templateId: albumView.templateId,
        serviceName: albumView.serviceName,
        checklistJson: albumView.checklistJson || null,
      },
      images,
    )
    const doneItems = filterChecklistItemsForCase(view.items || [])
    const doneLine = doneItems
      .slice(0, 8)
      .map((it) => scrubPiiText(it.label || ''))
      .filter(Boolean)
      .join('、')
    const followUpSummary = buildCaseFollowUpSummary(view.items || [])
    return {
      doneLine: doneLine ? `本单已处理：${doneLine}` : '',
      followUpSummary: scrubPiiText(followUpSummary),
    }
  } catch (_) {
    return { doneLine: '', followUpSummary: '' }
  }
}

function projectHeadline(albumView = {}) {
  const service = stripAmountText(albumView.serviceName || '')
    .replace(/过程记录|维修案例|案例$/g, '')
    .trim()
  if (service) return service.slice(0, 24)
  try {
    const { inferJobKind } = require('../utils/merchant-case-job-faq')
    const kind = inferJobKind({
      serviceName: albumView.serviceName,
      templateId: albumView.templateId,
    })
    if (kind === 'maintenance') return '保养'
    if (kind === 'body_paint') return '钣喷'
  } catch (_) {
    /* ignore */
  }
  return '维修'
}

function shortPlaceLabel(albumView = {}) {
  const cityField = stripAmountText(albumView.store?.city || albumView.city || '')
  const districtField = stripAmountText(
    albumView.store?.district || albumView.district || '',
  )
  const address = stripAmountText(
    albumView.storeAddress || albumView.store?.address || albumView.address || '',
  )
  let city = cityField.replace(/市$/u, '')
  let district = districtField.replace(/[区县]$/u, '')
  if (!city && address) {
    const cityMatch = address.match(/([\u4e00-\u9fa5]{2,3})市/u)
    if (cityMatch) city = cityMatch[1]
  }
  if (!district && address) {
    const distMatch =
      address.match(/([\u4e00-\u9fa5]{1,3})区/u) ||
      address.match(/([\u4e00-\u9fa5]{1,3})县/u)
    if (distMatch) district = distMatch[1]
  }
  if (city && district && district !== city) return `${city}${district}`
  return city || district || ''
}

function doneItemsForTitle(albumView = {}) {
  const hints = buildChecklistCaseHints(albumView)
  const fromDone = String(hints.doneLine || '').replace(/^本单已处理[:：]/u, '')
  if (fromDone) {
    return fromDone
      .split(/、|,/)
      .map((item) => stripAmountText(item))
      .filter(Boolean)
      .slice(0, 3)
      .join('、')
  }
  return (albumView.planParts || [])
    .map((row) => stripAmountText(row.name || ''))
    .filter(Boolean)
    .slice(0, 3)
    .join('、')
}

/** 标题：城市城区 + 短车型 + 项目：这次做了什么（店名地址不进标题） */
function buildTitle(albumView = {}) {
  const place = shortPlaceLabel(albumView)
  const vehicle = shortVehicleLabel(albumView)
  const project = projectHeadline(albumView)
  const done = doneItemsForTitle(albumView)
  const head = [place, vehicle, project].filter(Boolean).join(' ')
  const title = done ? `${head}：${done}` : head
  if (title) return title.slice(0, 120)
  return project.slice(0, 120)
}

function buildRuleSections(albumView = {}) {
  const nodes = albumView.nodes || []
  const partsNames = (albumView.planParts || [])
    .map((row) => scrubPiiText(row.name || ''))
    .filter(Boolean)
    .slice(0, 8)
  const { formatWarrantyCommitmentText, findWarrantyEvidenceItem } = require('../utils/album-evidence-items')
  const warrantyText = formatWarrantyCommitmentText(
    findWarrantyEvidenceItem(albumView.evidenceItems || []) || {},
  )
  const checklistHints = buildChecklistCaseHints(albumView)

  return MERCHANT_CASE_SECTION_KEYS.map((def) => {
    let body = noteForStages(nodes, def.stageIds)
    if (def.key === 'process' && checklistHints.doneLine) {
      body = body ? `${body}。${checklistHints.doneLine}` : checklistHints.doneLine
    }
    if (def.key === 'plan' && partsNames.length) {
      const partLine = `主要项目：${partsNames.join('、')}`
      body = body ? `${body}。${partLine}` : partLine
    }
    if (def.key === 'handover') {
      if (warrantyText) {
        const warrantyLine = scrubPiiText(warrantyText)
        body = body ? `${body}。${warrantyLine}` : warrantyLine
      }
      if (checklistHints.followUpSummary) {
        body = body
          ? `${body}。${checklistHints.followUpSummary}`
          : checklistHints.followUpSummary
      }
      if (!body) {
        body = '旧件与交车确认以门店留档为准；质保以门店承诺为准。'
      }
    }
    return {
      key: def.key,
      title: def.title,
      body: stripAmountText(body).slice(0, 600),
    }
  })
}

const HANDOVER_PLACEHOLDER = '旧件与交车确认以门店留档为准；质保以门店承诺为准。'

function isSectionBodyBlank(body = '', key = '') {
  const text = String(body || '').trim()
  if (!text) return true
  if (key === 'handover' && text === HANDOVER_PLACEHOLDER) return true
  return false
}

function draftBodyHasWarranty(body = '') {
  return /质保时长|质保范围/.test(String(body || ''))
}

/**
 * 未确认稿：把相册「质保承诺」字段同步进交车与质保章节（及摘要，若尚无质保句）
 */
function syncWarrantyIntoDraft(draft, albumView = {}) {
  if (!draft || typeof draft !== 'object') return draft
  const { formatWarrantyCommitmentText, findWarrantyEvidenceItem } = require('../utils/album-evidence-items')
  const warrantyText = scrubPiiText(
    formatWarrantyCommitmentText(findWarrantyEvidenceItem(albumView.evidenceItems || []) || {}),
  )
  if (!warrantyText) return draft

  const sectionsIn = Array.isArray(draft.sections) ? draft.sections : []
  const sections = sectionsIn.map((sec) => ({ ...sec }))
  const idx = sections.findIndex((sec) => sec && sec.key === 'handover')
  let sectionsChanged = false

  if (idx < 0) {
    const ruleHandover = buildRuleSections(albumView).find((sec) => sec.key === 'handover')
    sections.push({
      key: 'handover',
      title: (ruleHandover && ruleHandover.title) || '交车与质保',
      body: ((ruleHandover && ruleHandover.body) || warrantyText).slice(0, 600),
    })
    sectionsChanged = true
  } else if (!draftBodyHasWarranty(sections[idx].body)) {
    const body = String(sections[idx].body || '').trim()
    let nextBody = body
    if (!body || body === HANDOVER_PLACEHOLDER) {
      const ruleHandover = buildRuleSections(albumView).find((sec) => sec.key === 'handover')
      nextBody = (ruleHandover && ruleHandover.body) || warrantyText
    } else {
      nextBody = `${body.replace(/[。；;\s]+$/u, '')}。${warrantyText}`
    }
    sections[idx] = {
      ...sections[idx],
      body: stripAmountText(nextBody).slice(0, 600),
    }
    sectionsChanged = true
  }

  let caseSummary = String(draft.caseSummary || '').trim()
  let summaryChanged = false
  if (caseSummary && !draftBodyHasWarranty(caseSummary)) {
    const prefix = /[。！？]$/u.test(caseSummary) ? caseSummary : `${caseSummary}。`
    caseSummary = stripAmountText(`${prefix}${warrantyText}。`).slice(0, 250)
    summaryChanged = true
  } else if (!caseSummary) {
    caseSummary = buildRuleCaseSummary({ title: draft.title, sections }, albumView)
    summaryChanged = true
  }

  if (!sectionsChanged && !summaryChanged) return draft
  return normalizeMerchantCaseDraft({
    ...draft,
    sections,
    caseSummary,
  })
}

function listPublicImageMeta(albumView = {}) {
  const meta = Array.isArray(albumView.imageMeta) ? albumView.imageMeta : []
  return meta
    .filter((row) => {
      if (isAlwaysPrivateStage(row.nodeId)) return false
      if (row.visibility !== VISIBILITY.PUBLIC) return false
      if (row.publicGateStatus === PUBLIC_GATE_STATUS.REJECTED) return false
      return true
    })
    .sort((a, b) => {
      const c = String(a.nodeId).localeCompare(String(b.nodeId))
      if (c !== 0) return c
      return Number(a.idx || 0) - Number(b.idx || 0)
    })
}

const MEDIA_SECTION_PICK_ORDER = ['diagnosis', 'plan', 'process', 'handover']

const STAGE_FIGURE_LABEL = {
  stage_2: '诊断检查',
  stage_4: '配件核对',
  stage_5: '施工过程',
  stage_6: '交车与质保',
}

function buildChecklistLabelMap(albumView = {}) {
  try {
    const { buildMerchantChecklistView } = require('./album-checklist.service')
    const images = Array.isArray(albumView.imageMeta)
      ? albumView.imageMeta.map((row) => ({
          id: row.id,
          rawUrl: row.rawUrl || row.url || '',
          url: row.url || row.rawUrl || '',
          caption: row.caption || '',
          nodeId: row.nodeId || '',
          checklistItemKey: row.checklistItemKey || '',
        }))
      : []
    const view = buildMerchantChecklistView(
      {
        templateId: albumView.templateId,
        serviceName: albumView.serviceName,
        checklistJson: albumView.checklistJson || null,
      },
      images,
    )
    const map = {}
    ;(view.items || []).forEach((it) => {
      const key = String((it && (it.itemKey || it.key)) || '').trim()
      const label = stripAmountText((it && it.label) || '')
      if (key && label) map[key] = label
    })
    return map
  } catch (_) {
    return {}
  }
}

function buildDraftMediaTexts(row = {}, labelMap = {}) {
  const merchantCaption = stripAmountText(row.caption || '').slice(0, 48)
  const itemLabel = stripAmountText(labelMap[row.checklistItemKey] || '')
  const stageName = STAGE_FIGURE_LABEL[row.nodeId] || '过程'
  let hint = ''
  if (merchantCaption && merchantCaption.length <= 12) {
    hint = `本图为「${merchantCaption}」检查留证，具体状态以图中为准。`
  } else if (!merchantCaption && itemLabel) {
    hint = `本图为「${itemLabel}」留证，具体状态以图中为准。`
  } else {
    hint = `本图为${stageName}留证。`
  }
  return {
    caption: merchantCaption,
    hint: stripAmountText(hint).slice(0, 80),
  }
}

function pickMappedMediaBySection(mapped, softCap) {
  const bySection = {}
  MEDIA_SECTION_PICK_ORDER.forEach((key) => {
    bySection[key] = []
  })
  mapped.forEach((item) => {
    const key = MEDIA_SECTION_PICK_ORDER.includes(item.sectionKey)
      ? item.sectionKey
      : 'process'
    bySection[key].push(item)
  })
  const picked = []
  const used = new Set()
  const idOf = (item) => `${item.nodeId}:${item.idx}`
  const push = (item) => {
    if (!item || used.has(idOf(item)) || picked.length >= softCap) return
    used.add(idOf(item))
    picked.push(item)
  }
  MEDIA_SECTION_PICK_ORDER.forEach((key) => push(bySection[key][0]))
  let round = 1
  while (picked.length < softCap) {
    let added = false
    for (const key of MEDIA_SECTION_PICK_ORDER) {
      const item = bySection[key][round]
      if (item && !used.has(idOf(item))) {
        push(item)
        added = true
        if (picked.length >= softCap) break
      }
    }
    if (!added) break
    round += 1
  }
  return picked
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
  const labelMap = buildChecklistLabelMap(albumView)
  const mapped = listPublicImageMeta(albumView)
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
      const texts = buildDraftMediaTexts(row, labelMap)
      return {
        nodeId: row.nodeId,
        idx: Number(row.idx || 0),
        maskedUrl: maskedUrl || '',
        previewUrl: previewUrl || maskedUrl || '',
        caption: texts.caption,
        hint: texts.hint,
        sectionKey: MEDIA_SECTION_BY_NODE[row.nodeId] || 'process',
      }
    })
    .filter(Boolean)
  return pickMappedMediaBySection(mapped, softCap)
}

function firstUsefulSentence(text = '') {
  const parts = String(text || '').split(/[。！？；;\n]/)
  for (const part of parts) {
    const line = stripAmountText(part).trim()
    if (!line) continue
    if (line === HANDOVER_PLACEHOLDER) continue
    if (/以门店留档为准|以门店承诺为准/.test(line) && line.length < 48) continue
    return line.slice(0, 80)
  }
  return ''
}

function shortVehicleLabel(albumView = {}) {
  const vehicle = albumView.vehicle || {}
  const fromFields = [vehicle.brand, vehicle.series]
    .map((item) => stripAmountText(item || ''))
    .filter(Boolean)
    .join(' ')
  if (fromFields) return fromFields.slice(0, 24)
  return stripAmountText(albumView.vehicleDisplay || '')
    .replace(/\s*\/\s*[^/]*$/u, '')
    .replace(/\s+\d+(\.\d+)?L\b.*$/u, '')
    .replace(/\s*\(\d{4}.*$/u, '')
    .trim()
    .slice(0, 24)
}

function buildRuleCaseSummary(draftLike = {}, albumView = {}) {
  const sections = Array.isArray(draftLike.sections) ? draftLike.sections : []
  const byKey = {}
  sections.forEach((sec) => {
    if (sec && sec.key) byKey[sec.key] = stripAmountText(sec.body || '')
  })
  const vehicle = shortVehicleLabel(albumView)
  const symptom = firstUsefulSentence(byKey.symptom)
  const diagnosis = firstUsefulSentence(byKey.diagnosis)
  const plan = firstUsefulSentence(byKey.plan)
  const process = String(byKey.process || '')
  const doneMatch = process.match(/本单已处理[:：][^。；;\n]+/)
  const doneLine = doneMatch ? stripAmountText(doneMatch[0]).slice(0, 80) : ''
  const handover = firstUsefulSentence(byKey.handover)
  const bits = []
  if (vehicle && symptom) bits.push(`${vehicle}${symptom}`)
  else if (vehicle) bits.push(vehicle)
  else if (symptom) bits.push(symptom)
  if (diagnosis && diagnosis !== symptom) bits.push(diagnosis)
  if (doneLine) bits.push(doneLine)
  else if (plan) bits.push(plan)
  if (handover) bits.push(handover)
  let summary = bits.join('。').replace(/。+/g, '。').trim()
  if (!summary) {
    const title = stripAmountText(draftLike.title || buildTitle(albumView) || '')
    summary = title
  }
  if (summary && !/[。！？]$/u.test(summary)) summary = `${summary}。`
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
            hint: stripAmountText(item.hint || '').slice(0, 80),
            sectionKey: String(item.sectionKey || MEDIA_SECTION_BY_NODE[item.nodeId] || 'process'),
          }
        })
        .filter(Boolean)
        .slice(0, PUBLIC_MEDIA_KEYFRAME_DEFAULT)
    : []

  const title = stripAmountText(raw.title || '').slice(0, 120)
  let caseSummary = stripAmountText(raw.caseSummary || raw.summary || '').slice(0, 250)
  if (!caseSummary) {
    caseSummary = buildRuleCaseSummary({ title, sections })
  }

  const faq = Array.isArray(raw.faq)
    ? normalizeFaqItems(raw.faq)
    : raw.confirmedAt
      ? []
      : extractJobFaqs({ sections })

  return {
    version: 1,
    title,
    caseSummary,
    faq,
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
    faq: extractJobFaqs({
      sections,
      serviceName: albumView.serviceName,
      templateId: albumView.templateId,
    }),
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
  ;(normalized.faq || []).forEach((item) => {
    if (!item || !item.q || !item.a) return
    parts.push(`问：${item.q}\n答：${item.a}`)
  })
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

function mergeUnconfirmedDraftMedia(prevMedia, freshMedia, softCap = PUBLIC_MEDIA_KEYFRAME_DEFAULT) {
  const prev = Array.isArray(prevMedia) ? prevMedia : []
  const fresh = Array.isArray(freshMedia) ? freshMedia : []
  if (!prev.length) return fresh.slice(0, softCap)
  const keep = new Set(prev.map((item) => `${item.nodeId}:${item.idx}`))
  const kept = []
  const used = new Set()
  fresh.forEach((item) => {
    const id = `${item.nodeId}:${item.idx}`
    if (!keep.has(id) || used.has(id)) return
    used.add(id)
    const old = prev.find((row) => `${row.nodeId}:${row.idx}` === id)
    kept.push({
      ...item,
      caption: (old && old.caption) || item.caption,
      hint: item.hint || (old && old.hint) || '',
    })
  })
  const presentSections = new Set(kept.map((item) => item.sectionKey))
  fresh.forEach((item) => {
    if (kept.length >= softCap) return
    if (presentSections.has(item.sectionKey)) return
    kept.push(item)
    presentSections.add(item.sectionKey)
  })
  return kept.slice(0, softCap)
}

/**
 * 未确认的规则稿：按新选图/要旨/问答规则刷新；商家已手改或润色过的不覆盖。
 */
function refreshUnconfirmedRuleDraft(draft, albumView = {}, preMaskTask = null) {
  const normalized = normalizeMerchantCaseDraft(draft)
  if (!normalized || normalized.confirmedAt) return normalized
  const source = String(normalized.source || 'rule')
  if (source === 'merchant_edit' || source === 'llm') return normalized
  const freshMedia = pickDraftMedia(albumView, preMaskTask)
  return normalizeMerchantCaseDraft({
    ...normalized,
    title: buildTitle(albumView) || normalized.title,
    caseSummary: buildRuleCaseSummary(normalized, albumView),
    faq: extractJobFaqs({
      sections: normalized.sections,
      serviceName: albumView.serviceName,
      templateId: albumView.templateId,
    }),
    media: mergeUnconfirmedDraftMedia(normalized.media, freshMedia),
  })
}

/**
 * 车主/审核读侧：用预脱敏任务回填案例稿配图的 maskedUrl；
 * 若确认稿 media 为空但相册仍有可公示过程图，则按选帧规则补回。
 */
function hydrateDraftMediaForOwnerView(draft, albumView = {}, preMaskTask = null) {
  const normalized = normalizeMerchantCaseDraft(draft)
  if (!normalized) return null
  const prevMedia = Array.isArray(normalized.media) ? normalized.media : []
  const hasAnyUrl = prevMedia.some((m) => m && (m.maskedUrl || m.previewUrl))
  if (!hasAnyUrl) {
    const fresh = pickDraftMedia(albumView, preMaskTask)
    if (!fresh.length) return normalized
    return { ...normalized, media: fresh }
  }
  const media = prevMedia.map((item) => {
    if (!item) return null
    if (item.maskedUrl) return item
    const maskedUrl = resolveMaskedFromTask(
      preMaskTask,
      item.nodeId,
      item.idx,
      item.previewUrl || item.rawUrl || '',
    )
    if (!maskedUrl) return item
    return {
      ...item,
      maskedUrl,
      previewUrl: item.previewUrl || maskedUrl,
    }
  }).filter(Boolean)
  return { ...normalized, media }
}

module.exports = {
  stripAmountText,
  buildRuleMerchantCaseDraft,
  normalizeMerchantCaseDraft,
  mergeLlmSectionsIntoDraft,
  pickDraftMedia,
  hydrateDraftMediaForOwnerView,
  refreshUnconfirmedRuleDraft,
  draftToPlainText,
  draftToAiSummary,
  buildTitle,
  buildRuleCaseSummary,
  deriveSeoDescriptionFromSummary,
  syncWarrantyIntoDraft,
  isSectionBodyBlank,
}
