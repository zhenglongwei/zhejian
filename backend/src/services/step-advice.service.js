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
  return {
    scope: 'process',
    gaps,
    items: written,
    groups,
    imageNotes: Array.isArray(parsed.imageNotes) ? parsed.imageNotes : [],
  }
}

function parseDeliveryAdvice(raw) {
  const parsed = parseReviewModelJson(raw)
  if (!parsed) return { repair: null, warranty: null, care: null, processIssues: [], fill: null }
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
      Boolean(text(advice.note))
  }
  if (kind === 'inspect') {
    return (Array.isArray(advice.items) && advice.items.length > 0) ||
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

function namedRows(findings) {
  return (Array.isArray(findings) ? findings : [])
    .map((row) => ({
      id: text(row && row.id),
      name: text(row && row.partName),
      result: text(row && row.result),
      note: text(row && (row.advice || row.caption)),
    }))
    .filter((row) => row.name || row.note || row.result)
}

const SHOP_KIND = {
  miss: '缺项',
  wrong: '错项',
  omit: '漏项',
  how: '怎么查',
}

function parseInspectionAdvice(raw, items) {
  const parsed = parseReviewModelJson(raw) || {}
  const byId = new Map()
  ;(Array.isArray(parsed.items) ? parsed.items : []).forEach((row) => {
    const id = text(row && row.id)
    const body = text(row && row.body).slice(0, 120)
    if (id && body) byId.set(id, { body, canApply: row.canApplyToEmptyAdvice !== false })
  })
  const known = new Set((Array.isArray(items) ? items : []).map((row) => text(row.name)).filter(Boolean))
  const shop = (Array.isArray(parsed.gaps) ? parsed.gaps : [])
    .concat(Array.isArray(parsed.shop) ? parsed.shop : [])
    .map((row) => {
      const kindRaw = text(row && row.kind)
      const kind = SHOP_KIND[kindRaw]
        ? kindRaw
        : kindRaw === 'missing_item'
          ? 'miss'
          : kindRaw === 'unclear_photo' || kindRaw === 'follow_up'
            ? 'how'
            : kindRaw
      if (!SHOP_KIND[kind]) return null
      const title = text(row && (row.title || row.partName)).slice(0, 16)
      const body = text(row && row.body).slice(0, 120)
      if (!title || !body) return null
      if ((kind === 'miss' || kind === 'omit') && known.has(title)) return null
      return { kind, title, body }
    })
    .filter(Boolean)
    .slice(0, 4)
  // 只保留模型根据实质写出的意见；禁止「表单填满就没有意见」或空栏套话
  const outItems = (Array.isArray(items) ? items : [])
    .map((row) => {
      const hit = byId.get(row.id)
      const noted = text(row.note)
      const body = hit ? hit.body : noted ? '' : ''
      if (!body) return null
      return {
        id: row.id,
        partName: row.name || '这项',
        sourceNote: noted,
        timing: OWNER_TIMING[row.result] || '',
        body,
        hasReason: Boolean(noted),
        canApply: Boolean(hit && hit.canApply && !noted),
      }
    })
    .filter(Boolean)
    .slice(0, 8)
  ;(Array.isArray(parsed.items) ? parsed.items : []).forEach((row) => {
    if (text(row && row.id) || !text(row && row.title) || !text(row && row.body)) return
    if (outItems.length >= 8) return
    shop.push({
      kind: 'miss',
      title: text(row.title).slice(0, 16),
      body: text(row.body).slice(0, 120),
    })
  })
  return {
    scope: 'flat',
    shop: shop.slice(0, 4),
    items: outItems,
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
          v4: 'flat',
          complaint: ctx.complaint,
          inspectItems: ctx.inspectItems,
          intakeBrief: ctx.intakeBrief,
          intakePhotos: ctx.intakePhotoUrls,
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
    'Return JSON only: {"gaps":[{"kind":"missing_quote_item|extra_work|missing_process_photo|missing_brand|missing_old_new","title":"","body":""}],"items":[{"id":"","body":"","canApply":true}],"groups":[{"slot":1,"partName":"","body":""}],"imageNotes":[{"slot":1,"note":""}]}',
  ].join('\n')
}

function inspectionInstruction(ctx) {
  return [
    'You assist a Chinese auto shop clerk during vehicle inspection.',
    'Goal: produce owner-relevant advice from REAL content (photos + written findings + intake complaint). Never say "no extra advice" merely because forms have text or photos. If substance is solid, state a brief confirmation of what the findings mean for the owner.',
    'Prior steps: use intake analysis summary and per-image notes only — do NOT ask to re-send those images.',
    'Current step: use all inspection line items and any NEW photos not yet noted.',
    'Owner cares about: what each finding means, whether action is needed now, consequence if ignored, how to watch later.',
    'Write Chinese that a car owner understands. Do NOT use internal labels like 需处理 / 需关注 / 状态良好 inside sentences.',
    'Do NOT invent damage absent from photos/text. Do NOT demand re-shooting normal exterior already covered at intake.',
    `Context JSON: ${JSON.stringify({
      complaint: ctx.complaint,
      intake: ctx.intakeAdviceSummary,
      intakeNoted: ctx.intakeNoted,
      items: ctx.inspectItems,
      inspectNoted: ctx.inspectNoted,
      newPhotoSlots: (ctx.inspectPhotoUrls || []).map((_, i) => i + 1),
    })}`,
    'Return JSON only: {"items":[{"id":"","body":"","title":"","canApplyToEmptyAdvice":true}],"gaps":[{"kind":"missing_item|unclear_photo|follow_up","title":"","body":""}],"imageNotes":[{"slot":1,"note":""}]}',
  ].join('\n')
}

function deliveryInstruction(ctx) {
  return [
    'You assist a Chinese auto shop clerk at vehicle delivery / handover.',
    'Goal: holistic review of the whole job using prior-step analysis summaries and image notes, plus current delivery photos and warranty fields. Content over form.',
    'CRITICAL permissions:',
    '- Intake report, inspection report, and confirmed quotes were already shown to the owner: you may POINT OUT issues but must NOT propose edits to those documents.',
    '- If work evidence is weak, say the shop should go back to the work step to improve photos/captions — do not rewrite historical docs here.',
    '- You MAY propose fills only for empty delivery-step fields (warranty period, care notes) and call out missing whole-car delivery photo.',
    'Do not invent maintenance intervals. Do not change confirmed prices.',
    'Do not output a mere "job completed" essay with nothing actionable.',
    `Context JSON: ${JSON.stringify({
      complaint: ctx.complaint,
      intake: ctx.intakeAdviceSummary,
      inspect: ctx.inspectAdviceSummary,
      quoteLines: ctx.quoteLines,
      workItems: ctx.workItems,
      workAdvice: ctx.workAdviceSummary,
      priorImageNotes: []
        .concat(ctx.intakeNoted || [])
        .concat(ctx.inspectNoted || [])
        .concat(ctx.workNoted || [])
        .concat(ctx.deliveryNoted || []),
      warrantyPeriod: ctx.warrantyPeriod,
      warrantyNotes: ctx.warrantyNotes,
      hasExterior: ctx.hasExterior,
      selectedCount: ctx.selectedCount,
    })}`,
    'Return JSON only: {"processIssues":[{"step":"intake|inspect|quote|work|delivery","body":""}],"fill":{"warrantyPeriod":"","warrantyNotes":""},"talk":{"repair":"","care":""},"imageNotes":[{"slot":1,"note":""}]}',
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
          ? [].concat(ctx.intakePhotoUrls || [], ctx.inspectPhotoUrls || [])
          : ctx.deliveryPhotoUrls || []
    const raw = await runLlm(
      kind === 'work' ? workInstruction(ctx) : kind === 'inspect' ? inspectionInstruction(ctx) : deliveryInstruction(ctx),
      urls,
      kind === 'work' ? 'Work' : kind === 'inspect' ? 'Inspect' : 'Delivery',
    )
    const parsed = kind === 'work'
      ? parseWorkAdvice(raw, ctx.workItems, ctx.workPhotoSlots)
      : kind === 'inspect'
        ? parseInspectionAdvice(raw, ctx.inspectItems)
        : parseDeliveryAdvice(raw)
    const ok = adviceHasContent(parsed, kind)
    await patchNode(albumId, nodeKind, (item) => {
      let next = {
        ...item,
        [field]: ok
          ? { status: 'ready', fingerprint, ...parsed, errorMessage: '', updatedAt: new Date().toISOString() }
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
  } finally {
    jobsInFlight.delete(key)
  }
}

async function queueIfNeeded(album, kind) {
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
    const err = new Error('先写下检查项')
    err.status = 400
    throw err
  }
  const fingerprint = fingerprintFor(kind, ctx)
  const { field, nodeKind } = nodeField(kind)
  const node = readFlowNodes(album).find((item) => item && item.kind === nodeKind)
  const current = (node && node[field]) || {}
  if (current.status === 'ready' && current.fingerprint === fingerprint && adviceHasContent(current, kind)) {
    return { queued: false, reuse: true }
  }
  await patchNode(album.id, nodeKind, (item) => ({
    ...item,
    [field]: { status: 'queued', fingerprint, updatedAt: new Date().toISOString() },
  }))
  setImmediate(() => {
    runJob(album.id, kind).catch(() => {})
  })
  return { queued: true }
}

function sanitizeStepAdviceForView(advice, kind) {
  if (!advice || typeof advice !== 'object' || !text(advice.status)) return null
  const status = text(advice.status)
  const base = {
    status,
    isWaiting: status === 'queued' || status === 'running',
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
    }
  }
  if (kind === 'inspect') {
    return {
      ...base,
      scope: text(advice.scope),
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
  queueWorkAdviceIfNeeded: (album) => queueIfNeeded(album, 'work'),
  queueDeliveryAdviceIfNeeded: (album) => queueIfNeeded(album, 'delivery'),
  queueInspectionAdviceIfNeeded: (album) => queueIfNeeded(album, 'inspect'),
  sanitizeStepAdviceForView,
  parseWorkAdvice,
  parseDeliveryAdvice,
  parseInspectionAdvice,
}
