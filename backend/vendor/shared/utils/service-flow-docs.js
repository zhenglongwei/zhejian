/**
 * DOC-FLOW · 单据规则生成（无 LLM）
 * 真源：docs/04_维修过程相册/26_商家端事件节点与单据节点链流程.md §4
 */
const {
  INSPECTION_DISCLAIMER,
  FINDING_RESULT,
  FINDING_RESULT_OPTIONS,
  FINDING_ADVICE_NONE,
  INTAKE_RECORD_CATEGORIES,
  ACCEPTANCE_RESULT,
  ACCEPTANCE_KIND,
  ACCEPTANCE_EXTERIOR_ID,
  ACCEPTANCE_EXTERIOR_NAME,
  ACCEPTANCE_EXTERIOR_MAX,
  ACCEPTANCE_ITEM_MAX_IMAGES,
  isValidAcceptanceResult,
  isValidUnbuiltReason,
  emptyAcceptanceItem,
  isValidFindingResult,
  findingAdviceRequired,
} = require('../constants/service-flow-nodes')
const {
  buildQuoteDraft,
  buildQuoteLinesFromFindings,
  resolveQuoteConfirmCopy,
} = require('./service-flow-quote-draft')

function parseMileageKm(value) {
  const digits = String(value || '').replace(/[^\d]/g, '')
  if (!digits) return ''
  const n = Number(digits)
  if (!Number.isFinite(n) || n <= 0 || n > 9999999) return ''
  return String(Math.round(n))
}

