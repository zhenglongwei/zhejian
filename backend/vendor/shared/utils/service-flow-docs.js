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

function parseMileageKm(value) {
  const digits = String(value || '').replace(/[^\d]/g, '')
  if (!digits) return ''
  const n = Number(digits)
  if (!Number.isFinite(n) || n <= 0 || n > 9999999) return ''
  return String(Math.round(n))
}

function parseOdometerMileageFromTexts(texts = []) {
  const list = Array.isArray(texts) ? texts : [texts]
  const labeled = []
  const unlabeled = []
  list.forEach((raw) => {
    const s = String(raw || '')
    if (!s.trim()) return
    const tagged = s.match(/(?:ODO|odometer|总里程|里程|公里|km)\s*[:：]?\s*([\d\s,]{3,9})/i)
    if (tagged) {
      const km = parseMileageKm(tagged[1])
      if (km) labeled.push(Number(km))
    }
    const compact = s.replace(/[,\s]/g, '')
    const nums = compact.match(/\d{3,7}/g) || []
    nums.forEach((d) => {
      const n = Number(d)
      if (Number.isFinite(n) && n >= 1 && n <= 9999999) unlabeled.push(n)
    })
  })
  const pool = labeled.length ? labeled : unlabeled
  if (!pool.length) return ''
  const notYear = pool.filter((n) => n < 1990 || n > 2035)
  const use = notYear.length ? notYear : pool
  const typical = use.filter((n) => n >= 100 && n <= 999999)
  const pickFrom = typical.length ? typical : use
  return String(Math.max(...pickFrom))
}

function formatMileageText(value) {
  const km = parseMileageKm(value)
  if (!km) return ''
  return `${Number(km).toLocaleString('zh-CN')} km`
}

