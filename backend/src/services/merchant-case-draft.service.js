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

const INVENTED_FILLER_PHRASES = ['按手册要求', '按厂家手册', '按规定流程', '按标准流程']

function albumNotesHaystack(albumView = {}) {
  const notes = (albumView.nodes || []).map((node) => String((node && node.note) || '')).join('\n')
  return `${notes}\n${JSON.stringify(albumView.checklistJson || '')}`
}

function stripInventedFiller(text = '', allowedHaystack = '') {
  const allowed = String(allowedHaystack || '')
  let out = String(text || '')
  INVENTED_FILLER_PHRASES.forEach((phrase) => {
    if (!allowed.includes(phrase)) out = out.split(phrase).join('')
  })
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/[，,]{2,}/g, '，')
    .replace(/^[,，。、]+/u, '')
    .replace(/[，,。、]+$/u, (tail) => (/。/.test(tail) ? '。' : ''))
    .trim()
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

/** 案例正文：有证检查全貌 + 做成项 + 有依据的差异原因（18 §7.3） */
function buildChecklistCaseHints(albumView = {}) {
  const empty = {
    inspectCount: 0,
    inspectLine: '',
    doneLine: '',
    deferLine: '',
    differenceLine: '',
    followUpSummary: '',
  }
  try {
    const {
      buildMerchantChecklistView,
      buildCaseChecklistLayers,
    } = require('./album-checklist.service')
    const images = Array.isArray(albumView.imageMeta)
      ? albumView.imageMeta.map((row, idx) => ({
          id: row.id || `${row.nodeId || 'img'}_${row.idx != null ? row.idx : idx}`,
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
    const layers = buildCaseChecklistLayers(view.items || [])
    return {
      inspectCount: layers.inspectCount,
      inspectLine: scrubPiiText(layers.inspectLine),
      doneLine: scrubPiiText(layers.doneLine),
      deferLine: scrubPiiText(layers.deferLine),
      differenceLine: scrubPiiText(layers.differenceLine),
      followUpSummary: scrubPiiText(layers.deferLine),
    }
  } catch (_) {
    return empty
  }
}

function projectHeadline(albumView = {}) {
  const done = doneItemsForTitle(albumView)
  const service = stripAmountText(albumView.serviceName || '')
    .replace(/过程记录|维修案例|案例$/g, '')
    .trim()
  const blob = `${service} ${done}`
  if (/机油|机滤|滤芯|雨刮|大保养|小保养|保养/.test(blob) && !/异响|胶套|摆臂|底盘异响/.test(done)) {
    if (/大保养/.test(service)) return '大保养'
    if (/小保养/.test(service)) return '小保养'
    return '保养'
  }
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
  if (city === '省杭州' || /^省/.test(city)) city = city.replace(/^省/u, '')
  let district = districtField.replace(/[区县]$/u, '')
  if (!city && address) {
    const withProvince = address.match(/([\u4e00-\u9fa5]{2,3})省([\u4e00-\u9fa5]{2,3})市/u)
    const cityOnly = address.match(/([\u4e00-\u9fa5]{2,3})市/u)
    if (withProvince) city = withProvince[2]
    else if (cityOnly) city = cityOnly[1]
  }
  if (!district && address) {
    const afterCity = address.match(/市([\u4e00-\u9fa5]{1,3})区/u)
    const county = address.match(/市([\u4e00-\u9fa5]{1,3})县/u)
    const bare = address.match(/([\u4e00-\u9fa5]{2,3})[区县]/u)
    if (afterCity) district = afterCity[1]
    else if (county) district = county[1]
    else if (bare && bare[1] !== city && !/^市/.test(bare[1])) district = bare[1]
  }
  if (city) city = city.replace(/市$/u, '')
  if (district) district = district.replace(/[区县市]$/u, '')
  if (city && district && district !== city) return `${city}${district}`
  return city || district || ''
}

function doneItemsForTitle(albumView = {}) {
  const hints = buildChecklistCaseHints(albumView)
  const fromDone = String(hints.doneLine || '').replace(/^本单已处理[:：]\s*/u, '')
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
    if (def.key === 'diagnosis' && checklistHints.inspectLine) {
      const inspectBody = `本次检查：${checklistHints.inspectLine}`
      body = body ? `${inspectBody}。${body}` : inspectBody
    }
    if (def.key === 'process' && checklistHints.doneLine) {
      const doneBody = `本次施工：${checklistHints.doneLine}`
      body = body ? `${doneBody}。${body}` : doneBody
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
      if (checklistHints.deferLine) {
        body = body ? `${body}。${checklistHints.deferLine}` : checklistHints.deferLine
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
      const reason = String(row.publicGateReason || '').trim()
      if (
        row.publicGateStatus === PUBLIC_GATE_STATUS.REJECTED &&
        (reason === 'document' || reason === 'file_unavailable' || reason === 'stage_private_only')
      ) {
        return false
      }
      return true
    })
    .sort((a, b) => {
      const c = String(a.nodeId).localeCompare(String(b.nodeId))
      if (c !== 0) return c
      return Number(a.idx || 0) - Number(b.idx || 0)
    })
}

const MEDIA_SECTION_PICK_ORDER = ['diagnosis', 'plan', 'process', 'handover']

const NORMAL_RESULTS = new Set(['正常', '已检查', '仅检查'])
const DONE_RESULTS = new Set(['已更换', '已处理'])
const ABNORMAL_RESULTS = new Set(['需处理', '建议更换', '未更换'])

function buildChecklistLabelMap(albumView = {}) {
  try {
    const { buildMerchantChecklistView } = require('./album-checklist.service')
    const images = Array.isArray(albumView.imageMeta)
      ? albumView.imageMeta.map((row, idx) => ({
          id: row.id || `${row.nodeId || 'img'}_${row.idx != null ? row.idx : idx}`,
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
  const rawCaption = stripAmountText(row.caption || '').slice(0, 48)
  let rest = rawCaption
  try {
    const { scrubOwnerCaption } = require('./album-checklist.service')
    rest = stripAmountText(scrubOwnerCaption(rawCaption))
  } catch (_) {
    rest = rawCaption.replace(/^(正常|已检查|仅检查|建议更换|已更换|未更换|需处理|已处理)[；;：:\s]*$/u, '')
  }
  const outcomeMatch = String(rawCaption || '').match(
    /^(正常|已检查|仅检查|建议更换|已更换|未更换|需处理|已处理)/u,
  )
  const outcome = outcomeMatch ? outcomeMatch[1] : ''
  const itemLabel = stripAmountText(labelMap[row.checklistItemKey] || '')
  if (NORMAL_RESULTS.has(outcome) && !rest) {
    return {
      caption: itemLabel ? `${itemLabel} 正常` : '正常',
      hint: '',
    }
  }
  if (DONE_RESULTS.has(outcome) && !rest) {
    if (!itemLabel) return { caption: '', hint: '' }
    return { caption: `${itemLabel} ${outcome}`, hint: '' }
  }
  if (rest) {
    const caption = itemLabel && !rest.includes(itemLabel) ? `${itemLabel} ${rest}` : rest
    return { caption: caption.slice(0, 48), hint: '' }
  }
  if (ABNORMAL_RESULTS.has(outcome)) {
    return { caption: '', hint: '' }
  }
  if (itemLabel) return { caption: itemLabel, hint: '' }
  return { caption: '', hint: '' }
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

function keepMaskedDraftMedia(media = []) {
  return (Array.isArray(media) ? media : []).filter((item) =>
    Boolean(item && String(item.maskedUrl || '').trim()),
  )
}

function applyMaskedMediaOnly(draft, requireMasked) {
  if (!requireMasked || !draft) return draft
  return { ...draft, media: keepMaskedDraftMedia(draft.media) }
}

/**
 * 域内选关键帧并挂到小节（图不进 LLM）
 * 完工前可用 previewUrl（原图预览位）；生成案例预览只保留打码成功的 maskedUrl
 */
function pickDraftMedia(albumView = {}, preMaskTask = null, options = {}) {
  const softCap = options.softCap != null ? options.softCap : PUBLIC_MEDIA_KEYFRAME_DEFAULT
  const requireMasked = Boolean(options.requireMasked)
  const labelMap = buildChecklistLabelMap(albumView)
  const mapped = listPublicImageMeta(albumView)
    .map((row) => {
      const previewUrl =
        rewriteMediaUrlForCurrentBase(String(row.rawUrl || '').trim()) ||
        resolveDisplayMediaUrl(row.rawUrl || '')
      const maskedUrl = resolveMaskedFromTask(
        preMaskTask,
        row.nodeId,
        row.idx,
        row.rawUrl,
      )
      if (requireMasked && !maskedUrl) return null
      if (!maskedUrl && !previewUrl) return null
      const texts = buildDraftMediaTexts(row, labelMap)
      return {
        nodeId: row.nodeId,
        idx: Number(row.idx || 0),
        maskedUrl: maskedUrl || '',
        previewUrl: requireMasked ? maskedUrl : previewUrl || maskedUrl || '',
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

function compactVehicleName(raw = '') {
  return stripAmountText(raw)
    .replace(/\s*\/\s*[^/]*$/u, '')
    .replace(/\s+\d+(\.\d+)?\s*[LlＬ].*$/u, '')
    .replace(/\s*(三厢|两厢|SUV|MPV|手动|自动|前轮|后轮|四驱).*$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16)
}

function shortVehicleLabel(albumView = {}) {
  const vehicle = albumView.vehicle || {}
  const fromFields = [vehicle.brand, vehicle.series]
    .map((item) => stripAmountText(item || ''))
    .filter(Boolean)
    .join(' ')
  const compact = compactVehicleName(fromFields || albumView.vehicleDisplay || '')
  return compact
}

function buildRuleCaseSummary(draftLike = {}, albumView = {}) {
  const sections = Array.isArray(draftLike.sections) ? draftLike.sections : []
  const byKey = {}
  sections.forEach((sec) => {
    if (sec && sec.key) byKey[sec.key] = stripAmountText(sec.body || '')
  })
  const hints = buildChecklistCaseHints(albumView)
  const doneItems = String(hints.doneLine || '').replace(/^本单已处理[:：]\s*/u, '')
  const inspectCount = Number(hints.inspectCount || 0)
  const difference = stripAmountText(hints.differenceLine || '')
  const vehicle = shortVehicleLabel(albumView)
  const bits = []
  if (inspectCount || doneItems) {
    if (inspectCount && doneItems) {
      bits.push(`本次检查了${inspectCount}项，施工了${doneItems}`)
    } else if (inspectCount) {
      bits.push(`本次检查了${inspectCount}项`)
    } else {
      bits.push(vehicle ? `${vehicle}本次施工了${doneItems}` : `本次施工了${doneItems}`)
    }
    if (difference) bits.push(difference)
  } else {
    const symptom = firstUsefulSentence(byKey.symptom)
    const diagnosis = firstUsefulSentence(byKey.diagnosis)
    const plan = firstUsefulSentence(byKey.plan)
    const handover = firstUsefulSentence(byKey.handover)
    if (symptom) bits.push(vehicle ? `${vehicle}${symptom}` : symptom)
    else if (diagnosis) bits.push(vehicle ? `${vehicle}${diagnosis}` : diagnosis)
    else if (plan) bits.push(plan)
    if (diagnosis && symptom && diagnosis !== symptom) bits.push(diagnosis)
    if (plan && (symptom || diagnosis) && plan !== diagnosis) bits.push(plan)
    if (handover) bits.push(handover)
  }
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
      title: def.title,
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
            rewriteMediaUrlForCurrentBase(previewRaw) ||
            resolveDisplayMediaUrl(previewRaw) ||
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
  const hints = buildChecklistCaseHints(albumView)
  const draft = {
    version: 1,
    title,
    sections,
    caseSummary: buildRuleCaseSummary({ title, sections }, albumView),
    faq: extractJobFaqs({
      sections,
      serviceName: albumView.serviceName,
      templateId: albumView.templateId,
      inspectLine: hints.inspectLine,
      inspectCount: hints.inspectCount,
      doneLine: hints.doneLine,
      followUpSummary: hints.followUpSummary,
      differenceLine: hints.differenceLine,
    }),
    media: pickDraftMedia(albumView, preMaskTask, options),
    source: 'rule',
    generatedAt: new Date().toISOString(),
    confirmedAt: '',
  }
  return normalizeMerchantCaseDraft(draft)
}

function mergeLlmSectionsIntoDraft(baseDraft, llmDraft, albumView = {}) {
  if (!llmDraft || typeof llmDraft !== 'object') return baseDraft
  const allowed = albumNotesHaystack(albumView)
  const llmByKey = {}
  ;(llmDraft.sections || []).forEach((sec) => {
    if (sec && sec.key) llmByKey[sec.key] = sec
  })
  const baseByKey = {}
  ;(baseDraft.sections || []).forEach((sec) => {
    if (sec && sec.key) baseByKey[sec.key] = sec
  })
  const nextSections = MERCHANT_CASE_SECTION_KEYS.map((def) => {
    const llm = llmByKey[def.key]
    const base = baseByKey[def.key]
    const rawBody = (llm && llm.body) || (base && base.body) || ''
    return {
      key: def.key,
      title: def.title,
      body: stripInventedFiller(stripAmountText(rawBody), `${allowed}\n${(base && base.body) || ''}`),
    }
  })
  const nextTitle = llmDraft.title || baseDraft.title
  const caseSummary = stripInventedFiller(
    stripAmountText(baseDraft.caseSummary || '').slice(0, 250) ||
      buildRuleCaseSummary({ title: nextTitle, sections: nextSections }, albumView),
    allowed,
  )
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
    kept.push(item)
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
 * 未确认稿：规则稿整篇刷新；自动润色稿只刷新问答/图说/栏目名，不覆盖已写顺的正文。
 */
function refreshUnconfirmedRuleDraft(draft, albumView = {}, preMaskTask = null, options = {}) {
  const normalized = normalizeMerchantCaseDraft(draft)
  if (!normalized || normalized.confirmedAt) return normalized
  const source = String(normalized.source || 'rule')
  if (source === 'merchant_edit') return normalized
  const hints = buildChecklistCaseHints(albumView)
  const freshMedia = pickDraftMedia(albumView, preMaskTask, options)
  const faqPayload = {
    serviceName: albumView.serviceName,
    templateId: albumView.templateId,
    inspectLine: hints.inspectLine,
    inspectCount: hints.inspectCount,
    doneLine: hints.doneLine,
    followUpSummary: hints.followUpSummary,
    differenceLine: hints.differenceLine,
  }
  if (source === 'llm') {
    const allowed = albumNotesHaystack(albumView)
    const sections = MERCHANT_CASE_SECTION_KEYS.map((def) => {
      const hit = (normalized.sections || []).find((sec) => sec && sec.key === def.key)
      return {
        key: def.key,
        title: def.title,
        body: stripInventedFiller((hit && hit.body) || '', allowed),
      }
    })
    return normalizeMerchantCaseDraft({
      ...normalized,
      sections,
      caseSummary: stripInventedFiller(normalized.caseSummary || '', allowed),
      faq: extractJobFaqs({ sections, ...faqPayload }),
      media: mergeUnconfirmedDraftMedia(normalized.media, freshMedia),
    })
  }
  const sections = buildRuleSections(albumView)
  return normalizeMerchantCaseDraft({
    ...normalized,
    title: buildTitle(albumView) || normalized.title,
    sections,
    caseSummary: buildRuleCaseSummary({ title: buildTitle(albumView) || normalized.title, sections }, albumView),
    faq: extractJobFaqs({
      sections,
      ...faqPayload,
    }),
    media: mergeUnconfirmedDraftMedia(normalized.media, freshMedia),
  })
}

function attachDraftPreviewMedia(draft, albumView = {}, preMaskTask = null, requireMasked = false) {
  let next = hydrateDraftMediaForOwnerView(draft, albumView, preMaskTask, { requireMasked })
  if (!requireMasked) return next
  next = applyMaskedMediaOnly(next, true)
  if (next && next.media && next.media.length) return next
  return { ...next, media: pickDraftMedia(albumView, preMaskTask, { requireMasked: true }) }
}

/**
 * 车主/审核读侧：用预脱敏任务回填案例稿配图的 maskedUrl；
 * 若确认稿 media 为空但相册仍有可公示过程图，则按选帧规则补回。
 */
function hydrateDraftMediaForOwnerView(draft, albumView = {}, preMaskTask = null, options = {}) {
  const normalized = normalizeMerchantCaseDraft(draft)
  if (!normalized) return null
  const prevMedia = Array.isArray(normalized.media) ? normalized.media : []
  const hasAnyUrl = prevMedia.some((m) => m && (m.maskedUrl || m.previewUrl))
  if (!hasAnyUrl) {
    const fresh = pickDraftMedia(albumView, preMaskTask, options)
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
  keepMaskedDraftMedia,
  applyMaskedMediaOnly,
  attachDraftPreviewMedia,
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
