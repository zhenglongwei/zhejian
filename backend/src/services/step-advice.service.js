/**
 * 施工、检测、交车的 AI 分析。
 * 真源：docs/04_维修过程相册/29_节点AI分析_单据结构与状态流转梳理.md
 * 当前节点全文 + 前序分析要点/图摘要；图每张一生只送模型一次；英文提示词、中文 JSON。
 */
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { FLOW_VERSION } = require('../../vendor/shared/constants/service-flow-nodes')
const { parseReviewModelJson } = require('../utils/node-ai-review-rules')
const { resolveConfiguredNodeAiReviewEngines } = require('../lib/node-ai-review-llm-registry')
const { resolveShared } = require('../utils/resolve-shared')
const { normalizeOwnerFaqs, contentOfFlowNode } = resolveShared('utils/service-flow-docs.js')

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
        const url = text(typeof img === 'object' && img ? img.url || img.rawUrl || img.maskedUrl : img)
        if (!/^https?:\/\//.test(url) || urls.includes(url)) return
        urls.push(url)
      })
      if (urls.length) buckets.push({ partName, findingId, urls })
    })
  })
  const slots = []
  const used = new Set()
  const push = (bucket, url) => {
    if (!url || used.has(url) || slots.length >= 8) return
    used.add(url)
    slots.push({ slot: slots.length + 1, url, partName: bucket.partName, findingId: bucket.findingId })
  }
  buckets.forEach((bucket) => push(bucket, bucket.urls[0]))
  buckets.forEach((bucket) => bucket.urls.slice(1).forEach((url) => push(bucket, url)))
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

function parseWorkAdvice(raw, items, slots) {
  const parsed = parseReviewModelJson(raw) || {}
  const byId = new Map()
  ;(Array.isArray(parsed.items) ? parsed.items : []).forEach((row) => {
    const id = text(row && row.id)
    const body = text(row && row.body).slice(0, 80)
    const supplement = text(row && row.supplement).slice(0, 80)
    if (id) byId.set(id, { body, supplement })
  })
  const gaps = (Array.isArray(parsed.gaps) ? parsed.gaps : [])
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
  const written = (Array.isArray(items) ? items : [])
    .map((row) => {
      const noted = text(row && row.note)
      const name = text(row && row.name)
      const hit = byId.get(text(row && row.id)) || null
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
  const groups = (Array.isArray(parsed.groups) ? parsed.groups : [])
    .map((row) => {
      const slot = Number(row && row.slot)
      const partName = text(row && (row.partName || row.title)).slice(0, 16)
      const shot = bySlot.get(slot)
      if (!Number.isInteger(slot) || !shot || !partName || !names.has(partName)) return null
      if (shot.partName === partName || seenSlot.has(slot)) return null
      seenSlot.add(slot)
      return {
        slot,
        url: shot.url,
        partName,
        body: `这张更像是${partName}。`,
      }
    })
    .filter(Boolean)
    .slice(0, 4)
  const photoPlan = (Array.isArray(parsed.photoPlan) ? parsed.photoPlan : [])
    .map((row) => {
      const title = text(row && (row.title || row.partName)).slice(0, 20)
      const body = text(row && row.body).slice(0, 120)
      if (!title && !body) return null
      return { title: title || '留证', body }
    })
    .filter(Boolean)
    .slice(0, 6)
  return {
    scope: 'process',
    gaps,
    items: written,
    groups,
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
      question: text(row && (row.question || row.q)),
      answer: text(row && (row.answer || row.a)),
    })),
  ).slice(0, 5)
}

