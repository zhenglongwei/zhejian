/**
 * 施工、检测、交车的 AI 分析。
 * 真源：docs/04_维修过程相册/29_节点AI分析_单据结构与状态流转梳理.md
 * 当前节点全文 + 前序分析要点/图摘要；图每张一生只送模型一次；先想后 JSON（不强制 response_format）。
 */
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { FLOW_VERSION } = require('../../vendor/shared/constants/service-flow-nodes')
const { parseReviewModelJson } = require('../utils/node-ai-review-rules')
const { resolveConfiguredNodeAiReviewEngines } = require('../lib/node-ai-review-llm-registry')
const { resolveShared } = require('../utils/resolve-shared')
const { normalizeOwnerFaqs, contentOfFlowNode } = resolveShared('utils/service-flow-docs.js')
const { noteForUrl, notesForAlbumImages } = require('./image-look-cache')

const jobsInFlight = new Set()

function text(value) {
  return String(value || '').trim()
}

function sortFlowNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : [])
    .slice()
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
}

function readFlowNodes(album) {
  const pkg = (album && album.contentPackageJson) || {}
  return sortFlowNodes(pkg.flowNodes)
}

function linesOf(node) {
  const payload = (node && node.document && node.document.payload) || {}
  return (Array.isArray(payload.lines) ? payload.lines : [])
    .map((row) => ({
      name: text(row && row.name),
      amount: text(row && row.amount),
      note: text(row && row.note),
    }))
    .filter((row) => row.name)
}

function imageOriginalUrl(raw) {
  if (typeof raw === 'string') return text(raw)
  return text(raw && (raw.url || raw.rawUrl || raw.src))
}

function imageMaskedUrl(raw) {
  if (!raw || typeof raw !== 'object') return ''
  const { usableMaskedProductUrl } = require('../lib/media-storage')
  return usableMaskedProductUrl(raw.maskedUrl || raw.preMaskedUrl)
}

function workImageList(row) {
  const images = Array.isArray(row && row.images) ? row.images : []
  if (images.length) return images
  return row && row.url ? [row] : []
}

function workRows(node) {
  const findings = contentOfFlowNode(node).findings || []
  return (Array.isArray(findings) ? findings : []).map((row, index) => ({
    id: text(row && row.id) || `w${index}`,
    name: text(row && row.partName),
    note: text(row && (row.caption || row.advice)),
    photos: workImageList(row).length,
  })).filter((row) => row.name || row.note || row.photos)
}

function workPhotoSlots(nodes) {
  const buckets = []
  ;(Array.isArray(nodes) ? nodes : []).forEach((node) => {
    const findings = contentOfFlowNode(node).findings || []
    ;(Array.isArray(findings) ? findings : []).forEach((row) => {
      const partName = text(row && row.partName)
      const findingId = text(row && row.id)
      const urls = []
      workImageList(row).forEach((img) => {
        const url = imageOriginalUrl(img)
        if (!/^https?:\/\//.test(url) || urls.some((row) => row.url === url)) return
        urls.push({ url, maskedUrl: imageMaskedUrl(img) })
      })
      if (urls.length) buckets.push({ partName, findingId, urls })
    })
  })
  const slots = []
  const used = new Set()
  const push = (bucket, shot) => {
    const url = shot && shot.url
    if (!url || used.has(url) || slots.length >= 8) return
    used.add(url)
    slots.push({
      slot: slots.length + 1,
      url,
      maskedUrl: shot.maskedUrl || '',
      partName: bucket.partName,
      findingId: bucket.findingId,
    })
  }
  buckets.forEach((bucket) => push(bucket, bucket.urls[0]))
  buckets.forEach((bucket) => bucket.urls.slice(1).forEach((shot) => push(bucket, shot)))
  return slots
}

function clipItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const title = text(raw.title).slice(0, 16)
  const body = text(raw.body || raw.text).slice(0, 80)
  if (!title && !body) return null
  return { title, body }
}

function ownerProcessSentence(raw) {
  const body = text(raw)
  if (!body) return ''
  if (/第\s*\d+\s*张|施工第|可见|展示了|展示的|红圈|技师|正在拆|正在拍|套筒|扳手/.test(body)) return ''
  return body.slice(0, 80)
}

function adviceRows(parsed, zhKey, enKey) {
  if (!parsed || typeof parsed !== 'object') return []
  if (Array.isArray(parsed[zhKey])) return parsed[zhKey]
  if (enKey && Array.isArray(parsed[enKey])) return parsed[enKey]
  return []
}

function workRemindKind(row) {
  const t = text(row && (row['类型'] || row.kind))
  if (t === '增项' || t === 'extra' || t === 'extra_work' || t === 'addon') return 'extra'
  if (t === '留证' || t === 'photo' || t === 'photoPlan') return 'plan'
  if (
    t === '缺项' ||
    t === 'missing' ||
    t === 'missing_quote_item' ||
    t === 'missing_process_photo' ||
    t === 'missing_brand' ||
    t === 'missing_old_new'
  ) {
    return 'missing'
  }
  return t ? 'missing' : 'plan'
}

function parseWorkAdvice(raw, items, slots) {
  const parsed = parseReviewModelJson(raw) || {}
  const byId = new Map()
  const byName = new Map()
  adviceRows(parsed, '填写建议', 'items').forEach((row) => {
    const id = text(row && (row.id || row['编号']))
    const name = text(row && (row['项目'] || row.partName || row.name || row.title))
    const body = text(row && (row['描述'] || row.body)).slice(0, 80)
    const supplement = text(row && row.supplement).slice(0, 80)
    const hit = { body, supplement }
    if (id) byId.set(id, hit)
    if (name && !byName.has(name)) byName.set(name, hit)
  })
  let gaps = []
  let photoPlan = []
  if (Array.isArray(parsed['提醒'])) {
    parsed['提醒'].forEach((row) => {
      const title = text(row && (row['标题'] || row.title || row.partName || row.lineName)).slice(0, 20)
      const body = text(row && (row['正文'] || row.body)).slice(0, 120)
      if (!title && !body) return
      const kind = workRemindKind(row)
      if (kind === 'plan') {
        photoPlan.push({ title: title || '留证', body })
        return
      }
      if (kind !== 'extra' && kind !== 'missing') return
      gaps.push({
        kind,
        title: title || '提醒',
        body:
          body ||
          (kind === 'extra' ? `${title}是新增项，没有事先报价。` : `报价里的${title}，施工没有做。`),
      })
    })
    gaps = gaps.slice(0, 4)
    photoPlan = photoPlan.slice(0, 6)
  } else {
    gaps = (Array.isArray(parsed.gaps) ? parsed.gaps : [])
      .map((row) => {
        const kindText = text(row && row.kind)
        const kind =
          kindText === 'extra' || kindText === 'addon' || kindText === 'extra_work'
            ? 'extra'
            : kindText === 'missing' || kindText === 'missing_quote_item'
              ? 'missing'
              : kindText === 'missing_process_photo' ||
                  kindText === 'missing_brand' ||
                  kindText === 'missing_old_new'
                ? 'missing'
                : ''
        const title = text(row && (row.title || row.partName || row.lineName)).slice(0, 16)
        const body = text(row && row.body).slice(0, 120)
        if (!kind || (!title && !body)) return null
        return {
          kind,
          title: title || '提醒',
          body:
            body ||
            (kind === 'extra' ? `${title}是新增项，没有事先报价。` : `报价里的${title}，施工没有做。`),
        }
      })
      .filter(Boolean)
      .slice(0, 4)
    photoPlan = (Array.isArray(parsed.photoPlan) ? parsed.photoPlan : [])
      .map((row) => {
        const title = text(row && (row.title || row.partName)).slice(0, 20)
        const body = text(row && row.body).slice(0, 120)
        if (!title && !body) return null
        return { title: title || '留证', body }
      })
      .filter(Boolean)
      .slice(0, 6)
  }
  const written = (Array.isArray(items) ? items : [])
    .map((row) => {
      const noted = text(row && row.note)
      const name = text(row && row.name)
      const hit = byId.get(text(row && row.id)) || byName.get(name) || null
      if (noted || !name || !(Number(row && row.photos) > 0) || !hit) return null
      const body = ownerProcessSentence(hit.body)
      if (!body) return null
      return {
        id: text(row && row.id),
        partName: name,
        sourceNote: '',
        body,
        display: `${name}建议描述为：${body}`,
        supplement: '',
      }
    })
    .filter(Boolean)
    .slice(0, 8)
  const names = new Set((Array.isArray(items) ? items : []).map((row) => text(row && row.name)).filter(Boolean))
  const bySlot = new Map((Array.isArray(slots) ? slots : []).map((row) => [row.slot, row]))
  const seenSlot = new Set()
  const splitRows = Array.isArray(parsed['拆分建议']) ? parsed['拆分建议'] : null
  const groupRows = splitRows || (Array.isArray(parsed.groups) ? parsed.groups : [])
  const groups = []
  groupRows.forEach((row) => {
    const partName = text(row && (row['检测项目'] || row.partName || row.title)).slice(0, 16)
    if (!partName || !names.has(partName)) return
    const nums = splitRows
      ? collectGroupSlotNumbers({
          imageSlots: slotTokens(row['图片']).concat(slotTokens(row.imageSlots)),
          imageNames: slotTokens(row.imageNames),
          imageName: row.imageName,
          photoNames: row.photoNames,
        })
      : [Number(row && row.slot)].filter((n) => Number.isInteger(n) && n >= 1)
    nums.forEach((slot) => {
      const shot = bySlot.get(slot)
      if (!shot || shot.partName === partName || seenSlot.has(slot)) return
      seenSlot.add(slot)
      groups.push({
        slot,
        url: shot.url,
        partName,
        body: `这张更像是${partName}。`,
      })
    })
  })
  return {
    scope: 'process',
    gaps,
    items: written,
    groups: groups.slice(0, 4),
    photoPlan,
    imageNotes: Array.isArray(parsed.imageNotes) ? parsed.imageNotes : [],
  }
}

