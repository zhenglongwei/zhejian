/**
 * DOC-FLOW · 单据规则生成（无 LLM）
 * 真源：docs/04_维修过程相册/26_商家端事件节点与单据节点链流程.md §4
 */
const {
  INSPECTION_DISCLAIMER,
  FINDING_RESULT,
  FINDING_RESULT_OPTIONS,
  FINDING_ADVICE_NONE,
  isValidFindingResult,
  findingAdviceRequired,
} = require('../constants/service-flow-nodes')

function mapPhotoRows(images = []) {
  return (images || [])
    .map((img) => {
      const url = typeof img === 'string' ? img : img.url || ''
      if (!url) return null
      const caption = String((typeof img === 'object' && img.caption) || '').trim()
      return {
        imageId: (typeof img === 'object' && img.id) || '',
        url,
        caption,
        captionEmpty: !caption,
      }
    })
    .filter(Boolean)
}

function normalizeFindingResult(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (isValidFindingResult(text)) return text
  if (/良好|正常/.test(text)) return FINDING_RESULT.OK
  if (/关注/.test(text)) return FINDING_RESULT.WATCH
  if (/处理|维修|更换|立即/.test(text)) return FINDING_RESULT.ACTION
  return text
}

function normalizeFinding(raw = {}) {
  const caption = String(raw.caption || '').trim()
  const result = normalizeFindingResult(raw.result)
  let advice = String(raw.advice || '').trim()
  if (result === FINDING_RESULT.OK && !advice) {
    advice = FINDING_ADVICE_NONE
  }
  return {
    imageId: String(raw.imageId || raw.id || ''),
    url: String(raw.url || ''),
    caption,
    captionEmpty: !caption,
    partName: String(raw.partName || caption || '').trim(),
    // 存量字段保留读取，新录入不再要求
    symptom: String(raw.symptom || '').trim(),
    result,
    advice,
  }
}

const WORK_IMAGES_MAX = 6

function normalizeWorkImage(raw = {}) {
  const url = String(typeof raw === 'string' ? raw : (raw && raw.url) || '').trim()
  if (!url) return null
  return {
    url,
    imageId: String(
      (typeof raw === 'object' && raw && (raw.imageId || raw.id)) || '',
    ).trim(),
  }
}

/** 施工项：部位 + 整项说明 + 多图（最多 6） */
function normalizeWorkFinding(raw = {}) {
  let images = Array.isArray(raw.images)
    ? raw.images.map((img) => normalizeWorkImage(img)).filter(Boolean)
    : []
  if (!images.length) {
    const one = normalizeWorkImage({
      url: raw.url,
      imageId: raw.imageId || raw.id,
    })
    if (one) images = [one]
  }
  images = images.slice(0, WORK_IMAGES_MAX)
  const caption = String(raw.caption || '').trim()
  const partName = String(raw.partName || '').trim()
  const first = images[0] || null
  return {
    imageId: first ? first.imageId : '',
    url: first ? first.url : '',
    caption,
    captionEmpty: !caption,
    partName,
    symptom: String(raw.symptom || '').trim(),
    result: '',
    advice: '',
    images,
    photoCount: images.length,
  }
}

function workFindingHasPhoto(raw = {}) {
  const item = normalizeWorkFinding(raw)
  return item.images.length > 0
}

/**
 * 施工发现项：以 photoDraft.findings 为结构真源（含 images[]）；
 * 无结构时回落为一图一项（存量兼容）。
 */
