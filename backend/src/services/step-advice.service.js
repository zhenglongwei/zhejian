/**
 * 施工、检测、交车的 AI 分析。
 * 施工只看本步的说明和照片，对照报价。前面各步的照片不再看。分组只给建议，不自动挪图。
 * 本步文字和照片没变就复用上次结果。
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
      const kind = kindText === 'extra' || kindText === 'addon'
        ? 'extra'
        : kindText === 'missing'
          ? 'missing'
          : ''
      const title = text(row && (row.title || row.partName)).slice(0, 16)
      if (!kind || !title) return null
      const body = kind === 'extra'
        ? `${title}是新增项，没有事先报价。`
        : `报价里的${title}，施工没有做。`
      return { kind, title, body }
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
  return { scope: 'process', gaps, items: written, groups }
}

function parseDeliveryAdvice(raw) {
  const parsed = parseReviewModelJson(raw)
  if (!parsed) return { repair: null, warranty: null, care: null }
  return {
    repair: clipItem(parsed.repair),
    warranty: clipItem(parsed.warranty),
    care: clipItem(parsed.care),
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
  return Boolean(filled(advice.repair) || filled(advice.warranty) || filled(advice.care))
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
    const body = text(row && row.body).slice(0, 80)
    if (id && body) byId.set(id, body)
  })
  const known = new Set((Array.isArray(items) ? items : []).map((row) => text(row.name)).filter(Boolean))
  const shop = (Array.isArray(parsed.shop) ? parsed.shop : [])
    .map((row) => {
      const kind = text(row && row.kind)
      if (!SHOP_KIND[kind]) return null
      const title = text(row && (row.title || row.partName)).slice(0, 16)
      const body = text(row && row.body).slice(0, 80)
      if (!title || !body) return null
      if ((kind === 'miss' || kind === 'omit') && known.has(title)) return null
      return { kind, title, body }
    })
    .filter(Boolean)
    .slice(0, 4)
  return {
    scope: 'flat',
    shop,
    items: (Array.isArray(items) ? items : [])
      .map((row) => {
        const noted = text(row.note)
        const timing = OWNER_TIMING[row.result] || '先看这项'
        const body = noted
          ? byId.get(row.id) || `${noted}。${timing}。`
          : '检查发现还空着。先写上看到的情况，再说明不处理会怎样。'
        return {
          id: row.id,
          partName: row.name || '这项',
          sourceNote: noted,
          timing,
          body,
          hasReason: Boolean(noted),
        }
      })
      .filter((row) => row.partName)
      .slice(0, 8),
  }
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
  const workAdvice = (works.find((item) => item.workAdvice) || {}).workAdvice || {}
  return {
    complaint: text(intake && intake.photoDraft && intake.photoDraft.chiefComplaint),
    intakeBrief: intakeBrief(intake),
    intakePhotoUrls: intakeBrief(intake) ? [] : intakePhotoUrls(intake),
    intakeRisks: (Array.isArray(intakeAdvice.risks) ? intakeAdvice.risks : [])
      .map((row) => text(row && row.title))
      .filter(Boolean),
    inspectItems: namedRows(inspection && inspection.photoDraft && inspection.photoDraft.findings),
    quoteLines: quotes.reduce((all, node) => all.concat(linesOf(node)), []),
    workItems: works.reduce((all, node) => all.concat(workRows(node)), []),
    workPhotoSlots: workPhotoSlots(works),
    warrantyPeriod: text(draft.warrantyPeriod || reportPayload.warrantyPeriod),
    warrantyNotes: text(draft.warrantyNotes || reportPayload.warrantyNotes),
    hasExterior: Boolean(text(draft.deliveryExteriorUrl)),
    selectedCount: Array.isArray(draft.selectedDeliveryUrls) ? draft.selectedDeliveryUrls.length : 0,
    workAdviceAt: text(workAdvice.updatedAt),
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
  const tag = label || '照片'
  const content = safeUrls.length
    ? [{ type: 'text', text: instruction }].concat(
        safeUrls.map((url, index) => [
          { type: 'text', text: `${tag}第 ${index + 1} 张` },
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
          { role: 'system', content: '只输出 JSON。' },
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
  const photoLine = slots.length
    ? '后面附了本步施工照片，只用来判断这项做成了什么样。写出来的话里不要提第几张，也不要写看见、展示。'
    : '这一步没有可看的施工照片。没有照片也没有说明的项，不要编做了什么。'
  return [
    '你在对照报价和施工。不要改金额，不要自己把照片挪走。',
    photoLine,
    '意见写成一条条完整的话。不要写「给店里」「给车主」当标题。',
    'gaps：只写和报价对不上的事实，最多 4 条。这是提醒，不代替施工描述。不要写怎么处理，不要写补充报价、重新报价、补照片、补说明、店里承担。',
    'kind 用 missing：报价有这项，施工里没有这项。title 写报价项目名。这种没有施工步骤，不要写进 items。',
    'kind 用 extra：施工做了，报价里没有。title 写施工项目名。这项只要说明是空的、并且有照片，还必须在 items 里写施工描述。',
    '只是还没拍照、没写说明，但这项施工里已经有：不要写进 gaps。',
    '对得上的不要写进 gaps，也不要写「和报价对得上」。',
    'items：施工里的每一项都要有给车主看的描述，一项一句。报价里没有的项也要写，不能只留在 gaps。车主关心这项做了什么、换下的零件坏成什么样。',
    '不要写技师、工具、拍摄角度，不要写第几张、可见、展示、红圈，不要按照片逐张复述。',
    '店员已经写了 note 的，不要出现在 items 里，也不要改他的句子。',
    'note 是空的、但有照片的，body 只写那一句描述。例如：更换了已经开裂的下摆臂胶套。supplement 留空。',
    '没有照片也没有 note 的项不要出现在 items 里。',
    'groups：某张图更像已经有的另一项时才写。slot 用「施工第 N 张」的 N。partName 必须是 workItems 里已有的 name，并且和这张图现在所在的项不同。已经在对的项上不要写。没有对得上的已有项不要新造项目名。不要写怎么挪。最多 4 条。',
    `本单：${JSON.stringify({
      quoteLines: ctx.quoteLines,
      workItems: ctx.workItems,
      photos: slots.map((row) => ({ slot: row.slot, on: row.partName })),
    })}`,
    '输出 JSON：{"gaps":[{"kind":"missing","title":"","body":""}],"items":[{"id":"","body":"","supplement":""}],"groups":[{"slot":1,"partName":""}]}',
  ].join('\n')
}

function inspectionInstruction(ctx) {
  const intakeLine = ctx.intakeBrief
    ? `接车分析：${ctx.intakeBrief}。不要再看接车照片，也不要要求把接车已经拍过的正常外观再拍一遍。`
    : '接车还没有分析。下面如果附了接车照片，只用来知道当时留了什么，不要把正常外观再列成检测要拍的项。'
  return [
    intakeLine,
    '剐蹭、漆面损伤只查受损的位置。正常的保险杠、翼子板、车门不要再要求补拍，那是接车已经做的事。',
    '意见写成一条条完整的话。不要写「给店里」「给车主」「怎么查」「缺项」「漏项」「错项」当标题。',
    'shop：还没写上的受损处、和诉求对不上的已有项、可以怎么核对。这些是文字意见，店员没法按一下就做完，不要写成能直接填进单据。已经有的部位不要再说漏了。最多 4 条。',
    'items：把每一项已写下的发现写成车主能听懂的一句。看到了什么，不处理会怎样，现在做还是先观察。',
    '结果为需处理就建议现在处理。需关注就说可以先观察。状态良好就说现在不用动。仅记录就说只是留了照片。',
    '这些句子里不要出现「需处理」「需关注」「状态良好」。检查发现是空的就不要为这项编后果。',
    `本单：${JSON.stringify({
      complaint: ctx.complaint,
      intake: ctx.intakeBrief,
      items: ctx.inspectItems,
    })}`,
    '输出 JSON：{"shop":[{"kind":"miss","title":"","body":""}],"items":[{"id":"","body":""}]}',
  ].join('\n')
}

function deliveryInstruction(ctx) {
  return [
    '你在看交车。只根据已经做好的项目和店员写的质保，给店员三句。',
    'repair：这次做成了什么。warranty：质保还缺不缺；已经写了就说按已写的。care：之后用车要注意的一句，必须对着这次的项目。',
    '不要编保养周期，不要编没写过的年限，不要改报价。',
    `本单：${JSON.stringify({
      complaint: ctx.complaint,
      quoteLines: ctx.quoteLines,
      workItems: ctx.workItems,
      warrantyPeriod: ctx.warrantyPeriod,
      warrantyNotes: ctx.warrantyNotes,
    })}`,
    '输出 JSON：{"repair":{"title":"这次维修","body":""},"warranty":{"title":"质保","body":""},"care":{"title":"用车","body":""}}',
  ].join('\n')
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
    const raw = await runLlm(
      kind === 'work' ? workInstruction(ctx) : kind === 'inspect' ? inspectionInstruction(ctx) : deliveryInstruction(ctx),
      kind === 'work' ? (ctx.workPhotoSlots || []).map((row) => row.url) : kind === 'inspect' && !ctx.intakeBrief ? ctx.intakePhotoUrls : [],
      kind === 'work' ? '施工' : '接车',
    )
    const parsed = kind === 'work'
      ? parseWorkAdvice(raw, ctx.workItems, ctx.workPhotoSlots)
      : kind === 'inspect'
        ? parseInspectionAdvice(raw, ctx.inspectItems)
        : parseDeliveryAdvice(raw)
    const ok = adviceHasContent(parsed, kind)
    await patchNode(albumId, nodeKind, (item) => ({
      ...item,
      [field]: ok
        ? { status: 'ready', fingerprint, ...parsed, errorMessage: '', updatedAt: new Date().toISOString() }
        : { ...(item[field] || {}), status: 'failed', fingerprint, errorMessage: '未能出意见', updatedAt: new Date().toISOString() },
    }))
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