function parseArchiveCopyFromDelivery(parsed) {
  const { normalizeArchiveCopy } = require('../utils/album-archive-copy')
  const block =
    (parsed && parsed.archiveCopy) ||
    (parsed && parsed.publicCopy) ||
    null
  if (!block || typeof block !== 'object') return null
  return normalizeArchiveCopy(
    {
      summary: block.summary || block.aiSummary,
      faq: block.faq,
    },
    { source: 'delivery_ai' },
  )
}

function parseOwnerFaqSuggestions(list) {
  const raw = Array.isArray(list) ? list : []
  return normalizeOwnerFaqs(
    raw.map((row, index) => ({
      id: text(row && row.id) || `suggest_${index + 1}`,
      question: text(row && (row['问'] || row.question || row.q)),
      answer: text(row && (row['答'] || row.answer || row.a)),
    })),
  ).slice(0, 8)
}

/** 交车 AI 的公开图说：{"图":"图1","说":"…"} → { slot, note }（slot 1-based 对应本次附图） */
function parsePublicCaptions(list) {
  const { scrubPiiText } = require('../utils/scrub-pii-text')
  const raw = Array.isArray(list) ? list : []
  return raw
    .map((row, index) => {
      const label = row && (row.slot != null ? row.slot : row['图'])
      const num = Number(String(label == null ? '' : label).match(/\d+/))
      const slot = num || index + 1
      const note = scrubPiiText(text(row && (row['说'] || row.note || row.caption))).slice(0, 60)
      if (!note) return null
      return { slot, note }
    })
    .filter(Boolean)
    .slice(0, 8)
}

function parseDeliveryAdvice(raw) {
  const parsed = parseReviewModelJson(raw)
  if (!parsed) {
    return {
      repairBrief: '',
      ownerFaqs: [],
      tips: [],
      publicCaptions: [],
      // 兼容旧字段
      repair: null,
      warranty: null,
      care: null,
      processIssues: [],
      fill: null,
      archiveCopy: null,
    }
  }
  const legacyCopy = parseArchiveCopyFromDelivery(parsed)
  const repairBrief = text(
    parsed['简述'] ||
      parsed.repairBrief ||
      (parsed.repair && parsed.repair.body) ||
      (parsed.talk && parsed.talk.repair) ||
      (legacyCopy && legacyCopy.summary),
  ).slice(0, 500)
  const ownerFaqs = parseOwnerFaqSuggestions(
    (Array.isArray(parsed['问答']) && parsed['问答'].length ? parsed['问答'] : null) ||
      parsed.ownerFaqs ||
      parsed.faqs ||
      (legacyCopy && legacyCopy.faq) ||
      [],
  )
  const tipSource = Array.isArray(parsed['提醒']) ? parsed['提醒'] : parsed.tips
  const tips = (Array.isArray(tipSource) ? tipSource : [])
    .map((row, index) => {
      const title = text(row && (row['标题'] || row.title)).slice(0, 40)
      const body = text(row && (row['正文'] || row.body)).slice(0, 120)
      if (!title && !body) return null
      return { id: `tip_${index + 1}`, title, body }
    })
    .filter(Boolean)
    .slice(0, 4)
  const acceptanceSource =
    (parsed['验收'] && typeof parsed['验收'] === 'object' ? parsed['验收'] : null) ||
    (parsed.acceptance && typeof parsed.acceptance === 'object' ? parsed.acceptance : null) ||
    null
  const acceptance = acceptanceSource
    ? {
        standard: text(acceptanceSource['标准'] || acceptanceSource.standard).slice(0, 200),
        process: text(acceptanceSource['过程'] || acceptanceSource.process).slice(0, 300),
        result: text(acceptanceSource['结果'] || acceptanceSource.result).slice(0, 200),
      }
    : null
  // 硬闸门：模型自评无验收依据时，强制清空编造的过程/结果（不依赖模型自觉遵守）
  const basisRaw = text(parsed['验收依据'] || parsed.evidenceBasis)
  const noEvidenceBasis = /无|没有|不足|缺乏|不相关/.test(basisRaw)
  if (acceptance && noEvidenceBasis) {
    acceptance.process = ''
    acceptance.result = ''
  }
  if (acceptance && !acceptance.standard && !acceptance.process && !acceptance.result) {
    return {
      repairBrief,
      ownerFaqs,
      acceptance: null,
      schema: 3,
      tips,
      publicCaptions: parsePublicCaptions(parsed['图说'] || parsed.publicCaptions),
      repair: repairBrief ? { title: '本次维修简述', body: repairBrief.slice(0, 300) } : null,
      warranty: null,
      care: null,
      processIssues: [],
      fill: null,
      imageNotes: Array.isArray(parsed.imageNotes) ? parsed.imageNotes : [],
      archiveCopy: null,
    }
  }
  return {
    repairBrief,
    ownerFaqs,
    acceptance,
    schema: 3,
    tips,
    publicCaptions: parsePublicCaptions(parsed['图说'] || parsed.publicCaptions),
    repair: repairBrief ? { title: '本次维修简述', body: repairBrief.slice(0, 300) } : null,
    warranty: null,
    care: null,
    processIssues: [],
    fill: null,
    imageNotes: Array.isArray(parsed.imageNotes) ? parsed.imageNotes : [],
    archiveCopy: null,
  }
}

function filled(item) {
  return Boolean(item && text(item.body))
}

function adviceHasContent(advice, kind) {
  if (!advice || typeof advice !== 'object') return false
  if (kind === 'work') {
    return (Array.isArray(advice.gaps) && advice.gaps.length > 0) ||
      (Array.isArray(advice.items) && advice.items.length > 0) ||
      (Array.isArray(advice.groups) && advice.groups.length > 0) ||
      (Array.isArray(advice.photoPlan) && advice.photoPlan.length > 0) ||
      Boolean(text(advice.note))
  }
  if (kind === 'inspect') {
    return Boolean(text(advice.faultAnalysis)) ||
      (Array.isArray(advice.inspectOrder) && advice.inspectOrder.length > 0) ||
      (Array.isArray(advice.edits) && advice.edits.length > 0) ||
      (Array.isArray(advice.items) && advice.items.length > 0) ||
      (Array.isArray(advice.shop) && advice.shop.length > 0)
  }
  return Boolean(
    text(advice.repairBrief) ||
      (Array.isArray(advice.ownerFaqs) && advice.ownerFaqs.length > 0) ||
      (Array.isArray(advice.tips) && advice.tips.length > 0) ||
      filled(advice.repair) ||
      filled(advice.warranty) ||
      filled(advice.care),
  )
}

function nodeField(kind) {
  if (kind === 'work') return { field: 'workAdvice', nodeKind: 'work' }
  if (kind === 'inspect') return { field: 'inspectionAdvice', nodeKind: 'inspection' }
  return { field: 'deliveryAdvice', nodeKind: 'delivery_photos' }
}

const OWNER_TIMING = {
  需处理: '建议现在处理',
  需关注: '可以先观察',
  状态良好: '现在不用动',
  仅记录: '这次只留了照片',
}

function intakePhotoUrls(intake) {
  const draft = contentOfFlowNode(intake)
  const urls = []
  const push = (raw) => {
    const url = text(typeof raw === 'object' && raw ? raw.url || raw.rawUrl || raw.maskedUrl : raw)
    if (!/^https?:\/\//.test(url) || urls.includes(url) || urls.length >= 6) return
    urls.push(url)
  }
  ;(Array.isArray(draft.pendingImages) ? draft.pendingImages : []).forEach(push)
  return urls
}

function intakeBrief(intake) {
  const advice = (intake && intake.intakeAdvice) || {}
  if (advice.status !== 'ready' || advice.scope !== 'coverage') return ''
  const risks = (Array.isArray(advice.risks) ? advice.risks : [])
    .map((row) => text(row && (row.title || row.body)))
    .filter(Boolean)
  if (advice.noPhotos) return '接车还没有车身照片'
  if (!risks.length) return '接车留证：车身四周都拍到了'
  return `接车留证还缺：${risks.join('、')}`
}

function findingPhotoCount(row) {
  const images = Array.isArray(row && row.images) ? row.images : []
  if (images.length) return images.length
  return row && text(row.url) ? 1 : 0
}

/** 检测项：有部位/说明/结果，或已挂图，都算可分析（与前端「有图就能点 AI」一致） */
function namedRows(findings) {
  return (Array.isArray(findings) ? findings : [])
    .map((row, index) => ({
      // 与 inspectPhotoSlots 一致：无 id 时用 f{index}，避免模型写出的 findingId 对不上
      id: text(row && row.id) || `f${index}`,
      name: text(row && row.partName),
      result: text(row && row.result),
      note: text(row && (row.advice || row.caption)),
      photos: findingPhotoCount(row),
    }))
    .filter((row) => row.name || row.note || row.result || row.photos > 0)
}

/** 接车留证套话：检测意见里一律丢掉 */
function isIntakeCoverageEcho(value) {
  const s = text(value)
  return !s
    ? true
    : /车身四周|接车留证|还缺这些侧面|补一张全景|四周都拍到/.test(s)
}

/** 面向店员的句子：去掉英文词，避免意见里夹英文 */
function zhOnly(value, max = 120) {
  return text(value)
    .replace(/[A-Za-z][A-Za-z0-9_\-]*/g, '')
    .replace(/[（(]\s*[）)]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max)
}

/** 建议补充检测（旧键检测顺序）：模型常写成一整段或 {title,body}，一律收成中文短句数组 */
function normalizeInspectOrder(raw) {
  const rows = []
  const push = (value) => {
    let s = ''
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      s = zhOnly(value.text || value.body || value.title || value.step || value.item || value.name, 160)
    } else {
      s = zhOnly(value, 160)
    }
    s = s.replace(/^\d+[.、．)\]）]\s*/, '').trim()
    if (s && !isIntakeCoverageEcho(s) && !rows.includes(s)) rows.push(s)
  }
  if (Array.isArray(raw)) {
    raw.forEach(push)
  } else if (typeof raw === 'string') {
    String(raw)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach(push)
  }
  return rows.slice(0, 8)
}

