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
const {
  normalizeOwnerFaqs,
  contentOfFlowNode,
  buildQuoteLedger,
  buildAcceptanceRowsFromWorkItems,
  collectUnbuiltQuoteItems,
  normalizeItemName,
  resolvePresetItemName,
} = resolveShared('utils/service-flow-docs.js')
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
    quoteLineId: text(row && row.quoteLineId),
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
    if (!url || used.has(url) || slots.length >= 12) return
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

function parseWorkAdvice(raw, items, slots, options = {}) {
  const parsed = parseReviewModelJson(raw) || {}
  const quoteLines = Array.isArray(options && options.quoteLines) ? options.quoteLines : []
  const accountedRows = Array.isArray(options && options.unbuiltQuoteItems) ? options.unbuiltQuoteItems : []
  // 施工节点已交代的未施工项：不再当缺项提醒
  const isAccounted = (line) =>
    accountedRows.some(
      (item) =>
        (line.id && item.quoteLineId === line.id) ||
        (item.name && resolvePresetItemName(item.name, [line.name]) === line.name),
    )
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
  // 施工顺序：按报价行给的通用施工说明+拍照建议（只读）
  let sequence = (Array.isArray(parsed['施工顺序']) ? parsed['施工顺序'] : [])
    .map((row) => {
      const name = text(row && (row['项目'] || row.partName || row.name || row.title)).slice(0, 40)
      const how = text(row && (row['说明'] || row.how || row.body)).slice(0, 160)
      const photo = text(row && (row['拍照建议'] || row.photoAdvice || row.photo)).slice(0, 160)
      if (!name && !how && !photo) return null
      return { name, how, photo }
    })
    .filter(Boolean)
    .slice(0, 12)
  // 新增项：不属于任何报价行的图
  const slotByNum = new Map((Array.isArray(slots) ? slots : []).map((row) => [Number(row.slot), row]))
  const newItems = (Array.isArray(parsed['新增项']) ? parsed['新增项'] : [])
    .map((row) => {
      const name = text(row && (row['项目'] || row.partName || row.name)).slice(0, 40)
      const desc = text(row && (row['描述'] || row.body || row.note)).slice(0, 160)
      const nums = collectGroupSlotNumbers({
        imageSlots: slotTokens(row['图片']).concat(slotTokens(row.imageSlots)),
        imageNames: slotTokens(row.imageNames),
        imageName: row.imageName,
        photoNames: row.photoNames,
      })
      const images = nums
        .map((n) => slotByNum.get(n))
        .filter(Boolean)
        .map((shot) => ({ slot: shot.slot, url: shot.url }))
      if (!images.length && !name && !desc) return null
      return { name, description: desc, images }
    })
    .filter(Boolean)
    .slice(0, 8)
  const names = new Set((Array.isArray(items) ? items : []).map((row) => text(row && row.name)).filter(Boolean))
  const bySlot = new Map((Array.isArray(slots) ? slots : []).map((row) => [row.slot, row]))
  const seenSlot = new Set()
  const splitRows = Array.isArray(parsed['拆分建议']) ? parsed['拆分建议'] : null
  const groupRows = splitRows || (Array.isArray(parsed.groups) ? parsed.groups : [])
  // 按所属施工项（findingId）归组，支持拆成多张
  const byFinding = new Map()
  groupRows.forEach((row) => {
    const partName = text(row && (row['项目'] || row['检测项目'] || row.partName || row.title)).slice(0, 16)
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
      if (!shot || seenSlot.has(slot)) return
      seenSlot.add(slot)
      const findingId = text(shot.findingId)
      if (!byFinding.has(findingId)) byFinding.set(findingId, new Map())
      const named = byFinding.get(findingId)
      if (!named.has(partName)) {
        named.set(partName, { partName, advice: '', images: [], imageSlots: [] })
      }
      const group = named.get(partName)
      const desc = text(row && (row['描述'] || row.advice || row.body)).slice(0, 200)
      if (desc && !group.advice) group.advice = desc
      if (!group.imageSlots.includes(slot)) group.imageSlots.push(slot)
      group.images.push({ url: shot.url })
    })
  })
  const groups = []
  byFinding.forEach((named, findingId) => {
    const groupList = [...named.values()]
      .filter((row) => row.partName && row.images.length)
      .map((row) => {
        const imageSlots = row.imageSlots.slice().sort((a, b) => a - b)
        return {
          partName: row.partName,
          advice: row.advice,
          images: row.images,
          imageSlots,
          imageLabel: imageSlots.map((n) => `图${n}`).join('、'),
        }
      })
    if (!groupList.length) return
    groups.push({
      id: `edit_item_${findingId}`,
      kind: 'item',
      findingId,
      body:
        groupList.length >= 2
          ? `拆成${groupList.map((g) => `「${g.partName}」`).join('')}并写上施工说明`
          : groupList[0].advice || groupList[0].partName,
      groups: groupList,
      canApply: groupList.length >= 2,
    })
  })
  // 新契约（schema 2）：报价项建议 / 逐图归类 / 证据 / 填写建议
  const workNames = (Array.isArray(items) ? items : [])
    .map((row) => text(row && row.name))
    .filter(Boolean)
  const quoteNames = quoteLines.map((row) => text(row && row.name)).filter(Boolean)
  const presetAll = workNames.concat(quoteNames.filter((name) => !workNames.includes(name)))
  const slotByNumNew = new Map((Array.isArray(slots) ? slots : []).map((row) => [Number(row.slot), row]))
  const slotsOfRow = (row) => {
    const nums = collectGroupSlotNumbers({
      imageSlots: slotTokens(row && (row['图'] || row['图片'])).concat(slotTokens(row && row.imageSlots)),
      imageNames: slotTokens(row && row.imageNames),
      imageName: row && row.imageName,
      photoNames: row && row.photoNames,
    })
    return nums.map((n) => slotByNumNew.get(n)).filter(Boolean).map((shot) => ({ slot: shot.slot, url: shot.url }))
  }
  // 第 1 步：报价项建议（只读）
  const quoteAdvice = (Array.isArray(parsed['报价项建议']) ? parsed['报价项建议'] : [])
    .map((row) => {
      const rawName = text(row && (row['报价项'] || row['项目'] || row.name))
      const name = resolvePresetItemName(rawName, quoteNames)
      if (!name) return null
      const how = text(row && (row['做法'] || row['说明'] || row.how)).slice(0, 160)
      const photo = text(row && (row['拍照建议'] || row.photoAdvice || row.photo)).slice(0, 160)
      if (!how && !photo) return null
      const line = quoteLines.find((item) => text(item && item.name) === name) || {}
      return { id: text(line.id) || `qa_${name}`, name, how, photo, amount: text(line.amount) }
    })
    .filter(Boolean)
  // 报价项没拿到建议也照样列出，前端在第一条列表里直接给「新增」
  const adviceNames = new Set(quoteAdvice.map((row) => row.name))
  quoteLines.forEach((line) => {
    const name = text(line && line.name)
    if (!name || adviceNames.has(name)) return
    quoteAdvice.push({ id: text(line.id) || `qa_${name}`, name, how: '', photo: '', amount: text(line.amount) })
  })
  quoteAdvice.splice(30)
  // 第 4 步：证据
  const evidenceByName = new Map()
  ;(Array.isArray(parsed['证据']) ? parsed['证据'] : []).forEach((row) => {
    const name = resolvePresetItemName(text(row && (row['项目'] || row.partName || row.name)), workNames)
    if (!name || evidenceByName.has(name)) return
    const flag = text(row && (row['判定'] || row['证据'] || row.evidence))
    // 完成判定：已完成 / 待确认；兼容老结果的 充分 / 不足
    const evidence =
      flag === '已完成' || flag === 'done' || flag === '充分' || flag === 'sufficient'
        ? 'done'
        : flag === '待确认' || flag === 'pending' || flag === '不足' || flag === 'insufficient'
          ? 'pending'
          : 'unknown'
    evidenceByName.set(name, {
      evidence,
      basis: text(row && (row['依据'] || row.basis)).slice(0, 150),
      gap: text(row && (row['缺少'] || row['缺什么'] || row.gap)).slice(0, 120),
    })
  })
  // 第 4 步补充：结构化补拍清单 + 疑似返工（施工节点完成前必须补齐留证）
  const shootPlan = (Array.isArray(parsed['补拍清单']) ? parsed['补拍清单'] : [])
    .map((row) => {
      const name = resolvePresetItemName(
        text(row && (row['项目'] || row.partName || row.name)),
        workNames,
      )
      const missing = text(row && (row['缺哪类'] || row.missing)).slice(0, 40)
      const how = text(row && (row['怎么拍'] || row.how || row.body)).slice(0, 160)
      const severity = text(row && (row['严重度'] || row.severity)) === '必须' ? 'must' : 'suggest'
      if (!name && !how) return null
      return {
        title: name || '留证',
        project: name,
        missing,
        how,
        body: how || (missing ? `缺${missing}` : '这一项留证不足，建议补拍。'),
        severity,
      }
    })
    .filter(Boolean)
    .slice(0, 8)
  const reworkHints = (Array.isArray(parsed['返工提醒']) ? parsed['返工提醒'] : [])
    .map((row) => {
      const name = resolvePresetItemName(
        text(row && (row['项目'] || row.partName || row.name)),
        workNames,
      )
      const basis = text(row && (row['依据'] || row.basis || row.body)).slice(0, 120)
      if (!name || !basis) return null
      return { name, basis, display: `${name}疑似返工：${basis}` }
    })
    .filter(Boolean)
    .slice(0, 4)
  // 说明建议：说明为空给「建议描述」，已写说明给「修改建议」（完整替换句）
  const fillByName = new Map()
  adviceRows(parsed, '填写建议', 'items').forEach((row) => {
    const rawName = text(row && (row['项目'] || row.partName || row.name))
    const name = resolvePresetItemName(rawName, workNames) || resolvePresetItemName(rawName, quoteNames)
    if (!name || fillByName.has(name)) return
    const body = text(row && (row['建议描述'] || row.body)).slice(0, 200)
    const polish = text(row && (row['修改建议'] || row['润色建议'] || row.polish)).slice(0, 200)
    const supplement = text(row && (row['补充建议'] || row.supplement)).slice(0, 120)
    if (!body && !polish && !supplement) return
    fillByName.set(name, { body, polish, supplement })
  })
  const photosOfFinding = (findingId) =>
    (Array.isArray(slots) ? slots : [])
      .filter((row) => text(row && row.findingId) === text(findingId))
      .map((row) => ({ slot: row.slot, url: row.url }))
  // 施工项：每项带报价归属、证据、可应用建议
  const workItemsOut = (Array.isArray(items) ? items : [])
    .map((row) => {
      const name = text(row && row.name)
      if (!name) return null
      const written = text(row && row.note)
      const quoteName = resolvePresetItemName(name, quoteNames)
      const quoteLine = quoteName ? quoteLines.find((item) => text(item && item.name) === quoteName) : null
      const hit = fillByName.get(name) || (quoteName ? fillByName.get(quoteName) : null) || null
      const ev = evidenceByName.get(name) || null
      const body = !written && hit ? text(hit.body) : ''
      const polish = written && hit ? text(hit.polish) : ''
      const supplement = written && hit ? text(hit.supplement) : ''
      return {
        id: text(row && row.id),
        name,
        quoteLineId: text(row && row.quoteLineId) || text(quoteLine && quoteLine.id),
        quoteName: quoteName || '',
        origin: quoteName ? 'quote' : 'extra',
        photos: photosOfFinding(row && row.id),
        written,
        evidence: ev ? ev.evidence : 'unknown',
        completionBasis: ev ? ev.basis : '',
        evidenceGap: ev ? ev.gap : '',
        advice: {
          body: body.slice(0, 200),
          polish: polish.slice(0, 200),
          supplement: supplement.slice(0, 120),
        },
        action: body ? 'fill' : polish ? 'polish' : supplement ? 'supplement' : 'none',
      }
    })
    .filter(Boolean)
  // 第 2 步：逐图归类 → 报价有、工单无、但有图（漏记）
  const quotePhotoMap = new Map()
  ;(Array.isArray(parsed['逐图归类']) ? parsed['逐图归类'] : []).forEach((row) => {
    const name = resolvePresetItemName(text(row && (row['归属'] || row.partName || row.name)), quoteNames)
    if (!name) return
    if (workItemsOut.some((item) => item.quoteName === name)) return
    if (!quotePhotoMap.has(name)) quotePhotoMap.set(name, [])
    const bucket = quotePhotoMap.get(name)
    slotsOfRow(row).forEach((shot) => {
      if (bucket.some((item) => item.slot === shot.slot)) return
      bucket.push(shot)
    })
  })
  // 新增项里如果其实能对上预设名，就并回报价项/工单项，不留在新增
  const newItemsOut = []
  newItems.forEach((row) => {
    const preset = resolvePresetItemName(row.name, presetAll)
    if (!preset) {
      newItemsOut.push(row)
      return
    }
    const quoteName = resolvePresetItemName(preset, quoteNames)
    if (!quoteName || workItemsOut.some((item) => item.quoteName === quoteName)) return
    if (!quotePhotoMap.has(quoteName)) quotePhotoMap.set(quoteName, [])
    const bucket = quotePhotoMap.get(quoteName)
    ;(row.images || []).forEach((shot) => {
      if (bucket.some((item) => item.slot === shot.slot)) return
      bucket.push(shot)
    })
  })
  // 报价项待施工：未施工（无图）/ 漏记（有图）
  const quoteOnlyItems = quoteLines
    .map((line) => {
      const name = text(line && line.name)
      if (!name) return null
      const lineId = text(line && line.id)
      const covered = workItemsOut.some(
        (item) =>
          (lineId && item.quoteLineId === lineId) ||
          item.quoteName === name ||
          item.name === name,
      )
      if (covered || isAccounted(line)) return null
      const photos = quotePhotoMap.get(name) || []
      const hit = fillByName.get(name) || null
      return {
        id: lineId || `q_${name}`,
        name,
        amount: text(line.amount),
        note: text(line.note),
        kind: photos.length ? 'work_missing' : 'unstarted',
        photos,
        advice: { body: hit ? text(hit.body).slice(0, 120) : '' },
        action: 'create',
        canApply: true,
      }
    })
    .filter(Boolean)
    .slice(0, 30)
  // 旧字段继续产出：施工顺序 / 缺项 / 增项 / 留证
  if (!sequence.length && quoteAdvice.length) {
    sequence = quoteAdvice.map((row) => ({ name: row.name, how: row.how, photo: row.photo }))
  }
  quoteOnlyItems
    .filter((row) => row.kind === 'unstarted')
    .forEach((row) => {
      if (gaps.length >= 4) return
      gaps.push({
        kind: 'missing',
        title: row.name,
        body: `报价里的${row.name}，施工没有做。`,
      })
    })
  newItemsOut.forEach((row) => {
    if (gaps.length >= 4 || !row.name) return
    gaps.push({
      kind: 'extra',
      title: row.name,
      body: `${row.name}是新增项，没有事先报价。`,
    })
  })
  if (shootPlan.length) {
    photoPlan = shootPlan
  } else if (!photoPlan.length) {
    photoPlan = workItemsOut
      .filter((row) => row.evidence === 'pending' && row.evidenceGap)
      .slice(0, 6)
      .map((row) => ({
        title: row.name,
        project: row.name,
        missing: '',
        how: row.evidenceGap || '',
        body: row.evidenceGap || '这一项留证不足，建议补拍。',
        severity: row.photos.length ? 'suggest' : 'must',
      }))
  }
  return {
    scope: 'process',
    schema: 8,
    sequence,
    gaps,
    items: written,
    groups: groups.slice(0, 6),
    newItems: newItemsOut,
    photoPlan,
    reworkHints,
    quoteAdvice,
    workItems: workItemsOut,
    quoteOnlyItems,
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

function parseDeliveryAdvice(raw, slots) {
  const parsed = parseReviewModelJson(raw)
  if (!parsed) {
    return {
      repairBrief: '',
      ownerFaqs: [],
      acceptance: null,
      warranty: null,
      tips: [],
      publicCaptions: [],
      processIssues: [],
      fill: null,
      archiveCopy: null,
    }
  }
  // 简述/问答不再进面板：只静默写入节点内容，供托管预览与公网完工章
  const repairBrief = text(parsed['简述'] || parsed.repairBrief).slice(0, 500)
  const ownerFaqs = parseOwnerFaqSuggestions(
    (Array.isArray(parsed['问答']) && parsed['问答'].length ? parsed['问答'] : null) ||
      parsed.ownerFaqs ||
      parsed.faqs ||
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
  // 验收已前移到施工节点：交车 AI 不再产出验收建议与图片挪行建议
  const acceptance = null
  const splitGroups = []
  const warrantyPeriod = text(parsed['质保'] || parsed.warrantyPeriod).slice(0, 60)
  return {
    repairBrief,
    ownerFaqs,
    acceptance,
    groups: splitGroups,
    warranty: warrantyPeriod
      ? { title: '质保期限', body: warrantyPeriod }
      : null,
    schema: 7,
    tips,
    publicCaptions: parsePublicCaptions(parsed['图说'] || parsed.publicCaptions),
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
    return (Array.isArray(advice.quoteAdvice) && advice.quoteAdvice.length > 0) ||
      (Array.isArray(advice.workItems) && advice.workItems.length > 0) ||
      (Array.isArray(advice.quoteOnlyItems) && advice.quoteOnlyItems.length > 0) ||
      (Array.isArray(advice.gaps) && advice.gaps.length > 0) ||
      (Array.isArray(advice.items) && advice.items.length > 0) ||
      (Array.isArray(advice.groups) && advice.groups.length > 0) ||
      (Array.isArray(advice.photoPlan) && advice.photoPlan.length > 0) ||
      (Array.isArray(advice.sequence) && advice.sequence.length > 0) ||
      (Array.isArray(advice.newItems) && advice.newItems.length > 0) ||
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
    filled(advice.warranty) ||
      text(advice.repairBrief) ||
      (Array.isArray(advice.ownerFaqs) && advice.ownerFaqs.length > 0) ||
      (Array.isArray(advice.tips) && advice.tips.length > 0),
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
    const partName = zhInspectName(g['项目'] || g['检测项目'] || g.partName || g.name || g.title)
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

/**
 * 交车验收行（规则生成，不过模型）：行 = 施工项 ∪ 报价行（首次 + 历次补充）。
 * 施工项的图按行名带进验收行，保证「有施工图就有证据」、验收清单不空白。
 */
function workAcceptanceItems(nodes) {
  const items = []
  ;(Array.isArray(nodes) ? nodes : []).forEach((node) => {
    const findings = contentOfFlowNode(node).findings || []
    ;(Array.isArray(findings) ? findings : []).forEach((row) => {
      const name = text(row && row.partName)
      if (!name) return
      const images = workImageList(row)
        .map((img) => ({ url: imageOriginalUrl(img) }))
        .filter((img) => /^https?:\/\//.test(img.url))
      items.push({ name, images })
    })
  })
  return items
}

/** 交车步图片：逐行图片（施工项 + 报价行 + 外观行），统一给 slot 与所属项目名（供 AI 引用「图N」） */
function deliveryPhotoSlots(rows) {
  const slots = []
  const seen = {}
  const push = (raw, partName) => {
    const url = text(typeof raw === 'object' && raw ? raw.url || raw.rawUrl || raw.maskedUrl : raw)
    if (!/^https?:\/\//.test(url) || seen[url] || slots.length >= 12) return
    seen[url] = true
    slots.push({ slot: slots.length + 1, url, partName: text(partName).slice(0, 40) })
  }
  ;(Array.isArray(rows) ? rows : []).forEach((item) => {
    const label = item && item.kind === 'exterior' ? '整车外观' : text(item && item.name)
    ;(Array.isArray(item && item.images) ? item.images : []).forEach((img) => push(img, label))
  })
  return slots
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

function contextOf(album, extraNotes = {}, options = {}) {
  const nodes = readFlowNodes(album)
  const { buildCaseFactPack } = require('../utils/case-geo-factpack')
  const factPack = buildCaseFactPack(nodes)
  const intake = nodes.find((item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'))
  const inspection = nodes.find((item) => item && item.kind === 'inspection')
  // 历次报价单（首次 + 各次补充报价）与其汇总：施工、交车都用汇总口径
  const quoteLedger = buildQuoteLedger(nodes)
  // 施工 AI 跟节点绑定：补充施工只看它自己的补充报价单，返工施工没有新报价单
  const scopedWorkId = text(options && options.nodeId)
  const scopedWork = scopedWorkId
    ? nodes.find((item) => item && item.id === scopedWorkId && item.kind === 'work') || null
    : null
  const confirmedOf = (entry) => entry.lines.filter((line) => line.confirmed)
  let quoteSummaryEntries = quoteLedger.entries
  if (scopedWork) {
    const reason = text(scopedWork.insertedReason)
    if (reason === 'addon') {
      const entry = quoteLedger.entries.find(
        (row) => row.nodeId === text(scopedWork.parentNodeId),
      )
      quoteSummaryEntries = entry ? [entry] : []
    } else if (reason === 'rework') {
      quoteSummaryEntries = []
    } else {
      // 原施工节点只对照首次报价；后续补充报价各自有补充施工节点
      const firstEntries = quoteLedger.entries.filter((entry) => !entry.isAddon)
      quoteSummaryEntries = firstEntries.length ? firstEntries : quoteLedger.entries
    }
  }
  const workQuoteLines = quoteSummaryEntries.reduce((all, entry) => all.concat(entry.lines), [])
  const workQuoteItems = quoteSummaryEntries.reduce(
    (all, entry) => all.concat(confirmedOf(entry)),
    [],
  )
  const quoteSummary = {
    count: quoteSummaryEntries.length,
    total: quoteSummaryEntries.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0),
    confirmedTotal: workQuoteItems.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
    entries: quoteSummaryEntries.map((entry) => ({
      label: entry.label,
      status: entry.status,
      lineCount: entry.lines.length,
      total: entry.total,
    })),
  }
  const works = nodes.filter((item) => item && item.kind === 'work')
  const workScope = scopedWork ? [scopedWork] : works
  const delivery = nodes.find((item) => item && item.kind === 'delivery_photos')
  const repair = nodes.find((item) => item && item.kind === 'repair_report')
  const draft = contentOfFlowNode(delivery)
  const reportPayload = (repair && repair.document && repair.document.payload) || {}
  const intakeAdvice = (intake && intake.intakeAdvice) || {}
  const inspectionAdvice = (inspection && inspection.inspectionAdvice) || {}
  const workAdvice = (workScope.find((item) => item.workAdvice) || {}).workAdvice || {}
  const imageNotesMap = { ...(extraNotes || {}), ...collectImageNotesMap(nodes) }
  const intakeUrls = intakePhotoUrls(intake)
  const inspectSlots = inspectPhotoSlots(inspection)
  const inspectUrls = inspectSlots.map((row) => row.url)
  const workSlots = workPhotoSlots(workScope)
  const workItemRows = workScope.reduce((all, node) => all.concat(workRows(node)), [])
  // 验收行由规则生成：施工项 ∪ 总报价行（首次 + 历次补充），施工图按行名带进验收行；大模型只做逐行评估
  // 施工节点已交代的未施工行带原因，交车只读，不再要求商家操作
  const unbuiltQuoteItems = collectUnbuiltQuoteItems(scopedWork ? [scopedWork] : nodes)
  const acceptanceRows = buildAcceptanceRowsFromWorkItems(
    workAcceptanceItems(workScope),
    draft.acceptanceItems,
    quoteLedger.lines,
    unbuiltQuoteItems,
  )
  const deliverySlots = deliveryPhotoSlots(acceptanceRows)
  const deliveryUrls = deliverySlots.map((row) => row.url)
  const intakeSplit = splitNewAndNotedUrls(intakeUrls, imageNotesMap)
  const inspectSplit = splitNewAndNotedUrls(inspectUrls, imageNotesMap)
  const workFreshSlots = (workSlots || []).filter((row) => !noteForUrl(row.url, imageNotesMap))
  const workNoted = (workSlots || [])
    .filter((row) => noteForUrl(row.url, imageNotesMap))
    .map((row) => ({ slot: row.slot, partName: row.partName, note: noteForUrl(row.url, imageNotesMap) }))
  const deliverySplit = splitNewAndNotedUrls(deliveryUrls, imageNotesMap)
  // 送模的图只含没看过的；槽位按送模顺序重排 1..N，保证「图N」与附件一致
  const deliveryFreshSlots = deliverySlots
    .filter((row) => !noteForUrl(row.url, imageNotesMap))
    .map((row, index) => ({ ...row, slot: index + 1 }))
  const acceptanceImageSlots = (row) =>
    (Array.isArray(row && row.images) ? row.images : [])
      .map((img) => {
        const url = text(img && (img.url || img.rawUrl))
        const hit = deliveryFreshSlots.find((slot) => slot.url === url)
        return hit ? hit.slot : null
      })
      .filter((slot) => slot != null)
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
    quoteLines: workQuoteLines,
    // 未施工判定只认已确认的报价；行上带来源，便于 AI 说明是哪张单子的项目
    quoteItemRows: workQuoteItems.map((row) => ({
      id: row.id,
      name: row.name,
      amount: row.amount || '',
      note: row.note || '',
      quoteLabel: row.quoteLabel || '',
    })),
    // 施工节点已交代的未施工项（系统录入错误 / 客户要求不做）：交车只读，不再要求商家处理
    unbuiltQuoteItems,
    quoteSummary,
    workItems: workItemRows,
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
    // 本单施工项目（验收行）与已填内容：AI 只对已有项目给建议，不得新增项目
    workItemNames: workItemRows
      .map((row) => text(row && row.name))
      .filter(Boolean)
      .slice(0, 20),
    // 验收行是规则产物（施工项 ∪ 总报价行），不依赖商家手填：没填也能逐行评估证据是否充分
    acceptance: {
      items: acceptanceRows.slice(0, 20).map((row) => ({
        name: text(row && row.name),
        kind: row && row.kind === 'exterior' ? 'exterior' : 'work',
        note: text(row && row.note).slice(0, 200),
        result: text(row && row.result).slice(0, 20),
        unbuiltReason: text(row && row.unbuiltReason),
        unbuiltNote: text(row && row.unbuiltNote).slice(0, 120),
        imageSlots: acceptanceImageSlots(row),
        evidenceImageCount: (Array.isArray(row && row.images) ? row.images : []).length,
      })),
    },
    exteriorCount: (acceptanceRows || []).reduce(
      (sum, row) => sum + (row && row.kind === 'exterior' && Array.isArray(row.images) ? row.images.length : 0),
      0,
    ),
    deliveryPhotoSlots: deliveryFreshSlots,
    deliveryPhotoUrls: deliverySplit.fresh,
    deliverySplit,
    deliveryNoted: deliverySplit.noted.map((row) => {
      const hit = deliverySlots.find((slot) => slot.url === row.url)
      return { partName: hit ? hit.partName : '', note: row.note }
    }),
    workAdviceAt: text(workAdvice.updatedAt),
    imageNotesMap,
    factPack,
  }
}

function fingerprintFor(kind, ctx) {
  const picked = kind === 'work'
    ? {
        // v9：施工即验收，逐项按一般验收标准判完成度；说明建议含润色（完整替换句）
        v: 'work_v9',
        quoteLines: (ctx.quoteItemRows || []).map((row) => ({
          id: row.id,
          name: row.name,
          amount: row.amount,
          quoteLabel: row.quoteLabel || '',
        })),
        // 补充报价确认/取消后，汇总口径变化，施工意见要重新出
        quoteSummary: ctx.quoteSummary
          ? {
              count: ctx.quoteSummary.count,
              total: ctx.quoteSummary.confirmedTotal,
              entries: (ctx.quoteSummary.entries || []).map((row) => `${row.label}:${row.status}`),
            }
          : null,
        unbuiltQuoteItems: (ctx.unbuiltQuoteItems || []).map((row) => ({
          quoteLineId: row.quoteLineId || '',
          name: row.name,
          reason: row.reason,
        })),
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
        // v8：验收已前移到施工节点，交车只产出质保/提醒/简述/问答/图说
        v7: 'delivery_v8',
        workItems: ctx.workItems,
        warrantyPeriod: ctx.warrantyPeriod,
        warrantyNotes: ctx.warrantyNotes,
        workAdviceAt: ctx.workAdviceAt,
      }
  return crypto.createHash('sha1').update(JSON.stringify({ v: kind, ...picked })).digest('hex')
}

async function patchNode(albumId, kind, mutator, options = {}) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) return null
  const pkg = album.contentPackageJson && typeof album.contentPackageJson === 'object' ? album.contentPackageJson : {}
  const nodes = sortFlowNodes(pkg.flowNodes)
  const wantedId = text(options && options.nodeId)
  const index = wantedId
    ? nodes.findIndex((item) => item && item.id === wantedId)
    : nodes.findIndex((item) => item && item.kind === kind)
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
  const accountedRows = Array.isArray(ctx.unbuiltQuoteItems) ? ctx.unbuiltQuoteItems : []
  const accountedOf = (row) =>
    accountedRows.find(
      (item) =>
        (row.id && item.quoteLineId === row.id) ||
        (item.name && resolvePresetItemName(item.name, [row.name]) === row.name),
    )
  const quoteItems = (Array.isArray(ctx.quoteItemRows) ? ctx.quoteItemRows : []).map((row) => {
    const covered = (ctx.workItems || []).some(
      (item) =>
        (row.id && item.quoteLineId === row.id) ||
        (item.name && resolvePresetItemName(item.name, [row.name]) === row.name),
    )
    const accounted = accountedOf(row)
    return {
      报价项: row.name,
      金额: row.amount || '',
      备注: row.note || '',
      来源: row.quoteLabel || '首次报价',
      工单: covered ? '已有' : '无',
      交代: accounted
        ? `未施工·${accounted.reason === 'system_error' ? '系统录入错误' : '客户要求不做'}${
            accounted.note ? `（${accounted.note}）` : ''
          }`
        : '',
    }
  })
  const material = {
    prior: {
      intake: ctx.intakeAdviceSummary,
      intakeNoted: ctx.intakeNoted,
      inspect: ctx.inspectAdviceSummary,
      inspectNoted: ctx.inspectNoted,
      workNoted: ctx.workNoted,
    },
    报价项: quoteItems,
    // 本节点对应的报价单（原施工＝首次报价；补充施工＝它自己的补充报价）
    报价汇总: ctx.quoteSummary || null,
    工单项目: (ctx.workItems || []).map((row) => ({
      项目: row.name,
      已写描述: row.note || '',
      图片数: row.photos || 0,
    })),
    图片: slots.map((row) => ({ 图: `图${row.slot}`, 现在挂在: row.partName || '未挂' })),
  }
  return [
    '你是修理厂的施工顾问，帮店员整理施工这一步的意见。',
    '定位：施工节点是本单唯一留证与验收节点。施工说明写清做了什么、怎么做、结果如何，再配上图片，这一项就视为验收通过；交车节点不再重复验收，也不再补拍。',
    '本步有两份单据，必须分清：报价项是车主已确认的方案行，是预设清单；工单项是按报价项预生成的施工记录，允许与报价项不同。',
    '',
    '硬规则：',
    '1. 项目名只能从「工单项目」「报价项」里原样选择，禁止自己造名字；新增项才允许留空或写新名。',
    '2. 同一个项目的不同叫法必须归到预设名（例：报价只有「划痕修复」，底部划痕、门边划痕都归「划痕修复」）。',
    '3. 不同项目不得合并。',
    '4. 只建议，店员点应用才执行；不改价格，不自己挪图。',
    '5. 报价项里「交代」非空的，是商家已确认未施工（系统录入错误 / 客户要求不做）：不得再列进缺项、未施工、漏记提醒，也不要建议补做。报价有、工单无、又没交代的，必须提醒「报价有、施工无」。',
    '6. 禁止出现「交车时补拍」「交车再确认」这类把责任推给下一步的说法；缺图只能在本步补。',
    '7. 报价项只来自本节点对应的那张报价单：原施工看首次报价，补充施工只看它自己的补充报价，别的报价单的项目不属于本节点，不要当成漏项；返工施工没有新报价单，只核对工单项目。',
    '',
    '判断是否施工完成，按一般维修验收标准，不只看照片够不够：',
    '- 更换件（胶套、刹车片、电瓶、轮胎等）：旧件已拆下、新件装配到位、紧固/扭矩已复紧、试车或功能检查无异常。',
    '- 油液类（机油、变速箱油、冷媒等）：液位符合要求、无渗漏、规格和用量匹配。',
    '- 钣喷类：底材处理到位、色差可接受、平整度/缝隙正常、无流挂。',
    '- 检查/清洁类：检查结论明确、处理动作已执行、结果可复核。',
    '- 改装/加装类：安装牢固、线路/管路规范、功能可用、不影响原车功能。',
    '判定只有两档：「已完成」或「待确认」。说明或图片能支持上述要点、无明显缺失就是「已完成」；说明缺关键动作/结果，或图片无法证明完成，就是「待确认」，并在「缺少」写明缺什么。',
    '',
    '按下面六步思考，结果都写进这一个 JSON：',
    '',
    '1. 完成判定：逐工单项判断是否已施工完成，写「项目」「判定」「依据」「缺少」。',
    '   判定只填「已完成」或「待确认」。依据引用已写说明或具体图片（例：图2 可见新胶套已压装、螺栓已复紧）。检查类项目看说明里的结论是否明确，不要求施工图。',
    '2. 逐图归类：按图1、图2顺序，每张图独立看，只写这张图里实际有的内容。每张图给「图」「内容」「归属」；归属先找工单项目，工单没有再看报价项，两者都没有写「新增」。',
    '3. 拆分建议：同一工单项里混了多个项目的图才拆，写「项目」「图片」「描述」；项目只能取预设名。已经挂对的图不要写。',
    '4. 说明建议：给每个工单项一条，写「项目」「建议描述」「修改建议」。',
    '   - 说明为空：给「建议描述」，按“做了什么 + 怎么做的 + 结果”写成一句可交付的话。',
    '   - 说明已写：给「修改建议」，输出完整替换句，保留原意，补上关键工序、用料参数和结果，不凭空加事实。',
    '5. 返工提醒：从照片看得出返工迹象（旧件未拆、装配不到位、漏装、油污未清等）时，写「项目」「依据」，依据必须指向具体图和画面；只提醒，不擅自把状态改成返工。',
    '6. 新增项：工单和报价都没有的图才列，写「项目」「图片」「描述」；识别不出项目就留空。',
    '',
    '只写画面和单据里实际有的内容，不编。',
    '',
    `参考材料：${JSON.stringify(material)}`,
    require('./model-mask-instruction').MODEL_MASKS_INSTRUCTION,
    '只返回 JSON：{"证据":[{"项目":"下摆臂胶套更换","判定":"已完成","依据":"图2 可见新胶套已压装，螺栓已复紧","缺少":""},{"项目":"变速箱油更换","判定":"待确认","依据":"说明只写了已换油","缺少":"放油口旧油颜色和加注量没有说明或图片"}],"逐图归类":[{"图":"图1","内容":"这张图里实际有的内容","归属":"工单项目名或报价项名，都没有写新增"}],"拆分建议":[{"项目":"制动盘检查","图片":["图2"],"描述":"这张是制动盘磨损情况。"}],"填写建议":[{"项目":"下摆臂胶套更换","建议描述":"更换了开裂的下摆臂胶套，旧件已拆下，新件压装到位，螺栓按标准扭矩复紧，路试无异常。","修改建议":""},{"项目":"变速箱油更换","建议描述":"","修改建议":"已更换变速箱油，放出旧油颜色发黑，加注新油至标准液位，检查放油口无渗漏，试车换挡正常。"}],"返工提醒":[{"项目":"下摆臂胶套更换","依据":"图1 可见旧胶套仍装在车上，未见拆装痕迹"}],"新增项":[{"项目":"","图片":["图3"],"描述":"拍到了减震器漏油。"}],"masks":[{"imageSlot":1,"regions":[{"kind":"face","left":0,"top":0,"width":0,"height":0}]}]}',
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
  // 验收已在施工节点完成并锁定：交车只产出交付文案、质保建议与提醒
  const safeFacts = scrubPiiDeep({
    workItems: ctx.workItems,
    warrantyPeriod: ctx.warrantyPeriod,
    warrantyNotes: ctx.warrantyNotes,
    // 已经用模型看过的图，直接用观察结论，不重复看图
    workPhotos: (ctx.workNoted || []).slice(0, 12).map((row) => ({
      part: row.partName,
      note: String(row.note || '').slice(0, 60),
    })),
    deliveryPhotosNoted: (ctx.deliveryNoted || []).slice(0, 12).map((row) => ({
      part: String((row && row.partName) || '').slice(0, 40),
      note: String((row && row.note) || '').slice(0, 60),
    })),
    newPhotoCount: (ctx.deliverySplit && ctx.deliverySplit.fresh ? ctx.deliverySplit.fresh.length : 0) || 0,
    exteriorCount: ctx.exteriorCount,
  })
  return [
    '你是修理厂的交车顾问。验收已在施工节点完成并锁定：施工说明 + 图片即视为验收通过，本步不再逐项判断验收，也不再要求补拍。',
    '报价单、接车单在各自节点完成后已经锁定，不再作为判断依据：不要引用、不要对比，也不要因为和报价或接车诉求不符而下结论。',
    '',
    '按下面三步思考，结果都写进这一个 JSON：',
    '',
    '1. 质保：只写一行期限建议，如「12 个月或 2 万公里，以先到为准」，不写范围条款。',
    '2. 简述（静默）：120到200字，只进公网完工章与托管预览，不展示给店员。按自然顺序覆盖四件事——①这次做了哪些项目；②关键工艺与用料（不写价格）；③修完怎么确认的（施工说明与照片）；④交车叮嘱与质保。不写价格和隐私，不编没做的事。',
    '   问答（静默）：3到8条，用于公开案例页与托管预览（不展示在交车页）：问句用消费者真实会问的自然问法，尽量带上车型与项目并含「这例」。优先覆盖①本次维修注意事项（修后护理、复查时机、禁忌、质保与返修）至少各一条；②同类问题修前怎么判断和由这例稍作延伸的普遍问题，答句末尾点明「具体以到店检测为准」。',
    '   图说：对本次附图（图1、图2…）各写一句15到30字的公开图说，描述画面可见的部件、动作或状态；只写与维修和车辆直接相关的主体，不写推测结论，不写车牌与人脸。',
    '3. 提醒：给店员 0 到 3 条交车提醒（如交付前绕车检查、钥匙与旧件交接、质保说明），写「标题」「正文」，不重复施工内容，不要求补拍。',
    '',
    `参考材料：${JSON.stringify(safeFacts)}`,
    require('./model-mask-instruction').MODEL_MASKS_INSTRUCTION,
    '只返回 JSON：{"质保":"12 个月或 2 万公里，以先到为准","简述":"…120到200字…","问答":[{"问":"这例下摆臂胶套换完要注意什么？","答":"这例已更换新胶套并做过路试，近期少过剧烈颠簸，磨合几天。"}],"图说":[{"图":"图1","说":"举升后安装到位的下摆臂胶套。"}],"提醒":[{"标题":"交付前绕车检查","正文":"确认外观照已拍、车内物品已清点后再交钥匙。"}],"masks":[{"imageSlot":1,"regions":[{"kind":"face","left":0,"top":0,"width":0,"height":0}]}]}',
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
    const ctx = contextOf(album, await notesForAlbumImages(album), options)
    const fingerprint = fingerprintFor(kind, ctx)
    const { field, nodeKind } = nodeField(kind)
    const nodeId = text(options && options.nodeId)
    const patchOpts = { nodeId: kind === 'work' ? nodeId : '' }
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
          : kind === 'delivery'
            ? buildSlotByUrl(ctx.deliveryPhotoSlots)
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
      ? parseWorkAdvice(raw, ctx.workItems, ctx.workPhotoSlots, {
          quoteLines: ctx.quoteItemRows,
          unbuiltQuoteItems: ctx.unbuiltQuoteItems,
        })
      : kind === 'inspect'
        ? parseInspectionAdvice(raw, ctx.inspectItems, urls, ctx.inspectPhotoSlots)
        : parseDeliveryAdvice(raw, ctx.deliveryPhotoSlots)
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
    }, patchOpts)
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
    const nodeId = kind === 'work' ? text(options && options.nodeId) : ''
    await patchNode(albumId, nodeKind, (item) => ({
      ...item,
      [field]: {
        ...((item && item[field]) || {}),
        status: 'failed',
        errorMessage: text(err && err.message).slice(0, 80) || '未能出意见',
        updatedAt: new Date().toISOString(),
      },
    }), { nodeId }).catch(() => {})
  } finally {
    jobsInFlight.delete(key)
  }
}

async function queueIfNeeded(album, kind, options = {}) {
  const { resolveCapabilityForMerchant } = require('./node-ai-review.service')
  const capability = await resolveCapabilityForMerchant(album.merchantId)
  if (!capability || !capability.entitled || !capability.llmEnabled) return { queued: false, skipped: true }
  const ctx = contextOf(album, await notesForAlbumImages(album), options)
  if (
    kind === 'work' &&
    !ctx.quoteLines.length &&
    !ctx.workItems.length &&
    !(ctx.workPhotoSlots || []).length
  ) {
    const err = new Error('先有报价或施工项或施工图')
    err.status = 400
    throw err
  }
  if (kind === 'inspect' && !text(ctx.complaint) && !ctx.inspectItems.length && !(ctx.inspectPhotoSlots || []).length) {
    const err = new Error('先写车主诉求')
    err.status = 400
    throw err
  }
  const force = Boolean(options && options.force)
  const nodeId = kind === 'work' ? text(options && options.nodeId) : ''
  const patchOpts = { nodeId }
  const fingerprint = fingerprintFor(kind, ctx)
  const { field, nodeKind } = nodeField(kind)
  const node = nodeId
    ? readFlowNodes(album).find((item) => item && item.id === nodeId)
    : readFlowNodes(album).find((item) => item && item.kind === nodeKind)
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
  }, patchOpts)
  setImmediate(() => {
    runJob(album.id, kind, { force, nodeId }).catch(() => {})
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
  const adviceOutdated = kind === 'delivery' && Number(advice.schema || 1) < 7
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
    // 旧结果（schema<8）视为过时，引导刷新
    const workOutdated = Number(advice.schema || 1) < 8
    return {
      ...base,
      stale: stale || (workOutdated && (status === 'ready' || hasBody)),
      schema: Number(advice.schema || 1),
      scope: text(advice.scope),
      note: text(advice.note),
      gaps: Array.isArray(advice.gaps) ? advice.gaps : [],
      items: Array.isArray(advice.items) ? advice.items : [],
      groups: Array.isArray(advice.groups) ? advice.groups : [],
      sequence: Array.isArray(advice.sequence) ? advice.sequence : [],
      newItems: Array.isArray(advice.newItems) ? advice.newItems : [],
      photoPlan: Array.isArray(advice.photoPlan) ? advice.photoPlan : [],
      quoteAdvice: Array.isArray(advice.quoteAdvice) ? advice.quoteAdvice : [],
      workItems: Array.isArray(advice.workItems) ? advice.workItems : [],
      quoteOnlyItems: Array.isArray(advice.quoteOnlyItems) ? advice.quoteOnlyItems : [],
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
    groups: Array.isArray(advice.groups) ? advice.groups : [],
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
  queueInspectionAdviceIfNeeded: (album, options) => queueIfNeeded(album, 'inspect', options),
  fingerprintFor,
  contextOf,
  sanitizeStepAdviceForView,
  parseWorkAdvice,
  parseDeliveryAdvice,
  parseInspectionAdvice,
  inspectStepsFromRaw,
}
