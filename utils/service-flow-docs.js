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

/** 给店员/车主看的说明里去掉「图1、图2」，只留部位和状态 */
function stripFigureIndexTalk(value) {
  let s = String(value || '')
  if (!s) return ''
  s = s.replace(/如(?:图\s*\d+\s*[、,，和及]?\s*)+所示/g, '')
  s = s.replace(/见(?:图\s*\d+\s*[、,，和及]?\s*)+/g, '')
  s = s.replace(/图\s*\d+(?:\s*[、,，和及]\s*图\s*\d+)*/g, '')
  s = s.replace(/第\s*\d+\s*张(?:图|照片)?/g, '')
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
  }
}

/** 落库的一项：照片数组、部位、检查结果、检查发现在一起。显式 images: [] 表示已删光。 */
function normalizeItemFinding(raw = {}, index = -1) {
  const hasImagesField = Array.isArray(raw.images)
  let images = hasImagesField
    ? raw.images.map((img) => normalizeWorkImage(img)).filter(Boolean)
    : collectFindingImages(raw)
  images = capImages(images, FINDING_IMAGES_MAX)
  const caption = stripFigureIndexTalk(raw.caption)
  const result = normalizeFindingResult(raw.result)
  let advice = stripFigureIndexTalk(raw.advice)
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
  const maskedUrl = String(
    (typeof raw === 'object' && raw && (raw.maskedUrl || raw.preMaskedUrl)) || '',
  ).trim()
  const imageId = String(
    (typeof raw === 'object' && raw && (raw.imageId || raw.id)) || '',
  ).trim()
  if (!maskedUrl) return { url, imageId }
  return {
    url,
    imageId,
    maskedUrl,
    preMaskedUrl: String((raw && raw.preMaskedUrl) || maskedUrl).trim() || maskedUrl,
  }
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
  const caption = stripFigureIndexTalk(raw.caption)
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
 * 节点唯一内容袋：content（兼容旧 photoDraft / 旧 document.payload 业务字段）。
 * 报告正文由此派生，禁止再当第二真源维护。
 */
function normalizeNodeContent(raw = {}) {
  const base = normalizePhotoDraft(raw || {})
  if (Array.isArray(raw.lines)) {
    base.lines = raw.lines.map((row) => normalizeQuoteLine(row)).filter((row) => row && row.name)
  }
  if (Array.isArray(raw.workItems)) {
    base.workItems = raw.workItems
      .map((row, index) => normalizeWorkFinding(row, index))
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
  if (raw.repairBrief != null && !base.repairBrief) {
    base.repairBrief = String(raw.repairBrief || '').trim().slice(0, 500)
  }
  return base
}

function mergeNodeContent(prev = {}, patch = {}) {
  const next = normalizeNodeContent(prev)
  if (!patch || typeof patch !== 'object') return next
  const mergedDraft = mergePhotoDraft(next, patch)
  Object.assign(next, mergedDraft)
  if (patch.lines != null) {
    next.lines = Array.isArray(patch.lines)
      ? patch.lines.map((row) => normalizeQuoteLine(row)).filter((row) => row && row.name)
      : []
  }
  if (patch.workItems != null) {
    next.workItems = Array.isArray(patch.workItems)
      ? patch.workItems
          .map((row, index) => normalizeWorkFinding(row, index))
          .filter((row) => row && (row.partName || (row.images && row.images.length)))
      : []
  }
  if (patch.photos != null) {
    next.photos = normalizePendingImages(patch.photos)
  }
  if (patch.discovery != null) {
    next.discovery = patch.discovery && typeof patch.discovery === 'object' ? patch.discovery : {}
  }
  if (patch.archiveCopy != null) {
    next.archiveCopy =
      patch.archiveCopy && typeof patch.archiveCopy === 'object' ? patch.archiveCopy : {}
  }
  return normalizeNodeContent(next)
}

function contentOfFlowNode(node) {
  if (!node || typeof node !== 'object') return normalizeNodeContent({})
  if (node.content && typeof node.content === 'object') {
    return normalizeNodeContent(node.content)
  }
  if (node.photoDraft && typeof node.photoDraft === 'object') {
    return normalizeNodeContent(node.photoDraft)
  }
  const doc = node.document && typeof node.document === 'object' ? node.document : null
  const payload = doc && doc.payload && typeof doc.payload === 'object' ? doc.payload : null
  if (payload) return normalizeNodeContent(payload)
  return normalizeNodeContent({})
}

/** @deprecated 使用 contentOfFlowNode；保留别名避免旧调用方断裂 */
function draftOfFlowNode(node) {
  return contentOfFlowNode(node)
}

/**
 * 存量节点：把 photoDraft / payload 业务字段收进 content，并去掉平行真源。
 * document 只留信封；payload 若仍在则改为 content 的浅引用投影（兼容旧读侧）。
 */
function migrateNodeToSingleContent(node) {
  if (!node || typeof node !== 'object') return node
  const doc = node.document && typeof node.document === 'object' ? { ...node.document } : null
  const payload = doc && doc.payload && typeof doc.payload === 'object' ? doc.payload : null
  const content = mergeNodeContent(
    mergeNodeContent(payload || {}, node.photoDraft || {}),
    node.content || {},
  )
  const next = { ...node, content }
  delete next.photoDraft
  if (doc) {
    // 信封保留；payload 投影自 content，不再独立演化
    next.document = {
      ...doc,
      payload: { ...content },
    }
  }
  return next
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
    const list = Array.isArray(payload.lines) ? payload.lines : []
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
        note: String((line && line.note) || '').trim(),
      })
    })
  })
  return lines
}