function mapWorkFindingRows(images = [], draftFindings = []) {
  const draftList = (draftFindings || []).map((row) => normalizeWorkFinding(row))
  if (draftList.some((row) => row.images.length || row.partName)) {
    return draftList
  }
  const draftByKey = {}
  draftList.forEach((item, index) => {
    const key = item.imageId || item.url
    if (key) draftByKey[key] = item
    draftByKey[`#${index}`] = item
  })
  ;(draftFindings || []).forEach((raw, index) => {
    const item = normalizeFinding(raw)
    const key = item.imageId || item.url
    if (key && !draftByKey[key]) draftByKey[key] = item
    if (!draftByKey[`#${index}`]) draftByKey[`#${index}`] = item
  })
  return mapPhotoRows(images).map((row, index) => {
    const draft = draftByKey[row.imageId] || draftByKey[row.url] || draftByKey[`#${index}`] || {}
    const partName = String(draft.partName || '').trim()
    let caption = String(draft.caption || '').trim()
    if (!caption) {
      const imgCap = String(row.caption || '').trim()
      if (imgCap && imgCap !== partName) caption = imgCap
    }
    return normalizeWorkFinding({
      ...draft,
      url: row.url,
      imageId: row.imageId || draft.imageId || '',
      partName,
      caption,
      images: [{ url: row.url, imageId: row.imageId || '' }],
    })
  })
}

/** 检测发现项：优先用过程步 photoDraft / 结构化字段，否则用图注作部位。 */
function mapFindingRows(images = [], draftFindings = [], options = {}) {
  if (options && options.mode === 'work') {
    return mapWorkFindingRows(images, draftFindings)
  }
  const draftByKey = {}
  ;(draftFindings || []).forEach((raw, index) => {
    const item = normalizeFinding(raw)
    const key = item.imageId || item.url
    if (key) draftByKey[key] = item
    draftByKey[`#${index}`] = item
  })
  return mapPhotoRows(images).map((row, index) => {
    const draft = draftByKey[row.imageId] || draftByKey[row.url] || draftByKey[`#${index}`] || {}
    return normalizeFinding({
      ...row,
      ...draft,
      url: row.url,
      imageId: row.imageId || draft.imageId || '',
      caption: row.caption || draft.caption || '',
      partName: draft.partName || row.caption || '',
    })
  })
}

function collectInspectionReportGaps(payload = {}) {
  const gaps = []
  if (!String(payload.chiefComplaint || '').trim()) {
    gaps.push('请填写进店主诉')
  }
  const findings = Array.isArray(payload.findings) ? payload.findings : []
  if (!findings.length) {
    gaps.push('请至少上传 1 张检测照片并填写发现项')
    return gaps
  }
  findings.forEach((raw, index) => {
    const item = normalizeFinding(raw)
    const label = item.partName || `第 ${index + 1} 项`
    if (!item.partName) gaps.push(`「${label}」请填写检查部位`)
    if (!item.result || !isValidFindingResult(item.result)) {
      gaps.push(`「${label}」请选择检查结果`)
    } else if (findingAdviceRequired(item.result) && !item.advice) {
      gaps.push(`「${label}」请填写处理建议`)
    }
  })
  return gaps
}

/** 施工过程：每项至少 1 张图 + 部位；可选校验工单项目均已挂图 */
function collectWorkPhotoDraftGaps(payload = {}, options = {}) {
  const gaps = []
  const findings = Array.isArray(payload.findings) ? payload.findings : []
  const withPhoto = findings.filter((raw) => workFindingHasPhoto(raw))
  if (!withPhoto.length) {
    gaps.push('请至少上传 1 张施工照片并填写部位')
  }
  withPhoto.forEach((raw, index) => {
    const item = normalizeWorkFinding(raw)
    const label = item.partName || `第 ${index + 1} 项`
    if (!item.partName) gaps.push(`「${label}」请填写部位`)
  })
  const orderItems = Array.isArray(options.orderItems) ? options.orderItems : []
  orderItems.forEach((row) => {
    const name = String((row && row.name) || '').trim()
    if (!name) return
    const matched = withPhoto.some((raw) => normalizeWorkFinding(raw).partName === name)
    if (!matched) gaps.push(`「${name}」请上传施工图`)
  })
  return gaps
}

function isVagueWarrantyPeriod(text = '') {
  const t = String(text || '').trim()
  if (!t) return true
  return /以门店公示为准|详见门店|见门店公示|门店公示为准|以店内公示为准/.test(t)
}

/** 注意事项：优先新字段；旧 scope/exclusions 拼成一句 */
function resolveWarrantyNotes(source = {}) {
  const notes = String(source.warrantyNotes || source.notes || '').trim()
  if (notes) return notes
  const scope = String(source.warrantyScope || source.scope || '').trim()
  const exclusions = String(source.warrantyExclusions || source.exclusions || '').trim()
  return [scope, exclusions].filter(Boolean).join('；')
}

