/**
 * 接车 / 检测 / 工单：待整理照片归组填草稿
 * 真源：docs/04_维修过程相册/26_ 上传后整理 · 按图只识一次
 */
const { randomUUID, createHash } = require('crypto')
const { config } = require('../config')
const { prisma } = require('../lib/prisma')
const { stripUrlQuery } = require('../lib/media-signed-url')
const { resolveShared } = require('../utils/resolve-shared')
const {
  mediaKey,
  collectConfirmedQuoteNames,
  stampWorkQuoteMatch,
  buildPriorOrganizeFacts,
  stripFigureIndexTalk,
} = resolveShared('utils/service-flow-docs.js')
const {
  INTAKE_RECORD_CATEGORIES,
} = require('../../vendor/shared/constants/service-flow-nodes')

const { MECHANIC_VOICE_RULES } = require('../utils/mechanic-copy-voice')

const FLOW_ORGANIZE_PROMPT_VERSION = 'flow-organize-v10'

function text(value) {
  return String(value || '').trim()
}

function parseJsonObject(raw) {
  if (raw && typeof raw === 'object') return raw
  const trimmed = String(raw || '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return {}
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch (_) {
    return {}
  }
}

function fingerprintMasked(maskedUrl = '') {
  return createHash('sha256').update(stripUrlQuery(String(maskedUrl || '').trim())).digest('hex').slice(0, 40)
}

function collectGroupRefs(row = {}) {
  if (Array.isArray(row.imageSlots) && row.imageSlots.length) return row.imageSlots
  if (Array.isArray(row.slots) && row.slots.length) return row.slots
  if (Array.isArray(row.images) && row.images.length) return row.images
  return Array.isArray(row.imageKeys) ? row.imageKeys : []
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

function resolveImageKeys(rawKeys, pending = []) {
  const list = Array.isArray(rawKeys) ? rawKeys : []
  const allowed = []
  const byKey = {}
  ;(pending || []).forEach((img) => {
    const key = mediaKey(img && img.url)
    if (!key) return
    allowed.push(key)
    if (!byKey[key]) byKey[key] = key
  })
  const out = []
  const seen = new Set()
  list.forEach((value) => {
    const slot = parseOrganizeSlot(value, pending.length)
    let key = ''
    if (slot >= 0) key = mediaKey(pending[slot] && pending[slot].url)
    else {
      key = mediaKey(value)
      if (!byKey[key]) {
        const tail = String(value || '').split(/[\\/]/).filter(Boolean).pop()
        key = (tail && byKey[mediaKey(tail)]) || ''
        if (!key) {
          key = allowed.find((id) => id && String(value || '').endsWith(id)) || ''
        }
      }
    }
    if (key && byKey[key] && !seen.has(key)) {
      seen.add(key)
      out.push(key)
    }
  })
  return out
}

function normalizeGroups(rawGroups, pending) {
  const list = Array.isArray(rawGroups) ? rawGroups : []
  return list
    .map((row) => {
      const partName = text(row && (row.partName || row.part || row.label))
      const imageKeys = resolveImageKeys(collectGroupRefs(row), pending)
      const category = text(row && row.category)
      if (!partName && !category && !imageKeys.length) return null
      return {
        partName: partName || category,
        category,
        reading: text(row && row.reading),
        result: text(row && row.result),
        advice: stripFigureIndexTalk(text(row && row.advice)),
        caption: stripFigureIndexTalk(text(row && row.caption)),
        observation: stripFigureIndexTalk(text(row && row.observation)),
        outsideQuote: Boolean(row && row.outsideQuote),
        imageKeys,
      }
    })
    .filter(Boolean)
}

async function collectMaskedPending(albumId, pending = []) {
  const { collectMaskedUrlsForRawList } = require('./desensitize.service')
  const packed = await collectMaskedUrlsForRawList(
    albumId,
    (pending || []).map((img, index) => ({
      url: text(img && img.url),
      label: `图${index + 1}`,
      imageKey: mediaKey(img && img.url),
    })),
  )
  return packed
}

function buildInstruction({ mode, existingParts, cachedNotes, quoteNames, priorFacts }) {
  const categories = INTAKE_RECORD_CATEGORIES.map((row) => ({ id: row.id, label: row.label }))
  const common = [
    '你是汽修店员。只根据这些照片归组，不要百科，不要编造没拍到的读数。',
    MECHANIC_VOICE_RULES,
    '落项用内部编号：返回 imageSlots 填 [1,2] 或 ["图1","图2"]。同一部位的多张图放进同一组。不要填文件名。本批只附已打码的图，编号可能不连续；没附图的编号不要写进组。',
    'observation、advice、caption 只写部位和看见的状态（如旧件胶套撕裂、下摆臂有磨损）。禁止写图1、图2、第几张，用户对不上号。',
    `已有项：${JSON.stringify(existingParts)}`,
    cachedNotes ? `这些图已经识过，不要再猜，直接沿用：${cachedNotes}` : '',
    priorFacts ? `前面各步已经识过/写过的结果（只是文字，不要再看那些图）：${JSON.stringify(priorFacts)}` : '',
  ].filter(Boolean)
  if (mode === 'intake') {
    return common.concat([
      '这是接车留证。按类目归组，抽出读数。不要写需处理，不要给每块板贴正常或有破损。',
      `类目 id：${JSON.stringify(categories)}`,
      '输出 JSON：{"groups":[{"category","imageSlots","reading","observation"}]}',
      'category 必须是类目 id。里程读数填纯数字到 reading；油量把表上能读到的写进 reading。observation 写车上的读数、污渍、损伤位置。给之后检测和报价用，不要当检查结果，不要描写拍照动作，不要编没看到的规格。',
      '仪表和油量可以在同一张图：这张图同时进 odometer 和 fuel 两组。',
    ]).join('\n')
  }
  if (mode === 'work') {
    return common.concat([
      '这是工单留证。按已确认方案归组：一条方案行对应最多一组。',
      '用前面的检测和方案文字对照本批新图。不要把接车/检测图再认一遍。',
      `已确认方案项目（必须原样抄写）：${JSON.stringify(quoteNames || [])}`,
      '图上做的事属于名单里某一项时：partName 必须从名单原样抄过来，一个字都不能改；outsideQuote 填 false。同一方案行的多张图放进同一组。',
      '名单里没有任何一项对得上时：outsideQuote 填 true，partName 写图上实际做的事。不要丢掉这组图。',
      'caption 只写用料短名（换了什么件，如图上的下摆臂、胶套）。禁止写检查、查看、处理、拆卸、安装。没有换件就留空。',
      '人像、半身、店员操作照、与施工无关的图不要进任何组，留给未归组。',
      '拍了关键工序就挂在对应件；没拍到的工序不要编。',
      'observation 只写包装或铭牌上的规格、旧件能看清的状态。没有就不写。禁止「拆卸并处理」这类句子。禁止适配型号。',
      '输出 JSON：{"groups":[{"partName","imageSlots","caption","observation","outsideQuote"}]}',
    ]).join('\n')
  }
  return common.concat([
    '这是检测。按检查点/部位归组。result 只能是：状态良好、需关注、需处理、仅记录。',
    'advice 写部位上的事实：损伤形态、读数（厚度/电压/液位）、颜色杂质、左右位置。不要写成更换方案，不要描写谁在拍照、图上有什么字。',
    'observation 写给之后报价用的完整观察（可见配件、损伤范围、读数）。包装或铭牌上看不见的规格不要编。',
    '输出 JSON：{"groups":[{"partName","imageSlots","result","advice","observation"}]}',
    '已识过的图若有观察记录，优先用来填 advice，不要再编、不要再看这些图。',
  ]).join('\n')
}

async function runOrganizeVision({ instruction, maskedUrls }) {
  const vision = config.geoVision || {}
  const llm = config.geoLlm || {}
  if (!vision.apiKey && !llm.apiKey) return null
  if (!maskedUrls || !maskedUrls.length) return {}
  const { chatCompletion } = require('../lib/dashscope-chat')
  const labeled = (maskedUrls || []).slice(0, 9)
  const userContent = [{ type: 'text', text: instruction }].concat(
    labeled.flatMap((row) => {
      const blocks = []
      if (row.label) blocks.push({ type: 'text', text: `下一张图：${row.label}` })
      blocks.push({ type: 'image_url', image_url: { url: row.url } })
      return blocks
    }),
  )
  const result = await chatCompletion({
    apiUrl: vision.apiUrl || llm.apiUrl,
    apiKey: vision.apiKey || llm.apiKey,
    model: vision.model || llm.model,
    messages: [
      { role: 'system', content: '只输出 JSON。' },
      { role: 'user', content: userContent },
    ],
    temperature: 0.1,
    responseFormat: { type: 'json_object' },
    enableThinking: false,
    timeoutMs: Math.min(Number(llm.timeoutMs || 60000), 60000),
  })
  return parseJsonObject(result && result.text)
}

function groupsFromFindingCache(cachedRows, pending) {
  const byPart = {}
  ;(cachedRows || []).forEach((row) => {
    const json = (row && row.resultJson) || {}
    const imageKey = text(json.imageKey || row.imageKey)
    const partName = text(json.partName || json.category)
    if (!partName && !imageKey) return
    const key = partName || '未归组'
    if (!byPart[key]) {
      byPart[key] = {
        partName: key,
        result: text(json.result),
        advice: text(json.advice || json.observation),
        caption: text(json.caption),
        observation: text(json.observation || json.advice || json.caption),
        outsideQuote: Boolean(json.outsideQuote),
        imageKeys: [],
      }
    }
    if (imageKey) byPart[key].imageKeys.push(imageKey)
    if (!byPart[key].result && json.result) byPart[key].result = text(json.result)
    if (!byPart[key].advice && (json.advice || json.observation)) {
      byPart[key].advice = text(json.advice || json.observation)
    }
    if (!byPart[key].caption && json.caption) byPart[key].caption = text(json.caption)
    if (!byPart[key].observation && json.observation) {
      byPart[key].observation = text(json.observation)
    }
    if (json.outsideQuote) byPart[key].outsideQuote = true
  })
  return normalizeGroups(Object.values(byPart), pending)
}

function mergeGroupsByPart(rawGroups, pending) {
  const byPart = {}
  normalizeGroups(rawGroups, pending).forEach((group) => {
    const key = text(group.partName || group.category) || '_'
    if (!byPart[key]) {
      byPart[key] = { ...group, imageKeys: [...(group.imageKeys || [])] }
      return
    }
    ;(group.imageKeys || []).forEach((imageKey) => {
      if (imageKey && !byPart[key].imageKeys.includes(imageKey)) {
        byPart[key].imageKeys.push(imageKey)
      }
    })
    ;['result', 'advice', 'caption', 'observation', 'reading'].forEach((field) => {
      if (!byPart[key][field] && group[field]) byPart[key][field] = group[field]
    })
  })
  return Object.values(byPart)
}

function classifyReviewVisionRows(labeledUrls, imageByMediaKey, cacheByAlbumImageId) {
  const visionUrls = []
  const cachedFacts = []
  ;(labeledUrls || []).forEach((row) => {
    const url = typeof row === 'string' ? row : row && row.url
    const label = typeof row === 'string' ? '' : text(row && row.label)
    const rawUrl = typeof row === 'string' ? '' : text(row && row.rawUrl)
    const key = mediaKey(rawUrl)
    const imageRow = key ? imageByMediaKey && imageByMediaKey[key] : null
    const hit = imageRow && cacheByAlbumImageId ? cacheByAlbumImageId[imageRow.id] : null
    if (hit && hit.resultJson) {
      const json = hit.resultJson || {}
      cachedFacts.push({
        label,
        partName: text(json.partName || json.category),
        reading: text(json.reading),
        result: text(json.result),
        observation: text(json.observation || json.advice || json.caption),
      })
      return
    }
    visionUrls.push(typeof row === 'string' ? { url, label, rawUrl } : row)
  })
  return { visionUrls, cachedFacts }
}

function groupsFromCache(cachedRows, pending) {
  const byCat = {}
  cachedRows.forEach((row) => {
    const json = (row && row.resultJson) || {}
    const category = text(json.category)
    const imageKey = text(json.imageKey || row.imageKey)
    if (!category && !imageKey) return
    const key = category || 'paint'
    const meta = INTAKE_RECORD_CATEGORIES.find((row) => row.id === key)
    if (!byCat[key]) {
      byCat[key] = {
        category: key,
        partName: (meta && meta.label) || key,
        reading: text(json.reading),
        observation: text(json.observation),
        imageKeys: [],
      }
    }
    if (imageKey) byCat[key].imageKeys.push(imageKey)
    if (!byCat[key].reading && json.reading) byCat[key].reading = text(json.reading)
  })
  return normalizeGroups(Object.values(byCat), pending)
}

async function loadFlowVisionCaches(album, pending, maskedUrls) {
  const images = Array.isArray(album.images) ? album.images : []
  const byMedia = {}
  images.forEach((img) => {
    const key = mediaKey(img && img.rawUrl)
    if (key) byMedia[key] = img
  })
  const maskedByKey = {}
  ;(maskedUrls || []).forEach((row) => {
    if (row && row.imageKey) maskedByKey[row.imageKey] = row
  })
  const cached = []
  const uncachedMasked = []
  for (let i = 0; i < (pending || []).length; i += 1) {
    const key = mediaKey(pending[i] && pending[i].url)
    const imageRow = byMedia[key]
    const masked = maskedByKey[key]
    if (!imageRow || !masked) {
      if (masked) uncachedMasked.push(masked)
      continue
    }
    const fp = fingerprintMasked(masked.url)
    const hit = await prisma.albumImageVisionCache.findUnique({
      where: {
        albumImageId_promptVersion: {
          albumImageId: imageRow.id,
          promptVersion: FLOW_ORGANIZE_PROMPT_VERSION,
        },
      },
    })
    if (hit && hit.contentFingerprint === fp) {
      await prisma.albumImageVisionCache.update({
        where: { id: hit.id },
        data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
      })
      cached.push({ ...hit, imageKey: key, resultJson: hit.resultJson || {} })
    } else {
      uncachedMasked.push({ ...masked, albumImageId: imageRow.id, albumId: imageRow.albumId })
    }
  }
  return { cached, uncachedMasked }
}

async function saveFlowVisionCaches(parsedGroups, uncachedMasked, album) {
  const vision = config.geoVision || {}
  const llm = config.geoLlm || {}
  const model = text(vision.model || llm.model)
  const images = Array.isArray(album.images) ? album.images : []
  const byMedia = {}
  images.forEach((img) => {
    const key = mediaKey(img && img.rawUrl)
    if (key) byMedia[key] = img
  })
  const byKey = {}
  ;(parsedGroups || []).forEach((group) => {
    ;(group.imageKeys || []).forEach((key) => {
      if (!byKey[key]) {
        byKey[key] = {
          category: text(group.category || group.partName),
          partName: text(group.partName || group.category),
          reading: text(group.reading),
          result: text(group.result),
          advice: text(group.advice),
          caption: text(group.caption),
          observation: text(group.observation || group.advice || group.caption),
          outsideQuote: Boolean(group.outsideQuote),
          imageKey: key,
        }
      }
    })
  })
  for (let i = 0; i < (uncachedMasked || []).length; i += 1) {
    const row = uncachedMasked[i]
    const imageRow = byMedia[row.imageKey] || (row.albumImageId
      ? { id: row.albumImageId, albumId: row.albumId || album.id }
      : null)
    if (!imageRow || !imageRow.id) continue
    const payload = byKey[row.imageKey] || { imageKey: row.imageKey, observation: '' }
    const fp = fingerprintMasked(row.url)
    await prisma.albumImageVisionCache.upsert({
      where: {
        albumImageId_promptVersion: {
          albumImageId: imageRow.id,
          promptVersion: FLOW_ORGANIZE_PROMPT_VERSION,
        },
      },
      create: {
        id: randomUUID(),
        albumImageId: imageRow.id,
        albumId: imageRow.albumId || album.id,
        contentFingerprint: fp,
        promptVersion: FLOW_ORGANIZE_PROMPT_VERSION,
        model,
        resultJson: payload,
        hitCount: 0,
        lastHitAt: new Date(),
      },
      update: {
        contentFingerprint: fp,
        model,
        resultJson: payload,
        lastHitAt: new Date(),
      },
    })
  }
}

async function organizeFlowNodePhotos(albumId, storeId, nodeId, payload = {}, merchantId = '') {
  const { loadAlbum, assertMerchantAlbum, assertAlbumContentEditable } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  assertAlbumContentEditable(album)

  const kind = text(payload.kind)
  const mode =
    kind === 'intake' || kind === 'work' || kind === 'inspection' ? kind : 'inspection'
  if (kind === 'delivery_photos') {
    const err = new Error('交车照不用按部位整理')
    err.status = 400
    throw err
  }
  if (kind === 'work') {
    const err = new Error('施工按方案行传图，不用识图归组')
    err.status = 400
    throw err
  }

  const pending = Array.isArray(payload.pendingImages) ? payload.pendingImages : []
  if (!pending.length) {
    return { groups: [], walkaroundIds: [], odometerImageKey: '', cacheHits: 0 }
  }

  const existingParts = (Array.isArray(payload.findings) ? payload.findings : [])
    .map((row) => text(row && row.partName))
    .filter(Boolean)

  let quoteNames = []
  let priorFacts = null
  try {
    const { readFlowNodesRaw } = require('./service-flow.service')
    const flowNodes = readFlowNodesRaw(album)
    if (mode === 'work') quoteNames = collectConfirmedQuoteNames(flowNodes)
    if (mode === 'inspection' || mode === 'work') {
      priorFacts = buildPriorOrganizeFacts(flowNodes, mode)
    }
  } catch (_) {
    quoteNames = []
    priorFacts = null
  }

  const masked = await collectMaskedPending(albumId, pending)
  if (!masked.ready) {
    return { groups: [], walkaroundIds: [], odometerImageKey: '', skipped: true, cacheHits: 0 }
  }
  if (!masked.urls.length) {
    return { groups: [], walkaroundIds: [], odometerImageKey: '', skipped: false, cacheHits: 0 }
  }

  let cached = []
  let uncachedMasked = masked.urls
  try {
    const loaded = await loadFlowVisionCaches(album, pending, masked.urls)
    cached = loaded.cached
    uncachedMasked = loaded.uncachedMasked
  } catch (_) {
    cached = []
    uncachedMasked = masked.urls
  }
  const cachedGroups =
    mode === 'intake' ? groupsFromCache(cached, pending) : groupsFromFindingCache(cached, pending)
  const cachedNotes = cached
    .map((row) => {
      const json = row.resultJson || {}
      const at = pending.findIndex((img) => mediaKey(img && img.url) === row.imageKey)
      const slot = at >= 0 ? `图${at + 1}` : '图'
      return `${slot}:${json.category || json.partName || ''} ${json.reading || ''} ${json.observation || json.advice || ''}`
    })
    .join('；')
    .slice(0, 2000)

  const visionUrls = uncachedMasked
  let parsed = { groups: cachedGroups }
  if (visionUrls.length) {
    const instruction = buildInstruction({
      mode,
      existingParts,
      cachedNotes,
      quoteNames,
      priorFacts,
    })
    try {
      const fresh = (await runOrganizeVision({ instruction, maskedUrls: visionUrls })) || {}
      let freshGroups = normalizeGroups(fresh.groups, pending)
      if (mode === 'work') freshGroups = stampWorkQuoteMatch(freshGroups, quoteNames)
      parsed = {
        groups: cachedGroups.concat(freshGroups),
      }
      try {
        await saveFlowVisionCaches(parsed.groups, uncachedMasked, album)
      } catch (_) {
        /* 缓存失败不影响整理结果 */
      }
    } catch (_) {
      parsed = { groups: cachedGroups }
    }
  }

  let groups =
    mode === 'intake'
      ? normalizeGroups(parsed.groups, pending)
      : mergeGroupsByPart(parsed.groups, pending)
  if (mode === 'work') groups = stampWorkQuoteMatch(groups, quoteNames)
  const odoGroup = groups.find((row) => row.category === 'odometer' || row.partName === '里程')
  const odometerImageKey = odoGroup && odoGroup.imageKeys && odoGroup.imageKeys[0]
    ? odoGroup.imageKeys[0]
    : ''

  return {
    groups,
    walkaroundIds: [],
    odometerImageKey,
    cacheHits: cached.length,
  }
}

module.exports = {
  organizeFlowNodePhotos,
  normalizeGroups,
  groupsFromFindingCache,
  mergeGroupsByPart,
  classifyReviewVisionRows,
  FLOW_ORGANIZE_PROMPT_VERSION,
}