function seedWorkFindingsFromQuoteLines(findings = [], quoteLines = []) {
  const rows = (findings || []).map((row, index) => normalizeWorkFinding(row, index))
  if (rows.some((row) => String(row.partName || '').trim() || row.images.length || row.quoteLineId)) {
    return rows
  }
  return (quoteLines || [])
    .filter((line) => String((line && line.name) || '').trim())
    .map((line, index) =>
      normalizeWorkFinding(
        {
          id: `wf_${String(line.id || index)}`,
          partName: line.name,
          quoteLineId: line.id || '',
          caption: '',
          images: [],
        },
        index,
      ),
    )
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
  ;(flowNodes || []).forEach((node) => {
    const kind = String((node && node.kind) || '')
    if (kind !== 'quote_confirm' && kind !== 'addon_quote_confirm') return
    const doc = (node && node.document) || {}
    if (String(doc.status || '') !== 'confirmed') return
    const payload = doc.payload && typeof doc.payload === 'object' ? doc.payload : doc
    const lines = Array.isArray(payload.lines) ? payload.lines : []
    lines.forEach((line) => {
      const name = String((line && line.name) || '').trim()
      if (!name || seen.has(name)) return
      seen.add(name)
      names.push(name)
    })
  })
  return names
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

/** 施工过程：每项至少 1 张图 + 项目名；可选校验工单项目均已挂图 */
function collectWorkPhotoDraftGaps(payload = {}) {
  const gaps = []
  const findings = Array.isArray(payload.findings) ? payload.findings : []
  const withPhoto = findings.filter((raw) => workFindingHasPhoto(raw))
  if (!withPhoto.length) {
    gaps.push('请至少上传 1 张施工照片并填写项目')
  }
  withPhoto.forEach((raw) => {
    const item = normalizeWorkFinding(raw)
    const label = item.partName || '未写项目'
    if (!item.partName) gaps.push(`「${label}」请填写项目`)
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
    note: stripFigureIndexTalk(raw.note),
    evidenceUrl: evidenceUrls[0] || '',
    evidenceUrls,
  })
}

function workFindingAddonNote(row = {}) {
  return [row.caption, row.material]
    .map((part) => stripFigureIndexTalk(part))
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

function normalizeOwnerFaqs(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((row, index) => {
      if (!row || typeof row !== 'object') return null
      const question = String(row.question || row.q || '').trim()
      const answer = String(row.answer || row.a || '').trim()
      if (!question) return null
      return {
        id: String(row.id || `faq_${index + 1}`).trim() || `faq_${index + 1}`,
        question: question.slice(0, 80),
        answer: answer.slice(0, 280),
      }
    })
    .filter(Boolean)
    .slice(0, 5)
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
  const repairBrief = String(
    photoDraft.repairBrief || photoDraft.summary || '',
  ).trim().slice(0, 500)
  const ownerFaqs = normalizeOwnerFaqs(
    photoDraft.ownerFaqs || photoDraft.faq || [],
  )
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
      images,
    }
  })
  const computedTotal =
    totalAmount != null
      ? parseAmount(totalAmount)
      : items.reduce((s, it) => s + (Number(it.amount) || 0), 0)

  // 交车图只认本步草稿引用（外观 + 勾选）；deliveryImages 仅兼容存量空草稿
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
    repairBrief,
    ownerFaqs,
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
          .map((item, index) => {
            const row = normalizeDraftFinding(item, index)
            return findingDraftKeeps(row) ? row : null
          })
          .filter(Boolean)
      : [],
    pendingImages: normalizePendingImages(raw.pendingImages),
    fuelReading: String(raw.fuelReading || '').trim(),
    intakeResults: Array.isArray(raw.intakeResults)
      ? raw.intakeResults.map((row) => normalizeIntakeResult(row)).filter((row) => row.images.length || row.reading)
      : [],
    warrantyPeriod: String(raw.warrantyPeriod || '').trim(),
    warrantyNotes: resolveWarrantyNotes(raw),
    confirmCopy: String(raw.confirmCopy || '').trim(),
    selectedDeliveryUrls: Array.isArray(raw.selectedDeliveryUrls)
      ? raw.selectedDeliveryUrls
          .map((url) => {
            // 兼容误写成 { url, maskedUrl } 的写回；禁止 String(object)→[object Object]
            if (url && typeof url === 'object') {
              return String(url.url || url.rawUrl || url.src || '').trim()
            }
            return String(url || '').trim()
          })
          .filter(Boolean)
      : [],
    deliveryExteriorUrl: String(raw.deliveryExteriorUrl || '').trim(),
    repairBrief: String(raw.repairBrief || raw.summary || '').trim().slice(0, 500),
    ownerFaqs: normalizeOwnerFaqs(raw.ownerFaqs || raw.faq || []),
    reportGeneratedAt: String(raw.reportGeneratedAt || '').trim(),
    ownerSentAt: String(raw.ownerSentAt || '').trim(),
    inspectionAiKey: String(raw.inspectionAiKey || '').trim(),
    receiverName: String(raw.receiverName || '').trim(),
    receivedAt: String(raw.receivedAt || '').trim(),
    inspectorName: String(raw.inspectorName || '').trim(),
    inspectedAt: String(raw.inspectedAt || '').trim(),
    workerName: String(raw.workerName || '').trim(),
    delivererName: String(raw.delivererName || '').trim(),
    finishedAt: String(raw.finishedAt || '').trim(),
    recordVersions: Array.isArray(raw.recordVersions)
      ? raw.recordVersions
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
  if (patch.pendingImages != null) {
    next.pendingImages = normalizePendingImages(patch.pendingImages)
  }
  if (patch.fuelReading != null) next.fuelReading = String(patch.fuelReading || '').trim()
  if (patch.intakeResults != null) {
    next.intakeResults = normalizePhotoDraft({ intakeResults: patch.intakeResults }).intakeResults
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
  if (patch.repairBrief != null || patch.summary != null) {
    next.repairBrief = String(
      patch.repairBrief != null ? patch.repairBrief : patch.summary || '',
    )
      .trim()
      .slice(0, 500)
  }
  if (patch.ownerFaqs != null || patch.faq != null) {
    next.ownerFaqs = normalizeOwnerFaqs(
      patch.ownerFaqs != null ? patch.ownerFaqs : patch.faq,
    )
  }
  if (patch.reportGeneratedAt != null) {
    next.reportGeneratedAt = String(patch.reportGeneratedAt || '').trim()
  }
  if (patch.ownerSentAt != null) {
    next.ownerSentAt = String(patch.ownerSentAt || '').trim()
  }
  if (patch.inspectionAiKey != null) {
    next.inspectionAiKey = String(patch.inspectionAiKey || '').trim()
  }
  if (patch.receiverName != null) next.receiverName = String(patch.receiverName || '').trim()
  if (patch.receivedAt != null) next.receivedAt = String(patch.receivedAt || '').trim()
  if (patch.inspectorName != null) next.inspectorName = String(patch.inspectorName || '').trim()
  if (patch.inspectedAt != null) next.inspectedAt = String(patch.inspectedAt || '').trim()
  if (patch.workerName != null) next.workerName = String(patch.workerName || '').trim()
  if (patch.delivererName != null) next.delivererName = String(patch.delivererName || '').trim()
  if (patch.finishedAt != null) next.finishedAt = String(patch.finishedAt || '').trim()
  if (patch.recordVersions != null) {
    next.recordVersions = normalizePhotoDraft({ recordVersions: patch.recordVersions }).recordVersions
  }
  return next
}

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
  keys.forEach((raw) => {
    const img = matchPendingImage(pending, byKey, raw)
    if (!img) return
    const key = mediaKey(img.url)
    if (!key || seen.has(key)) return
    seen.add(key)
    shots.push(img)
  })
  return shots
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
    const created = proposal.groups.map((group, index) => {
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
  normalizeOwnerFaqs,
  normalizeQuoteLine,
  buildAddonDraftFromWorkFindings,
  addonDraftStillBlank,
  listQuoteLineEvidenceUrls,
  isQuoteEvidenceFinding,
  sumQuoteAmounts,
  parseMileageKm,
  stripFigureIndexTalk,
  parseOdometerMileageFromTexts,
  formatMileageText,
  normalizePhotoDraft,
  looksLikeWorkFinding,
  mergePhotoDraft,
  normalizeNodeContent,
  mergeNodeContent,
  contentOfFlowNode,
  draftOfFlowNode,
  migrateNodeToSingleContent,
  normalizePendingImages,
  applyOrganizeGroups,
  inspectionSuggestions,
  applyInspectionSuggestion,
  foldInspectionPendingDraft,
  collectConfirmedQuoteNames,
  collectConfirmedQuoteLines,
  seedWorkFindingsFromQuoteLines,
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