function collectDeliveryPhotoDraftGaps(payload = {}) {
  const gaps = []
  const period = String(payload.warrantyPeriod || '').trim()
  if (!period) {
    gaps.push('请填写质保期限')
  } else if (isVagueWarrantyPeriod(period)) {
    gaps.push('质保期限请写清时长或里程，勿填「以门店公示为准」')
  }
  if (!String(payload.deliveryExteriorUrl || '').trim()) {
    gaps.push('请指定整车外观（从施工图选择或补拍）')
  }
  return gaps
}

function buildInspectionReportPayload({
  vehicle = {},
  albumNodes = [],
  chiefComplaint = '',
  findings: findingsInput,
  conclusion = '',
  photoDraft = {},
} = {}) {
  const intake = (albumNodes || []).find((n) => n.id === 'stage_1')
  const inspection = (albumNodes || []).find((n) => n.id === 'stage_2')
  // 统一入口：发现项来自 stage_2；存量 stage_1 并入
  const mergedImages = []
    .concat((intake && intake.images) || [])
    .concat((inspection && inspection.images) || [])
  const draftFindings =
    Array.isArray(findingsInput) && findingsInput.length
      ? findingsInput
      : Array.isArray(photoDraft.findings)
        ? photoDraft.findings
        : []
  const findings = mapFindingRows(mergedImages, draftFindings)
  const mileageFromFinding = findings.find((item) => {
    const text = [item.partName, item.result, item.advice, item.caption].join(' ')
    return /\d/.test(text)
  })
  return {
    vehicleBrand: String(vehicle.brand || ''),
    vehicleSeries: String(vehicle.series || ''),
    vehicleYear: String(vehicle.modelYear || vehicle.year || ''),
    mileageText:
      String(vehicle.mileage || vehicle.mileageKm || '').trim() ||
      (mileageFromFinding
        ? mileageFromFinding.partName || mileageFromFinding.caption || ''
        : ''),
    chiefComplaint: String(
      chiefComplaint || photoDraft.chiefComplaint || '',
    ).trim(),
    reportDate: new Date().toISOString().slice(0, 10),
    findings,
    disclaimer: INSPECTION_DISCLAIMER,
    conclusion: String(conclusion || photoDraft.conclusion || '').trim(),
  }
}

function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** 存量行：name=部位·建议、note=结果 → name=部位、note=建议
 * 近一代：name=部位·检测结果 → 剥掉结果后缀，只留部位
 */
function stripFindingResultFromLineName(name = '') {
  return String(name || '')
    .replace(/\s·\s(状态良好|需关注|需处理)$/, '')
    .trim()
}

function remapLegacyQuoteLineLayout(line = {}) {
  const note = String(line.note || '').trim()
  const name = String(line.name || '').trim()
  // 更旧：name=部位·建议、note=结果档
  if (isValidFindingResult(note) && name.includes(' · ')) {
    const sep = name.indexOf(' · ')
    const part = name.slice(0, sep).trim()
    const advice = name.slice(sep + 3).trim()
    if (part && advice) {
      return {
        ...line,
        name: part,
        note: advice,
      }
    }
  }
  const stripped = stripFindingResultFromLineName(name)
  if (stripped && stripped !== name) {
    return {
      ...line,
      name: stripped,
      note,
    }
  }
  return line
}

function normalizeQuoteLine(raw = {}) {
  const amount = parseAmount(raw.amount != null ? raw.amount : raw.priceHint)
  return remapLegacyQuoteLineLayout({
    name: String(raw.name || '').trim(),
    brand: String(raw.brand || '').trim(),
    amount: amount == null ? '' : amount,
    note: String(raw.note || '').trim(),
    evidenceUrl: String(raw.evidenceUrl || raw.url || '').trim(),
  })
}