function mapPhotoRows(images = []) {
  return (images || [])
    .map((img) => {
      const url = typeof img === 'string' ? img : img.url || ''
      if (!url) return null
      const caption = String((typeof img === 'object' && img.caption) || '').trim()
      return {
        imageId: (typeof img === 'object' && (img.id || img.imageId)) || '',
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

function isOdometerFinding(raw = {}) {
  if (String(raw.itemKey || '').trim() === 'odo') return true
  const name = String(raw.partName || raw.caption || '').trim()
  if (!name) return false
  if (/灯|故障|指示/.test(name)) return false
  return /仪表|里程表/.test(name)
}

function withoutOdometerPhoto(row, odometerUrl) {
  if (!row) return null
  if (!sameMedia(row.url, odometerUrl)) {
    return isOdometerFinding(row) ? null : row
  }
  if (isOdometerFinding(row)) return null
  return { ...row, url: '', imageId: '' }
}

function pickOdometerSlot(photoDraft = {}, findings = []) {
  const list = Array.isArray(findings) ? findings : []
  const draftUrl = String((photoDraft && photoDraft.odometerUrl) || '').trim()
  if (draftUrl) {
    return {
      odometerUrl: draftUrl,
      odometerImageId: String((photoDraft && photoDraft.odometerImageId) || '').trim(),
      findings: list.map((row) => withoutOdometerPhoto(row, draftUrl)).filter(Boolean),
    }
  }
  const hit = list.find((row) => isOdometerFinding(row) && String((row && row.url) || '').trim())
  if (hit) {
    const url = String(hit.url || '').trim()
    return {
      odometerUrl: url,
      odometerImageId: String(hit.imageId || '').trim(),
      findings: list.map((row) => withoutOdometerPhoto(row, url)).filter(Boolean),
    }
  }
  return {
    odometerUrl: '',
    odometerImageId: '',
    findings: list,
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
  const hasImagesField = Array.isArray(raw.images)
  let images = hasImagesField
    ? raw.images.map((img) => normalizeWorkImage(img)).filter(Boolean)
    : []
  // 仅存量「一图一项」回落；显式 images: [] 表示已删光，不得用 url 填回
  if (!hasImagesField && !images.length) {
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
    const persisted = mapPhotoRows(images)
    if (!persisted.length) return draftList
    const byKey = {}
    persisted.forEach((row) => {
      const key = mediaKey(row.url)
      if (key && !byKey[key]) byKey[key] = row
    })
    return draftList.map((item) => {
      if (!item.images.length) return item
      const nextImages = item.images
        .map((img) => {
          const hit = byKey[mediaKey(img.url)]
          if (!hit) return null
          return {
            url: hit.url || img.url,
            imageId: hit.imageId || img.imageId || '',
          }
        })
        .filter(Boolean)
      return normalizeWorkFinding({
        ...item,
        images: nextImages,
      })
    })
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

function mediaBare(value) {
  return String(value || '')
    .trim()
    .split('?')[0]
    .split('#')[0]
}

/** 签名参数和 /media/uploads 与 /api/v1/media/files/uploads 视为同一张图 */
function mediaKey(value) {
  const bare = mediaBare(value)
  if (!bare) return ''
  const mark = '/uploads/'
  const at = bare.lastIndexOf(mark)
  if (at >= 0) return bare.slice(at + mark.length)
  return bare
}

function sameMedia(a, b) {
  const left = mediaKey(a)
  const right = mediaKey(b)
  return Boolean(left && right && left === right)
}

function mergeFindingWithImage(row, draft) {
  const src = draft || {}
  return normalizeFinding({
    ...row,
    ...src,
    url: row.url,
    imageId: row.imageId || src.imageId || '',
    caption: row.caption || src.caption || '',
    partName: src.partName || row.caption || '',
  })
}

/** 仪表照写在检测图最前，不能按序号去配发现项，否则部位结果会错位。 */
function omitOdometerImages(images = [], odometerUrl = '') {
  const odo = mediaKey(odometerUrl)
  if (!odo) return images || []
  return (images || []).filter((img) => {
    const url = typeof img === 'string' ? img : (img && img.url) || ''
    if (mediaKey(url) === odo) return false
    const caption = img && typeof img === 'object' ? String(img.caption || '').trim() : ''
    return caption !== '仪表'
  })
}

/** 检测发现项：优先用过程步 photoDraft / 结构化字段，否则用图注作部位。 */
function mapFindingRows(images = [], draftFindings = [], options = {}) {
  if (options && options.mode === 'work') {
    return mapWorkFindingRows(images, draftFindings)
  }
  const drafts = (draftFindings || []).map((raw) => normalizeFinding(raw))
  const rows = mapPhotoRows(omitOdometerImages(images, options && options.odometerUrl))
  const used = new Set()
  const matchIndex = (row) => {
    const id = String(row.imageId || '').trim()
    if (id) {
      const byId = drafts.findIndex((item, i) => !used.has(i) && item.imageId === id)
      if (byId >= 0) return byId
    }
    const key = mediaKey(row.url)
    if (key) {
      const byUrl = drafts.findIndex((item, i) => !used.has(i) && mediaKey(item.url) === key)
      if (byUrl >= 0) return byUrl
    }
    return -1
  }
  const assigned = rows.map((row) => {
    const idx = matchIndex(row)
    if (idx < 0) return null
    used.add(idx)
    return mergeFindingWithImage(row, drafts[idx])
  })
  const imageKeys = new Set(rows.map((row) => mediaKey(row.url)).filter(Boolean))
  assigned.forEach((item, index) => {
    if (!item) assigned[index] = mergeFindingWithImage(rows[index], {})
  })
  const odoKey = mediaKey(options && options.odometerUrl)
  drafts.forEach((item, index) => {
    if (used.has(index)) return
    const key = mediaKey(item.url)
    if (key && odoKey && key === odoKey) {
      if (item.partName || item.advice || item.result) {
        assigned.push({ ...item, url: '', imageId: '' })
      }
      return
    }
    if (key && imageKeys.has(key)) {
      const alreadyShown = assigned.some(
        (row) => row && String(row.partName || '').trim() === String(item.partName || '').trim() && mediaKey(row.url) === key,
      )
      if (!alreadyShown && (item.partName || item.advice || item.result)) {
        assigned.push({ ...item, url: '', imageId: '' })
      }
      return
    }
    if (key) return
    if (item.partName || item.advice || item.result) {
      assigned.push({ ...item, url: '', imageId: '' })
    }
  })
  return assigned.filter(Boolean)
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
      gaps.push(`「${label}」请填写检查发现`)
    }
  })
  return gaps
}

/** 施工过程：每项至少 1 张图 + 项目名；可选校验工单项目均已挂图 */
function collectWorkPhotoDraftGaps(payload = {}, options = {}) {
  const gaps = []
  const findings = Array.isArray(payload.findings) ? payload.findings : []
  const withPhoto = findings.filter((raw) => workFindingHasPhoto(raw))
  if (!withPhoto.length) {
    gaps.push('请至少上传 1 张施工照片并填写项目')
  }
  withPhoto.forEach((raw, index) => {
    const item = normalizeWorkFinding(raw)
    const label = item.partName || `第 ${index + 1} 项`
    if (!item.partName) gaps.push(`「${label}」请填写项目`)
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
  const mergedImages = omitOdometerImages(
    []
      .concat((intake && intake.images) || [])
      .concat((inspection && inspection.images) || []),
    photoDraft.odometerUrl,
  )
  const draftFindings =
    Array.isArray(findingsInput) && findingsInput.length
      ? findingsInput
      : Array.isArray(photoDraft.findings)
        ? photoDraft.findings
        : []
  const findings = mapFindingRows(mergedImages, draftFindings, {
    odometerUrl: photoDraft.odometerUrl,
  })
  return {
    vehicleBrand: String(photoDraft.vehicleBrand || vehicle.brand || ''),
    vehicleSeries: String(photoDraft.vehicleSeries || vehicle.series || ''),
    vehicleYear: String(
      photoDraft.vehicleYear || vehicle.modelYear || vehicle.year || '',
    ),
    mileageText:
      formatMileageText(photoDraft.mileageKm) ||
      formatMileageText(vehicle.mileage || vehicle.mileageKm),
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

function listQuoteLineEvidenceUrls(raw = {}) {
  const fromList = Array.isArray(raw.evidenceUrls)
    ? raw.evidenceUrls.map((u) => String(u || '').trim()).filter(Boolean)
    : []
  const one = String(raw.evidenceUrl || raw.url || '').trim()
  const out = []
  const seen = {}
  fromList.concat(one ? [one] : []).forEach((url) => {
    if (!url || seen[url]) return
    seen[url] = true
    out.push(url)
  })
  return out
}

function isQuoteEvidenceFinding(raw = {}) {
  const item = normalizeFinding(raw)
  if (!item.url) return false
  if (item.result === FINDING_RESULT.RECORD || item.result === FINDING_RESULT.OK) return false
  return findingAdviceRequired(item.result)
}

function normalizeQuoteLine(raw = {}) {
  const amount = parseAmount(raw.amount != null ? raw.amount : raw.priceHint)
  const evidenceUrls = listQuoteLineEvidenceUrls(raw)
  return remapLegacyQuoteLineLayout({
    name: String(raw.name || '').trim(),
    brand: String(raw.brand || '').trim(),
    amount: amount == null ? '' : amount,
    note: String(raw.note || '').trim(),
    evidenceUrl: evidenceUrls[0] || '',
    evidenceUrls,
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
    if (requireEvidence && !listQuoteLineEvidenceUrls(line).length) {
      gaps.push(`「${label}」请挂检测图或上传故障图`)
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
 * name = 部位；note 空（处理建议由商家另写，不复制检查发现）；检测结果不写进行名；品牌商家另填
 */
function buildQuoteLinesFromFindings() {
  // 检测图不再一对一预填方案行；方案按「要做的事」手填并挂证据
  return []
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
    mileageKm: parseMileageKm(raw.mileageKm || raw.mileage),
    odometerUrl: String(raw.odometerUrl || '').trim(),
    odometerImageId: String(raw.odometerImageId || '').trim(),
    vehicleBrand: String(raw.vehicleBrand || '').trim(),
    vehicleSeries: String(raw.vehicleSeries || '').trim(),
    vehicleYear: String(raw.vehicleYear || '').trim(),
    conclusion: String(raw.conclusion || '').trim(),
    findings: Array.isArray(raw.findings)
      ? raw.findings
          .map((item) => {
            if (Array.isArray(item && item.images) || (item && item.partName && !item.result)) {
              const work = normalizeWorkFinding(item)
              return work.images.length || work.partName ? work : null
            }
            const row = normalizeFinding(item)
            return row.url || row.partName || row.advice ? row : null
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
  if (patch.mileageKm != null || patch.mileage != null) {
    next.mileageKm = parseMileageKm(patch.mileageKm != null ? patch.mileageKm : patch.mileage)
  }
  if (patch.odometerUrl != null) next.odometerUrl = String(patch.odometerUrl || '').trim()
  if (patch.odometerImageId != null) next.odometerImageId = String(patch.odometerImageId || '').trim()
  if (patch.vehicleBrand != null) next.vehicleBrand = String(patch.vehicleBrand || '').trim()
  if (patch.vehicleSeries != null) next.vehicleSeries = String(patch.vehicleSeries || '').trim()
  if (patch.vehicleYear != null) next.vehicleYear = String(patch.vehicleYear || '').trim()
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
  mediaKey,
  mapFindingRows,
  mapWorkFindingRows,
  normalizeFinding,
  isOdometerFinding,
  pickOdometerSlot,
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
  listQuoteLineEvidenceUrls,
  isQuoteEvidenceFinding,
  sumQuoteAmounts,
  parseMileageKm,
  parseOdometerMileageFromTexts,
  formatMileageText,
  normalizePhotoDraft,
  mergePhotoDraft,
  parseAmount,
  stripFindingResultFromLineName,
  remapLegacyQuoteLineLayout,
  isVagueWarrantyPeriod,
  resolveWarrantyNotes,
}