function parseDeliveryAdvice(raw) {
  const parsed = parseReviewModelJson(raw)
  if (!parsed) {
    return {
      repairBrief: '',
      ownerFaqs: [],
      tips: [],
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
    parsed.repairBrief ||
      (parsed.repair && parsed.repair.body) ||
      (parsed.talk && parsed.talk.repair) ||
      (legacyCopy && legacyCopy.summary),
  ).slice(0, 500)
  const ownerFaqs = parseOwnerFaqSuggestions(
    parsed.ownerFaqs ||
      parsed.faqs ||
      (legacyCopy && legacyCopy.faq) ||
      [],
  )
  const tips = (Array.isArray(parsed.tips) ? parsed.tips : [])
    .map((row, index) => {
      const title = text(row && row.title).slice(0, 40)
      const body = text(row && row.body).slice(0, 120)
      if (!title && !body) return null
      return { id: `tip_${index + 1}`, title, body }
    })
    .filter(Boolean)
    .slice(0, 4)
  return {
    repairBrief,
    ownerFaqs,
    tips,
    repair: repairBrief ? { title: '本次维修简述', body: repairBrief.slice(0, 200) } : null,
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
      (Array.isArray(advice.partHints) && advice.partHints.length > 0) ||
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

/** 故障分析：兼容字符串或分点数组（避免 Array.toString 变成「1.…,2.…」） */
function zhFaultAnalysis(value, max = 200) {
  if (Array.isArray(value)) {
    const lines = value
      .map((row) => zhOnly(row, Math.min(max, 120)))
      .filter(Boolean)
    return zhOnly(lines.join('\n'), max)
  }
  return zhOnly(value, max)
}

/** imageNotes：兼容数组或 { "1": "观察" } 按槽对象 */
function normalizeImageNotesInput(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const slot = resolveInspectSlotNumber(row.slot)
        const note = zhOnly(row.note || row.body || row.text, 80)
        const partName = zhOnly(row.partName || row.title, 16)
        if (!slot || !note) return null
        return { slot, partName, note }
      })
      .filter(Boolean)
  }
  if (raw && typeof raw === 'object') {
    return Object.keys(raw)
      .map((key) => {
        const slot = resolveInspectSlotNumber(key)
        const val = raw[key]
        const note =
          typeof val === 'string'
            ? zhOnly(val, 80)
            : zhOnly(val && (val.note || val.body || val.text), 80)
        const partName =
          typeof val === 'object' && val
            ? zhOnly(val.partName || val.title, 16)
            : ''
        if (!slot || !note) return null
        return { slot, partName, note }
      })
      .filter(Boolean)
      .sort((a, b) => a.slot - b.slot)
  }
  return []
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

/**
 * 模型已在 imageNotes 写出不同 partName（检测项目名，不一定是部位）时，程序只做结构化编 groups。
 * 同名槽合并；名称必须来自模型，禁止用故障分析/检测顺序猜名。
 */
function buildGroupsFromNamedImageNotes(imageNotes, findingSlots, slotUrl) {
  const slots = Array.isArray(findingSlots) ? findingSlots : []
  if (slots.length < 2) return []
  const slotSet = new Set(slots.map((row) => Number(row && row.slot)).filter((n) => n >= 1))
  const byName = new Map()
  ;(Array.isArray(imageNotes) ? imageNotes : []).forEach((row) => {
    const slot = Number(row && row.slot) || 0
    if (!slotSet.has(slot)) return
    const partName = zhOnly(row && row.partName, 16)
    if (!partName) return
    const url =
      (typeof slotUrl === 'function' ? text(slotUrl(slot)) : '') ||
      text((slots.find((s) => Number(s && s.slot) === slot) || {}).url)
    if (!url) return
    const advice = zhOnly(row && row.note, 120)
    if (!byName.has(partName)) {
      byName.set(partName, { partName, advice: '', result: '', images: [] })
    }
    const group = byName.get(partName)
    if (advice && !group.advice) group.advice = advice
    const bare = mediaBare(url)
    if (!group.images.some((img) => mediaBare(img.url) === bare)) {
      group.images.push({ url })
    }
  })
  const groups = [...byName.values()].filter((g) => g.partName && g.images.length)
  return groups.length >= 2 ? groups : []
}

/** 恰好一个多图项时，把模型写错的 findingId 重挂到该项；多个多图项则不猜 */
function soleMultiPhotoFindingId(items, photoSlots) {
  const ids = new Set()
  ;(Array.isArray(items) ? items : []).forEach((row) => {
    const id = text(row && row.id)
    if (id && Number(row && row.photos) >= 2) ids.add(id)
  })
  const slotCounts = new Map()
  ;(Array.isArray(photoSlots) ? photoSlots : []).forEach((row) => {
    const id = text(row && row.findingId)
    if (!id) return
    slotCounts.set(id, (slotCounts.get(id) || 0) + 1)
  })
  slotCounts.forEach((n, id) => {
    if (n >= 2) ids.add(id)
  })
  const list = [...ids]
  return list.length === 1 ? list[0] : ''
}

function parseInspectionAdvice(raw, items, photoUrls, photoSlots) {
  const parsed = parseReviewModelJson(raw) || {}
  const byItemId = new Map(
    (Array.isArray(items) ? items : []).map((row) => [text(row && row.id), row]).filter((pair) => pair[0]),
  )
  const urls = Array.isArray(photoUrls) ? photoUrls : []
  const slots = Array.isArray(photoSlots) ? photoSlots : []
  const soleMultiId = soleMultiPhotoFindingId(items, photoSlots)
  const resolveFindingId = (rawId) => {
    const findingId = text(rawId)
    if (!findingId) return ''
    if (byItemId.has(findingId)) return findingId
    if (soleMultiId) return soleMultiId
    return ''
  }
  const slotUrl = (slot) => {
    const n = resolveInspectSlotNumber(slot)
    if (!n) return ''
    const hit = slots.find((row) => Number(row && row.slot) === n)
    if (hit && hit.url) return text(hit.url)
    if (n <= urls.length) return text(urls[n - 1])
    return ''
  }
  const parseGroups = (list) =>
    (Array.isArray(list) ? list : [])
      .map((g) => {
        const partName = zhOnly(g && g.partName, 16)
        const advice = zhOnly(g && g.advice, 120)
        const images = (Array.isArray(g && g.images) ? g.images : [])
          .map((img) => {
            const url = text(typeof img === 'object' && img ? img.url : img)
            return url ? { url } : null
          })
          .filter(Boolean)
        const fromSlots = (Array.isArray(g && g.imageSlots) ? g.imageSlots : [])
          .map(slotUrl)
          .filter(Boolean)
          .map((url) => ({ url }))
        const shots = images.length ? images : fromSlots
        if (!partName || !shots.length) return null
        return { partName, advice, result: '', images: shots }
      })
      .filter(Boolean)

  const faultRaw = zhFaultAnalysis(parsed.faultAnalysis, 200)
  const faultAnalysis = isIntakeCoverageEcho(faultRaw) ? '' : faultRaw
  const inspectOrder = (Array.isArray(parsed.inspectOrder) ? parsed.inspectOrder : [])
    .map((row) => zhOnly(row, 40))
    .filter((row) => row && !isIntakeCoverageEcho(row))
    .slice(0, 6)
  const partHints = (Array.isArray(parsed.partHints) ? parsed.partHints : [])
    .map((row) => {
      const title = zhOnly(row && (row.title || row.partName), 16)
      const body = zhOnly(row && row.body, 80)
      if (!title || !body || isIntakeCoverageEcho(body)) return null
      return { title, body }
    })
    .filter(Boolean)
    .slice(0, 6)

  // 按检测项合并：拆图 + 文案只留一条
  const byFinding = new Map()
  const photos = []
  const mergeItem = (row) => {
    const findingId = resolveFindingId(row && (row.findingId || row.id))
    if (!findingId) return
    const body = zhOnly(row && row.body, 120)
    const partName = zhOnly(row && (row.partName || row.title), 16)
    const advice = zhOnly(row && row.advice, 120)
    const groups = parseGroups(row && row.groups)
    const prev = byFinding.get(findingId) || {
      findingId,
      partName: '',
      advice: '',
      body: '',
      groups: [],
    }
    if (partName) prev.partName = partName
    if (advice) prev.advice = advice
    if (body && !isIntakeCoverageEcho(body)) prev.body = body
    if (groups.length >= 2) prev.groups = groups
    else if (groups.length === 1 && !prev.partName) {
      prev.partName = groups[0].partName
      if (groups[0].advice) prev.advice = groups[0].advice
    }
    byFinding.set(findingId, prev)
  }

  ;(Array.isArray(parsed.edits) ? parsed.edits : []).forEach((row) => {
    const kind = text(row && row.kind)
    if (kind === 'photo') {
      const body = zhOnly(row && row.body, 120)
      if (!body || isIntakeCoverageEcho(body)) return
      photos.push({
        id: `edit_photo_${photos.length}`,
        kind: 'photo',
        findingId: resolveFindingId(row.findingId || row.id),
        body,
        canApply: false,
      })
      return
    }
    // item / text / split 一律按项合并
    if (kind === 'item' || kind === 'text' || kind === 'split' || !kind) mergeItem(row)
  })
  ;(Array.isArray(parsed.items) ? parsed.items : []).forEach((row) => {
    const findingId = resolveFindingId(row && row.id)
    const body = zhOnly(row && row.body, 120)
    if (!findingId || !body || isIntakeCoverageEcho(body) || byFinding.has(findingId)) return
    mergeItem({
      findingId,
      partName: zhOnly(row && (row.title || row.partName), 16),
      advice: body,
      body,
    })
  })
  ;(Array.isArray(parsed.gaps) ? parsed.gaps : []).forEach((row) => {
    const kindRaw = text(row && row.kind)
    const body = zhOnly(row && row.body, 120)
    const title = zhOnly(row && (row.title || row.partName), 16)
    if (!body || isIntakeCoverageEcho(body)) return
    if (kindRaw === 'unclear_photo' || kindRaw === 'follow_up' || kindRaw === 'how') {
      photos.push({
        id: `edit_photo_${photos.length}`,
        kind: 'photo',
        findingId: '',
        body: title ? `${title}：${body}` : body,
        canApply: false,
      })
      return
    }
    if (kindRaw === 'missing_item' || kindRaw === 'miss' || kindRaw === 'omit') {
      photos.push({
        id: `edit_photo_${photos.length}`,
        kind: 'photo',
        findingId: '',
        body: title ? `建议补查「${title}」。${body}` : body,
        canApply: false,
      })
    }
  })

  const imageNotes = normalizeImageNotesInput(parsed.imageNotes)
  // 空壳 groups：用模型已写的 imageNotes.partName 结构化（名称认模型）
  const findingIdsForHydrate = new Set()
  slots.forEach((row) => {
    const id = text(row && row.findingId)
    if (id) findingIdsForHydrate.add(id)
  })
  byItemId.forEach((_, id) => findingIdsForHydrate.add(id))
  findingIdsForHydrate.forEach((findingId) => {
    const findingSlots = slots.filter((row) => text(row && row.findingId) === findingId)
    if (findingSlots.length < 2) return
    const prev = byFinding.get(findingId) || {
      findingId,
      partName: '',
      advice: '',
      body: '',
      groups: [],
    }
    if (Array.isArray(prev.groups) && prev.groups.length >= 2) return
    const hydrated = buildGroupsFromNamedImageNotes(imageNotes, findingSlots, slotUrl)
    if (hydrated.length < 2) return
    prev.groups = hydrated
    if (!prev.body) {
      const names = hydrated.map((g) => g.partName).filter(Boolean)
      prev.body = `拆成${names.map((n) => `「${n}」`).join('')}并写上检查发现`
    }
    byFinding.set(findingId, prev)
  })

  const edits = []
  byFinding.forEach((row) => {
    if (edits.length >= 10) return
    const current = byItemId.get(row.findingId)
    const curName = text(current && current.name)
    const curNote = text(current && current.note)
    const groups = Array.isArray(row.groups) && row.groups.length >= 2 ? row.groups : []
    const nextName = !curName ? row.partName : ''
    const nextAdvice = !curNote ? row.advice || (!groups.length ? row.body : '') : ''
    if (!groups.length && !nextName && !nextAdvice) return
    const names = groups.map((g) => g.partName).filter(Boolean)
    const body =
      row.body ||
      (groups.length
        ? `拆成${names.map((n) => `「${n}」`).join('')}并写上检查发现`
        : [nextName, nextAdvice].filter(Boolean).join(' · '))
    edits.push({
      id: `edit_item_${row.findingId}`,
      kind: 'item',
      findingId: row.findingId,
      partName: nextName,
      advice: nextAdvice,
      body,
      groups,
      canApply: true,
    })
  })

  return {
    scope: 'inspect_v2',
    faultAnalysis,
    inspectOrder,
    partHints,
    edits: edits.concat(photos).slice(0, 12),
    shop: [],
    items: [],
    imageNotes,
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
    const key = mediaBare(url)
    if (!key) return
    if (notesMap[key]) noted.push({ url, note: notesMap[key] })
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
    const url = text(typeof raw === 'object' && raw ? raw.url || raw.rawUrl || raw.maskedUrl : raw)
    const key = mediaBare(url)
    if (!isInspectMediaUrl(url) || !key || used.has(key) || slots.length >= 8) return
    used.add(key)
    slots.push({
      slot: slots.length + 1,
      url,
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

function contextOf(album) {
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
  const imageNotesMap = collectImageNotesMap(nodes)
  const intakeUrls = intakePhotoUrls(intake)
  const inspectSlots = inspectPhotoSlots(inspection)
  const inspectUrls = inspectSlots.map((row) => row.url)
  const workSlots = workPhotoSlots(works)
  const deliveryUrls = deliveryPhotoUrls(delivery)
  const intakeSplit = splitNewAndNotedUrls(intakeUrls, imageNotesMap)
  const inspectSplit = splitNewAndNotedUrls(inspectUrls, imageNotesMap)
  const workFreshSlots = (workSlots || []).filter((row) => !imageNotesMap[mediaBare(row.url)])
  const workNoted = (workSlots || [])
    .filter((row) => imageNotesMap[mediaBare(row.url)])
    .map((row) => ({ slot: row.slot, partName: row.partName, note: imageNotesMap[mediaBare(row.url)] }))
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
          inspectOrder: Array.isArray(inspectionAdvice.inspectOrder)
            ? inspectionAdvice.inspectOrder.slice(0, 4)
            : [],
          partHints: Array.isArray(inspectionAdvice.partHints)
            ? inspectionAdvice.partHints.slice(0, 4)
            : [],
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
async function prepareMaskedAttachments(urls, slotByUrl) {
  const { resolveDesensitizedUrlForAsset } = require('./media.service')
  const attached = []
  const seen = new Set()
  for (const raw of Array.isArray(urls) ? urls : []) {
    const originalUrl = String(raw || '').trim()
    if (!originalUrl || seen.has(originalUrl)) continue
    seen.add(originalUrl)
    try {
      const masked = await resolveDesensitizedUrlForAsset(originalUrl, { force: false })
      const safeUrl = masked && masked.ok ? String(masked.maskedUrl || '').trim() : ''
      if (!safeUrl) continue
      const meta = slotByUrl ? slotByUrl.get(mediaBare(originalUrl)) : null
      attached.push({
        originalUrl,
        safeUrl,
        slot: meta && meta.slot ? Number(meta.slot) : 0,
        findingId: meta ? text(meta.findingId) : '',
      })
    } catch (_) {
      /* 这张不送 */
    }
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
  const attached = await prepareMaskedAttachments(urls, slotByUrl)
  const content = attached.length
    ? [{ type: 'text', text: instruction }].concat(
        attached.map((row, index) => {
          // 必须标真实 photoSlots.slot，禁止用附图数组下标冒充槽位号
          const caption = row.slot
            ? `${tag} photoSlots.slot=${row.slot} findingId=${row.findingId || ''}`
            : `${tag} image ${index + 1}`
          return [
            { type: 'text', text: caption },
            { type: 'image_url', image_url: { url: row.safeUrl } },
          ]
        }).flat(),
      )
    : instruction
  let textOut = null
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
              'You are an assistant for a Chinese auto repair shop. Reply with JSON only. All natural-language string values MUST be Simplified Chinese. Never say there is no advice merely because forms look filled.',
          },
          { role: 'user', content },
        ],
        temperature: 0.2,
        responseFormat: engine.vendor === 'dashscope' ? { type: 'json_object' } : undefined,
        enableThinking: engine.vendor === 'dashscope' ? false : undefined,
        timeoutMs: Math.min(Number(engine.timeoutMs || 60000), 45000),
      })
      textOut = result && result.text
      if (textOut) break
    } catch (_) {
      /* 换下一家 */
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
      })),
      text: textOut,
    })
  }
  return textOut
}

