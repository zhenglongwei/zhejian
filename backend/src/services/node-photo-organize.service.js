/**
 * 接车 / 检测 / 工单：待整理照片归组填草稿
 * 真源：docs/04_维修过程相册/26_ 上传后整理
 */
const { config } = require('../config')
const { stripUrlQuery } = require('../lib/media-signed-url')
const { resolveShared } = require('../utils/resolve-shared')
const { mediaKey } = resolveShared('utils/service-flow-docs.js')
const { WALKAROUND_PARTS } = require('../../vendor/shared/constants/service-flow-nodes')

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

function normalizeGroups(rawGroups, pending) {
  const allowed = new Set((pending || []).map((img) => mediaKey(img && img.url)).filter(Boolean))
  const list = Array.isArray(rawGroups) ? rawGroups : []
  return list
    .map((row) => {
      const partName = text(row && (row.partName || row.part))
      const imageKeys = (Array.isArray(row && row.imageKeys) ? row.imageKeys : [])
        .map((value) => {
          const key = mediaKey(value)
          if (key && allowed.has(key)) return key
          const tail = String(value || '').split(/[\\/]/).filter(Boolean).pop()
          if (tail && allowed.has(tail)) return tail
          const found = [...allowed].find((id) => id && String(value || '').endsWith(id))
          return found || ''
        })
        .filter((key) => key && allowed.has(key))
      if (!partName && !imageKeys.length) return null
      return {
        partName,
        result: text(row && row.result),
        advice: text(row && row.advice),
        caption: text(row && row.caption),
        imageKeys,
      }
    })
    .filter(Boolean)
}

async function collectMaskedPending(albumId, pending = []) {
  const { buildPreMaskUrlLookup, scheduleAlbumPreMask, getAlbumPreMaskReadiness } =
    require('./desensitize.service')
  if ((pending || []).length) {
    scheduleAlbumPreMask(albumId, { trigger: 'photo_organize' })
    const started = Date.now()
    let readiness = await getAlbumPreMaskReadiness(albumId)
    while (readiness.state === 'pending' && Date.now() - started < 60000) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      readiness = await getAlbumPreMaskReadiness(albumId)
    }
  }
  const lookup = await buildPreMaskUrlLookup(albumId)
  if (!lookup.ready) return { ready: false, urls: [] }
  const urls = []
  ;(pending || []).forEach((img, index) => {
    const raw = text(img && img.url)
    const masked =
      lookup.byRawUrl.get(raw) || lookup.byRawUrl.get(stripUrlQuery(raw)) || ''
    if (masked) {
      urls.push({
        url: masked,
        label: `待整理${index} ${mediaKey(raw)}`,
        imageKey: mediaKey(raw),
      })
    }
  })
  return { ready: true, urls }
}

function buildInstruction({ mode, existingParts, walkaroundLabels }) {
  const common = [
    '你是汽修店员。只根据这些照片归组，不要百科，不要编造没拍到的读数。',
    '输出 JSON：{"groups":[{"partName","imageKeys","result","advice","caption"}],"walkaroundIds":[],"odometerImageKey":""}',
    'imageKeys 必须用每张图说明里的文件名（uploads 之后那一段）。同一部位的多张图放进同一组。',
    '对得上已有名称的，partName 必须与已有名称完全一致。',
    `已有项：${JSON.stringify(existingParts)}`,
  ]
  if (mode === 'intake') {
    return common.concat([
      '这是接车留证，只认环车部位、仪表、油液。不要写检查结果，不要写需处理。',
      `环车清单 id：${JSON.stringify(walkaroundLabels)}`,
      'walkaroundIds 填认得出的清单 id。仪表图的 imageKey 填到 odometerImageKey。',
    ]).join('\n')
  }
  if (mode === 'work') {
    return common.concat([
      '这是施工过程。按「做了哪一项」归组。partName 写项目名，caption 写做了什么、用了什么件。不要写检查结果。',
    ]).join('\n')
  }
  return common.concat([
    '这是检测。按检查点/部位归组。result 只能是：状态良好、需关注、需处理、仅记录。advice 写看见什么，不要写成更换方案。',
  ]).join('\n')
}

async function runOrganizeVision({ instruction, maskedUrls }) {
  const vision = config.geoVision || {}
  const llm = config.geoLlm || {}
  if (!vision.apiKey && !llm.apiKey) return null
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

  const pending = Array.isArray(payload.pendingImages) ? payload.pendingImages : []
  if (!pending.length) {
    return { groups: [], walkaroundIds: [], odometerImageKey: '' }
  }

  const existingParts = (Array.isArray(payload.findings) ? payload.findings : [])
    .map((row) => text(row && row.partName))
    .filter(Boolean)
  const walkaroundLabels = WALKAROUND_PARTS.map((row) => ({ id: row.id, label: row.label }))

  const masked = await collectMaskedPending(albumId, pending)
  if (!masked.ready || !masked.urls.length) {
    return { groups: [], walkaroundIds: [], odometerImageKey: '', skipped: true }
  }

  const instruction = buildInstruction({ mode, existingParts, walkaroundLabels })
  let parsed = {}
  try {
    parsed = (await runOrganizeVision({ instruction, maskedUrls: masked.urls })) || {}
  } catch (_) {
    parsed = {}
  }

  const groups = normalizeGroups(parsed.groups, pending)
  const allowedWalk = new Set(WALKAROUND_PARTS.map((row) => row.id))
  const walkaroundIds = (Array.isArray(parsed.walkaroundIds) ? parsed.walkaroundIds : [])
    .map((id) => text(id))
    .filter((id) => allowedWalk.has(id))
  const odometerImageKey = mediaKey(parsed.odometerImageKey)

  return { groups, walkaroundIds, odometerImageKey }
}

module.exports = {
  organizeFlowNodePhotos,
  normalizeGroups,
}
