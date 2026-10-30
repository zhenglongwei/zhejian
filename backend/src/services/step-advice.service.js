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
  const findings = (node && node.photoDraft && node.photoDraft.findings) || []
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
    const findings = (node && node.photoDraft && node.photoDraft.findings) || []
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

function parseDeliveryAdvice(raw) {
  const parsed = parseReviewModelJson(raw)
  if (!parsed) {
    return {
      repair: null,
      warranty: null,
      care: null,
      processIssues: [],
      fill: null,
      archiveCopy: null,
    }
  }
  const talk = parsed.talk && typeof parsed.talk === 'object' ? parsed.talk : {}
  const fill = parsed.fill && typeof parsed.fill === 'object' ? parsed.fill : {}
  const repair =
    clipItem(parsed.repair) ||
    (text(talk.repair) ? { title: '这次维修', body: text(talk.repair).slice(0, 80) } : null)
  const care =
    clipItem(parsed.care) ||
    (text(talk.care) ? { title: '用车', body: text(talk.care).slice(0, 80) } : null)
  const warranty =
    clipItem(parsed.warranty) ||
    (text(fill.warrantyPeriod) || text(fill.warrantyNotes)
      ? {
          title: '质保',
          body: [text(fill.warrantyPeriod), text(fill.warrantyNotes)].filter(Boolean).join('；').slice(0, 80),
        }
      : null)
  const processIssues = (Array.isArray(parsed.processIssues) ? parsed.processIssues : [])
    .map((row) => ({
      step: text(row && row.step),
      body: text(row && row.body).slice(0, 120),
    }))
    .filter((row) => row.body)
    .slice(0, 6)
  return {
    repair,
    warranty,
    care,
    processIssues,
    fill: {
      warrantyPeriod: text(fill.warrantyPeriod).slice(0, 40),
      warrantyNotes: text(fill.warrantyNotes).slice(0, 80),
    },
    imageNotes: Array.isArray(parsed.imageNotes) ? parsed.imageNotes : [],
    archiveCopy: parseArchiveCopyFromDelivery(parsed),
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
    filled(advice.repair) ||
      filled(advice.warranty) ||
      filled(advice.care) ||
      (Array.isArray(advice.processIssues) && advice.processIssues.length > 0),
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
  const draft = (intake && intake.photoDraft) || {}
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
    .map((row) => ({
      id: text(row && row.id),
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

function parseInspectionAdvice(raw, items, photoUrls) {
  const parsed = parseReviewModelJson(raw) || {}
  const byItemId = new Map(
    (Array.isArray(items) ? items : []).map((row) => [text(row && row.id), row]).filter((pair) => pair[0]),
  )
  const urls = Array.isArray(photoUrls) ? photoUrls : []
  const slotUrl = (slot) => {
    const n = Number(slot)
    if (!Number.isInteger(n) || n < 1 || n > urls.length) return ''
    return text(urls[n - 1])
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

  const faultAnalysis = isIntakeCoverageEcho(parsed.faultAnalysis)
    ? ''
    : zhOnly(parsed.faultAnalysis, 200)
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
    const findingId = text(row && (row.findingId || row.id))
    if (!findingId || !byItemId.has(findingId)) return
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
        findingId: text(row.findingId || row.id),
        body,
        canApply: false,
      })
      return
    }
    // item / text / split 一律按项合并
    if (kind === 'item' || kind === 'text' || kind === 'split' || !kind) mergeItem(row)
  })
  ;(Array.isArray(parsed.items) ? parsed.items : []).forEach((row) => {
    const findingId = text(row && row.id)
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
    imageNotes: Array.isArray(parsed.imageNotes) ? parsed.imageNotes : [],
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
    const draft = (node && node.photoDraft) || {}
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

function inspectPhotoUrls(inspection) {
  const draft = (inspection && inspection.photoDraft) || {}
  const urls = []
  const push = (raw) => {
    const url = text(typeof raw === 'object' && raw ? raw.url || raw.rawUrl || raw.maskedUrl : raw)
    if (!/^https?:\/\//.test(url) || urls.includes(url) || urls.length >= 8) return
    urls.push(url)
  }
  ;(Array.isArray(draft.findings) ? draft.findings : []).forEach((row) => {
    if (!row) return
    if (row.url) push(row.url)
    ;(Array.isArray(row.images) ? row.images : []).forEach(push)
  })
  return urls
}

function deliveryPhotoUrls(delivery) {
  const draft = (delivery && delivery.photoDraft) || {}
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
  const draft = (delivery && delivery.photoDraft) || {}
  const reportPayload = (repair && repair.document && repair.document.payload) || {}
  const intakeAdvice = (intake && intake.intakeAdvice) || {}
  const inspectionAdvice = (inspection && inspection.inspectionAdvice) || {}
  const workAdvice = (works.find((item) => item.workAdvice) || {}).workAdvice || {}
  const imageNotesMap = collectImageNotesMap(nodes)
  const intakeUrls = intakePhotoUrls(intake)
  const inspectUrls = inspectPhotoUrls(inspection)
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
    complaint: text(intake && intake.photoDraft && intake.photoDraft.chiefComplaint),
    intakeBrief: intakeBrief(intake),
    intakeAdviceSummary: intakeBrief(intake),
    intakePhotoUrls: intakeSplit.fresh,
    intakeNoted: intakeSplit.noted,
    intakeRisks: (Array.isArray(intakeAdvice.risks) ? intakeAdvice.risks : [])
      .map((row) => text(row && row.title))
      .filter(Boolean),
    inspectItems: namedRows(inspection && inspection.photoDraft && inspection.photoDraft.findings),
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
          v5: 'inspect_v2',
          complaint: ctx.complaint,
          inspectItems: ctx.inspectItems,
          intakeBrief: ctx.intakeBrief,
          inspectPhotos: ctx.inspectPhotoUrls,
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

async function runLlm(instruction, urls, label) {
  const engines = resolveConfiguredNodeAiReviewEngines()
  if (!engines.length) return null
  const { maskUrlsForModel } = require('./media.service')
  const safeUrls = await maskUrlsForModel(urls)
  const { chatCompletion } = require('../lib/dashscope-chat')
  const { responsesCompletion } = require('../lib/responses-chat')
  const tag = label || 'Photo'
  const content = safeUrls.length
    ? [{ type: 'text', text: instruction }].concat(
        safeUrls.map((url, index) => [
          { type: 'text', text: `${tag} slot ${index + 1}` },
          { type: 'image_url', image_url: { url } },
        ]).flat(),
      )
    : instruction
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
      return result && result.text
    } catch (_) {
      /* 换下一家 */
    }
  }
  return null
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

function inspectionInstruction(ctx) {
  return [
    'You assist a Chinese auto shop clerk during vehicle inspection.',
    'Goal: faultAnalysis, inspectOrder, partHints, and ONE actionable edit per inspection finding (photos + text in the same edit).',
    'Hard rules:',
    '- Intake coverage is CONTEXT ONLY — never restate it in any output field.',
    '- Simplified Chinese only in natural-language values. No English words.',
    '- Do NOT invent damage absent from photos/text. No labels 需处理 / 需关注 / 状态良好 in sentences.',
    '- edits: at most ONE kind=item row per findingId. If that finding mixes several topics, put split+text together: groups[] each with partName, advice, imageSlots. If one topic only, set partName/advice and omit groups (or leave groups empty).',
    '- kind=photo is reminder only (no apply). partHints are read-only.',
    `Context JSON: ${JSON.stringify({
      complaint: ctx.complaint,
      intakeContext: ctx.intakeAdviceSummary,
      intakeNoted: ctx.intakeNoted,
      items: ctx.inspectItems,
      inspectNoted: ctx.inspectNoted,
      newPhotoSlots: (ctx.inspectPhotoUrls || []).map((_, i) => i + 1),
    })}`,
    'Return JSON only: {"faultAnalysis":"","inspectOrder":[""],"partHints":[{"title":"","body":""}],"edits":[{"kind":"item","findingId":"","partName":"","advice":"","body":"","groups":[{"partName":"","advice":"","imageSlots":[1]}]},{"kind":"photo","findingId":"","body":""}],"imageNotes":[{"slot":1,"note":""}]}',
  ].join('\n')
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
    priorImageNotes: []
      .concat(ctx.intakeNoted || [])
      .concat(ctx.inspectNoted || [])
      .concat(ctx.workNoted || [])
      .concat(ctx.deliveryNoted || []),
    warrantyPeriod: ctx.warrantyPeriod,
    warrantyNotes: ctx.warrantyNotes,
    hasExterior: ctx.hasExterior,
    selectedCount: ctx.selectedCount,
  })
  return [
    'You assist a Chinese auto shop clerk at vehicle delivery / handover.',
    'Part A — shop review (merchant only, NEVER paste into public case pages):',
    'Holistic review using prior-step analysis summaries and image notes, plus current delivery photos and warranty fields.',
    'CRITICAL: owner-facing historical docs may only be flagged, not rewritten; weak work evidence → tell shop to go back to work step.',
    'You MAY propose fills only for empty delivery-step fields (warranty period, care notes) and call out missing whole-car delivery photo.',
    'Do not invent maintenance intervals. Do not change confirmed prices.',
    'Part B — archiveCopy for owner + storefront (citable GEO wording):',
    'From the SAME case facts, write summary (first sentence = vehicle + main issue; 80–180 Chinese chars of meaning) and 2–6 FAQ items consumers care about (budget without amounts, materials, pitfalls, process).',
    'No prices, no PII, no marketing fluff, no empty filler like "含过程图片记录". If facts are thin, return fewer FAQ or empty faq[].',
    'Context JSON (PII already stripped):',
    JSON.stringify(safeFacts),
    'Return JSON only: {"processIssues":[{"step":"intake|inspect|quote|work|delivery","body":""}],"fill":{"warrantyPeriod":"","warrantyNotes":""},"talk":{"repair":"","care":""},"imageNotes":[{"slot":1,"note":""}],"archiveCopy":{"summary":"","faq":[{"q":"","a":""}]}}',
  ].join('\n')
}

function mergeImageNotesFromSlots(node, slots, imageNotes, albumId) {
  if (!node || !Array.isArray(imageNotes) || !imageNotes.length) return node
  const draft = (node.photoDraft && typeof node.photoDraft === 'object' ? node.photoDraft : {}) || {}
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
    photoDraft: { ...draft, imageNotes: map },
  }
}

function mergeImageNotesFromUrlList(node, urls, imageNotes) {
  if (!node || !Array.isArray(imageNotes) || !imageNotes.length) return node
  const draft = (node.photoDraft && typeof node.photoDraft === 'object' ? node.photoDraft : {}) || {}
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
    photoDraft: { ...draft, imageNotes: map },
  }
}

async function runJob(albumId, kind) {
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
    const urls =
      kind === 'work'
        ? (ctx.workPhotoSlots || []).map((row) => row.url)
        : kind === 'inspect'
          ? ctx.inspectPhotoUrls || []
          : ctx.deliveryPhotoUrls || []
    const raw = await runLlm(
      kind === 'work' ? workInstruction(ctx) : kind === 'inspect' ? inspectionInstruction(ctx) : deliveryInstruction(ctx),
      urls,
      kind === 'work' ? 'Work' : kind === 'inspect' ? 'Inspect' : 'Delivery',
    )
    const parsed = kind === 'work'
      ? parseWorkAdvice(raw, ctx.workItems, ctx.workPhotoSlots)
      : kind === 'inspect'
        ? parseInspectionAdvice(raw, ctx.inspectItems, urls)
        : parseDeliveryAdvice(raw)
    const ok = adviceHasContent(parsed, kind)
    const archiveCopy = kind === 'delivery' ? parsed.archiveCopy : null
    // 对账意见不把 archiveCopy 塞进 deliveryAdvice，避免和公开草稿混住
    const advicePayload =
      kind === 'delivery'
        ? (() => {
            const { archiveCopy: _drop, ...rest } = parsed
            return rest
          })()
        : parsed
    await patchNode(albumId, nodeKind, (item) => {
      let next = {
        ...item,
        [field]: ok
          ? { status: 'ready', fingerprint, ...advicePayload, errorMessage: '', updatedAt: new Date().toISOString() }
          : { ...(item[field] || {}), status: 'failed', fingerprint, errorMessage: '未能出意见', updatedAt: new Date().toISOString() },
      }
      const notes = Array.isArray(parsed.imageNotes) ? parsed.imageNotes : []
      if (kind === 'work') {
        next = mergeImageNotesFromSlots(next, ctx.workPhotoSlots, notes)
      } else if (kind === 'inspect') {
        next = mergeImageNotesFromUrlList(next, urls, notes)
      } else {
        next = mergeImageNotesFromUrlList(next, urls, notes)
      }
      return next
    })
    if (kind === 'delivery' && archiveCopy && archiveCopy.summary) {
      try {
        const { mergeArchiveCopyIntoPackage } = require('../utils/album-archive-copy')
        const fresh = await loadAlbum(albumId)
        const pkg =
          fresh && fresh.contentPackageJson && typeof fresh.contentPackageJson === 'object'
            ? fresh.contentPackageJson
            : {}
        const nextPkg = mergeArchiveCopyIntoPackage(pkg, {
          ...archiveCopy,
          source: 'delivery_ai',
          factFingerprint: fingerprint,
        })
        await prisma.album.update({
          where: { id: albumId },
          data: { contentPackageJson: nextPkg },
        })
      } catch (err) {
        console.warn('[step-advice] save archiveCopy failed', albumId, err && err.message)
      }
    }
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
    runJob(album.id, kind).catch(() => {})
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
