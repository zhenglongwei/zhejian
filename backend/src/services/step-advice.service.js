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

/** 检测顺序：模型常写成一整段或 {title,body}，一律收成中文短句数组 */
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

function slotTokens(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    return value
      .split(/[、,，;；\s]+/)
      .map((part) => part.trim())
      .filter(Boolean)
  }
  if (value == null || value === '') return []
  return [value]
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
        named.set(partName, { partName, advice: '', images: [], imageSlots: [] })
      }
      const group = named.get(partName)
      if (advice && !group.advice) group.advice = advice
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
          result: '',
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
  const orderSource = parsed['检测顺序'] != null ? parsed['检测顺序'] : parsed.inspectOrder
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

/** 旧意见里的部件参考并进检测顺序，下游不再单看一块 */
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
            ? `图${row.slot}。只根据这一张判断内容，不要用其它图代替。`
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
  return [
    '你是修理厂的检测顾问，帮店员整理检测这一步的意见。',
    '按下面五步思考，只返回一个 JSON。第2步到第4步不要单独交出来。',
    '',
    '1. 故障分析只根据接车时的客户诉求，不要看这次上传的检测照片。',
    '从专业汽修的角度，把这个症状所有可能的原因列出来，按可能性从高到低排。',
    '每种可能占一段，用1、2、3、4分行。故障分析就写这份完整清单。',
    '同时在心里留一份同样顺序的检查清单，留给第5步删减，先不要写进返回。',
    '',
    '2. 再单独看照片。按图1、图2的顺序，每张图独立看，前面的图不影响后面的图。',
    '只记录这张图里实际有的内容。图里没有的损伤不要编。这一步不要参考客户诉求。',
    '',
    '3. 只根据这一张图的内容，判断它对应哪个检测项目。',
    '漆面和划痕归到划痕检测，底盘照片归到底盘检测，制动盘归到制动盘检查。',
    '不要用客户诉求或第1步的句子给照片起名。',
    '',
    '4. 把同一条里、语义上属于同一检测项目的照片分成一组。',
    '结合这一组全部照片，用一段话说清：说明了什么问题，要不要马上处理，不处理会怎样。',
    '图里看不出后果就不要编。不要使用「需处理」「需关注」「状态良好」。',
    '已经分在不同条里的照片不要并到一起。',
    '',
    '5. 用第4步得到的检测项目，对照第1步那份检查清单。',
    '已经有照片覆盖的项目，从清单里去掉。剩下的才写入返回的检测顺序，仍然一段一项。',
    '如果照片已经把第1步的可能都覆盖了，检测顺序用空数组。',
    '',
    '不要复述接车时车身四周有没有拍全。',
    '参考材料只给第1步用。给照片归类时不要用它。',
    '',
    '同一条里的照片：',
    pileText,
    '',
    `参考材料：${JSON.stringify(material)}`,
    '',
    '只返回 JSON，不要其它文字。示例只说明形状：图里是什么就归到什么项目，示例里有、这次图里没有的项目不要写上。',
    '{"故障分析":"1. 漆面破损，可能已露底生锈。\\n2. 底盘或排气松动、锈蚀。\\n3. 制动盘磨损造成拖滞或异响。\\n4. 悬挂衬套老化。","检测顺序":["悬挂衬套这次没有对应照片，建议补查"],"拆分建议":[{"检测项目":"划痕检测","图片":["图1","图2"],"描述":"两张都是车门下沿漆面剥落露底，建议尽快处理，放着容易锈穿。"},{"检测项目":"底盘检测","图片":["图3"],"描述":"拍的是底盘和悬挂，可见锈迹。"},{"检测项目":"制动盘检查","图片":["图4"],"描述":"拍的是制动盘盘面，可见磨损。"}]}',
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
    const ok = adviceHasContent(parsed, kind)
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
}