function workInstruction(ctx) {
  const slots = ctx.workPhotoSlots || []
  return [
    'You assist a Chinese auto shop clerk during repair work documentation.',
    'Goal: whether critical process photos exist, brand/spec of parts, old-vs-new comparison, and whether captions are clear for the car owner. Content over form.',
    'Compare against confirmed quote lines. Do NOT change prices. Do NOT move photos yourself — only suggest groups.',
    'Prior steps: use analysis summaries + image notes only; do not re-attach those images.',
    'Current: work items and NEW work photos only (slots below). Already-noted photos are text only.',
    'Owner cares about proof of work, what was replaced, and readable descriptions — not technician poses or tool close-ups.',
    `Context JSON: ${JSON.stringify({
      prior: {
        intake: ctx.intakeAdviceSummary,
        intakeNoted: ctx.intakeNoted,
        inspect: ctx.inspectAdviceSummary,
        inspectNoted: ctx.inspectNoted,
        quoteLines: ctx.quoteLines,
        workNoted: ctx.workNoted,
      },
      workItems: ctx.workItems,
      photos: slots.map((row) => ({ slot: row.slot, on: row.partName })),
    })}`,
    'Also list photoPlan: which workmanship photos this step should take (old/new parts, critical process) — shop reminder only.',
    'Return JSON only: {"gaps":[{"kind":"missing_quote_item|extra_work|missing_process_photo|missing_brand|missing_old_new","title":"","body":""}],"items":[{"id":"","body":"","canApply":true}],"groups":[{"slot":1,"partName":"","body":""}],"photoPlan":[{"title":"","body":""}],"imageNotes":[{"slot":1,"note":""}]}',
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

function slotsForFinding(ctx, findingId) {
  const id = text(findingId)
  return (Array.isArray(ctx && ctx.inspectPhotoSlots) ? ctx.inspectPhotoSlots : []).filter(
    (row) => text(row && row.findingId) === id && text(row && row.url),
  )
}

/** 提示词里钉死：多图项必须按真实 findingId + 槽位出 groups */
function requiredInspectSplitHints(ctx) {
  return multiPhotoFindingIds(ctx)
    .map((id) => {
      const slots = slotsForFinding(ctx, id).map((row) => Number(row.slot))
      if (slots.length < 2) return ''
      return `- findingId "${id}" owns slots [${slots.join(', ')}]: if those slots belong to DIFFERENT shop inspection lines (检测项目), you MUST emit one edits[] row with findingId="${id}" and groups[] so each listed slot appears in exactly one group; partName = real inspection line name, not necessarily a body-part label.`
    })
    .filter(Boolean)
}

function inspectionInstruction(ctx, options = {}) {
  const payload = inspectionContextPayload(ctx, options)
  const multiIds = multiPhotoFindingIds(ctx)
  const exampleId = multiIds[0] || 'FINDING_ID'
  const exampleSlots = slotsForFinding(ctx, exampleId).map((row) => Number(row.slot))
  const s1 = exampleSlots[0] || 1
  const s2 = exampleSlots[1] || 2
  const s3 = exampleSlots[2] || 3
  const exampleLead = multiIds[0]
    ? `Example when finding "${exampleId}" has different inspection lines across its slots:`
    : 'Example (replace FINDING_ID with the exact photoSlots[].findingId of the multi-photo item):'
  const required = requiredInspectSplitHints(ctx)
  return [
    'You assist a Chinese auto-shop clerk on the inspection step.',
    'Output: faultAnalysis, inspectOrder, partHints, edits, imageNotes.',
    '',
    'CRITICAL — photo split (groups) is the only way the clerk can split a mixed photo pile. Prose is not enough.',
    '1) Look at every attached image (slot ids in photoSlots / newPhotoSlots).',
    '2) Decide which shop inspection LINE each slot belongs to (what the shop would write as a 检测项目 on the job sheet).',
    '3) Naming rule: groups[].partName and imageNotes[].partName are real-shop inspection line names, NOT required to be anatomic body-part labels only.',
    '   Prefer names like「前制动盘磨损评估」「左后门下沿钣喷」; avoid bare「车门」「刹车」unless that is how the shop names the line.',
    '4) If one findingId owns 2+ slots with DIFFERENT inspection lines, emit exactly ONE edits[] row for that findingId with groups[]:',
    '   - one group per inspection line; EVERY group MUST have non-empty partName, advice, imageSlots (numeric slot ids only)',
    '   - every slot of that findingId must appear in exactly one group; do not leave a slot out',
    '5) If faultAnalysis lists multiple topics as 1. 2. 3., groups is REQUIRED for that multi-photo finding.',
    '6) Omit groups ONLY when all slots of that finding share one inspection line, or you truly cannot tell them apart.',
    '7) findingId in edits MUST be copied exactly from Context items[].id or photoSlots[].findingId. Never invent "pile".',
    '8) FORBIDDEN: groups:[{},{}] or any group missing partName or imageSlots. Empty shells are INVALID.',
    '9) faultAnalysis: prefer one string with newlines (1. …\\n2. …), not a JSON array of strings.',
    '10) imageNotes: array of {slot, partName, note} — partName follows the same inspection-line naming rule; not a map keyed by slot string.',
    '',
    ...(required.length
      ? ['REQUIRED split checks for this request:', ...required, '']
      : []),
    exampleLead,
    `{"edits":[{"kind":"item","findingId":"${exampleId}","body":"拆成左后门下沿钣喷、前制动盘磨损评估、底盘锈蚀检查","groups":[{"partName":"左后门下沿钣喷","advice":"漆面剥落需钣喷","imageSlots":[${s1}]},{"partName":"前制动盘磨损评估","advice":"盘面磨损需测厚","imageSlots":[${s2}]},{"partName":"底盘锈蚀检查","advice":"锈斑需进一步检查","imageSlots":[${s3}]}]}]}`,
    '',
    'Other rules:',
    '- Intake is context only — never restate intake coverage.',
    '- Natural-language JSON string values: Simplified Chinese only (no English words inside those strings).',
    '- Do not invent damage absent from photos/text. No labels 需处理 / 需关注 / 状态良好.',
    '- Cover every distinct inspection line visible in photos + complaint in faultAnalysis.',
    '- imageNotes: one short observation per attached slot; never a substitute for groups.',
    '- kind=photo edits are reminders only (no apply). partHints are read-only.',
    `Context JSON: ${JSON.stringify(payload)}`,
    'Return JSON only with keys: faultAnalysis, inspectOrder, partHints, edits, imageNotes.',
  ].join('\n')
}

/** 故障分析是否已分出多个主题（模型已能区分，却可能漏写 groups） */
function faultAnalysisLooksMultiTopic(faultAnalysis) {
  const s = text(faultAnalysis)
  if (!s) return false
  const marks = s.match(/[1-9]\s*[.、．]/g) || []
  if (marks.length >= 2) return true
  return (s.match(/；|;/g) || []).length >= 2 && s.length >= 40
}

function multiPhotoFindingIds(ctx) {
  const counts = new Map()
  ;(Array.isArray(ctx.inspectPhotoSlots) ? ctx.inspectPhotoSlots : []).forEach((row) => {
    const id = text(row && row.findingId)
    if (!id) return
    counts.set(id, (counts.get(id) || 0) + 1)
  })
  // 槽位未齐时仍认草稿项上的张数，避免漏触发补跑
  ;(Array.isArray(ctx.inspectItems) ? ctx.inspectItems : []).forEach((row) => {
    const id = text(row && row.id)
    const photos = Number(row && row.photos) || 0
    if (!id || photos < 2) return
    counts.set(id, Math.max(counts.get(id) || 0, photos))
  })
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([id]) => id)
}

function inspectionHasSplitForFinding(parsed, findingId, ctx, attachedUrlKeys) {
  const id = text(findingId)
  const edit = (Array.isArray(parsed && parsed.edits) ? parsed.edits : []).find(
    (row) =>
      text(row && row.kind) !== 'photo' &&
      text(row && row.findingId) === id &&
      Array.isArray(row.groups) &&
      row.groups.length >= 2,
  )
  if (!edit) return false
  const groups = edit.groups
  if (!groups.every((g) => text(g && g.partName) && Array.isArray(g.images) && g.images.length)) {
    return false
  }
  const slots = slotsForFinding(ctx, id)
  const required =
    attachedUrlKeys && attachedUrlKeys.size
      ? slots.filter((row) => attachedUrlKeys.has(mediaBare(row.url)))
      : slots
  if (required.length < 2) return true
  const covered = new Set()
  groups.forEach((g) => {
    ;(Array.isArray(g.images) ? g.images : []).forEach((img) => {
      const key = mediaBare(img && img.url)
      if (key) covered.add(key)
    })
  })
  return required.every((row) => covered.has(mediaBare(row.url)))
}

/** 已能分主题（分点分析或部件参考≥2）但多图项仍无合格 groups → 需要英文补跑 */
function needsInspectGroupsRepair(parsed, ctx, attachedUrlKeys) {
  const multi = multiPhotoFindingIds(ctx)
  if (!multi.length) return false
  // 实际送出附图不足 2 张时，无法要求模型按槽拆分
  if (attachedUrlKeys && attachedUrlKeys.size && attachedUrlKeys.size < 2) return false
  const missing = multi.some((id) => !inspectionHasSplitForFinding(parsed, id, ctx, attachedUrlKeys))
  if (!missing) return false
  const hints = Array.isArray(parsed && parsed.partHints) ? parsed.partHints.length : 0
  return faultAnalysisLooksMultiTopic(parsed && parsed.faultAnalysis) || hints >= 2
}

function inspectionGroupsRepairInstruction(ctx, previousParsed, options = {}) {
  const payload = inspectionContextPayload(ctx, options)
  const attachedUrlKeys = options.attachedUrlKeys || null
  const missingIds = multiPhotoFindingIds(ctx).filter(
    (id) => !inspectionHasSplitForFinding(previousParsed, id, ctx, attachedUrlKeys),
  )
  const notes = Array.isArray(previousParsed && previousParsed.imageNotes)
    ? previousParsed.imageNotes
    : []
  const slotPlan = missingIds.map((id) => {
    const slots = slotsForFinding(ctx, id).map((row) => Number(row.slot))
    const slotHints = slots.map((slot) => {
      const hit = notes.find((row) => Number(row && row.slot) === slot)
      return {
        slot,
        note: text(hit && hit.note),
        partNameHint: text(hit && hit.partName),
      }
    })
    return { findingId: id, slots, slotHints }
  })
  const exampleId = (slotPlan[0] && slotPlan[0].findingId) || 'FINDING_ID'
  const exampleSlots = (slotPlan[0] && slotPlan[0].slots) || [1, 2]
  const filledExample = {
    edits: [
      {
        kind: 'item',
        findingId: exampleId,
        body: '按主题拆开',
        groups: exampleSlots.slice(0, 2).map((slot, index) => {
          const hint =
            (slotPlan[0] &&
              Array.isArray(slotPlan[0].slotHints) &&
              slotPlan[0].slotHints.find((row) => Number(row.slot) === slot)) ||
            null
          return {
            partName: text(hint && hint.partNameHint) || (index === 0 ? '左后门下沿钣喷' : '前制动盘磨损评估'),
            advice: text(hint && hint.note) || (index === 0 ? '漆面损伤需钣喷' : '盘面磨损需测厚'),
            imageSlots: [slot],
          }
        }),
      },
    ],
  }
  // 同一检测项目的槽位应合并：示例里若有第 3 槽，提示模型可并入相近检测项目
  if (exampleSlots.length >= 3 && filledExample.edits[0].groups.length >= 2) {
    filledExample.edits[0].groups[1].imageSlots = exampleSlots.slice(1)
  }
  return [
    'Your previous JSON distinguished multiple inspection lines but groups were EMPTY or incomplete.',
    'FORBIDDEN (never return this): "groups":[{},{}]  — empty objects are INVALID.',
    'Each group MUST include non-empty partName, advice, and imageSlots (numbers from missingSplitPlan).',
    'partName = real-shop 检测项目 name (inspection line), NOT required to be an anatomic body-part label only.',
    'Use missingSplitPlan[].slotHints (from your own previous imageNotes) as material to FILL groups.',
    'Merge slots that belong to the SAME inspection line into ONE group; different lines → different groups.',
    'Keep faultAnalysis / inspectOrder / partHints / imageNotes unless a tiny fix is required.',
    'For EACH entry in missingSplitPlan, emit exactly ONE kind=item edit with findingId copied exactly.',
    'Natural-language string values: Simplified Chinese only.',
    'Do not invent damage beyond photos and slotHints.',
    `missingSplitPlan: ${JSON.stringify(slotPlan)}`,
    `photoSlots: ${JSON.stringify(payload.photoSlots)}`,
    `VALID filled shape example (adapt partName/advice/imageSlots to the photos; do not leave fields blank): ${JSON.stringify(filledExample)}`,
    `Previous JSON: ${JSON.stringify({
      faultAnalysis: previousParsed && previousParsed.faultAnalysis,
      inspectOrder: previousParsed && previousParsed.inspectOrder,
      partHints: previousParsed && previousParsed.partHints,
      edits: previousParsed && previousParsed.edits,
      imageNotes: notes,
    })}`,
    'Return the full corrected JSON only (same keys as before).',
  ].join('\n')
}

function mergeInspectAdvicePreferringGroups(base, repair) {
  if (!repair || typeof repair !== 'object') return base
  const baseEdits = Array.isArray(base && base.edits) ? base.edits.slice() : []
  const repairEdits = Array.isArray(repair.edits) ? repair.edits : []
  repairEdits.forEach((row) => {
    if (!row || text(row.kind) === 'photo') return
    const findingId = text(row.findingId)
    if (!findingId || !Array.isArray(row.groups) || row.groups.length < 2) return
    const idx = baseEdits.findIndex(
      (item) => text(item && item.kind) !== 'photo' && text(item && item.findingId) === findingId,
    )
    if (idx >= 0) baseEdits[idx] = { ...baseEdits[idx], ...row, groups: row.groups, canApply: true }
    else baseEdits.push({ ...row, canApply: true })
  })
  return {
    ...base,
    faultAnalysis: text(base && base.faultAnalysis) || text(repair.faultAnalysis),
    inspectOrder:
      Array.isArray(base && base.inspectOrder) && base.inspectOrder.length
        ? base.inspectOrder
        : Array.isArray(repair.inspectOrder)
          ? repair.inspectOrder
          : [],
    partHints:
      Array.isArray(base && base.partHints) && base.partHints.length
        ? base.partHints
        : Array.isArray(repair.partHints)
          ? repair.partHints
          : [],
    edits: baseEdits,
    imageNotes:
      Array.isArray(base && base.imageNotes) && base.imageNotes.length
        ? base.imageNotes
        : Array.isArray(repair.imageNotes)
          ? repair.imageNotes
          : [],
  }
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
    hasExterior: ctx.hasExterior,
    selectedCount: ctx.selectedCount,
  })
  return [
    'You assist a Chinese auto shop clerk at vehicle delivery / handover.',
    'Goal: using whole-case facts, draft (1) repairBrief and (2) ownerFaqs for the delivery node. Clerk will apply; you only propose.',
    'Do NOT rehash intake/inspect/quote/work "what to do next" advice. Do NOT say 系统内缺少 or invent unfinished paint/body work.',
    'Hard rules:',
    '- repairBrief: one short Chinese paragraph of what was done this visit (facts only). No prices, no PII. Suitable for owner report header.',
    '- ownerFaqs: 1–5 items {question, answer}. MUST include ongoing care/precautions if any (break-in, seepage to watch, how warranty works). If none, add case-related general consumer questions. Max 5.',
    '- tips: optional short reminders only for THIS step (missing delivery photo, empty warranty period).',
    '- Simplified Chinese only in natural-language values.',
    'Context JSON (PII already stripped):',
    JSON.stringify(safeFacts),
    'Return JSON only: {"repairBrief":"","ownerFaqs":[{"question":"","answer":""}],"tips":[{"title":"","body":""}]}',
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
    const ctx = contextOf(album)
    const fingerprint = fingerprintFor(kind, ctx)
    const { field, nodeKind } = nodeField(kind)
    // 检测：默认只送未识图；点刷新或本步已无新图可送时，附上全部检测图，便于按图拆项
    const inspectFresh = ctx.inspectPhotoUrls || []
    const inspectAll = ctx.inspectPhotoUrlsAll || inspectFresh
    const reVisionInspect = kind === 'inspect' && (force || !inspectFresh.length)
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
    // 检测：分析已分主题却漏合格 groups → 带着图英文补跑（最多两次）；仍缺则不算出成
    if (kind === 'inspect') {
      const repairOpts = { ...inspectOpts, attachedUrlKeys }
      for (
        let attempt = 0;
        attempt < 2 && needsInspectGroupsRepair(parsed, ctx, attachedUrlKeys);
        attempt += 1
      ) {
        const repairRaw = await runLlm(
          inspectionGroupsRepairInstruction(ctx, parsed, repairOpts),
          urls,
          attempt === 0 ? 'InspectGroups' : 'InspectGroupsRetry',
          llmOpts,
        )
        if (!repairRaw) break
        const repaired = parseInspectionAdvice(repairRaw, ctx.inspectItems, urls, ctx.inspectPhotoSlots)
        parsed = mergeInspectAdvicePreferringGroups(parsed, repaired)
      }
    }
    const groupsGap = kind === 'inspect' && needsInspectGroupsRepair(parsed, ctx, attachedUrlKeys)
    const ok = adviceHasContent(parsed, kind) && !groupsGap
    // 简述/问答只挂在意见里，店员点应用才写入节点草稿；确认交车时再同步 archiveCopy
    const advicePayload =
      kind === 'delivery'
        ? (() => {
            const { archiveCopy: _drop, ...rest } = parsed
            return rest
          })()
        : parsed
    if (kind === 'inspect') {
      writeInspectAdviceDebug(albumId, {
        groupsGap,
        ok,
        multiPhotoFindingIds: multiPhotoFindingIds(ctx),
        photoSlots: ctx.inspectPhotoSlots,
        urlsRequested: urls,
        attachedUrlKeys: [...attachedUrlKeys],
        traces: llmTraces.map((trace) => ({
          label: trace.label,
          requestedUrlCount: trace.requestedUrlCount,
          safeUrlCount: trace.safeUrlCount,
          attachedSlots: trace.attachedSlots,
          raw: String(trace.text || '').slice(0, 12000),
        })),
        finalEdits: Array.isArray(parsed && parsed.edits) ? parsed.edits : [],
        faultAnalysis: text(parsed && parsed.faultAnalysis).slice(0, 500),
        inspectOrder: Array.isArray(parsed && parsed.inspectOrder) ? parsed.inspectOrder : [],
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
              errorMessage: groupsGap ? '拆分建议未出成，请刷新再试' : '未能出意见',
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
  } finally {
    jobsInFlight.delete(key)
  }
}

async function queueIfNeeded(album, kind, options = {}) {
  const { resolveCapabilityForMerchant } = require('./node-ai-review.service')
  const capability = await resolveCapabilityForMerchant(album.merchantId)
  if (!capability || !capability.entitled || !capability.llmEnabled) return { queued: false, skipped: true }
  const ctx = contextOf(album)
  if (kind === 'work' && !ctx.quoteLines.length && !ctx.workItems.length) {
    const err = new Error('先有报价或施工项')
    err.status = 400
    throw err
  }
  if (kind === 'inspect' && !ctx.inspectItems.length) {
    const err = new Error('先拍检查图或写检查项')
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
  const hasBody = adviceHasContent(advice, kind)
  const stale =
    Boolean(fingerprint) &&
    Boolean(contentFingerprint) &&
    fingerprint !== contentFingerprint &&
    (status === 'ready' || hasBody)
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
  needsInspectGroupsRepair,
  mergeInspectAdvicePreferringGroups,
  faultAnalysisLooksMultiTopic,
}