function collectGroupSlotNumbers(g) {
  const raw = []
    .concat(Array.isArray(g && g.imageSlots) ? g.imageSlots : [])
    .concat(Array.isArray(g && g.imageNames) ? g.imageNames : [])
    .concat(g && g.imageName ? [g.imageName] : [])
    .concat(Array.isArray(g && g.photoNames) ? g.photoNames : [])
  return [...new Set(raw.map(resolveInspectSlotNumber).filter(Boolean))]
}

/** 槽位号：认数字或「图N」 */
function resolveInspectSlotNumber(slot) {
  if (typeof slot === 'number' && Number.isInteger(slot) && slot >= 1) return slot
  const raw = String(slot == null ? '' : slot).trim()
  const named = raw.match(/^图\s*(\d+)$/i)
  if (named) {
    const n = Number(named[1])
    if (Number.isInteger(n) && n >= 1) return n
  }
  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw)
    if (Number.isInteger(n) && n >= 1) return n
  }
  return 0
}

const INSPECT_HANDLE_RANK = {
  状态良好: 1,
  仅记录: 2,
  需关注: 3,
  需处理: 4,
}

/** 处理意见只收四档原词。其它写法留空，不从描述里猜。 */
function inspectHandleOpinion(value) {
  const raw = text(value).replace(/[。．.]$/, '')
  return Object.prototype.hasOwnProperty.call(INSPECT_HANDLE_RANK, raw) ? raw : ''
}

/** 同一项目名收成一组时，留下更需要动手的那一档。 */
function preferInspectHandle(current, incoming) {
  const left = inspectHandleOpinion(current)
  const right = inspectHandleOpinion(incoming)
  if (!left) return right
  if (!right) return left
  return INSPECT_HANDLE_RANK[right] > INSPECT_HANDLE_RANK[left] ? right : left
}