/** 给店员/车主看的说明里去掉「图1、图2」，只留部位和状态。没出现图号时原文不动，避免输入时吞掉逗号分号。 */
function stripFigureIndexTalk(value) {
  let s = String(value || '')
  if (!s) return ''
  const before = s
  s = s.replace(/如(?:图\s*\d+\s*[、,，和及]?\s*)+所示/g, '')
  s = s.replace(/见(?:图\s*\d+\s*[、,，和及]?\s*)+/g, '')
  s = s.replace(/图\s*\d+(?:\s*[、,，和及]\s*图\s*\d+)*/g, '')
  s = s.replace(/第\s*\d+\s*张(?:图|照片)?/g, '')
  if (s === before) return s
  s = s.replace(/[；;]{2,}/g, '；')
  s = s.replace(/[、，,]{2,}/g, '，')
  s = s.replace(/^[的、，,；;：:\s]+/, '')
  s = s.replace(/[、，,；;：:\s]+$/, '')
  return s.replace(/\s{2,}/g, ' ').trim()
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
      const base = normalizeWorkImage(img)
      if (!base) return null
      const caption = String((typeof img === 'object' && img && img.caption) || '').trim()
      return {
        ...base,
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

function collectFindingImages(raw = {}) {
  const list = []
  const push = (img) => {
    const norm = normalizeWorkImage(img)
    if (!norm) return
    const key = mediaKey(norm.url)
    if (!key || list.some((item) => mediaKey(item.url) === key)) return
    list.push(norm)
  }
  if (Array.isArray(raw.images)) raw.images.forEach(push)
  push({ url: raw.url, imageId: raw.imageId || raw.id })
  return capImages(list, FINDING_IMAGES_MAX)
}

/**
 * 发现项稳定 id
 * 真源：docs/04_维修过程相册/26_ §6.4
 * 存量无 id 时按首图指纹生成，再退回下标（仅首次迁移命中）；生成后由写入路径持久化。
 */
function stableFindingId(raw = {}, index = -1) {
  const own = String((raw && raw.id) || '').trim()
  if (own) return own
  const images = Array.isArray(raw && raw.images) ? raw.images : []
  const first = images[0] || raw
  const key = String((first && (first.imageId || first.url)) || '').trim()
  const media = key ? mediaKey(key) : ''
  if (media) return `fid_${media}`.slice(0, 64)
  return index >= 0 ? `fid_i${index}` : ''
}

function keepInspectionRemind(raw = {}) {
  const code = String((raw && raw.aiRemindCode) || '').trim()
  const part = String((raw && raw.partName) || '').trim()
  const result = String((raw && raw.result) || '').trim()
  if (code.startsWith('result:') && result === code.slice(7)) {
    return { aiRemind: '', aiRemindCode: '' }
  }
  if (code.startsWith('place:') && part === code.slice(6)) {
    return { aiRemind: '', aiRemindCode: '' }
  }
  return {
    aiRemind: String((raw && raw.aiRemind) || '').trim(),
    aiRemindCode: code,
  }
}

/** 这一眼只产生提醒。部位对上了就去掉「放错项」，结果对上了就去掉「看图更像是」。 */
function inspectionRemindFromLook(row = {}, suggestedResult = '', suggestedPart = '') {
  const part = String(row.partName || '').trim()
  const result = String(row.result || '').trim()
  if (suggestedPart && part && suggestedPart !== part) {
    return { aiRemind: `这张更像是${suggestedPart}`, aiRemindCode: `place:${suggestedPart}` }
  }
  if (suggestedResult && result && suggestedResult !== result) {
    return { aiRemind: `看图更像是${suggestedResult}`, aiRemindCode: `result:${suggestedResult}` }
  }
  const kept = keepInspectionRemind(row)
  if (suggestedPart && part && suggestedPart === part && kept.aiRemindCode.startsWith('place:')) {
    return { aiRemind: '', aiRemindCode: '' }
  }
  if (suggestedResult && result && suggestedResult === result && kept.aiRemindCode.startsWith('result:')) {
    return { aiRemind: '', aiRemindCode: '' }
  }
  return kept
}

function pickMaskFields(raw = {}, first = null) {
  const maskedUrl = String(
    (raw && (raw.maskedUrl || raw.preMaskedUrl)) ||
      (first && (first.maskedUrl || first.preMaskedUrl)) ||
      '',
  ).trim()
  const maskOutcome = String(
    (raw && raw.maskOutcome) || (first && first.maskOutcome) || '',
  ).trim()
  const regionsFrom =
    (raw && Array.isArray(raw.maskRegions) && raw.maskRegions) ||
    (first && Array.isArray(first.maskRegions) && first.maskRegions) ||
    null
  const out = {}
  if (maskedUrl) {
    out.maskedUrl = maskedUrl
    out.preMaskedUrl = String(
      (raw && raw.preMaskedUrl) || (first && first.preMaskedUrl) || maskedUrl,
    ).trim() || maskedUrl
  }
  if (maskOutcome) out.maskOutcome = maskOutcome
  if (regionsFrom) out.maskRegions = regionsFrom
  return out
}

function normalizeFinding(raw = {}, index = -1) {
  const caption = String(raw.caption || '').trim()
  const result = normalizeFindingResult(raw.result)
  let advice = String(raw.advice || '').trim()
  if (result === FINDING_RESULT.OK && !advice) {
    advice = FINDING_ADVICE_NONE
  }
  const images = collectFindingImages(raw)
  const first = images[0] || { url: '', imageId: '' }
  return {
    id: stableFindingId(raw, index),
    imageId: first.imageId || '',
    url: first.url || '',
    images,
    caption,
    captionEmpty: !caption,
    partName: String(raw.partName || caption || '').trim(),
    // 存量字段保留读取，新录入不再要求
    symptom: String(raw.symptom || '').trim(),
    result,
    advice,
    ...keepInspectionRemind({ ...raw, partName: String(raw.partName || caption || '').trim(), result }),
    aiApply: raw.aiApply && raw.aiApply.id ? raw.aiApply : null,
    ...pickMaskFields(raw, first),
  }
}

/** 落库的一项：照片数组、部位、检查结果、检查发现在一起。显式 images: [] 表示已删光。 */
function normalizeItemFinding(raw = {}, index = -1) {
  const hasImagesField = Array.isArray(raw.images)
  let images = hasImagesField
    ? raw.images.map((img) => normalizeWorkImage(img)).filter(Boolean)
    : collectFindingImages(raw)
  images = capImages(images, FINDING_IMAGES_MAX)
  const caption = String(raw.caption || '')
  const result = normalizeFindingResult(raw.result)
  let advice = String(raw.advice || '')
  if (result === FINDING_RESULT.OK && !advice) advice = FINDING_ADVICE_NONE
  const first = images[0] || { url: '', imageId: '' }
  return {
    id: stableFindingId(raw, index),
    imageId: first.imageId || '',
    url: first.url || '',
    images,
    caption,
    captionEmpty: !caption,
    partName: String(raw.partName || caption || '').trim(),
    symptom: String(raw.symptom || '').trim(),
    result,
    advice,
    ...keepInspectionRemind({ ...raw, partName: String(raw.partName || '').trim(), result }),
    aiApply: raw.aiApply && raw.aiApply.id ? raw.aiApply : null,
    ...pickMaskFields(raw, first),
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
  if (isOdometerFinding(row)) return null
  const source = Array.isArray(row.images) && row.images.length
    ? row.images
    : [{ url: row.url, imageId: row.imageId }]
  const images = source.filter((img) => img && !sameMedia(img.url || img, odometerUrl))
  if (images.length === source.length && !sameMedia(row.url, odometerUrl)) return row
  return normalizeFinding({
    ...row,
    url: (images[0] && images[0].url) || '',
    imageId: (images[0] && (images[0].imageId || images[0].id)) || '',
    images,
  })
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
/** 检测项每项张数：0 = 不限制（单次选图仍受微信上限） */
const FINDING_IMAGES_MAX = 0

function capImages(list = [], max = 0) {
  const rows = Array.isArray(list) ? list : []
  const n = Number(max)
  if (!Number.isFinite(n) || n <= 0) return rows
  return rows.slice(0, n)
}

function normalizeWorkImage(raw = {}) {
  const url = String(typeof raw === 'string' ? raw : (raw && raw.url) || '').trim()
  if (!url) return null
  const obj = typeof raw === 'object' && raw ? raw : null
  const maskedUrl = String((obj && (obj.maskedUrl || obj.preMaskedUrl)) || '').trim()
  const imageId = String((obj && (obj.imageId || obj.id)) || '').trim()
  const maskOutcome = String((obj && obj.maskOutcome) || '').trim()
  const maskRegions = Array.isArray(obj && obj.maskRegions) ? obj.maskRegions : null
  const next = { url, imageId }
  if (maskedUrl) {
    next.maskedUrl = maskedUrl
    next.preMaskedUrl = String((obj && obj.preMaskedUrl) || maskedUrl).trim() || maskedUrl
  }
  if (maskOutcome) next.maskOutcome = maskOutcome
  if (maskRegions) next.maskRegions = maskRegions
  // 疑似纸质单据标记：商家确认前不上网（docKeepPrivate=商家确认「是单据」）
  if (obj && obj.docLike === true) next.docLike = true
  if (obj && obj.docConfirmed === true) next.docConfirmed = true
  if (obj && obj.docKeepPrivate === true) next.docKeepPrivate = true
  return next
}

/** 施工项：部位 + 整项说明 + 多图（最多 6） */
function normalizeWorkFinding(raw = {}, index = -1) {
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
  const caption = String(raw.caption || '')
  const partName = String(raw.partName || '').trim()
  const first = images[0] || null
  return {
    id: stableFindingId(raw, index),
    imageId: first ? first.imageId : '',
    url: first ? first.url : '',
    caption,
    captionEmpty: !caption,
    partName,
    symptom: String(raw.symptom || '').trim(),
    // 工单如实记录：用料/品牌/数量/金额均选填，用于完工核对与报价比对
    material: String(raw.material || '').trim(),
    brand: String(raw.brand || '').trim(),
    qty: String(raw.qty || '').trim(),
    amount: parseAmount(raw.amount),
    // 关联的方案行 id；仅作排序/展示参考，不要求与报价勾连
    quoteLineId: String(raw.quoteLineId || '').trim(),
    outsideQuote: Boolean(raw.outsideQuote),
    result: '',
    advice: '',
    images,
    photoCount: images.length,
    ...pickMaskFields(raw, first),
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
function mapWorkFindingRows(images = [], draftFindings = [], options = {}) {
  const pendingKeys = new Set(
    ((options && options.pendingKeys) || []).map((value) => mediaKey(value)).filter(Boolean),
  )
  const workImages = pendingKeys.size
    ? (images || []).filter((img) => {
        const url = typeof img === 'string' ? img : img && img.url
        const key = mediaKey(url)
        return Boolean(key && !pendingKeys.has(key))
      })
    : images
  const draftList = (Array.isArray(draftFindings) ? draftFindings : []).map((row, index) =>
    normalizeWorkFinding(row, index),
  )
  const strictFindings = Boolean(options && options.strictFindings)
  if (strictFindings && !draftList.some((row) => row.images.length || row.partName || row.id)) {
    return []
  }
  if (draftList.some((row) => row.images.length || row.partName || row.id)) {
    const persisted = mapPhotoRows(workImages)
    if (!persisted.length) return draftList
    const byKey = {}
    persisted.forEach((row) => {
      const key = mediaKey(row.url)
      if (key && !byKey[key]) byKey[key] = row
    })
    return draftList.map((item) => {
      if (!item.images.length) return item
      const nextImages = item.images.map((img) => {
        const hit = byKey[mediaKey(img.url)]
        if (!hit) return img
        return {
          url: hit.url || img.url,
          imageId: hit.imageId || img.imageId || '',
        }
      })
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
    if (item.id) draftByKey[`@${item.id}`] = item
    draftByKey[`#${index}`] = item
  })
  ;(draftFindings || []).forEach((raw, index) => {
    const item = normalizeFinding(raw, index)
    const key = item.imageId || item.url
    if (key && !draftByKey[key]) draftByKey[key] = item
    if (item.id && !draftByKey[`@${item.id}`]) draftByKey[`@${item.id}`] = item
    if (!draftByKey[`#${index}`]) draftByKey[`#${index}`] = item
  })
  const rows = mapPhotoRows(workImages)
  // 位置兜底仅用于存量「一图一项」：两侧数量相等才启用，id 落库后不再命中（26_ §6.5）
  const legacyPositional = rows.length > 0 && rows.length === draftList.length
  return rows.map((row, index) => {
    const draft =
      draftByKey[row.imageId] ||
      draftByKey[row.url] ||
      (legacyPositional ? draftByKey[`#${index}`] : null) ||
      {}
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

function findingImageKeys(item) {
  const keys = new Set()
  ;(item && item.images ? item.images : []).forEach((img) => {
    const key = mediaKey(img && img.url)
    if (key) keys.add(key)
  })
  const own = mediaKey(item && item.url)
  if (own) keys.add(own)
  return keys
}

function mergeFindingsByPart(list) {
  const out = []
  ;(list || []).forEach((raw, index) => {
    const item = normalizeFinding(raw, index)
    const part = String(item.partName || '').trim()
    if (!part) {
      out.push(item)
      return
    }
    // 同名不同 id 视为两项；仅存量无 id 时才回落按名称合并（26_ §6.5）
    const host = out.find((row) => {
      if (row.id && item.id) return row.id === item.id
      return String(row.partName || '').trim() === part
    })
    if (!host) {
      out.push(item)
      return
    }
    const images = []
    const seen = new Set()
    host.images.concat(item.images).forEach((img) => {
      const key = mediaKey(img && img.url)
      if (!key || seen.has(key)) return
      seen.add(key)
      images.push(img)
    })
    host.images = capImages(images, FINDING_IMAGES_MAX)
    host.url = (host.images[0] && host.images[0].url) || ''
    host.imageId = (host.images[0] && host.images[0].imageId) || ''
    if (!host.result && item.result) host.result = item.result
    if ((!host.advice || host.advice === FINDING_ADVICE_NONE) && item.advice && item.advice !== FINDING_ADVICE_NONE) {
      host.advice = item.advice
    }
    if (!host.aiRemind && item.aiRemind) {
      host.aiRemind = item.aiRemind
      host.aiRemindCode = item.aiRemindCode || ''
    }
  })
  return out
}

function normalizePendingImages(list = []) {
  const out = []
  const seen = new Set()
  ;(list || []).forEach((raw) => {
    const img = normalizeWorkImage(raw)
    if (!img) return
    const key = mediaKey(img.url)
    if (!key || seen.has(key)) return
    seen.add(key)
    const skipReason = String((raw && typeof raw === 'object' && raw.skipReason) || '').trim()
    out.push(skipReason ? { ...img, skipReason } : img)
  })
  return out
}

function parseOrganizeSlot(value, count) {
  const total = Number(count) || 0
  if (total < 1) return -1
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= total) {
    return value - 1
  }
  const raw = String(value == null ? '' : value).trim()
  const named = raw.match(/^图\s*(\d+)$/i)
  if (named) {
    const n = Number(named[1])
    if (n >= 1 && n <= total) return n - 1
  }
  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw)
    if (n >= 1 && n <= total) return n - 1
  }
  return -1
}

function matchPendingImage(pending, byKey, rawKey) {
  const slot = parseOrganizeSlot(rawKey, (pending || []).length)
  if (slot >= 0) return pending[slot] || null
  const raw = String(rawKey || '').trim()
  if (!raw) return null
  const candidates = []
  const key = mediaKey(raw)
  if (key) candidates.push(key)
  const tail = raw.split(/[\\/]/).filter(Boolean).pop()
  if (tail) {
    candidates.push(tail)
    const tailKey = mediaKey(tail)
    if (tailKey) candidates.push(tailKey)
  }
  for (let i = 0; i < candidates.length; i += 1) {
    if (byKey[candidates[i]]) return byKey[candidates[i]]
  }
  return (
    pending.find((row) => {
      const m = mediaKey(row.url)
      return Boolean(m && candidates.some((c) => c === m || raw.endsWith(m) || m.endsWith(c)))
    }) || null
  )
}

/**
 * 节点唯一内容袋：content（仅写 content，旧 photoDraft / document.payload 已删）。
 * 报告正文由此派生，禁止再当第二真源维护。
 */
function normalizeNodeContent(raw = {}) {
  const r = raw || {}
  const base = {
    chiefComplaint: String(r.chiefComplaint || '').trim(),
    mileageKm: parseMileageKm(r.mileageKm || r.mileage),
    odometerUrl: String(r.odometerUrl || '').trim(),
    odometerImageId: String(r.odometerImageId || '').trim(),
    vehicleBrand: String(r.vehicleBrand || '').trim(),
    vehicleSeries: String(r.vehicleSeries || '').trim(),
    vehicleYear: String(r.vehicleYear || '').trim(),
    conclusion: String(r.conclusion || '').trim(),
    findings: Array.isArray(r.findings)
      ? r.findings
          .map((item, index) => {
            const row = normalizeDraftFinding(item, index)
            return findingDraftKeeps(row) ? row : null
          })
          .filter(Boolean)
      : [],
    pendingImages: normalizePendingImages(r.pendingImages),
    fuelReading: String(r.fuelReading || '').trim(),
    belongings: String(r.belongings || '').trim(),
    intakeResults: Array.isArray(r.intakeResults)
      ? r.intakeResults
          .map((row) => normalizeIntakeResult(row))
          .filter((row) => row.images.length || row.reading)
      : [],
    warrantyPeriod: String(r.warrantyPeriod || '').trim(),
    warrantyNotes: resolveWarrantyNotes(r),
    confirmCopy: String(r.confirmCopy || '').trim(),
    acceptanceItems: foldLegacyDeliveryPhotos(resolveAcceptanceItems(r), r.deliveryPhotos),
    reportGeneratedAt: String(r.reportGeneratedAt || '').trim(),
    ownerSentAt: String(r.ownerSentAt || '').trim(),
    inspectionAiKey: String(r.inspectionAiKey || '').trim(),
    receiverName: String(r.receiverName || '').trim(),
    receivedAt: String(r.receivedAt || '').trim(),
    inspectorName: String(r.inspectorName || '').trim(),
    inspectedAt: String(r.inspectedAt || '').trim(),
    workerName: String(r.workerName || '').trim(),
    delivererName: String(r.delivererName || '').trim(),
    deliveredAt: String(r.deliveredAt || '').trim(),
    deliveryMileage: parseMileageKm(r.deliveryMileage),
    reworkRecords: normalizeReworkRecords(r.reworkRecords),
    exteriorPhotoWaived: r.exteriorPhotoWaived === true,
    revision: Math.max(0, Math.round(Number(r.revision) || 0)),
    needsRevision: r.needsRevision === true,
    finishedAt: String(r.finishedAt || '').trim(),
    recordVersions: Array.isArray(r.recordVersions)
      ? r.recordVersions
          .map((row) => ({
            id: String((row && row.id) || '').trim(),
            confirmedAt: String((row && row.confirmedAt) || '').trim(),
            title: String((row && row.title) || '').trim(),
            summary: String((row && row.summary) || '').trim(),
          }))
          .filter((row) => row.id)
          .slice(-20)
      : [],
  }
  if (Array.isArray(raw.lines)) {
    base.lines = raw.lines
      .map((row) => normalizeQuoteLine(row))
      .filter((row) => row && row.name)
  }
  if (Array.isArray(raw.workItems)) {
    base.workItems = raw.workItems
      .map((row, index) =>
        normalizeWorkFinding(
          {
            ...(row || {}),
            partName: (row && (row.partName || row.name)) || '',
            caption: (row && (row.caption || row.note)) || '',
          },
          index,
        ),
      )
      .filter((row) => row && (row.partName || (row.images && row.images.length)))
  }
  if (Array.isArray(raw.photos)) {
    base.photos = normalizePendingImages(raw.photos)
  }
  if (raw.discovery && typeof raw.discovery === 'object') {
    base.discovery = raw.discovery
  }
  if (raw.archiveCopy && typeof raw.archiveCopy === 'object') {
    base.archiveCopy = raw.archiveCopy
  }
  if (Array.isArray(raw.deliveryPhotos)) {
    base.acceptanceItems = foldLegacyDeliveryPhotos(base.acceptanceItems, raw.deliveryPhotos)
  }
  if (raw.totalAmount != null && raw.totalAmount !== '') {
    base.totalAmount = raw.totalAmount
  }
  if (Array.isArray(raw.unbuiltQuoteItems)) {
    base.unbuiltQuoteItems = normalizeUnbuiltQuoteItems(raw.unbuiltQuoteItems)
  }
  return base
}

function mergeNodeContent(prev = {}, patch = {}) {
  let next = normalizeNodeContent(prev)
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
    next.findings = normalizeNodeContent({ findings: patch.findings }).findings
  }
  if (patch.pendingImages != null) next.pendingImages = normalizePendingImages(patch.pendingImages)
  if (patch.fuelReading != null) next.fuelReading = String(patch.fuelReading || '').trim()
  if (patch.belongings != null) next.belongings = String(patch.belongings || '').trim()
  if (patch.intakeResults != null) {
    next.intakeResults = normalizeNodeContent({ intakeResults: patch.intakeResults }).intakeResults
  }
  if (patch.warrantyPeriod != null) next.warrantyPeriod = String(patch.warrantyPeriod || '').trim()
  if (patch.warrantyNotes != null) next.warrantyNotes = String(patch.warrantyNotes || '').trim()
  if (patch.warrantyScope != null || patch.warrantyExclusions != null) {
    next.warrantyNotes = resolveWarrantyNotes({
      warrantyNotes: patch.warrantyNotes != null ? patch.warrantyNotes : next.warrantyNotes,
      warrantyScope: patch.warrantyScope,
      warrantyExclusions: patch.warrantyExclusions,
    })
  }
  if (patch.confirmCopy != null) next.confirmCopy = String(patch.confirmCopy || '').trim()
  if (patch.deliveryPhotos != null) {
    const photos = normalizeDeliveryPhotos(patch.deliveryPhotos)
    const rows = normalizeAcceptanceItems(next.acceptanceItems)
    const idx = rows.findIndex((row) => row.kind === ACCEPTANCE_KIND.EXTERIOR)
    const prev = idx >= 0 ? rows[idx] : null
    const exterior = emptyAcceptanceItem({
      kind: ACCEPTANCE_KIND.EXTERIOR,
      images: photos,
      result: prev ? prev.result : '',
      note: prev ? prev.note : '',
    })
    if (idx >= 0) rows[idx] = exterior
    else rows.push(exterior)
    next.acceptanceItems = rows
  }
  if (patch.acceptanceItems != null) next.acceptanceItems = normalizeAcceptanceItems(patch.acceptanceItems)
  if (patch.reportGeneratedAt != null) next.reportGeneratedAt = String(patch.reportGeneratedAt || '').trim()
  if (patch.ownerSentAt != null) next.ownerSentAt = String(patch.ownerSentAt || '').trim()
  if (patch.inspectionAiKey != null) next.inspectionAiKey = String(patch.inspectionAiKey || '').trim()
  if (patch.receiverName != null) next.receiverName = String(patch.receiverName || '').trim()
  if (patch.receivedAt != null) next.receivedAt = String(patch.receivedAt || '').trim()
  if (patch.inspectorName != null) next.inspectorName = String(patch.inspectorName || '').trim()
  if (patch.inspectedAt != null) next.inspectedAt = String(patch.inspectedAt || '').trim()
  if (patch.workerName != null) next.workerName = String(patch.workerName || '').trim()
  if (patch.delivererName != null) next.delivererName = String(patch.delivererName || '').trim()
  if (patch.deliveredAt != null) next.deliveredAt = String(patch.deliveredAt || '').trim()
  if (patch.deliveryMileage != null) next.deliveryMileage = parseMileageKm(patch.deliveryMileage)
  if (patch.reworkRecords != null) next.reworkRecords = normalizeReworkRecords(patch.reworkRecords)
  if (patch.exteriorPhotoWaived != null) next.exteriorPhotoWaived = patch.exteriorPhotoWaived === true
  if (patch.revision != null) next.revision = Math.max(0, Math.round(Number(patch.revision) || 0))
  if (patch.needsRevision != null) next.needsRevision = patch.needsRevision === true
  if (patch.finishedAt != null) next.finishedAt = String(patch.finishedAt || '').trim()
  if (patch.recordVersions != null) {
    next.recordVersions = normalizeNodeContent({ recordVersions: patch.recordVersions }).recordVersions
  }
  if (patch.lines != null) {
    next.lines = Array.isArray(patch.lines)
      ? patch.lines.map((row) => normalizeQuoteLine(row)).filter((row) => row && row.name)
      : []
  }
  if (patch.workItems != null) {
    next.workItems = Array.isArray(patch.workItems)
      ? patch.workItems
          .map((row, index) =>
            normalizeWorkFinding(
              {
                ...(row || {}),
                partName: (row && (row.partName || row.name)) || '',
                caption: (row && (row.caption || row.note)) || '',
              },
              index,
            ),
          )
          .filter((row) => row && (row.partName || (row.images && row.images.length)))
      : []
  }
  if (patch.photos != null) next.photos = normalizePendingImages(patch.photos)
  if (patch.discovery != null) {
    next.discovery = patch.discovery && typeof patch.discovery === 'object' ? patch.discovery : {}
  }
  if (patch.archiveCopy != null) {
    next.archiveCopy = patch.archiveCopy && typeof patch.archiveCopy === 'object' ? patch.archiveCopy : {}
  }
  if (patch.totalAmount != null && patch.totalAmount !== '') {
    next.totalAmount = patch.totalAmount
  }
  if (patch.unbuiltQuoteItems != null) {
    next.unbuiltQuoteItems = normalizeUnbuiltQuoteItems(patch.unbuiltQuoteItems)
  }
  return normalizeNodeContent(next)
}

function contentBagHasSubstance(raw) {
  if (!raw || typeof raw !== 'object') return false
  const keys = [
    'chiefComplaint',
    'findings',
    'pendingImages',
    'lines',
    'workItems',
    'photos',
    'deliveryPhotos',
    'warrantyPeriod',
    'warrantyNotes',
    'acceptanceItems',
    'workerName',
    'receiverName',
    'inspectorName',
    'delivererName',
    'deliveredAt',
    'deliveryMileage',
    'conclusion',
    'belongings',
    'totalAmount',
  ]
  return keys.some((key) => {
    const value = raw[key]
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'number') return Number.isFinite(value) && value !== 0
    return Boolean(String(value == null ? '' : value).trim())
  })
}

function pickContentSource(node) {
  if (!node || typeof node !== 'object') return {}
  if (node.content && typeof node.content === 'object') return node.content
  return {}
}

function contentOfFlowNode(node) {
  if (!node || typeof node !== 'object') return normalizeNodeContent({})
  return normalizeNodeContent(pickContentSource(node))
}

function envelopeOnlyDocument(doc) {
  if (!doc || typeof doc !== 'object') return doc
  return { ...doc }
}

function compactPriorRow(row = {}) {
  const out = {}
  Object.keys(row || {}).forEach((key) => {
    const value = String(row[key] || '').trim()
    if (value) out[key] = value
  })
  return Object.keys(out).length ? out : null
}

function isDeliveryLikeKind(kind) {
  return kind === 'delivery_photos' || kind === 'repair_report' || kind === 'delivery'
}

/**
 * 后一步识图/核对用的前序文字事实：只带已有结果，不带图。
 * currentKind=inspection 带接车；work 带接车+检测+已确认方案；完工/交车再带工单。
 */
function buildPriorOrganizeFacts(flowNodes = [], currentKind = '') {
  const current = String(currentKind || '')
  const includeIntake = current !== 'intake' && current !== 'intake_inspection'
  const includeInspection =
    current === 'work' ||
    current === 'quote_confirm' ||
    isDeliveryLikeKind(current)
  const includeQuote = current === 'work' || isDeliveryLikeKind(current)
  const includeWork = isDeliveryLikeKind(current)
  const facts = { intake: null, inspection: [], quote: [], work: [] }

  ;(flowNodes || []).forEach((node) => {
    const kind = String((node && node.kind) || '')
    const draft = draftOfFlowNode(node)
    const doc = (node && node.document && typeof node.document === 'object' && node.document) || {}
    const payload = doc.payload && typeof doc.payload === 'object' ? doc.payload : doc

    if (includeIntake && (kind === 'intake' || kind === 'intake_inspection')) {
      const records = []
      ;(Array.isArray(draft.intakeResults) ? draft.intakeResults : []).forEach((row) => {
        const item = compactPriorRow({
          part: row.partName || row.category,
          reading: row.reading,
          note: row.observation || row.advice,
        })
        if (item) records.push(item)
      })
      ;(Array.isArray(draft.findings) && kind === 'intake' ? draft.findings : []).forEach((row) => {
        const item = compactPriorRow({
          part: row.partName || row.category,
          reading: row.reading,
          note: row.observation || row.advice,
        })
        if (item) records.push(item)
      })
      facts.intake = compactPriorRow({
        chiefComplaint: draft.chiefComplaint || payload.chiefComplaint,
        mileageKm: draft.mileageKm || payload.mileageKm,
        vehicleBrand: draft.vehicleBrand,
      }) || { records: [] }
      if (records.length) facts.intake.records = records
    }

    if (includeInspection && (kind === 'inspection' || kind === 'inspection_report')) {
      const findings =
        (Array.isArray(draft.findings) && draft.findings.length
          ? draft.findings
          : Array.isArray(payload.findings)
            ? payload.findings
            : []) || []
      findings.forEach((row) => {
        const item = compactPriorRow({
          part: row.partName,
          result: row.result,
          advice: row.advice,
          observation: row.observation,
        })
        if (item) facts.inspection.push(item)
      })
    }

    if (
      includeQuote &&
      (kind === 'quote_confirm' || kind === 'addon_quote_confirm') &&
      String(doc.status || payload.status || '') === 'confirmed'
    ) {
      const lines = Array.isArray(payload.lines) ? payload.lines : []
      lines.forEach((line) => {
        const item = compactPriorRow({
          name: line.name,
          note: line.note || line.plan,
        })
        if (item) facts.quote.push(item)
      })
    }

    if (includeWork && kind === 'work') {
      const findings = Array.isArray(draft.findings) ? draft.findings : []
      findings.forEach((row) => {
        const item = compactPriorRow({
          part: row.partName,
          caption: row.caption,
          material: row.material,
          extra: row.outsideQuote ? '报价没有这项' : '',
        })
        if (item) facts.work.push(item)
      })
    }
  })

  if (facts.intake && !facts.intake.records && !facts.intake.chiefComplaint && !facts.intake.mileageKm) {
    facts.intake = null
  }
  return facts
}

function collectConfirmedQuoteLines(flowNodes = []) {
  const lines = []
  const seen = new Set()
  ;(flowNodes || []).forEach((node) => {
    const kind = String((node && node.kind) || '')
    if (kind !== 'quote_confirm' && kind !== 'addon_quote_confirm') return
    const doc = (node && node.document) || {}
    if (String(doc.status || '') !== 'confirmed') return
    const payload = doc.payload && typeof doc.payload === 'object' ? doc.payload : doc
    // 确认后 payload 会被清成信封，报价行真源在节点 content.lines
    const contentLines = contentOfFlowNode(node).lines
    const list = Array.isArray(contentLines) && contentLines.length
      ? contentLines
      : Array.isArray(payload.lines)
        ? payload.lines
        : []
    list.forEach((line) => {
      const id = String((line && line.id) || '').trim()
      const name = String((line && line.name) || '').trim()
      if (!name) return
      const key = id || name
      if (seen.has(key)) return
      seen.add(key)
      lines.push({
        id,
        name,
        amount: line && line.amount != null ? String(line.amount) : '',
        note: String((line && line.note) || '').trim(),
        // 保留与施工项的关联，未施工核对优先按 id 判定（不能只靠名称模糊匹配）
        workFindingId: String((line && line.workFindingId) || '').trim(),
        quoteLineId: String((line && line.quoteLineId) || '').trim(),
      })
    })
  })
  return lines
}

/**
 * 施工项播种的报价行必须按施工节点限定范围，不能跨报价串台：
 * - 返工施工节点（parentNodeId 指向施工节点）：自身项目已写入 content.findings，不再从报价播种
 * - 补充施工节点（parentNodeId 指向某补充报价）：只认它的父补充报价
 * - 原施工节点：首次报价；已有施工项时只补入施工期间新增、且没有自己施工节点的补充报价
 */
function collectConfirmedQuoteLinesForWorkNode(flowNodes = [], workNode = {}) {
  const nodes = Array.isArray(flowNodes) ? flowNodes : []
  const work = workNode && typeof workNode === 'object' ? workNode : {}
  const parentId = String(work.parentNodeId || '').trim()
  if (parentId) {
    const parent = nodes.find((n) => n && String(n.id || '') === parentId)
    if (parent && parent.kind === 'work') return []
    return parent ? collectConfirmedQuoteLines([parent]) : []
  }
  const content = (work && (work.content || work.photoDraft)) || {}
  const hasFindings = (Array.isArray(content.findings) ? content.findings : []).some((row) =>
    String((row && row.partName) || '').trim(),
  )
  // 原施工已有施工项：只并入施工期间新增的补充报价，不改写原有项目
  if (hasFindings) {
    const ownedByAddonWork = new Set(
      nodes
        .filter(
          (n) => n && n.kind === 'work' && String(n.insertedReason || '').trim() === 'addon',
        )
        .map((n) => String(n.parentNodeId || '').trim())
        .filter(Boolean),
    )
    const addonQuotes = nodes.filter(
      (n) =>
        n &&
        (n.kind === 'addon_quote_confirm' ||
          (n.kind === 'quote_confirm' && String(n.insertedReason || '') === 'addon')) &&
        !ownedByAddonWork.has(String(n.id || '').trim()),
    )
    return collectConfirmedQuoteLines(addonQuotes)
  }
  const originalQuote = nodes.find(
    (n) =>
      n &&
      n.kind === 'quote_confirm' &&
      String(n.insertedReason || '') !== 'addon',
  )
  return originalQuote ? collectConfirmedQuoteLines([originalQuote]) : []
}

function seedWorkFindingsFromQuoteLines(findings = [], quoteLines = []) {
  const rows = (findings || []).map((row, index) => normalizeWorkFinding(row, index))
  const hasSubstance = rows.some(
    (row) => String(row.partName || '').trim() || row.images.length || row.quoteLineId,
  )
  // 已有施工项时只补入尚未落进施工项的新报价行，避免把删掉的项目又长回来
  const extra = (quoteLines || [])
    .filter((line) => String((line && line.name) || '').trim())
    .filter((line) => {
      const lineId = String((line && line.id) || '').trim()
      const name = normalizeItemName(line && line.name)
      return !rows.some(
        (row) =>
          (lineId && String(row.quoteLineId || '').trim() === lineId) ||
          (name && normalizeItemName(row.partName) === name),
      )
    })
    .map((line, index) =>
      normalizeWorkFinding(
        {
          id: `wf_${String(line.id || index)}`,
          partName: line.name,
          quoteLineId: line.id || '',
          caption: '',
          images: [],
        },
        rows.length + index,
      ),
    )
  if (!hasSubstance) return extra
  return extra.length ? rows.concat(extra) : rows
}

function normalizeItemName(value = '') {
  return String(value || '').replace(/\s+/g, '').trim()
}

/** 把模型写的项目名收敛到预设名：精确优先，其次包含匹配取最长 */
function resolvePresetItemName(rawName, presetNames = []) {
  const raw = normalizeItemName(rawName)
  if (!raw) return ''
  const names = (Array.isArray(presetNames) ? presetNames : [])
    .map((name) => String(name || '').trim())
    .filter(Boolean)
  if (!names.length) return ''
  const exact = names.find((name) => normalizeItemName(name) === raw)
  if (exact) return exact
  if (raw.length < 2) return ''
  const hits = names.filter((name) => {
    const key = normalizeItemName(name)
    return key.length >= 2 && (key.includes(raw) || raw.includes(key))
  })
  if (!hits.length) return ''
  const longest = Math.max(...hits.map((name) => normalizeItemName(name).length))
  const top = hits.filter((name) => normalizeItemName(name).length === longest)
  // 同样长的多个候选说明分不清，宁可判为新增，也不错误合并
  return top.length === 1 ? top[0] : ''
}

/**
 * 未施工报价项的交代记录（施工节点 content.unbuiltQuoteItems）
 * 施工节点完成前必须二选一，交车节点只读汇总，不再要求商家操作。
 */
function normalizeUnbuiltQuoteItem(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {}
  const name = String(obj.name || '').trim().slice(0, 60)
  if (!name) return null
  return {
    quoteLineId: String(obj.quoteLineId || '').trim(),
    name,
    reason: isValidUnbuiltReason(obj.reason) ? obj.reason : '',
    note: String(obj.note || '').trim().slice(0, 200),
    at: String(obj.at || '').trim(),
  }
}

/**
 * 返工记录（交车后发现施工问题 / 复核要求返工）
 * 写入施工节点 content.reworkRecords；施工回 in_progress 时保留，报告据此标注「返工」。
 */
function normalizeReworkRecord(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {}
  const reason = String(obj.reason || '').trim().slice(0, 200)
  if (!reason) return null
  const itemIds = Array.isArray(obj.itemIds)
    ? obj.itemIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 20)
    : []
  const itemNames = Array.isArray(obj.itemNames)
    ? obj.itemNames.map((name) => String(name || '').trim()).filter(Boolean).slice(0, 20)
    : []
  return {
    id: String(obj.id || '').trim() || `rw_${Date.now().toString(36)}`,
    reason,
    itemIds,
    itemNames,
    operator: String(obj.operator || '').trim().slice(0, 40),
    at: String(obj.at || '').trim(),
    doneAt: String(obj.doneAt || '').trim(),
  }
}

function normalizeReworkRecords(list) {
  return (Array.isArray(list) ? list : []).map(normalizeReworkRecord).filter(Boolean).slice(-20)
}

/** 按 quoteLineId / 行名去重，后者覆盖前者（重进施工节点重选即覆盖） */
function normalizeUnbuiltQuoteItems(list) {
  const map = new Map()
  ;(Array.isArray(list) ? list : []).forEach((raw) => {
    const item = normalizeUnbuiltQuoteItem(raw)
    if (!item || !item.reason) return
    const key = item.quoteLineId || normalizeItemName(item.name)
    if (!key) return
    map.set(key, item)
  })
  return [...map.values()]
}

/** 汇总本单所有施工节点的交代记录 */
function collectUnbuiltQuoteItems(flowNodes = []) {
  const all = []
  ;(flowNodes || []).forEach((node) => {
    if (!node || node.kind !== 'work') return
    const rows = contentOfFlowNode(node).unbuiltQuoteItems
    if (Array.isArray(rows)) all.push(...rows)
  })
  return normalizeUnbuiltQuoteItems(all)
}

/** 交代索引：按 quoteLineId 与去空行名各建一份，便于 id / 名双命中 */
function unbuiltQuoteIndex(items = []) {
  const byId = new Map()
  const byName = new Map()
  ;(Array.isArray(items) ? items : []).forEach((raw) => {
    const item = normalizeUnbuiltQuoteItem(raw)
    if (!item || !item.reason) return
    if (item.quoteLineId) byId.set(item.quoteLineId, item)
    byName.set(normalizeItemName(item.name), item)
  })
  return { byId, byName }
}

/** 报价行 → 关联的施工项 id（新数据带 workFindingId，旧数据从 ql_work_ 前缀还原） */
function findingIdOfQuoteLine(line = {}) {
  const explicit = String((line && line.workFindingId) || '').trim()
  if (explicit) return explicit
  const matched = /^ql_work_(.+)$/.exec(String((line && line.id) || '').trim())
  return matched ? String(matched[1] || '').trim() : ''
}

/**
 * 报价项未施工：报价有、工单无。
 * 有图的漏记由 AI 逐图归类另行处置，这里只按单据链判定「没有任何工单项承接」。
 * 商家在施工节点已交代（系统录入错误 / 客户要求不做）的不算未施工。
 */
function computeUnstartedQuoteItems(flowNodes = []) {
  const quoteLines = collectConfirmedQuoteLines(flowNodes).filter((line) => line.name)
  if (!quoteLines.length) return { items: [], total: 0 }
  const accounted = unbuiltQuoteIndex(collectUnbuiltQuoteItems(flowNodes))
  const quoteNames = quoteLines.map((line) => line.name)
  const usedIds = new Set()
  const usedNames = new Set()
  // 施工记录里出现过的项视为已施工：有图或有文案的新增项更不该再提醒
  const startedFindingIds = new Set()
  ;(flowNodes || []).forEach((node) => {
    if (!node || node.kind !== 'work') return
    const findings = contentOfFlowNode(node).findings || []
    ;(Array.isArray(findings) ? findings : []).forEach((row) => {
      const quoteLineId = String((row && row.quoteLineId) || '').trim()
      if (quoteLineId) usedIds.add(quoteLineId)
      const findingId = String((row && row.id) || '').trim()
      if (findingId) startedFindingIds.add(findingId)
      const partName = String((row && row.partName) || '').trim()
      if (!partName) return
      const preset = resolvePresetItemName(partName, quoteNames)
      if (preset) usedNames.add(preset)
    })
  })
  const items = quoteLines
    .filter((line) => {
      const findingId = findingIdOfQuoteLine(line)
      if (findingId && startedFindingIds.has(findingId)) return false
      if (line.id && usedIds.has(line.id)) return false
      if (usedNames.has(line.name)) return false
      return true
    })
    .filter(
      (line) =>
        !(line.id && accounted.byId.has(line.id)) &&
        !accounted.byName.has(normalizeItemName(line.name)),
    )
    .map((line) => ({ id: line.id, name: line.name, amount: line.amount || '', note: line.note || '' }))
  return { items, total: items.length }
}

function unmatchedCheckpoints(checkpoints, findings) {
  const normalize = (name) =>
    String(name || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/[左右前后内外侧上下]/g, '')
  const names = (Array.isArray(findings) ? findings : [])
    .map((row) => normalize(row && row.partName))
    .filter(Boolean)
  return (Array.isArray(checkpoints) ? checkpoints : []).filter((ck) => {
    const key = normalize(ck && ck.partName)
    if (!key) return false
    return !names.some((name) => name.includes(key) || key.includes(name))
  })
}

function collectConfirmedQuoteNames(flowNodes = []) {
  const names = []
  const seen = new Set()
  collectConfirmedQuoteLines(flowNodes).forEach((line) => {
    const name = String((line && line.name) || '').trim()
    if (!name || seen.has(name)) return
    seen.add(name)
    names.push(name)
  })
  return names
}

/**
 * 历次报价单 + 汇总报价单。
 * entries：按节点顺序的单张报价单（首次报价、补充报价1、补充报价2…）；
 * lines / total：历次加总后的汇总报价单，行上带来源标签。
 */
function buildQuoteLedger(flowNodes = []) {
  const entries = []
  let addonSeq = 0
  ;(flowNodes || []).forEach((node) => {
    if (!node || (node.kind !== 'quote_confirm' && node.kind !== 'addon_quote_confirm')) return
    const doc = (node && node.document) || {}
    const status = String(doc.status || '')
    if (status === 'cancelled') return
    const isAddon =
      String(node.insertedReason || '') === 'addon' || node.kind === 'addon_quote_confirm'
    if (isAddon) addonSeq += 1
    const label = isAddon ? `补充报价${addonSeq}` : '首次报价'
    const contentLines = contentOfFlowNode(node).lines
    const payload = doc.payload && typeof doc.payload === 'object' ? doc.payload : {}
    const raw = Array.isArray(contentLines) && contentLines.length
      ? contentLines
      : Array.isArray(payload.lines)
        ? payload.lines
        : []
    const lines = raw
      .map((line) => {
        const name = String((line && line.name) || '').trim()
        if (!name) return null
        return {
          id: String((line && line.id) || '').trim(),
          name,
          amount: line && line.amount != null ? String(line.amount) : '',
          note: String((line && line.note) || '').trim(),
          quoteNodeId: String((node && node.id) || ''),
          quoteLabel: label,
          isAddon,
          status,
          confirmed: status === 'confirmed',
        }
      })
      .filter(Boolean)
    entries.push({
      nodeId: String((node && node.id) || ''),
      label,
      isAddon,
      status,
      confirmed: status === 'confirmed',
      lines,
      total: sumQuoteAmounts(lines),
    })
  })
  const lines = entries.reduce((all, entry) => all.concat(entry.lines), [])
  const confirmedLines = lines.filter((line) => line.confirmed)
  return {
    entries,
    lines,
    confirmedLines,
    total: sumQuoteAmounts(lines),
    confirmedTotal: sumQuoteAmounts(confirmedLines),
    count: entries.length,
  }
}

function compactQuoteName(value = '') {
  return String(value || '').replace(/\s+/g, '')
}

/** 工单项目名与已确认方案行必须完全一致；对上则返回方案原名。 */
function matchQuotePartName(partName, quoteNames = []) {
  const raw = String(partName || '').trim()
  if (!raw) return ''
  const names = (quoteNames || []).map((n) => String(n || '').trim()).filter(Boolean)
  return names.find((n) => n === raw) || ''
}

function stampWorkQuoteMatch(groups = [], quoteNames = []) {
  const names = Array.isArray(quoteNames) ? quoteNames : []
  return (groups || []).map((group) => {
    const partName = String((group && group.partName) || '').trim()
    const hit = matchQuotePartName(partName, names)
    if (hit) return { ...group, partName: hit, outsideQuote: false }
    return { ...group, partName, outsideQuote: true }
  })
}

function workOutsideQuoteOf(partName, quoteNames = []) {
  return !matchQuotePartName(partName, quoteNames)
}

function usedWorkQuoteNames(findings = []) {
  const used = new Set()
  ;(findings || []).forEach((row) => {
    const name = String((row && row.partName) || '').trim()
    if (name) used.add(name)
  })
  return used
}

/** 工单「并入」：整张方案 + 本步已有新增项 */
function buildWorkAssignPickGroups({ quoteNames = [], findings = [] } = {}) {
  const names = (quoteNames || []).map((n) => String(n || '').trim()).filter(Boolean)
  const rows = (findings || []).map((row, index) => normalizeWorkFinding(row, index))
  const used = usedWorkQuoteNames(rows)
  const groups = []
  if (names.length) {
    groups.push({
      label: '方案',
      items: names.map((title) => ({
        key: `quote:${title}`,
        title,
        meta: used.has(title) ? '已有' : '',
      })),
    })
  }
  const extras = rows.filter((row) => row && row.outsideQuote)
  if (extras.length) {
    groups.push({
      label: '新增',
      items: extras.map((row) => ({
        key: `finding:${row.id}`,
        title: row.partName || '待填写',
        meta: '',
      })),
    })
  }
  return groups
}

/** 工单「加一项」：尚未做到工单上的方案行 */
function buildWorkAddPickGroups({ quoteNames = [], findings = [] } = {}) {
  const names = (quoteNames || []).map((n) => String(n || '').trim()).filter(Boolean)
  const used = usedWorkQuoteNames(findings)
  const leftover = names.filter((title) => !used.has(title))
  if (!leftover.length) return []
  return [
    {
      label: '方案',
      items: leftover.map((title) => ({
        key: `quote:${title}`,
        title,
        meta: '',
      })),
    },
  ]
}

/** 整理结果并入已有项：对得上部位/项目则加图，空字段才填草稿，未用到的图留在待整理。 */
function applyOrganizeGroups({
  pendingImages = [],
  findings = [],
  groups = [],
  mode = 'inspection',
  quoteNames = [],
} = {}) {
  const pending = normalizePendingImages(pendingImages)
  const byKey = {}
  pending.forEach((img) => {
    byKey[mediaKey(img.url)] = img
  })
  const used = new Set()
  const nextFindings = (findings || []).map((row) =>
    mode === 'work' ? normalizeWorkFinding(row) : normalizeItemFinding(row),
  )
  const stamped =
    mode === 'work' ? stampWorkQuoteMatch(groups, quoteNames) : groups
  const prepared = (stamped || []).map((group) => {
    const partName = String((group && group.partName) || '').trim()
    const keys = Array.isArray(group && group.imageSlots) && group.imageSlots.length
      ? group.imageSlots
      : Array.isArray(group && group.imageKeys)
        ? group.imageKeys
        : []
    const shots = []
    keys.forEach((rawKey) => {
      const img = matchPendingImage(pending, byKey, rawKey)
      if (!img) return
      const imgKey = mediaKey(img.url)
      if (!imgKey || used.has(imgKey)) return
      shots.push(img)
    })
    return { group, partName, shots }
  })
  prepared.forEach(({ group, partName, shots }) => {
    if (!shots.length || !partName) return
    const suggestedResult = isValidFindingResult(String((group && group.result) || '').trim())
      ? String(group.result).trim()
      : ''
    const suggestedAdvice = stripFigureIndexTalk(group && group.advice)
    const fresh = []
    if (mode === 'inspection') {
      // 检测：已挂在项上的图只可提醒/补空字段，禁止因多组建议静默拆成多项
      shots.forEach((img) => {
        const imgKey = mediaKey(img.url)
        if (!imgKey || used.has(imgKey)) return
        const ownerIdx = nextFindings.findIndex((row) =>
          (row.images || []).some((im) => mediaKey(im && im.url) === imgKey),
        )
        if (ownerIdx < 0) {
          fresh.push(img)
          return
        }
        used.add(imgKey)
        const owner = nextFindings[ownerIdx]
        const ownerPart = String(owner.partName || '').trim()
        const ownerAdvice = String(owner.advice || '').trim()
        const samePart = !ownerPart || ownerPart === partName
        const remind = inspectionRemindFromLook(owner, samePart ? suggestedResult : '', ownerPart ? partName : '')
        nextFindings[ownerIdx] = normalizeItemFinding({
          ...owner,
          partName: ownerPart || partName,
          result: samePart ? owner.result || suggestedResult : owner.result,
          advice: samePart ? ownerAdvice || suggestedAdvice : owner.advice,
          ...remind,
        })
      })
    } else {
      shots.forEach((img) => fresh.push(img))
    }
    if (!fresh.length) return
    fresh.forEach((img) => used.add(mediaKey(img.url)))
    const hostIdx = partName
      ? nextFindings.findIndex((row) => String(row.partName || '').trim() === partName)
      : -1
    if (hostIdx >= 0) {
      const host = nextFindings[hostIdx]
      const cap = mode === 'work' ? WORK_IMAGES_MAX : FINDING_IMAGES_MAX
      const images = capImages((host.images || []).concat(fresh), cap)
      if (mode === 'work') {
        nextFindings[hostIdx] = normalizeWorkFinding({
          ...host,
          images,
          partName: host.partName || partName,
          material:
            host.material ||
            stripFigureIndexTalk(group && (group.material || group.caption)),
          caption:
            host.caption ||
            stripFigureIndexTalk(group && (group.observation || '')),
          outsideQuote: Boolean(group && group.outsideQuote),
        })
      } else {
        const remind = inspectionRemindFromLook(host, suggestedResult, '')
        nextFindings[hostIdx] = normalizeItemFinding({
          ...host,
          images,
          partName: host.partName || partName,
          result: host.result || suggestedResult,
          advice: host.advice || suggestedAdvice,
          ...remind,
        })
      }
      return
    }
    if (mode === 'work') {
      nextFindings.push(
        normalizeWorkFinding({
          partName,
          material: stripFigureIndexTalk(group && (group.material || group.caption)),
          caption: stripFigureIndexTalk(group && (group.observation || '')),
          images: fresh.slice(0, WORK_IMAGES_MAX),
          outsideQuote: Boolean(group && group.outsideQuote),
        }),
      )
      return
    }
    nextFindings.push(
      normalizeItemFinding({
        partName,
        result: suggestedResult,
        advice: suggestedAdvice,
        images: capImages(fresh, FINDING_IMAGES_MAX),
      }),
    )
  })
  return {
    findings: mode === 'work' ? nextFindings : mergeFindingsByPart(nextFindings),
    pendingImages: pending
      .filter((img) => !used.has(mediaKey(img.url)))
      .map((img) => ({
        ...img,
        skipReason: '请手工归到对应项',
      })),
  }
}

function resolveIntakeCategory(raw = {}) {
  const id = String((raw && (raw.category || raw.id)) || '').trim()
  const part = String((raw && (raw.partName || raw.label || raw.caption)) || '').trim()
  return (
    INTAKE_RECORD_CATEGORIES.find((row) => row.id === id) ||
    INTAKE_RECORD_CATEGORIES.find((row) => row.label === part) ||
    null
  )
}

function normalizeIntakeResult(raw = {}) {
  const meta = resolveIntakeCategory(raw)
  const category = meta || INTAKE_RECORD_CATEGORIES[2]
  return {
    category: category.id,
    label: category.label,
    needsVerify: Boolean(category.needsVerify),
    unit: category.unit || '',
    reading: String((raw && raw.reading) || '').trim(),
    images: normalizePendingImages((raw && raw.images) || (raw && raw.shots) || []),
  }
}

function applyIntakeOrganizeGroups({
  pendingImages = [],
  groups = [],
  prevResults = [],
} = {}) {
  const pending = normalizePendingImages(pendingImages)
  const byKey = {}
  pending.forEach((img) => {
    byKey[mediaKey(img.url)] = img
  })
  const used = new Set()
  const byCat = {}
  INTAKE_RECORD_CATEGORIES.forEach((meta) => {
    const prev = (prevResults || []).find((row) => row && row.category === meta.id) || {}
    byCat[meta.id] = normalizeIntakeResult({
      category: meta.id,
      reading: prev.reading,
      images: prev.images,
    })
  })
  ;(groups || []).forEach((group) => {
    const meta = resolveIntakeCategory(group)
    if (!meta) return
    const shots = []
    const keys = Array.isArray(group.imageSlots) && group.imageSlots.length
      ? group.imageSlots
      : Array.isArray(group.imageKeys)
        ? group.imageKeys
        : []
    keys.forEach((rawKey) => {
      const img = matchPendingImage(pending, byKey, rawKey)
      if (!img) return
      const imgKey = mediaKey(img.url)
      if (!imgKey || used.has(imgKey)) return
      used.add(imgKey)
      shots.push(img)
    })
    const host = byCat[meta.id]
    byCat[meta.id] = normalizeIntakeResult({
      category: meta.id,
      reading: host.needsVerify
        ? host.reading || String((group && group.reading) || '').trim()
        : '',
      images: (host.images || []).concat(shots),
    })
  })
  const leftover = pending.filter((img) => !used.has(mediaKey(img.url)))
  const intakeResults = INTAKE_RECORD_CATEGORIES.map((meta) => byCat[meta.id]).filter(
    (row) => (row.images && row.images.length) || row.reading,
  )
  const odo = byCat.odometer || {}
  const fuel = byCat.fuel || {}
  const odoShot = (odo.images && odo.images[0]) || null
  return {
    intakeResults,
    pendingImages: leftover,
    mileageKm: parseMileageKm(odo.reading),
    fuelReading: String(fuel.reading || '').trim(),
    odometerUrl: odoShot ? odoShot.url : '',
    odometerImageId: odoShot ? odoShot.imageId || '' : '',
  }
}

/** 检测发现项以草稿里的一项为准。相册散图只补尚未挂上的照片，不重拼、不丢掉已有结果。 */
function mapFindingRows(images = [], draftFindings = [], options = {}) {
  if (options && options.mode === 'work') {
    return mapWorkFindingRows(images, draftFindings, options)
  }
  const assigned = []
  ;(draftFindings || []).forEach((raw, index) => {
    const draft = normalizeItemFinding(raw, index)
    if (!draft.partName && !draft.advice && !draft.result && !draft.images.length && !draft.id) return
    assigned.push(draft)
  })
  const merged = mergeFindingsByPart(assigned)
  if (options && options.strictFindings) return merged
  const owned = new Set()
  merged.forEach((item) => {
    findingImageKeys(item).forEach((key) => owned.add(key))
  })
  const pendingKeys = new Set(
    ((options && options.pendingKeys) || []).map((value) => mediaKey(value)).filter(Boolean),
  )
  const rows = mapPhotoRows(omitOdometerImages(images, options && options.odometerUrl))
  rows.forEach((row) => {
    const key = mediaKey(row.url)
    if (!key || owned.has(key) || pendingKeys.has(key)) return
    const part = String(row.caption || '').trim()
    if (!part) return
    const shot = { url: row.url, imageId: row.imageId || '' }
    const host = part
      ? merged.find((item) => String(item.partName || '').trim() === part)
      : null
    if (host) {
      const nextImages = capImages(host.images.concat([shot]), FINDING_IMAGES_MAX)
      Object.assign(
        host,
        normalizeItemFinding({
          ...host,
          images: nextImages,
          url: nextImages[0].url,
          imageId: nextImages[0].imageId,
        }),
      )
      owned.add(key)
      return
    }
    merged.push(normalizeItemFinding({
      url: row.url,
      imageId: row.imageId || '',
      caption: part,
      partName: part,
      images: [shot],
    }))
    owned.add(key)
  })
  return mergeFindingsByPart(merged)
}

function collectInspectionReportGaps(payload = {}) {
  const gaps = []
  if (!String(payload.chiefComplaint || '').trim()) {
    gaps.push('请先在接车填写车主诉求')
  }
  const findings = Array.isArray(payload.findings) ? payload.findings : []
  if (!findings.length) {
    gaps.push('请写出检查内容')
    return gaps
  }
  findings.forEach((raw) => {
    const item = normalizeFinding(raw)
    if (!item.partName && !item.images.length && !item.url) return
    const label = item.partName || '未写部位'
    if (!item.partName) gaps.push(`「${label}」请填写检查部位`)
    if (!item.result || !isValidFindingResult(item.result)) {
      gaps.push(`「${label}」请选择检查结果`)
    } else if (findingAdviceRequired(item.result) && !item.advice) {
      gaps.push(`「${label}」请填写检查发现`)
    }
  })
  return gaps
}

/**
 * 施工过程 = 唯一留证节点：每个施工项至少 1 张图 + 项目名。
 * 完成后照片锁定，交车节点不再补拍，因此门槛放在这里。
 */
function collectWorkPhotoDraftGaps(payload = {}) {
  const gaps = []
  const findings = Array.isArray(payload.findings) ? payload.findings : []
  const rows = findings.filter(
    (raw) =>
      workFindingHasPhoto(raw) ||
      String((raw && (raw.partName || raw.caption)) || '').trim(),
  )
  if (!rows.length) {
    gaps.push('请先添加工单项目，并至少上传 1 张施工照片')
    return gaps
  }
  rows.forEach((raw) => {
    const item = normalizeWorkFinding(raw)
    const label = item.partName || '未写项目'
    if (!item.partName) {
      gaps.push(`「${label}」请填写项目`)
    } else if (!item.images.length) {
      gaps.push(`「${label}」请补 1 张施工照片（过程 / 新旧对比 / 完工效果至少一张）`)
    }
    // 施工说明是托管文案与交车报告的唯一人工描述，空说明不得完成施工
    if (!String(item.caption || '').trim()) {
      gaps.push(`「${label}」请填写施工说明（做了什么、怎么做的、结果如何）`)
    }
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
  const accItems = resolveAcceptanceItems(payload)
  const workRows = accItems.filter((item) => item.kind !== ACCEPTANCE_KIND.EXTERIOR)
  // 外观照选填（2026-11-11）：缺图不再硬拦交车，由前端弹确认并在 payload 记 exteriorPhotoWaived 留痕。
  if (!workRows.length) {
    gaps.push('还没有施工项目：请先在施工节点完成施工项，再回来确认交付')
  }
  const period = String(payload.warrantyPeriod || '').trim()
  if (!period) {
    gaps.push('请填写质保期限')
  } else if (isVagueWarrantyPeriod(period)) {
    gaps.push('质保期限请写清时长或里程，勿填「以门店公示为准」')
  }
  if (!String(payload.delivererName || '').trim()) {
    gaps.push('请填写交付人')
  }
  const deliveredAt = String(payload.deliveredAt || '').trim()
  if (!deliveredAt) {
    gaps.push('请填写交车时间')
  } else if (Number.isNaN(Date.parse(deliveredAt.replace(' ', 'T')))) {
    // iOS JSCore 不认 "YYYY-MM-DD HH:mm"，替换空格再判断
    gaps.push('交车时间格式不对，请重新选择')
  }
  if (!parseMileageKm(payload.deliveryMileage)) {
    gaps.push('请填写交车里程')
  }
  // 交付确认不再逐行选结果；只拦截已确认「需返工」但未处理的行
  accItems.forEach((item) => {
    if (item.unbuiltReason) return
    if (item.result === ACCEPTANCE_RESULT.REWORK) {
      gaps.push(`「${item.name}」需返工，处理完重验后才能交车`)
    }
  })
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
  // 定稿真源：检测节点草稿 findings（项对象 + 挂图）。不再从旧阶段散图拼项。
  void albumNodes
  const draftFindings =
    Array.isArray(findingsInput) && findingsInput.length
      ? findingsInput
      : Array.isArray(photoDraft.findings)
        ? photoDraft.findings
        : []
  const findings = mapFindingRows([], draftFindings, {
    odometerUrl: photoDraft.odometerUrl,
    strictFindings: true,
  })
  return {
    vehicleBrand: String(photoDraft.vehicleBrand || vehicle.brand || ''),
    vehicleSeries: String(photoDraft.vehicleSeries || vehicle.series || ''),
    vehicleYear: String(
      photoDraft.vehicleYear || vehicle.modelYear || vehicle.year || '',
    ),
    mileageText:
      formatMileageText(vehicle.mileage || vehicle.mileageKm) ||
      formatMileageText(photoDraft.mileageKm),
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

function hashKey(text = '') {
  const s = String(text || '')
  let h = 5381
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

/**
 * 方案行 / 工单项稳定 id（26_ §4.3）
 * 优先保留已有 id；其次按内容指纹；最后按下标。前两者缺失即存量，生成后由写入路径持久化。
 */
function stableLineId(raw = {}, index = -1) {
  const own = String((raw && (raw.id || raw.lineId)) || '').trim()
  if (own) return own
  const blob = [
    String((raw && raw.name) || '').trim(),
    String((raw && raw.brand) || '').trim(),
    raw && raw.amount != null ? String(raw.amount) : '',
    String((raw && raw.note) || '').trim(),
  ]
    .filter(Boolean)
    .join('|')
  if (blob) return `ql_${hashKey(blob)}`
  return index >= 0 ? `ql_i${index}` : ''
}

function normalizeQuoteLine(raw = {}, index = -1) {
  const amount = parseAmount(raw.amount != null ? raw.amount : raw.priceHint)
  const evidenceUrls = listQuoteLineEvidenceUrls(raw)
  return remapLegacyQuoteLineLayout({
    id: stableLineId(raw, index),
    workFindingId: String((raw && raw.workFindingId) || '').trim(),
    name: String(raw.name || '').trim(),
    brand: String(raw.brand || '').trim(),
    amount: amount == null ? '' : amount,
    note: String(raw.note || ''),
    evidenceUrl: evidenceUrls[0] || '',
    evidenceUrls,
  })
}

function workFindingAddonNote(row = {}) {
  return [row.caption, row.material]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' · ')
}

function collectOutsideWorkFindings(findings = []) {
  return (findings || [])
    .map((raw, index) => normalizeWorkFinding(raw, index))
    .filter((row) => row && row.outsideQuote && (row.partName || (row.images && row.images.length)))
}

/** 工单里所有「报价没有这项」合成一张增项草稿。图跟项 id 走，不按下标对。 */
function buildAddonDraftFromWorkFindings(findings = []) {
  const rows = collectOutsideWorkFindings(findings)
  if (!rows.length) {
    return {
      seeded: false,
      lines: [{ name: '', brand: '', amount: '', note: '', evidenceUrl: '', evidenceUrls: [], workFindingId: '' }],
      discovery: { images: [], note: '', ready: false },
    }
  }
  const lines = rows.map((row, index) => {
    const evidenceUrls = (row.images || []).map((img) => String((img && img.url) || '').trim()).filter(Boolean)
    return normalizeQuoteLine(
      {
        id: row.id ? `ql_work_${row.id}` : '',
        workFindingId: row.id,
        name: row.partName,
        brand: row.brand,
        amount: '',
        note: workFindingAddonNote(row),
        evidenceUrls,
      },
      index,
    )
  })
  const images = []
  const seen = {}
  rows.forEach((row) => {
    ;(row.images || []).forEach((img) => {
      const url = String((img && img.url) || '').trim()
      if (!url || seen[url]) return
      seen[url] = true
      images.push(url)
    })
  })
  const note = rows
    .map((row) => {
      const name = row.partName || '未填项目'
      const detail = workFindingAddonNote(row)
      return detail ? `${name}：${detail}` : name
    })
    .join('\n')
  return {
    seeded: true,
    lines,
    discovery: {
      images,
      note,
      ready: Boolean(images.length && String(note || '').trim()),
    },
  }
}

function addonDraftStillBlank(payload = {}) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const hasNamed = lines.some((row) => String((row && row.name) || '').trim())
  const discovery = payload.discovery && typeof payload.discovery === 'object' ? payload.discovery : {}
  const discoveryReady = Boolean(
    discovery.ready &&
      (Array.isArray(discovery.images) ? discovery.images.filter(Boolean).length : 0) &&
      String(discovery.note || '').trim(),
  )
  return !hasNamed && !discoveryReady
}

function collectQuoteConfirmGaps(payload = {}, options = {}) {
  const gaps = []
  const requireEvidence = Boolean(options.requireEvidence)
  const requireDiscovery = Boolean(options.requireDiscovery)
  if (requireDiscovery) {
    const discovery = payload.discovery && typeof payload.discovery === 'object' ? payload.discovery : {}
    const images = Array.isArray(discovery.images) ? discovery.images.filter(Boolean) : []
    if (!images.length) gaps.push('请上传照片')
    if (!String(discovery.note || '').trim()) gaps.push('请写备注')
  }
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

/**
 * 验收项（acceptanceItems · 2026-11-10 二次收敛定稿）：一项自包含
 * { id, kind: 'work'|'exterior', name, images[], result, note }
 * 只有图片 / 结果 / 验收描述；kind=exterior 为「外观」行，固定排在清单最后一行。
 */
function normalizeAcceptanceItemObj(raw, index) {
  const obj = raw && typeof raw === 'object' ? raw : {}
  const isExterior = obj.kind === ACCEPTANCE_KIND.EXTERIOR
  const name = String(obj.name || (isExterior ? ACCEPTANCE_EXTERIOR_NAME : ''))
    .trim()
    .slice(0, 60)
  if (!name) return null
  const maxImages = isExterior ? ACCEPTANCE_EXTERIOR_MAX : ACCEPTANCE_ITEM_MAX_IMAGES
  return {
    id: isExterior
      ? ACCEPTANCE_EXTERIOR_ID
      : String(obj.id || '').trim() || `acc_${index + 1}`,
    kind: isExterior ? ACCEPTANCE_KIND.EXTERIOR : ACCEPTANCE_KIND.WORK,
    name,
    images: normalizePendingImages(obj.images).slice(0, maxImages),
    result: isValidAcceptanceResult(obj.result) ? obj.result : '',
    note: String(obj.note || '').trim().slice(0, 300),
    // 未施工交代（施工节点写入）：交车行只读展示，不要求选结果
    unbuiltReason: !isExterior && isValidUnbuiltReason(obj.unbuiltReason) ? obj.unbuiltReason : '',
    unbuiltNote: isExterior ? '' : String(obj.unbuiltNote || '').trim().slice(0, 200),
  }
}

/** 归一化并按「施工项目在前、外观最后一行」排序；id 去重（外观只留一条） */
function normalizeAcceptanceItems(list) {
  if (!Array.isArray(list)) return []
  const seen = {}
  const rows = []
  list.forEach((row, index) => {
    const item = normalizeAcceptanceItemObj(row, index)
    if (!item) return
    if (seen[item.id]) return
    seen[item.id] = true
    rows.push(item)
  })
  // 稳定排序：外观看作 1，施工项 0；保持各自原有顺序
  rows.sort(
    (a, b) =>
      (a.kind === ACCEPTANCE_KIND.EXTERIOR ? 1 : 0) - (b.kind === ACCEPTANCE_KIND.EXTERIOR ? 1 : 0),
  )
  return rows.slice(0, 20)
}

/** 内容袋读侧：只认 acceptanceItems（旧结构由迁移脚本搬完，读侧不做兼容） */
function resolveAcceptanceItems(raw = {}) {
  return normalizeAcceptanceItems(raw.acceptanceItems)
}

/**
 * 交车清单的「行」= 本单施工项目 ∪ 报价行（首次报价 + 历次补充报价），按行名去重（2026-11-13 收敛）。
 * 规则生成、不经过大模型：已填的图 / 结果 / 描述按**行名**回填；施工项的图按行名自动带进验收行，
 * 报价有但没施工的行也建行（等商家补图后 AI 再判断证据是否充分）。
 * 旧结构里没有逐项信息（例如首轮迁移压成的一行「整体验收」）不参与配对，
 * 只有本单确实没有施工项也没有报价行时才保留旧行，避免清单空白。
 */
function buildAcceptanceRowsFromWorkItems(workItems = [], savedRows = [], quoteLines = [], unbuiltItems = []) {
  const saved = normalizeAcceptanceItems(savedRows)
  const exterior = saved.find((row) => row.kind === ACCEPTANCE_KIND.EXTERIOR)
  const savedWork = saved.filter((row) => row.kind === ACCEPTANCE_KIND.WORK)
  const byName = {}
  savedWork.forEach((row) => {
    if (!byName[row.name]) byName[row.name] = row
  })
  // 施工节点已交代的未施工报价项：行上带原因，交车只读
  const accounted = unbuiltQuoteIndex(unbuiltItems)
  const accountedOf = (name) => accounted.byName.get(normalizeItemName(name)) || null
  const rows = []
  const seen = {}
  const pushRow = (rawName, images = [], accountedRow = null) => {
    const name = String(rawName || '').trim().slice(0, 60)
    if (!name || seen[name] || rows.length >= 19) return
    seen[name] = true
    const hit = byName[name]
    const unbuilt = hit && hit.unbuiltReason ? hit : accountedRow
    rows.push(
      emptyAcceptanceItem({
        id: hit ? hit.id : `acc_${rows.length + 1}`,
        name,
        images:
          hit && Array.isArray(hit.images) && hit.images.length
            ? hit.images
            : normalizePendingImages(images),
        result: hit ? hit.result : '',
        note: hit ? hit.note : '',
        unbuiltReason: unbuilt ? unbuilt.unbuiltReason || unbuilt.reason : '',
        unbuiltNote: unbuilt ? unbuilt.unbuiltNote || unbuilt.note : '',
      }),
    )
  }
  ;(Array.isArray(workItems) ? workItems : []).forEach((item) => {
    pushRow(item && item.name, (item && item.images) || [])
  })
  ;(Array.isArray(quoteLines) ? quoteLines : []).forEach((line) => {
    pushRow(line && line.name, [], accountedOf(line && line.name))
  })
  const exteriorRow = emptyAcceptanceItem({
    kind: ACCEPTANCE_KIND.EXTERIOR,
    images: exterior ? exterior.images : [],
    result: exterior ? exterior.result : '',
    note: exterior ? exterior.note : '',
  })
  if (!rows.length) return withExteriorAcceptanceRow(savedWork.concat([exteriorRow]))
  return rows.concat([exteriorRow])
}

/** 编辑/保存/校验用：保证清单里有一条「外观」行，且排最后一行（展示层不调用） */
function withExteriorAcceptanceRow(rows) {
  const list = normalizeAcceptanceItems(rows)
  if (list.some((row) => row.kind === ACCEPTANCE_KIND.EXTERIOR)) return list
  return list.concat([emptyAcceptanceItem({ kind: ACCEPTANCE_KIND.EXTERIOR })])
}

/** 读侧兼容：旧 `deliveryPhotos` 并入「外观」行（新写入不再产生旧字段） */
function foldLegacyDeliveryPhotos(rows, legacyPhotos) {
  const list = normalizeAcceptanceItems(rows)
  const photos = normalizeDeliveryPhotos(legacyPhotos)
  if (!photos.length) return list
  const idx = list.findIndex((row) => row.kind === ACCEPTANCE_KIND.EXTERIOR)
  if (idx < 0) {
    return list.concat([emptyAcceptanceItem({ kind: ACCEPTANCE_KIND.EXTERIOR, images: photos })])
  }
  if (list[idx].images && list[idx].images.length) return list
  const next = list.slice()
  next[idx] = { ...list[idx], images: photos }
  return next
}

/** 存量外观照归一（只给 foldLegacyDeliveryPhotos 用）：1~3 张，首张为整车外观 */
function normalizeDeliveryPhotos(raw) {
  const list = Array.isArray(raw) ? raw : []
  const seen = {}
  const rows = []
  list.forEach((row) => {
    const url = String(
      (row && typeof row === 'object' ? row.url || row.rawUrl || row.src : row) || '',
    ).trim()
    if (!url || seen[url]) return
    seen[url] = true
    rows.push({ url })
  })
  return rows.slice(0, ACCEPTANCE_EXTERIOR_MAX)
}

function buildRepairReportPayload({
  chiefComplaint = '',
  workItems = [],
  deliveryImages = [],
  warranty = {},
  photoDraft = {},
  confirmCopy = '',
  totalAmount = null,
  revision = 0,
  unbuiltItems = [],
  intakeMileageText = '',
} = {}) {
  const period = String(warranty.period || photoDraft.warrantyPeriod || '').trim()
  const notes = resolveWarrantyNotes({
    warrantyNotes: warranty.notes || photoDraft.warrantyNotes,
    warrantyScope: warranty.scope || photoDraft.warrantyScope,
    warrantyExclusions: warranty.exclusions || photoDraft.warrantyExclusions,
  })
  const items = (workItems || []).map((item) => {
    const images = []
    const seen = {}
    const push = (raw) => {
      const url = String(
        typeof raw === 'object' && raw ? raw.url || raw.src || '' : raw || '',
      ).trim()
      if (!url || seen[url]) return
      seen[url] = true
      const imageId =
        typeof raw === 'object' && raw ? String(raw.imageId || raw.id || '').trim() : ''
      images.push(imageId ? { url, imageId } : { url })
    }
    ;(Array.isArray(item.images) ? item.images : []).forEach(push)
    if (!images.length && item.url) push(item)
    return {
      name: String(item.name || '').trim(),
      brand: String(item.brand || '').trim(),
      material: String(item.material || '').trim(),
      qty: String(item.qty || '').trim(),
      amount: parseAmount(item.amount) == null ? 0 : parseAmount(item.amount),
      note: String(item.note || '').trim(),
      // 返工重新施工的记录如实保留，报告上标「返工」
      rework: Boolean(item.rework),
      images,
    }
  })
  const computedTotal =
    totalAmount != null
      ? parseAmount(totalAmount)
      : items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
  // 交车报告里程：交车里程单独成文，不再回退接车里程
  const deliveryMileageKm = Number(parseMileageKm(photoDraft.deliveryMileage)) || 0
  const mileageText =
    deliveryMileageKm > 0
      ? `交车里程 ${deliveryMileageKm.toLocaleString('zh-CN')} km`
      : ''

  void deliveryImages

  return {
    chiefComplaint: String(chiefComplaint || '').trim(),
    workItems: items,
    totalAmount: computedTotal == null ? 0 : computedTotal,
    mileageText,
    intakeMileageText: String(intakeMileageText || '').trim(),
    warrantyPeriod: period,
    warrantyNotes: notes,
    // 兼容旧读侧：不再写入空话默认；存量字段置空
    warrantyScope: '',
    warrantyExclusions: '',
    delivererName: String(photoDraft.delivererName || '').trim(),
    // 交付确认信息（2026-11-13）：交车时间、交付里程、返工记录、未施工交代
    deliveredAt: String(photoDraft.deliveredAt || '').trim(),
    deliveryMileage: parseMileageKm(photoDraft.deliveryMileage),
    reworkRecords: normalizeReworkRecords(photoDraft.reworkRecords),
    unbuiltQuoteItems: normalizeUnbuiltQuoteItems(unbuiltItems),
    revision: Number.isFinite(Number(revision)) ? Math.max(0, Math.round(Number(revision))) : 0,
    // 外观照豁免留痕透传：读侧（车主/公开页）据此标注「商家未留外观照」
    exteriorPhotoWaived: photoDraft.exteriorPhotoWaived === true,
    finishedAt: String(photoDraft.finishedAt || '').trim(),
    confirmCopy:
      String(confirmCopy || photoDraft.confirmCopy || '').trim() ||
      '本人确认上述施工与交车状态，并知悉质保条款。',
  }
}

function looksLikeWorkFinding(raw = {}) {
  if (!raw || typeof raw !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(raw, 'outsideQuote')) return true
  if (String(raw.material || '').trim()) return true
  if (String(raw.brand || '').trim()) return true
  if (String(raw.quoteLineId || '').trim()) return true
  if (String(raw.qty || '').trim()) return true
  if (raw.amount != null && raw.amount !== '') return true
  return false
}

function normalizeDraftFinding(raw = {}, index = -1) {
  return looksLikeWorkFinding(raw)
    ? normalizeWorkFinding(raw, index)
    : normalizeItemFinding(raw, index)
}

function findingDraftKeeps(row = {}) {
  return Boolean(
    row.url ||
      row.partName ||
      row.advice ||
      row.result ||
      row.caption ||
      (row.images && row.images.length) ||
      row.id,
  )
}


/** 合并过程步内容：仅覆盖显式传入的字段 */
function mergeContentDraftStub() { /* 占位，将在下一步删除 */ }

function shotsInOrganizeGroup(images, group) {
  const pending = normalizePendingImages(images)
  const byKey = {}
  pending.forEach((img) => {
    const key = mediaKey(img && img.url)
    if (key) byKey[key] = img
  })
  const keys =
    Array.isArray(group && group.imageSlots) && group.imageSlots.length
      ? group.imageSlots
      : Array.isArray(group && group.imageKeys)
        ? group.imageKeys
        : []
  const shots = []
  const seen = new Set()
  const push = (img) => {
    if (!img) return
    const key = mediaKey(img.url)
    if (!key || seen.has(key)) return
    seen.add(key)
    shots.push(img)
  }
  keys.forEach((raw) => {
    push(matchPendingImage(pending, byKey, raw))
  })
  normalizePendingImages(group && group.images).forEach((img) => {
    push(matchPendingImage(pending, byKey, img.url) || img)
  })
  return shots
}

/** 拆分建议里的图对回当前项上的现图（签名参数可变，按图片身份对）。 */
function hydrateInspectionSplitGroups(finding, groups) {
  const pool = normalizePendingImages((finding && finding.images) || [])
  return (Array.isArray(groups) ? groups : [])
    .map((group) => {
      const partName = String((group && group.partName) || '').trim()
      if (!partName) return null
      const shots = shotsInOrganizeGroup(pool, group)
      return {
        partName,
        result: String((group && group.result) || '').trim(),
        advice: String((group && group.advice) || '').trim(),
        images: shots.length ? shots : normalizePendingImages(group && group.images),
      }
    })
    .filter(Boolean)
}

/** 检测：AI 只挂建议。一批图对一项时补空字段；对不上时建议拆开。不改原项。 */
function inspectionSuggestions(findings, groups) {
  return (findings || []).map((raw) => {
    const row = normalizeItemFinding(raw)
    const images = row.images || []
    if (!images.length) return { ...row, aiApply: null }
    const hit = []
    ;(groups || []).forEach((group) => {
      const partName = String((group && group.partName) || '').trim()
      if (!partName) return
      const shots = shotsInOrganizeGroup(images, group)
      if (!shots.length) return
      const result = isValidFindingResult(String((group && group.result) || '').trim())
        ? String(group.result).trim()
        : ''
      hit.push({
        partName,
        result,
        advice: stripFigureIndexTalk(group && group.advice),
        images: shots,
      })
    })
    if (!hit.length) return { ...row, aiApply: null }
    if (hit.length === 1) {
      const one = hit[0]
      const partDiff = Boolean(row.partName && one.partName && row.partName !== one.partName)
      const empty = !row.partName || !row.result || !row.advice
      if (!partDiff && !empty) return { ...row, aiApply: null }
      const bits = [one.partName, one.result].filter(Boolean).join(' · ')
      const body = partDiff
        ? `这批图更像是「${one.partName}」`
        : one.advice
          ? `写成「${bits}」。${one.advice}`
          : `写成「${bits}」`
      return {
        ...row,
        aiApply: {
          id: `apply_${row.id}`,
          kind: 'fill',
          onlyEmpty: !partDiff,
          body,
          partName: one.partName,
          result: one.result,
          advice: one.advice,
        },
      }
    }
    const names = hit.map((item) => item.partName).filter(Boolean)
    return {
      ...row,
      aiApply: {
        id: `apply_${row.id}`,
        kind: 'split',
        body: `可以拆成${names.map((name) => `「${name}」`).join('')}`,
        groups: hit,
      },
    }
  })
}

function applyInspectionSuggestion(findings, applyId) {
  const list = Array.isArray(findings) ? findings : []
  const idx = list.findIndex((row) => row && row.aiApply && row.aiApply.id === applyId)
  if (idx < 0) return list.map((row) => normalizeItemFinding(row))
  const row = normalizeItemFinding(list[idx])
  const proposal = row.aiApply
  if (proposal.kind === 'split' && Array.isArray(proposal.groups) && proposal.groups.length) {
    const used = new Set()
    const splitGroups = hydrateInspectionSplitGroups(row, proposal.groups)
    const created = (splitGroups.length ? splitGroups : proposal.groups).map((group, index) => {
      const shots = normalizePendingImages(group.images)
      shots.forEach((img) => {
        const key = mediaKey(img.url)
        if (key) used.add(key)
      })
      return normalizeItemFinding({
        id: `${row.id}_s${index}`,
        partName: group.partName,
        result: group.result,
        advice: group.advice,
        images: shots,
        aiApply: null,
      })
    })
    const rest = (row.images || []).filter((img) => !used.has(mediaKey(img && img.url)))
    if (rest.length) {
      created.push(
        normalizeItemFinding({
          ...row,
          id: `${row.id}_rest`,
          images: rest,
          aiApply: null,
        }),
      )
    }
    return list
      .slice(0, idx)
      .concat(created)
      .concat(list.slice(idx + 1))
      .map((item) => normalizeItemFinding(item))
  }
  const onlyEmpty = proposal.onlyEmpty !== false
  const next = normalizeItemFinding({
    ...row,
    partName: onlyEmpty ? row.partName || proposal.partName : proposal.partName || row.partName,
    result: onlyEmpty ? row.result || proposal.result : proposal.result || row.result,
    advice: onlyEmpty ? row.advice || proposal.advice : proposal.advice || row.advice,
    aiApply: null,
  })
  return list
    .slice(0, idx)
    .concat([next])
    .concat(list.slice(idx + 1))
    .map((item) => normalizeItemFinding(item))
}

/** 检测旧的未归组一堆，打开时收成一项。已经挂在项上的图不再收一次。 */
function foldInspectionPendingDraft(photoDraft = {}) {
  const pending = normalizePendingImages(photoDraft.pendingImages)
  const findings = Array.isArray(photoDraft.findings) ? photoDraft.findings.slice() : []
  if (!pending.length) return { ...photoDraft, findings, pendingImages: [] }
  const used = new Set()
  findings.forEach((row) => {
    normalizePendingImages(row && row.images).forEach((img) => {
      const key = mediaKey(img && img.url)
      if (key) used.add(key)
    })
  })
  const fresh = pending.filter((img) => {
    const key = mediaKey(img && img.url)
    return key && !used.has(key)
  })
  if (fresh.length) {
    findings.push(
      normalizeItemFinding({
        id: `fid_pile_${mediaKey(fresh[0].url).slice(0, 40)}`,
        partName: '',
        result: '',
        advice: '',
        images: fresh,
      }),
    )
  }
  return { ...photoDraft, findings, pendingImages: [] }
}

/**
 * 历次报价汇总：首报 + 所有未撤销的补充报价（可用 excludeNodeId 排除当前这张）。
 * 后续 AI（补充报价、工单核对、交车检查）判断「这项报过没有」都以这份汇总为准，
 * 避免第二次补充报价又把上一次已报的项目建议一遍。
 */
function collectQuotedLines(nodes = [], options = {}) {
  const excludeNodeId = String((options && options.excludeNodeId) || '')
  const list = (Array.isArray(nodes) ? nodes : [])
    .slice()
    .sort((a, b) => Number((a && a.sortOrder) || 0) - Number((b && b.sortOrder) || 0))
  return buildQuoteLedger(list).lines
    .filter((line) => !excludeNodeId || String(line.quoteNodeId || '') !== excludeNodeId)
    .map((line) => ({
      ...line,
      sourceNodeId: String(line.quoteNodeId || ''),
      source: line.isAddon ? 'addon' : 'first',
    }))
}

module.exports = {
  mapPhotoRows,
  mediaKey,
  mapFindingRows,
  mapWorkFindingRows,
  normalizeFinding,
  isOdometerFinding,
  pickOdometerSlot,
  stableFindingId,
  normalizeWorkFinding,
  normalizeWorkImage,
  workFindingHasPhoto,
  WORK_IMAGES_MAX,
  FINDING_IMAGES_MAX,
  capImages,
  collectInspectionReportGaps,
  collectDeliveryPhotoDraftGaps,
  collectWorkPhotoDraftGaps,
  collectQuoteConfirmGaps,
  buildInspectionReportPayload,
  buildQuoteLinesFromFindings,
  buildQuoteDraft,
  resolveQuoteConfirmCopy,
  stableLineId,
  buildRepairReportPayload,
  normalizeAcceptanceItems,
  normalizeDeliveryPhotos,
  resolveAcceptanceItems,
  withExteriorAcceptanceRow,
  buildAcceptanceRowsFromWorkItems,
  normalizeQuoteLine,
  buildAddonDraftFromWorkFindings,
  collectQuotedLines,
  addonDraftStillBlank,
  listQuoteLineEvidenceUrls,
  isQuoteEvidenceFinding,
  sumQuoteAmounts,
  parseMileageKm,
  stripFigureIndexTalk,
  parseOdometerMileageFromTexts,
  formatMileageText,

  looksLikeWorkFinding,

  normalizeNodeContent,
  mergeNodeContent,
  contentOfFlowNode,
  contentBagHasSubstance,

  envelopeOnlyDocument,

  normalizePendingImages,
  applyOrganizeGroups,
  inspectionSuggestions,
  applyInspectionSuggestion,
  foldInspectionPendingDraft,
  collectConfirmedQuoteNames,
  collectConfirmedQuoteLines,
  collectConfirmedQuoteLinesForWorkNode,
  buildQuoteLedger,
  seedWorkFindingsFromQuoteLines,
  normalizeItemName,
  resolvePresetItemName,
  normalizeUnbuiltQuoteItem,
  normalizeUnbuiltQuoteItems,
  collectUnbuiltQuoteItems,
  normalizeReworkRecord,
  normalizeReworkRecords,
  computeUnstartedQuoteItems,
  unmatchedCheckpoints,
  buildPriorOrganizeFacts,
  matchQuotePartName,
  stampWorkQuoteMatch,
  workOutsideQuoteOf,
  buildWorkAssignPickGroups,
  buildWorkAddPickGroups,
  applyIntakeOrganizeGroups,
  normalizeIntakeResult,
  parseAmount,
  stripFindingResultFromLineName,
  remapLegacyQuoteLineLayout,
  isVagueWarrantyPeriod,
  resolveWarrantyNotes,
}