function collectQuoteConfirmGaps(payload = {}, options = {}) {
  const gaps = []
  const requireEvidence = Boolean(options.requireEvidence)
  const lines = Array.isArray(payload.lines) ? payload.lines.map(normalizeQuoteLine) : []
  const valid = lines.filter((l) => l.name)
  if (!valid.length) {
    gaps.push('请至少填写一行方案项目')
    return gaps
  }
  valid.forEach((line, index) => {
    const label = line.name || `第 ${index + 1} 行`
    if (line.amount === '' || line.amount == null || Number(line.amount) < 0) {
      gaps.push(`「${label}」请填写金额`)
    }
    if (requireEvidence && !String(line.evidenceUrl || '').trim()) {
      gaps.push(`「${label}」请上传故障证据图`)
    }
  })
  return gaps
}

function sumQuoteAmounts(lines = []) {
  return (lines || []).reduce((sum, raw) => {
    const line = normalizeQuoteLine(raw)
    const n = Number(line.amount)
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
}

function buildWorkOrderPayloadFromQuote(quotePayload = {}, sourceQuoteNodeId = '') {
  const lines = Array.isArray(quotePayload.lines) ? quotePayload.lines : []
  return {
    sourceQuoteNodeId,
    items: lines
      .map((line) => normalizeQuoteLine(line))
      .filter((line) => line.name)
      .map((line) => ({
        name: line.name,
        brand: line.brand || '',
        amount: line.amount === '' ? 0 : Number(line.amount),
        note: line.note,
      })),
  }
}

/** 方案草稿：从「需关注/需处理」发现项预填（金额手填）
 * name = 部位；note = 处理建议（可长文）；检测结果不写进行名；品牌商家另填
 */
function buildQuoteLinesFromFindings(findings = []) {
  return (findings || [])
    .map((raw) => {
      const item = normalizeFinding(raw)
      if (!findingAdviceRequired(item.result)) return null
      if (!item.advice || item.advice === FINDING_ADVICE_NONE) return null
      const name = item.partName || item.result || ''
      return {
        name,
        brand: '',
        amount: '',
        note: item.advice || '',
        evidenceUrl: item.url || '',
      }
    })
    .filter(Boolean)
}

function buildRepairReportPayload({
  chiefComplaint = '',
  workItems = [],
  deliveryImages = [],
  warranty = {},
  photoDraft = {},
  confirmCopy = '',
  totalAmount = null,
} = {}) {
  const period = String(warranty.period || photoDraft.warrantyPeriod || '').trim()
  const notes = resolveWarrantyNotes({
    warrantyNotes: warranty.notes || photoDraft.warrantyNotes,
    warrantyScope: warranty.scope || photoDraft.warrantyScope,
    warrantyExclusions: warranty.exclusions || photoDraft.warrantyExclusions,
  })
  const items = (workItems || []).map((item) => ({
    name: String(item.name || '').trim(),
    brand: String(item.brand || '').trim(),
    amount: parseAmount(item.amount) == null ? 0 : parseAmount(item.amount),
    note: String(item.note || '').trim(),
  }))
  const computedTotal =
    totalAmount != null
      ? parseAmount(totalAmount)
      : items.reduce((s, it) => s + (Number(it.amount) || 0), 0)

  // 交车图优先用引用（外观 + 其他勾选），避免复制施工图进 stage_6
  const exterior = String(photoDraft.deliveryExteriorUrl || '').trim()
  const extras = Array.isArray(photoDraft.selectedDeliveryUrls)
    ? photoDraft.selectedDeliveryUrls.map((url) => String(url || '').trim()).filter(Boolean)
    : []
  const refImages = []
  if (exterior) refImages.push({ url: exterior, caption: '整车外观' })
  extras.forEach((url) => {
    if (url && url !== exterior && !refImages.some((row) => row.url === url)) {
      refImages.push({ url, caption: '' })
    }
  })
  const deliveryPhotos = refImages.length
    ? mapPhotoRows(refImages)
    : mapPhotoRows(deliveryImages)

  return {
    chiefComplaint: String(chiefComplaint || '').trim(),
    workItems: items,
    totalAmount: computedTotal == null ? 0 : computedTotal,
    deliveryPhotos,
    warrantyPeriod: period,
    warrantyNotes: notes,
    // 兼容旧读侧：不再写入空话默认；存量字段置空
    warrantyScope: '',
    warrantyExclusions: '',
    confirmCopy:
      String(confirmCopy || photoDraft.confirmCopy || '').trim() ||
      '本人确认上述施工与交车状态，并知悉质保条款。',
  }
}

function normalizePhotoDraft(raw = {}) {
  return {
    chiefComplaint: String(raw.chiefComplaint || '').trim(),
    conclusion: String(raw.conclusion || '').trim(),
    findings: Array.isArray(raw.findings)
      ? raw.findings
          .map((item) => {
            if (Array.isArray(item && item.images) || (item && item.partName && !item.result)) {
              const work = normalizeWorkFinding(item)
              return work.images.length || work.partName ? work : null
            }
            const row = normalizeFinding(item)
            return row.url ? row : null
          })
          .filter(Boolean)
      : [],
    warrantyPeriod: String(raw.warrantyPeriod || '').trim(),
    warrantyNotes: resolveWarrantyNotes(raw),
    confirmCopy: String(raw.confirmCopy || '').trim(),
    selectedDeliveryUrls: Array.isArray(raw.selectedDeliveryUrls)
      ? raw.selectedDeliveryUrls.map((url) => String(url || '').trim()).filter(Boolean)
      : [],
    deliveryExteriorUrl: String(raw.deliveryExteriorUrl || '').trim(),
  }
}

/** 合并过程步草稿：仅覆盖显式传入的字段 */
function mergePhotoDraft(prev = {}, patch = {}) {
  const next = normalizePhotoDraft(prev)
  if (!patch || typeof patch !== 'object') return next
  if (patch.chiefComplaint != null) next.chiefComplaint = String(patch.chiefComplaint || '').trim()
  if (patch.conclusion != null) next.conclusion = String(patch.conclusion || '').trim()
  if (patch.findings != null) {
    next.findings = normalizePhotoDraft({ findings: patch.findings }).findings
  }
  if (patch.warrantyPeriod != null) {
    next.warrantyPeriod = String(patch.warrantyPeriod || '').trim()
  }
  if (patch.warrantyNotes != null) {
    next.warrantyNotes = String(patch.warrantyNotes || '').trim()
  }
  // 旧字段写入时并入注意事项（新字段优先已在 normalize 处理）
  if (patch.warrantyScope != null || patch.warrantyExclusions != null) {
    next.warrantyNotes = resolveWarrantyNotes({
      warrantyNotes: patch.warrantyNotes != null ? patch.warrantyNotes : next.warrantyNotes,
      warrantyScope: patch.warrantyScope,
      warrantyExclusions: patch.warrantyExclusions,
    })
  }
  if (patch.confirmCopy != null) next.confirmCopy = String(patch.confirmCopy || '').trim()
  if (patch.selectedDeliveryUrls != null) {
    next.selectedDeliveryUrls = Array.isArray(patch.selectedDeliveryUrls)
      ? patch.selectedDeliveryUrls.map((url) => String(url || '').trim()).filter(Boolean)
      : []
  }
  if (patch.deliveryExteriorUrl != null) {
    next.deliveryExteriorUrl = String(patch.deliveryExteriorUrl || '').trim()
  }
  return next
}

module.exports = {
  mapPhotoRows,
  mapFindingRows,
  mapWorkFindingRows,
  normalizeFinding,
  normalizeWorkFinding,
  normalizeWorkImage,
  workFindingHasPhoto,
  WORK_IMAGES_MAX,
  collectInspectionReportGaps,
  collectDeliveryPhotoDraftGaps,
  collectWorkPhotoDraftGaps,
  collectQuoteConfirmGaps,
  buildInspectionReportPayload,
  buildQuoteLinesFromFindings,
  buildWorkOrderPayloadFromQuote,
  buildRepairReportPayload,
  normalizeQuoteLine,
  sumQuoteAmounts,
  normalizePhotoDraft,
  mergePhotoDraft,
  parseAmount,
  stripFindingResultFromLineName,
  remapLegacyQuoteLineLayout,
  isVagueWarrantyPeriod,
  resolveWarrantyNotes,
}