/** 去掉检测三档用词，避免档位词进店员意见 */
function dropRankWords(value) {
  return text(value)
    .replace(/需处理|需关注|状态良好/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function zhInspectName(value) {
  return zhOnly(dropRankWords(value), 24)
}

function zhInspectProse(value, max = 200) {
  if (Array.isArray(value)) {
    const lines = value.map((row) => zhOnly(dropRankWords(row), Math.min(max, 120))).filter(Boolean)
    return zhOnly(lines.join('\n'), max)
  }
  return zhOnly(dropRankWords(value), max)
}

/** 「图2、图3」这种一段才切开。空白不切，避免「图 1」被拆散。 */
function splitFigureTokens(value) {
  return String(value)
    .split(/[、,，;；]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * 图片按类型收：字符串数组按项取；多套一层只取内层字符串；一段才按顿号逗号切开。
 * 对象、再深一层、其它类型丢掉，不当图号。
 */
function slotTokens(value) {
  if (value == null || value === '') return []
  if (typeof value === 'string') return splitFigureTokens(value)
  if (typeof value === 'number') return [value]
  if (!Array.isArray(value)) return []
  const out = []
  value.forEach((item) => {
    if (typeof item === 'string') {
      splitFigureTokens(item).forEach((part) => out.push(part))
      return
    }
    if (typeof item === 'number') {
      out.push(item)
      return
    }
    if (!Array.isArray(item)) return
    item.forEach((inner) => {
      if (typeof inner === 'string') {
        splitFigureTokens(inner).forEach((part) => out.push(part))
        return
      }
      if (typeof inner === 'number') out.push(inner)
    })
  })
  return out
}

/**
 * 拆分建议优先认中文关键字。没有该键时，才收下旧的 edits.groups，避免偶发旧键整段空白。
 * 有「拆分建议」键时（含空数组）不再回看 edits，避免空拆分被旧字段补回来。
 */
function rawInspectSplitRows(parsed) {
  if (!parsed || typeof parsed !== 'object') return []
  if (Array.isArray(parsed['拆分建议'])) return parsed['拆分建议']
  if (Array.isArray(parsed.splits)) return parsed.splits
  const rows = []
  ;(Array.isArray(parsed.edits) ? parsed.edits : []).forEach((row) => {
    if (!row || text(row.kind) === 'photo') return
    if (Array.isArray(row.groups)) rows.push(...row.groups)
  })
  return rows
}

/**
 * 按模型写出的检测项目原样归到「这些图已经所在的那一条」。
 * 同一条里名称完全相同才收成一组；名称不同不猜成同一项。跨条的图不并进同一条。
 * 一组也展示；同一条里至少两组才允许应用。
 */
function organizeInspectSplits(rawGroups, photoSlots) {
  const slots = Array.isArray(photoSlots) ? photoSlots : []
  const byFinding = new Map()
  ;(Array.isArray(rawGroups) ? rawGroups : []).forEach((g) => {
    if (!g || typeof g !== 'object') return
    const partName = zhInspectName(g['检测项目'] || g.partName || g.name || g.title)
    const advice = zhInspectProse(g['描述'] || g.advice || g.body || g.note, 200)
    const opinion = inspectHandleOpinion(g['处理意见'] || g.result)
    if (!partName) return
    const slotNums = collectGroupSlotNumbers({
      imageSlots: slotTokens(g['图片']).concat(slotTokens(g.imageSlots)),
      imageNames: slotTokens(g.imageNames),
      imageName: g.imageName,
      photoNames: g.photoNames,
    })
    ;(Array.isArray(g.images) ? g.images : []).forEach((img) => {
      const url = text(typeof img === 'object' && img ? img.url : img)
      if (!url) return
      const hit = slots.find((row) => mediaBare(row && row.url) === mediaBare(url))
      const slot = Number(hit && hit.slot) || 0
      if (slot && !slotNums.includes(slot)) slotNums.push(slot)
    })
    slotNums.forEach((slot) => {
      const hit = slots.find((row) => Number(row && row.slot) === slot)
      const findingId = text(hit && hit.findingId)
      const url = text(hit && hit.url)
      if (!findingId || !url) return
      if (!byFinding.has(findingId)) byFinding.set(findingId, new Map())
      const named = byFinding.get(findingId)
      if (!named.has(partName)) {
        named.set(partName, { partName, advice: '', result: '', images: [], imageSlots: [] })
      }
      const group = named.get(partName)
      if (advice && !group.advice) group.advice = advice
      if (opinion) group.result = preferInspectHandle(group.result, opinion)
      if (!group.imageSlots.includes(slot)) group.imageSlots.push(slot)
      const bare = mediaBare(url)
      if (!group.images.some((img) => mediaBare(img.url) === bare)) group.images.push({ url })
    })
  })
  const edits = []
  byFinding.forEach((named, findingId) => {
    const groups = [...named.values()]
      .filter((row) => row.partName && row.images.length)
      .map((row) => {
        const imageSlots = row.imageSlots.slice().sort((a, b) => a - b)
        return {
          partName: row.partName,
          advice: row.advice,
          result: inspectHandleOpinion(row.result),
          images: row.images,
          imageSlots,
          imageLabel: imageSlots.map((n) => `图${n}`).join('、'),
        }
      })
    if (!groups.length) return
    const names = groups.map((row) => row.partName).filter(Boolean)
    edits.push({
      id: `edit_item_${findingId}`,
      kind: 'item',
      findingId,
      partName: '',
      advice: '',
      body:
        groups.length >= 2
          ? `拆成${names.map((n) => `「${n}」`).join('')}并写上检查发现`
          : groups[0].advice || groups[0].partName,
      groups,
      canApply: groups.length >= 2,
    })
  })
  return edits
}

function imageNotesFromInspectEdits(edits) {
  const notes = []
  ;(Array.isArray(edits) ? edits : []).forEach((row) => {
    ;(Array.isArray(row && row.groups) ? row.groups : []).forEach((g) => {
      const note = text(g && g.advice).slice(0, 120)
      if (!note) return
      ;(Array.isArray(g.imageSlots) ? g.imageSlots : []).forEach((slot) => {
        notes.push({ slot, note })
      })
    })
  })
  return notes
}

/** 调试日志用：五步原文。不上屏，也不写入检测项。 */
function inspectStepsFromRaw(raw) {
  const parsed = parseReviewModelJson(raw)
  const empty = {
    步骤1_故障分析: null,
    步骤2_逐张看图: null,
    步骤3_逐张归类: null,
    步骤4_拆分建议: null,
    步骤5_建议补充检测: null,
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty
  const pick = (...keys) => {
    for (const key of keys) {
      if (parsed[key] != null) return parsed[key]
    }
    return null
  }
  return {
    步骤1_故障分析: pick('故障分析', '故障诊断'),
    步骤2_逐张看图: pick('逐张看图'),
    步骤3_逐张归类: pick('逐张归类'),
    步骤4_拆分建议: pick('拆分建议'),
    步骤5_建议补充检测: pick('建议补充检测', '检测顺序'),
  }
}

function parseInspectionAdvice(raw, _items, _photoUrls, photoSlots) {
  const parsed = parseReviewModelJson(raw) || {}
  const faultSource =
    parsed['故障诊断'] != null
      ? parsed['故障诊断']
      : parsed['故障分析'] != null
        ? parsed['故障分析']
        : parsed.faultAnalysis
  const faultRaw = zhInspectProse(faultSource, 800)
  const faultAnalysis = isIntakeCoverageEcho(faultRaw) ? '' : faultRaw
  const orderSource =
    parsed['建议补充检测'] != null
      ? parsed['建议补充检测']
      : parsed['检测顺序'] != null
        ? parsed['检测顺序']
        : parsed.inspectOrder
  const inspectOrder = normalizeInspectOrder(orderSource)
    .map((line) => dropRankWords(line))
    .filter((line) => line && !isIntakeCoverageEcho(line))
  const edits = organizeInspectSplits(rawInspectSplitRows(parsed), photoSlots).slice(0, 10)
  return {
    scope: 'inspect_v2',
    faultAnalysis,
    inspectOrder,
    partHints: [],
    edits,
    shop: [],
    items: [],
    imageNotes: imageNotesFromInspectEdits(edits),
  }
}

function mediaBare(url) {
  return String(url || '')
    .trim()
    .split('?')[0]
    .split('#')[0]
}

/** 各步已落下的「图观察摘要」：跟图片身份走，跨步复用，禁止再附图 */
function collectImageNotesMap(nodes = []) {
  const map = {}
  ;(Array.isArray(nodes) ? nodes : []).forEach((node) => {
    const draft = contentOfFlowNode(node)
    const notes = draft.imageNotes && typeof draft.imageNotes === 'object' ? draft.imageNotes : {}
    Object.keys(notes).forEach((key) => {
      const note = text(notes[key])
      if (key && note && !map[key]) map[key] = note
    })
    ;['intakeAdvice', 'inspectionAdvice', 'workAdvice', 'deliveryAdvice'].forEach((field) => {
      const advice = node && node[field]
      ;(Array.isArray(advice && advice.imageNotes) ? advice.imageNotes : []).forEach((row) => {
        const key = mediaBare(row && (row.url || row.key))
        const note = text(row && row.note)
        if (key && note && !map[key]) map[key] = note
      })
    })
  })
  return map
}

function splitNewAndNotedUrls(urls = [], notesMap = {}) {
  const fresh = []
  const noted = []
  ;(Array.isArray(urls) ? urls : []).forEach((url) => {
    const note = noteForUrl(url, notesMap)
    if (!mediaBare(url)) return
    if (note) noted.push({ url, note })
    else fresh.push(url)
  })
  return { fresh, noted }
}

/** 检测图：绝对地址或本机 /uploads 相对路径（送模前再解析打码地址） */
function isInspectMediaUrl(url) {
  const u = text(url)
  if (!u) return false
  if (/^https?:\/\//i.test(u)) return true
  if (u.startsWith('/') || /\/uploads\//i.test(u)) return true
  return false
}

function inspectPhotoUrls(inspection) {
  const draft = contentOfFlowNode(inspection)
  const urls = []
  const push = (raw) => {
    const url = text(typeof raw === 'object' && raw ? raw.url || raw.rawUrl || raw.maskedUrl : raw)
    if (!isInspectMediaUrl(url) || urls.includes(url) || urls.length >= 8) return
    urls.push(url)
  }
  ;(Array.isArray(draft.findings) ? draft.findings : []).forEach((row) => {
    if (!row) return
    if (row.url) push(row.url)
    ;(Array.isArray(row.images) ? row.images : []).forEach(push)
  })
  return urls
}

/** 检测图槽位：与送模附图顺序一致，并挂上所属检测项 id（供拆分 groups.imageSlots） */

function inspectPhotoSlots(inspection) {
  const draft = contentOfFlowNode(inspection)
  const slots = []
  const used = new Set()
  const push = (findingId, partName, raw) => {
    const url = imageOriginalUrl(raw)
    const key = mediaBare(url)
    if (!isInspectMediaUrl(url) || !key || used.has(key) || slots.length >= 8) return
    used.add(key)
    slots.push({
      slot: slots.length + 1,
      url,
      maskedUrl: imageMaskedUrl(raw),
      findingId: text(findingId),
      partName: text(partName),
    })
  }
  ;(Array.isArray(draft.findings) ? draft.findings : []).forEach((row, index) => {
    if (!row) return
    const findingId = text(row.id) || `f${index}`
    const partName = text(row.partName)
    const shots = []
    if (Array.isArray(row.images) && row.images.length) {
      row.images.forEach((img) => shots.push(img))
    } else if (row.url) {
      shots.push(row)
    }
    shots.forEach((img) => push(findingId, partName, img))
  })
  return slots
}

function deliveryPhotoUrls(delivery) {
  const draft = contentOfFlowNode(delivery)
  const urls = []
  const push = (raw) => {
    const url = text(typeof raw === 'object' && raw ? raw.url || raw.rawUrl || raw.maskedUrl : raw)
    if (!/^https?:\/\//.test(url) || urls.includes(url) || urls.length >= 6) return
    urls.push(url)
  }
  if (draft.deliveryExteriorUrl) push(draft.deliveryExteriorUrl)
  ;(Array.isArray(draft.selectedDeliveryUrls) ? draft.selectedDeliveryUrls : []).forEach(push)
  return urls
}

/** 旧意见里的部件参考并进建议补充检测，下游不再单看一块 */
function foldPartHintsIntoOrder(advice) {
  const order = (Array.isArray(advice && advice.inspectOrder) ? advice.inspectOrder : [])
    .map((row) => text(row))
    .filter(Boolean)
  ;(Array.isArray(advice && advice.partHints) ? advice.partHints : []).forEach((row) => {
    const line = [text(row && (row.title || row.partName)), text(row && row.body)].filter(Boolean).join('：')
    if (line && !order.includes(line)) order.push(line)
  })
  return order.slice(0, 6)
}

function contextOf(album, extraNotes = {}) {
  const nodes = readFlowNodes(album)
  const { buildCaseFactPack } = require('../utils/case-geo-factpack')
  const factPack = buildCaseFactPack(nodes)
  const intake = nodes.find((item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'))
  const inspection = nodes.find((item) => item && item.kind === 'inspection')
  const quotes = nodes.filter((item) => {
    if (!item || (item.kind !== 'quote_confirm' && item.kind !== 'addon_quote_confirm')) return false
    return String((item.document && item.document.status) || '') !== 'cancelled'
  })
  const works = nodes.filter((item) => item && item.kind === 'work')
  const delivery = nodes.find((item) => item && item.kind === 'delivery_photos')
  const repair = nodes.find((item) => item && item.kind === 'repair_report')
  const draft = contentOfFlowNode(delivery)
  const reportPayload = (repair && repair.document && repair.document.payload) || {}
  const intakeAdvice = (intake && intake.intakeAdvice) || {}
  const inspectionAdvice = (inspection && inspection.inspectionAdvice) || {}
  const workAdvice = (works.find((item) => item.workAdvice) || {}).workAdvice || {}
  const imageNotesMap = { ...(extraNotes || {}), ...collectImageNotesMap(nodes) }
  const intakeUrls = intakePhotoUrls(intake)
  const inspectSlots = inspectPhotoSlots(inspection)
  const inspectUrls = inspectSlots.map((row) => row.url)
  const workSlots = workPhotoSlots(works)
  const deliveryUrls = deliveryPhotoUrls(delivery)
  const intakeSplit = splitNewAndNotedUrls(intakeUrls, imageNotesMap)
  const inspectSplit = splitNewAndNotedUrls(inspectUrls, imageNotesMap)
  const workFreshSlots = (workSlots || []).filter((row) => !noteForUrl(row.url, imageNotesMap))
  const workNoted = (workSlots || [])
    .filter((row) => noteForUrl(row.url, imageNotesMap))
    .map((row) => ({ slot: row.slot, partName: row.partName, note: noteForUrl(row.url, imageNotesMap) }))
  const deliverySplit = splitNewAndNotedUrls(deliveryUrls, imageNotesMap)
  return {
    complaint: text(contentOfFlowNode(intake).chiefComplaint),
    intakeBrief: intakeBrief(intake),
    intakeAdviceSummary: intakeBrief(intake),
    intakePhotoUrls: intakeSplit.fresh,
    intakeNoted: intakeSplit.noted,
    intakeRisks: (Array.isArray(intakeAdvice.risks) ? intakeAdvice.risks : [])
      .map((row) => text(row && row.title))
      .filter(Boolean),
    inspectItems: namedRows(contentOfFlowNode(inspection).findings),
    inspectAdviceSummary: text(inspectionAdvice.updatedAt)
      ? {
          faultAnalysis: text(inspectionAdvice.faultAnalysis).slice(0, 120),
          inspectOrder: foldPartHintsIntoOrder(inspectionAdvice),
          edits: Array.isArray(inspectionAdvice.edits)
            ? inspectionAdvice.edits
                .map((row) => ({ kind: text(row.kind), body: text(row.body) }))
                .filter((row) => row.body)
                .slice(0, 6)
            : [],
          shop: Array.isArray(inspectionAdvice.shop) ? inspectionAdvice.shop.slice(0, 4) : [],
          items: Array.isArray(inspectionAdvice.items)
            ? inspectionAdvice.items.map((row) => ({ id: row.id, body: text(row.body) })).slice(0, 6)
            : [],
        }
      : null,
    inspectPhotoUrls: inspectSplit.fresh,
    inspectPhotoUrlsAll: inspectUrls,
    inspectPhotoSlots: inspectSlots,
    inspectNoted: inspectSplit.noted,
    quoteLines: quotes.reduce((all, node) => all.concat(linesOf(node)), []),
    workItems: works.reduce((all, node) => all.concat(workRows(node)), []),
    workPhotoSlots: workFreshSlots,
    workNoted,
    workAdviceSummary: text(workAdvice.updatedAt)
      ? {
          gaps: Array.isArray(workAdvice.gaps) ? workAdvice.gaps.slice(0, 4) : [],
          items: Array.isArray(workAdvice.items)
            ? workAdvice.items.map((row) => ({ id: row.id, body: text(row.body) })).slice(0, 6)
            : [],
        }
      : null,
    warrantyPeriod: text(draft.warrantyPeriod || reportPayload.warrantyPeriod),
    warrantyNotes: text(draft.warrantyNotes || reportPayload.warrantyNotes),
    acceptance:
      draft.acceptance && typeof draft.acceptance === 'object'
        ? {
            standard: text(draft.acceptance.standard),
            process: text(draft.acceptance.process),
            result: text(draft.acceptance.result),
          }
        : null,
    hasExterior: Boolean(text(draft.deliveryExteriorUrl)),
    selectedCount: Array.isArray(draft.selectedDeliveryUrls) ? draft.selectedDeliveryUrls.length : 0,
    deliveryPhotoUrls: deliverySplit.fresh,
    deliveryNoted: deliverySplit.noted,
    workAdviceAt: text(workAdvice.updatedAt),
    imageNotesMap,
    factPack,
  }
}

function fingerprintFor(kind, ctx) {
  const picked = kind === 'work'
    ? {
        v: 'owner-all',
        quoteLines: ctx.quoteLines,
        workItems: ctx.workItems,
        workPhotos: (ctx.workPhotoSlots || []).map((row) => ({
          slot: row.slot,
          url: row.url,
          partName: row.partName,
        })),
      }
    : kind === 'inspect'
      ? {
          // v6：指纹用「全部检测图」去参后的路径，避免观察摘要落库后 fresh 变空被误标 stale
          v6: 'inspect_v3',
          complaint: ctx.complaint,
          inspectItems: ctx.inspectItems,
          intakeBrief: ctx.intakeBrief,
          inspectPhotos: (ctx.inspectPhotoUrlsAll || ctx.inspectPhotoUrls || [])
            .map((url) => mediaBare(url))
            .filter(Boolean)
            .sort(),
        }
      : {
        complaint: ctx.complaint,
        quoteLines: ctx.quoteLines,
        workItems: ctx.workItems,
        warrantyPeriod: ctx.warrantyPeriod,
        warrantyNotes: ctx.warrantyNotes,
        acceptance: ctx.acceptance || null,
        hasExterior: ctx.hasExterior,
        selectedCount: ctx.selectedCount,
        workAdviceAt: ctx.workAdviceAt,
      }
  return crypto.createHash('sha1').update(JSON.stringify({ v: kind, ...picked })).digest('hex')
}

async function patchNode(albumId, kind, mutator) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) return null
  const pkg = album.contentPackageJson && typeof album.contentPackageJson === 'object' ? album.contentPackageJson : {}
  const nodes = sortFlowNodes(pkg.flowNodes)
  const index = nodes.findIndex((item) => item && item.kind === kind)
  if (index < 0) return null
  nodes[index] = mutator(nodes[index]) || nodes[index]
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: { ...pkg, flowVersion: FLOW_VERSION, flowNodes: nodes } },
  })
  return nodes[index]
}

function buildSlotByUrl(photoSlots) {
  const map = new Map()
  ;(Array.isArray(photoSlots) ? photoSlots : []).forEach((row) => {
    const key = mediaBare(row && row.url)
    if (!key) return
    map.set(key, {
      slot: Number(row && row.slot) || 0,
      findingId: text(row && row.findingId),
      url: text(row && row.url),
      maskedUrl: imageMaskedUrl({ maskedUrl: row && row.maskedUrl }),
    })
  })
  return map
}

function writeInspectAdviceDebug(albumId, payload) {
  try {
    const fs = require('fs')
    const path = require('path')
    const dir = path.join(__dirname, '../../data/inspect-advice-debug')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${String(albumId || 'unknown')}-last.json`)
    fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...payload }, null, 2), 'utf8')
  } catch (_) {
    /* 调试落盘失败不影响主流程 */
  }
}

/**
 * 脱敏后 URL 与草稿原图不同；必须按「原图 → 脱敏图」成对保留，才能用原图查 photoSlots.slot。
 */
async function writeMasksOntoNodes(albumId, pairs) {
  const id = text(albumId)
  // 有打码图或明确结论（含 ok_no_privacy）都要写回；禁止只收下带 maskedUrl 的
  const list = (Array.isArray(pairs) ? pairs : []).filter(
    (row) =>
      row &&
      text(row.rawUrl) &&
      (text(row.maskedUrl) || text(row.maskOutcome)),
  )
  if (!id || !list.length) return
  const { persistMaskedPairsToAlbumFlow } = require('./desensitize.service')
  await persistMaskedPairsToAlbumFlow(id, list)
}

async function prepareVisionAttachments(urls, slotByUrl) {
  const attached = []
  const seen = new Set()
  for (const raw of Array.isArray(urls) ? urls : []) {
    const originalUrl = String(raw || '').trim()
    if (!originalUrl || seen.has(originalUrl)) continue
    seen.add(originalUrl)
    const meta = slotByUrl ? slotByUrl.get(mediaBare(originalUrl)) : null
    attached.push({
      originalUrl,
      safeUrl: originalUrl,
      slot: meta && meta.slot ? Number(meta.slot) : 0,
      findingId: meta ? text(meta.findingId) : '',
      fromNode: false,
    })
  }
  return attached
}

async function runLlm(instruction, urls, label, options = {}) {
  const engines = resolveConfiguredNodeAiReviewEngines()
  if (!engines.length) return null
  const { chatCompletion } = require('../lib/dashscope-chat')
  const { responsesCompletion } = require('../lib/responses-chat')
  const tag = label || 'Photo'
  const slotByUrl = options.slotByUrl instanceof Map ? options.slotByUrl : null
  const attached = await prepareVisionAttachments(urls, slotByUrl)
  // 先想后 JSON；不强制 response_format，避免 masks 嵌套时通义中途掐断
  const fullInstruction = [
    '步骤：先把附图和业务要点看完（含敏感区），想清楚后再输出。',
    '最终只输出一个 JSON 对象，前后不要解释、不要 markdown 代码块。',
    instruction,
  ].join('\n')
  const content = attached.length
    ? [{ type: 'text', text: fullInstruction }].concat(
        attached.map((row, index) => {
          // 必须标真实 photoSlots.slot，禁止用附图数组下标冒充槽位号
          const caption = row.slot
            ? `图${row.slot}。只根据这一张判断内容，不要用其它图代替。`
            : `${tag} image ${index + 1}`
          return [
            { type: 'text', text: caption },
            { type: 'image_url', image_url: { url: row.safeUrl } },
          ]
        }).flat(),
      )
    : fullInstruction
  let textOut = null
  console.info('[step-advice] llm start', {
    label: tag,
    urlCount: attached.length,
    engines: engines.map((e) => `${e.vendor}/${e.model}`),
  })
  for (const engine of engines) {
    try {
      const callModel = engine.protocol === 'responses' ? responsesCompletion : chatCompletion
      const result = await callModel({
        apiUrl: engine.apiUrl,
        apiKey: engine.apiKey,
        model: engine.model,
        messages: [
          {
            role: 'system',
            content:
              '你是修理厂助手。先想清楚再回答。最终只输出一个 JSON；自然语言字段必须用简体中文。不要因为表单看起来填过了就说没有意见。',
          },
          { role: 'user', content },
        ],
        temperature: 0.2,
        responseFormat: undefined,
        enableThinking: engine.vendor === 'dashscope' ? false : undefined,
        timeoutMs: Math.min(Number(engine.timeoutMs || 60000), 45000),
      })
      textOut = result && result.text
      if (textOut) {
        console.info('[step-advice] llm ok', {
          label: tag,
          vendor: engine.vendor,
          model: engine.model,
          rawLen: String(textOut).length,
        })
        try {
          const { queueApplyModelMasks } = require('./model-mask.service')
          queueApplyModelMasks(attached.map((row) => row.originalUrl), textOut, {
            albumId: options.albumId || '',
          })
        } catch (_) {
          /* 打码失败不影响出意见 */
        }
        break
      }
    } catch (err) {
      console.warn('[step-advice] llm fail', {
        label: tag,
        vendor: engine.vendor,
        model: engine.model,
        error: String((err && err.message) || err || '').slice(0, 220),
      })
    }
  }
  if (typeof options.onResult === 'function') {
    options.onResult({
      label: tag,
      requestedUrlCount: (Array.isArray(urls) ? urls : []).length,
      safeUrlCount: attached.length,
      // 覆盖校验用原图 key，与 photoSlots.url 对齐
      attachedSlots: attached.map((row) => ({
        slot: row.slot,
        findingId: row.findingId,
        url: row.originalUrl,
        safeUrl: row.safeUrl,
        fromNode: Boolean(row.fromNode),
      })),
      safeUrlsIdentical: new Set(attached.map((row) => mediaBare(row.safeUrl))).size < attached.length,
      text: textOut,
    })
  }
  return textOut
}

function workInstruction(ctx) {
  const slots = ctx.workPhotoSlots || []
  return [
    '你是修理厂的施工顾问，帮店员看这一步留证齐不齐。',
    '对照已经确认的报价行。不要改价格。不要自己挪图，只建议。',
    '前序节点只带文字，不要再看那些图。本步只看施工项和这次的施工图。',
    '车主要看做成了什么、换了什么件；店员姿势和工具特写不算留证。',
    '提醒：报价有施工无，类型写「缺项」；施工有报价无，类型写「增项」；该拍还没拍，类型写「留证」。',
    '填写建议：只给还没有施工说明、并且已经有照片的项写描述。项目填该项名称。',
    '拆分建议：某张图更像另一项时，检测项目填已有施工项名称，图片用["图1"]。已经挂对的不要再写。其它键留空。',
    `参考材料：${JSON.stringify({
      prior: {
        intake: ctx.intakeAdviceSummary,
        intakeNoted: ctx.intakeNoted,
        inspect: ctx.inspectAdviceSummary,
        inspectNoted: ctx.inspectNoted,
        quoteLines: ctx.quoteLines,
        workNoted: ctx.workNoted,
      },
      workItems: ctx.workItems,
      photos: slots.map((row) => ({ 图: `图${row.slot}`, 现在挂在: row.partName })),
    })}`,
    require('./model-mask-instruction').MODEL_MASKS_INSTRUCTION,
    '只返回 JSON：{"故障分析":"","建议补充检测":[],"拆分建议":[{"检测项目":"已有施工项名称","图片":["图1"],"描述":"这张更像这一项。","处理意见":""}],"填写建议":[{"项目":"已有施工项名称","描述":"更换了开裂的下摆臂胶套。"}],"简述":"","问答":[],"提醒":[{"类型":"缺项","标题":"下摆臂","正文":"报价有这项，施工还没有照片。"}],"masks":[{"imageSlot":1,"regions":[{"kind":"face","left":0,"top":0,"width":0,"height":0}]}]}',
  ].join('\n')
}

function inspectionContextPayload(ctx, options = {}) {
  const force = Boolean(options && options.force)
  const visionUrls = Array.isArray(options && options.visionUrls)
    ? options.visionUrls
    : (ctx.inspectPhotoUrls || [])
  const photoSlots = (Array.isArray(ctx.inspectPhotoSlots) ? ctx.inspectPhotoSlots : []).map((row) => ({
    slot: row.slot,
    findingId: row.findingId,
    partName: row.partName || '',
  }))
  const visionSlots = visionUrls
    .map((url) => {
      const hit = (ctx.inspectPhotoSlots || []).find((row) => mediaBare(row.url) === mediaBare(url))
      return hit ? hit.slot : null
    })
    .filter(Boolean)
  return {
    complaint: ctx.complaint,
    intakeContext: ctx.intakeAdviceSummary,
    intakeNoted: ctx.intakeNoted,
    items: ctx.inspectItems,
    inspectNoted: force ? [] : ctx.inspectNoted,
    photoSlots,
    newPhotoSlots: visionSlots.length ? visionSlots : visionUrls.map((_, i) => i + 1),
  }
}

function inspectionInstruction(ctx, options = {}) {
  const payload = inspectionContextPayload(ctx, options)
  const byFinding = new Map()
  ;(Array.isArray(payload.photoSlots) ? payload.photoSlots : []).forEach((row) => {
    const id = text(row && row.findingId) || '未分组'
    if (!byFinding.has(id)) byFinding.set(id, [])
    byFinding.get(id).push(`图${row.slot}`)
  })
  const pileText = byFinding.size
    ? [...byFinding.values()].map((list) => `- ${list.join('、')} 在同一条里，只能在这几张之间归并`).join('\n')
    : '- 本次没有检测图'
  const material = {
    客户诉求: payload.complaint || '',
  }
  if (!byFinding.size) {
    return [
      '你是修理厂的检测顾问，帮店员整理检测这一步的意见。',
      '这次还没有检测照片。不要编照片，不要编检测项目，不要写拆分。',
      '',
      '1. 故障分析只根据接车时的客户诉求。',
      '从专业汽修的角度，把这个症状所有可能的原因列出来，按可能性从高到低排。',
      '每种可能占一段，用1、2、3、4分行。写入「故障分析」。',
      '',
      '2. 「建议补充检测」写出接下来要查的项目，一段一项。没有照片，就不要从这份清单里删项。',
      '',
      '逐张看图、逐张归类、拆分建议都用空数组。',
      '不要复述接车时车身四周有没有拍全。',
      '',
      `参考材料：${JSON.stringify(material)}`,
      '',
      '只返回 JSON，不要其它文字：',
      '{"故障分析":"1. 第一种可能。\\n2. 第二种可能。","逐张看图":[],"逐张归类":[],"拆分建议":[],"建议补充检测":["接下来要查的一项"],"masks":[]}',
    ].join('\n')
  }
  return [
    '你是修理厂的检测顾问，帮店员整理检测这一步的意见。',
    '按下面五步思考，五步的结果都写进这一个 JSON。',
    '',
    '1. 故障分析只根据接车时的客户诉求，不要看这次上传的检测照片。',
    '从专业汽修的角度，把这个症状所有可能的原因列出来，按可能性从高到低排。',
    '每种可能占一段，用1、2、3、4分行。写入「故障分析」。',
    '',
    '2. 再单独看照片。按图1、图2的顺序，每张图独立看，前面的图不影响后面的图。',
    '只记录这张图里实际有的内容。图里没有的损伤不要编。这一步不要参考客户诉求。',
    '每张图写一条，写入「逐张看图」。',
    '',
    '3. 只根据这一张图的内容，判断它对应哪个检测项目。',
    '漆面和划痕归到划痕检测，底盘照片归到底盘检测，制动盘归到制动盘检查。',
    '不要用客户诉求或第1步的句子给照片起名。',
    '每张图写一条，写入「逐张归类」。',
    '',
    '4. 把同一条里、语义上属于同一检测项目的照片分成一组。',
    '结合这一组全部照片，用一段话说清：说明了什么问题，要不要马上处理，不处理会怎样。',
    '图里看不出后果就不要编。描述里不要写「需处理」「需关注」「状态良好」「仅记录」。',
    '每组另写「处理意见」，只能是这四个词里的一个：状态良好、需关注、需处理、仅记录。按这一组的实际情况选，不要总写需处理。',
    '已经分在不同条里的照片不要并到一起。写入「拆分建议」。',
    '',
    '5. 用第4步得到的检测项目，对照第1步那份清单。',
    '只有照片里真正拍到、能对上的项，才可从「建议补充检测」去掉。',
    '照片没盖住的项必须保留，一段一项；保养、底盘、制动、电气等各类目同理。',
    '禁止因为「大致做过了」就整表清空。仅当第1步每一条都有对应实拍证据时，才可用空数组。',
    '',
    '不要复述接车时车身四周有没有拍全。',
    '参考材料只给第1步用。给照片归类时不要用它。',
    '',
    '同一条里的照片：',
    pileText,
    '',
    `参考材料：${JSON.stringify(material)}`,
    '',
    '只返回 JSON，不要其它文字。示例只说明有哪几个键，句子按这次的诉求和照片写，不要照抄示例里的占位话：',
    '{"故障分析":"1. 第一种可能。\\n2. 第二种可能。","逐张看图":[{"图":"图1","内容":"只写这一张里看见的"},{"图":"图2","内容":"只写这一张里看见的，不要复述图1"}],"逐张归类":[{"图":"图1","检测项目":"按图1内容起的项目名"},{"图":"图2","检测项目":"按图2内容起的项目名"}],"拆分建议":[{"检测项目":"与第3步同一名称","图片":["图1"],"描述":"这一组说明了什么，要不要马上处理，不处理会怎样","处理意见":"需处理"}],"建议补充检测":["第1步里还没有照片覆盖的那一项"],"masks":[{"imageSlot":1,"regions":[{"kind":"plate","left":0,"top":0,"width":0,"height":0}]}]}',
    require('./model-mask-instruction').MODEL_MASKS_INSTRUCTION,
  ].join('\n')
}

function multiPhotoFindingIds(ctx) {
  const counts = new Map()
  ;(Array.isArray(ctx.inspectPhotoSlots) ? ctx.inspectPhotoSlots : []).forEach((row) => {
    const id = text(row && row.findingId)
    if (!id) return
    counts.set(id, (counts.get(id) || 0) + 1)
  })
  // 多图项：一条检测项上挂了两张及以上的图
  ;(Array.isArray(ctx.inspectItems) ? ctx.inspectItems : []).forEach((row) => {
    const id = text(row && row.id)
    const photos = Number(row && row.photos) || 0
    if (!id || photos < 2) return
    counts.set(id, Math.max(counts.get(id) || 0, photos))
  })
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([id]) => id)
}

function deliveryInstruction(ctx) {
  const { scrubPiiDeep } = require('../utils/scrub-pii-text')
  const safeFacts = scrubPiiDeep({
    complaint: ctx.complaint,
    intake: ctx.intakeAdviceSummary,
    inspect: ctx.inspectAdviceSummary,
    quoteLines: ctx.quoteLines,
    workItems: ctx.workItems,
    workAdvice: ctx.workAdviceSummary,
    factPack: ctx.factPack || null,
    warrantyPeriod: ctx.warrantyPeriod,
    warrantyNotes: ctx.warrantyNotes,
    acceptance: ctx.acceptance || null,
    hasExterior: ctx.hasExterior,
    selectedCount: ctx.selectedCount,
  })
  return [
    '你是修理厂的交车顾问。根据整单事实，写出本次维修简述和车主会问的问题。',
    '不要复述接车、检测、报价、施工里接下来做什么。不要写「系统内缺少」，不要编没做的钣喷。',
    '简述：120到200字的一段话，写进车主报告抬头，按自然顺序覆盖五件事——①车主为什么来（诉求）；②查出了什么（挑与诉求最相关的两三项检测结果并带结果状态，检测中「需关注」的项也要点到）；③怎么修的（关键工艺或用料特色，如原厂件、按规定力矩复紧、举升作业，不写价格）；④修完怎么确认的（验收方法与结果）；⑤交车叮嘱与质保（期限/范围，需关注但本次未处理的项怎么观察）。这是提炼不是流水账：不要逐节点复述全部内容，一句话能说清的不拆成几句。不要写价格和隐私，不编没做的事。',
    '验收起草（重要）：先判断有没有验收依据，在输出里如实填「验收依据」字段（“有”或“无”），再决定起草哪些段。「验收依据=有」的定义：附图画面确实与本次维修部位或车主诉求相关、能看出修复后的状态或前后对比（修复面对比、举升检查、路试、仪表读数；外观类维修如划痕修复、漆面翻新的修复后整车/外观照也算）；「验收依据=无」的定义：附图与本次维修无关（如修底盘却只传了整车外观照）或没有任何相关图与文字。标准段对照车主诉求与检测发现即可定，无论有无依据都起草。过程与结果只有在「验收依据=有」时才起草（试车工况、修复面对比、举升检查、仪表读数等，写具体避免绝对化说法）；「验收依据=无」时过程与结果必须写空字符串——系统会在代码层校验，写了也会被清空，没验过就是没验过，不要凭维修事实脑补成「已验合格」，同时在「提醒」里给补传建议（结合本次维修项目说明该补传哪类验收照片、验收文字怎么写），只给建议不代写。依据=有但证据不全（缺某个角度、缺复验画面）的，起草同时在提醒里建议补传。参考材料里已有验收（acceptance）时照样起草，店员自行比对取舍；若已写的验收有绝对化表述或没有可验证依据的效果描述，在提醒里指出并给更稳妥的替代说法。',
    '问答：3到8条，随车主报告用于公开案例页（店员核对后公开），也是其他消费者向 AI 咨询时会被检索到的答案：问句用消费者真实会问的自然问法，尽量带上车型与项目并含「这例」，脱离页面也知道问的是哪台车什么项目。优先覆盖两类：①本次维修的注意事项——修后护理、复查时机、禁忌（含检测中「需关注」项的观察方法）和质保与返修（期限内出问题怎么找门店），这两条至少各写一条；②同类问题在修前怎么判断（出现什么症状该来检查、拖久会怎样）和由这例稍作延伸的普遍问题（这类部件一般多久老化、原厂件与副厂件差别等），用通用汽修常识回答，只讲常识、不编本案没有的检测结论，不制造焦虑推加项，答句末尾点明「具体以到店检测为准」。答句先写这例的具体事实（部位、状态、做了什么、结果如何，禁止「已正常处理」这类空话），再接一句叮嘱；延伸类问答写通用情况并说明是常识。参考材料里有车龄（年款）或里程时，可写一条「这车龄/公里数做这个有没有必要」式问答，只解释不推断。事实不够 3 条时可以写和本案相关的常见问。',
    '图说：对本次附图（图1、图2…）各写一句15到30字的公开图说，描述画面可见的部件、动作或状态；只写与维修和车辆直接相关的主体，不描述无关背景（居民楼、行人、街景、地面等），不写推测结论，不写车牌与人脸。',
    '提醒：只写本步还缺的，比如交车照、质保期限空；验收过程/结果缺依据时，给该补传哪类照片、文字怎么写的一般性建议（这类建议只是引导，不需要应用）。其它键留空。店员点应用才写入。',
    `参考材料：${JSON.stringify(safeFacts)}`,
    require('./model-mask-instruction').MODEL_MASKS_INSTRUCTION,
    '只返回 JSON（「验收依据」如实填“有”或“无”；“无”时验收的过程/结果必须写空字符串）：{"故障分析":"","建议补充检测":[],"拆分建议":[],"填写建议":[],"简述":"车主反映过减速带左前异响，检查确认左下摆臂胶套老化开裂，其余底盘件状态良好。更换原厂下摆臂胶套总成，按规定力矩复紧，并顺带举升检查了球头与衬套。完工后低速过减速带路试，异响消失。近期少过剧烈颠簸；右前衬套有轻微老化，暂无需处理，日常留意即可。质保 12 个月，同部位出问题免费复检。","验收依据":"有","验收":{"标准":"低速过减速带无异响，底盘各部件运转正常。","过程":"完工后同工况路试，对照接车时的异响路段复验。","结果":"异响消失，车主随车体验确认。"},"问答":[{"问":"这例下摆臂胶套换完要注意什么？","答":"这例已更换新胶套并做过路试，近期少过剧烈颠簸，磨合几天。"},{"问":"这例质保怎么算？","答":"这例质保 12 个月，同部位出问题可免费复检。"},{"问":"车底盘有异响拖着不修会怎么样？","答":"衬套这类橡胶件开裂后一般会逐渐加重，异响变大还可能连带轮胎偏磨，建议出现就检查，具体以到店检测为准，这是通用情况。"}],"图说":[{"图":"图1","说":"举升后拆下的下摆臂胶套，胶体开裂明显。"}],"提醒":[{"类型":"","标题":"","正文":""}],"masks":[{"imageSlot":1,"regions":[{"kind":"face","left":0,"top":0,"width":0,"height":0}]}]}',
  ].join('\n')
}

function mergeImageNotesFromSlots(node, slots, imageNotes, albumId) {
  if (!node || !Array.isArray(imageNotes) || !imageNotes.length) return node
  const draft = contentOfFlowNode(node)
  const map = { ...(draft.imageNotes && typeof draft.imageNotes === 'object' ? draft.imageNotes : {}) }
  imageNotes.forEach((row) => {
    const slot = Number(row && row.slot)
    const note = text(row && row.note)
    const hit = (Array.isArray(slots) ? slots : []).find((item) => Number(item.slot) === slot)
    const url = hit ? hit.url : ''
    const key = mediaBare(url)
    if (key && note) map[key] = note.slice(0, 120)
  })
  return {
    ...node,
    content: { ...draft, imageNotes: map },
  }
}

function mergeImageNotesFromUrlList(node, urls, imageNotes) {
  if (!node || !Array.isArray(imageNotes) || !imageNotes.length) return node
  const draft = contentOfFlowNode(node)
  const map = { ...(draft.imageNotes && typeof draft.imageNotes === 'object' ? draft.imageNotes : {}) }
  imageNotes.forEach((row) => {
    const slot = Number(row && row.slot)
    const note = text(row && row.note)
    const url = (Array.isArray(urls) ? urls : [])[slot - 1]
    const key = mediaBare(url)
    if (key && note) map[key] = note.slice(0, 120)
  })
  return {
    ...node,
    content: { ...draft, imageNotes: map },
  }
}

async function runJob(albumId, kind, options = {}) {
  const force = Boolean(options && options.force)
  const key = `${kind}-advice:${albumId}`
  if (jobsInFlight.has(key)) return
  jobsInFlight.add(key)
  try {
    const { loadAlbum } = require('./service-album.service')
    const album = await loadAlbum(albumId)
    if (!album) return
    const ctx = contextOf(album, await notesForAlbumImages(album))
    const fingerprint = fingerprintFor(kind, ctx)
    const { field, nodeKind } = nodeField(kind)
    // 检测：默认只送还没有观察摘要的图。点刷新才把本步检测图再送进去。
    const inspectFresh = ctx.inspectPhotoUrls || []
    const inspectAll = ctx.inspectPhotoUrlsAll || inspectFresh
    const reVisionInspect = kind === 'inspect' && force
    const urls =
      kind === 'work'
        ? (ctx.workPhotoSlots || []).map((row) => row.url)
        : kind === 'inspect'
          ? (reVisionInspect ? inspectAll : inspectFresh)
          : ctx.deliveryPhotoUrls || []
    const slotByUrl =
      kind === 'inspect'
        ? buildSlotByUrl(ctx.inspectPhotoSlots)
        : kind === 'work'
          ? buildSlotByUrl(ctx.workPhotoSlots)
          : null
    const llmTraces = []
    const llmOpts = {
      slotByUrl,
      albumId,
      onResult: (info) => {
        llmTraces.push(info)
      },
    }
    const inspectOpts = { force: reVisionInspect, visionUrls: urls }
    let raw = await runLlm(
      kind === 'work'
        ? workInstruction(ctx)
        : kind === 'inspect'
          ? inspectionInstruction(ctx, inspectOpts)
          : deliveryInstruction(ctx),
      urls,
      kind === 'work' ? 'Work' : kind === 'inspect' ? 'Inspect' : 'Delivery',
      llmOpts,
    )
    let parsed = kind === 'work'
      ? parseWorkAdvice(raw, ctx.workItems, ctx.workPhotoSlots)
      : kind === 'inspect'
        ? parseInspectionAdvice(raw, ctx.inspectItems, urls, ctx.inspectPhotoSlots)
        : parseDeliveryAdvice(raw)
    const attachedUrlKeys = new Set()
    llmTraces.forEach((trace) => {
      ;(Array.isArray(trace && trace.attachedSlots) ? trace.attachedSlots : []).forEach((row) => {
        const key = mediaBare(row && row.url)
        if (key) attachedUrlKeys.add(key)
      })
    })
    const ok = adviceHasContent(parsed, kind)
    // 简述/问答只挂在意见里，店员点应用才写入节点草稿；确认交车时再同步 archiveCopy
    const advicePayload =
      kind === 'delivery'
        ? (() => {
            const { archiveCopy: _drop, ...rest } = parsed
            return rest
          })()
        : parsed
    // 图说按本次附图槽位映射成 URL 键，确认交车时随报告带进公开图注
    if (kind === 'delivery' && advicePayload && Array.isArray(advicePayload.publicCaptions)) {
      const captionsByUrl = {}
      ;(advicePayload.publicCaptions || []).forEach((row) => {
        const url = (Array.isArray(urls) ? urls : [])[Number(row && row.slot) - 1]
        const key = mediaBare(url)
        if (key && row.note) captionsByUrl[key] = row.note
      })
      advicePayload.publicCaptions = captionsByUrl
    }
    if (kind === 'inspect') {
      writeInspectAdviceDebug(albumId, {
        ok,
        multiPhotoFindingIds: multiPhotoFindingIds(ctx),
        photoSlots: ctx.inspectPhotoSlots,
        urlsRequested: urls,
        attachedUrlKeys: [...attachedUrlKeys],
        traces: llmTraces.map((trace) => ({
          label: trace.label,
          requestedUrlCount: trace.requestedUrlCount,
          safeUrlCount: trace.safeUrlCount,
          safeUrlsIdentical: Boolean(trace.safeUrlsIdentical),
          attachedSlots: trace.attachedSlots,
          raw: String(trace.text || '').slice(0, 12000),
        })),
        steps: inspectStepsFromRaw((llmTraces.find((trace) => trace && trace.label === 'Inspect') || llmTraces[0] || {}).text),
        finalEdits: Array.isArray(parsed && parsed.edits) ? parsed.edits : [],
        faultAnalysis: text(parsed && parsed.faultAnalysis).slice(0, 500),
        inspectOrder: Array.isArray(parsed && parsed.inspectOrder) ? parsed.inspectOrder : [],
        inspectOrderLen: Array.isArray(parsed && parsed.inspectOrder) ? parsed.inspectOrder.length : 0,
      })
    }
    await patchNode(albumId, nodeKind, (item) => {
      let next = {
        ...item,
        [field]: ok
          ? { status: 'ready', fingerprint, ...advicePayload, errorMessage: '', updatedAt: new Date().toISOString() }
          : {
              ...(item[field] || {}),
              ...advicePayload,
              status: 'failed',
              fingerprint,
              errorMessage: '未能出意见',
              updatedAt: new Date().toISOString(),
            },
      }
      const notes = Array.isArray(parsed.imageNotes) ? parsed.imageNotes : []
      if (kind === 'work') {
        next = mergeImageNotesFromSlots(next, ctx.workPhotoSlots, notes)
      } else if (kind === 'inspect') {
        // 槽位号跟 photoSlots 对齐，不能按「本次附图下标」写回
        next = mergeImageNotesFromSlots(next, ctx.inspectPhotoSlots, notes)
      } else {
        next = mergeImageNotesFromUrlList(next, urls, notes)
      }
      return next
    })
    // 与接车一致：看图返回的 masks 落到本批附图；只打一次，不挡意见正文
    if (ok && urls.length) {
      try {
        const { queueApplyModelMasks } = require('./model-mask.service')
        queueApplyModelMasks(urls, raw, { albumId })
      } catch (_) {
        /* 打码失败不影响出意见 */
      }
    }
    if (ok) {
      try {
        const { markAlbumAiAnalysisConsumed } = require('./merchant-plan-quota.service')
        await markAlbumAiAnalysisConsumed(albumId)
      } catch (_) {
        /* ignore */
      }
    }
  } catch (err) {
    const { field, nodeKind } = nodeField(kind)
    await patchNode(albumId, nodeKind, (item) => ({
      ...item,
      [field]: {
        ...((item && item[field]) || {}),
        status: 'failed',
        errorMessage: text(err && err.message).slice(0, 80) || '未能出意见',
        updatedAt: new Date().toISOString(),
      },
    })).catch(() => {})
  } finally {
    jobsInFlight.delete(key)
  }
}

async function queueIfNeeded(album, kind, options = {}) {
  const { resolveCapabilityForMerchant } = require('./node-ai-review.service')
  const capability = await resolveCapabilityForMerchant(album.merchantId)
  if (!capability || !capability.entitled || !capability.llmEnabled) return { queued: false, skipped: true }
  const ctx = contextOf(album, await notesForAlbumImages(album))
  if (kind === 'work' && !ctx.quoteLines.length && !ctx.workItems.length) {
    const err = new Error('先有报价或施工项')
    err.status = 400
    throw err
  }
  if (kind === 'inspect' && !text(ctx.complaint) && !ctx.inspectItems.length && !(ctx.inspectPhotoSlots || []).length) {
    const err = new Error('先写车主诉求')
    err.status = 400
    throw err
  }
  const force = Boolean(options && options.force)
  const fingerprint = fingerprintFor(kind, ctx)
  const { field, nodeKind } = nodeField(kind)
  const node = readFlowNodes(album).find((item) => item && item.kind === nodeKind)
  const current = (node && node[field]) || {}
  const hasReady = current.status === 'ready' && adviceHasContent(current, kind)
  // 有上次结果默认复用；仅 force 才重跑
  if (hasReady && !force) {
    return {
      queued: false,
      reuse: true,
      stale: text(current.fingerprint) !== fingerprint,
    }
  }
  {
    const { assertAiAnalysisQuotaAvailable } = require('./merchant-plan-quota.service')
    await assertAiAnalysisQuotaAvailable(album.merchantId, album.id)
  }
  await patchNode(album.id, nodeKind, (item) => {
    const prev = (item && item[field]) || {}
    return {
      ...item,
      [field]: {
        ...prev,
        status: 'queued',
        fingerprint,
        updatedAt: new Date().toISOString(),
      },
    }
  })
  setImmediate(() => {
    runJob(album.id, kind, { force }).catch(() => {})
  })
  return { queued: true, stale: false }
}

function sanitizeStepAdviceForView(advice, kind, options = {}) {
  if (!advice || typeof advice !== 'object' || !text(advice.status)) return null
  const status = text(advice.status)
  const fingerprint = text(advice.fingerprint)
  const contentFingerprint = text(options.contentFingerprint)
  const contentStale =
    Boolean(fingerprint) &&
    Boolean(contentFingerprint) &&
    fingerprint !== contentFingerprint
  // 旧版提示词生成的交车意见（无验收起草）视为过时，引导店员刷新
  const adviceOutdated = kind === 'delivery' && Number(advice.schema || 1) < 3
  const hasBody = adviceHasContent(advice, kind)
  const stale = (contentStale || adviceOutdated) && (status === 'ready' || hasBody)
  const isWaiting = status === 'queued' || status === 'running'
  const base = {
    status,
    fingerprint,
    stale,
    isWaiting,
    waitHint: isWaiting ? (hasBody ? '正在更新' : '正在出意见') : '',
    errorMessage: status === 'failed' ? text(advice.errorMessage) || '未能出意见' : '',
    updatedAt: text(advice.updatedAt),
  }
  if (kind === 'work') {
    return {
      ...base,
      scope: text(advice.scope),
      note: text(advice.note),
      gaps: Array.isArray(advice.gaps) ? advice.gaps : [],
      items: Array.isArray(advice.items) ? advice.items : [],
      groups: Array.isArray(advice.groups) ? advice.groups : [],
      photoPlan: Array.isArray(advice.photoPlan) ? advice.photoPlan : [],
    }
  }
  if (kind === 'inspect') {
    return {
      ...base,
      scope: text(advice.scope),
      faultAnalysis: text(advice.faultAnalysis),
      inspectOrder: Array.isArray(advice.inspectOrder) ? advice.inspectOrder : [],
      partHints: Array.isArray(advice.partHints) ? advice.partHints : [],
      edits: Array.isArray(advice.edits) ? advice.edits : [],
      shop: Array.isArray(advice.shop) ? advice.shop : [],
      items: Array.isArray(advice.items) ? advice.items : [],
    }
  }
  return {
    ...base,
    repairBrief: text(advice.repairBrief),
    ownerFaqs: Array.isArray(advice.ownerFaqs) ? advice.ownerFaqs : [],
    acceptance: advice.acceptance && typeof advice.acceptance === 'object' ? advice.acceptance : null,
    tips: Array.isArray(advice.tips) ? advice.tips : [],
    repair: advice.repair || null,
    warranty: advice.warranty || null,
    care: advice.care || null,
    processIssues: Array.isArray(advice.processIssues) ? advice.processIssues : [],
    fill: advice.fill || null,
  }
}

module.exports = {
  queueWorkAdviceIfNeeded: (album, options) => queueIfNeeded(album, 'work', options),
  queueDeliveryAdviceIfNeeded: (album, options) => queueIfNeeded(album, 'delivery', options),
  queueInspectionAdviceIfNeeded: (album, options) => queueIfNeeded(album, 'inspect', options),
  fingerprintFor,
  contextOf,
  sanitizeStepAdviceForView,
  parseWorkAdvice,
  parseDeliveryAdvice,
  parseInspectionAdvice,
  inspectStepsFromRaw,
}
