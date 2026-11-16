/**
 * 案例证据画像：从单据链 flowNodes 统计「哪些环节留了定稿、哪些环节留了图」。
 * 口径：docs/15 §证据分级 / docs/26 单据链。2026-11-11 新增。
 *
 * 设计要点：
 * 1. **纯函数**：只吃 flowNodes 数组，不碰 DB、不依赖 album，方便单测
 * 2. 五个证据环节：主诉(intake) / 检测(inspection) / 方案(quote) / 工单(work) / 完工(finish)
 * 3. 图证按环节去重统计，用于「图文全留证 / 部分留证 / 仅文字记录」分级
 * 4. 不判级：档位判定在 schemas/case-trust-meta.schema.js（与枚举契约同处）
 */

/** 图片可能是字符串，也可能是 { url }（与 case-geo-factpack 同口径） */
function pickImageKey(raw) {
  if (!raw) return ''
  if (typeof raw === 'string') return String(raw).trim()
  if (typeof raw === 'object') return String(raw.url || raw.rawUrl || '').trim()
  return ''
}

function normalizeImageKey(key) {
  const value = String(key || '').trim()
  if (!value) return ''
  return value.replace(/[?#].*$/, '')
}

function payloadOf(node) {
  const doc = node && node.document && typeof node.document === 'object' ? node.document : {}
  return doc.payload && typeof doc.payload === 'object' ? doc.payload : {}
}

function photoDraftOf(node) {
  return node && node.photoDraft && typeof node.photoDraft === 'object' ? node.photoDraft : {}
}

function text(value) {
  return String(value || '').trim()
}

function nodesOfKind(flowNodes, kinds) {
  const set = new Set(Array.isArray(kinds) ? kinds : [kinds])
  return (flowNodes || []).filter((node) => set.has(String((node && node.kind) || '')))
}

/** 单据 payload 里所有能挂图的位置（与 case-hosting collectReviewMaskImages 同思路） */
function collectPayloadImageKeys(payload) {
  const keys = new Set()
  const push = (raw) => {
    const key = normalizeImageKey(pickImageKey(raw))
    if (key) keys.add(key)
  }
  const pushRows = (rows) => {
    ;(Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || typeof row !== 'object') return
      push(row)
      ;(Array.isArray(row.images) ? row.images : []).forEach(push)
      if (text(row.evidenceUrl)) push(row.evidenceUrl)
      ;(Array.isArray(row.evidenceUrls) ? row.evidenceUrls : []).forEach(push)
    })
  }
  ;['photos', 'discoveryImages', 'pendingImages'].forEach((key) => pushRows(payload[key]))
  ;['findings', 'workItems', 'items', 'acceptanceItems', 'lines'].forEach((key) =>
    pushRows(payload[key])
  )
  return keys
}

function stageNodeImages(node) {
  const keys = collectPayloadImageKeys(payloadOf(node))
  collectPayloadImageKeys(photoDraftOf(node)).forEach((key) => keys.add(key))
  return keys
}

/** 单环节：节点集合 + 是否算「有定稿」 */
const STAGE_DEFS = [
  {
    id: 'intake',
    label: '主诉',
    kinds: ['intake', 'intake_inspection', 'inspection'],
    sealed(payload, draft) {
      return Boolean(text(payload.chiefComplaint) || text(draft.chiefComplaint))
    },
  },
  {
    id: 'inspection',
    label: '检测',
    kinds: ['inspection_report'],
    sealed(payload) {
      return Array.isArray(payload.findings) && payload.findings.length > 0
    },
  },
  {
    id: 'quote',
    label: '方案',
    kinds: ['quote_confirm', 'addon_quote_confirm'],
    sealed(payload) {
      return Array.isArray(payload.lines) && payload.lines.length > 0
    },
  },
  {
    id: 'work',
    label: '工单',
    kinds: ['work'],
    sealed(payload, draft) {
      const sealedItems = Array.isArray(payload.workItems) && payload.workItems.length > 0
      const draftFindings = Array.isArray(draft.findings) && draft.findings.length > 0
      return Boolean(sealedItems || draftFindings)
    },
  },
  {
    id: 'finish',
    label: '完工',
    kinds: ['repair_report'],
    sealed(payload) {
      return Boolean(
        (Array.isArray(payload.acceptanceItems) && payload.acceptanceItems.length > 0) ||
          text(payload.conclusion) ||
          text(payload.warrantyPeriod)
      )
    },
  },
]

/**
 * @param {object[]} flowNodes 单据链（album.contentPackageJson.flowNodes 或 archiveSnapshot.flowNodes）
 * @returns {object|null} 证据画像；flowNodes 为空时返回 null
 */
function assessCaseEvidenceProfile(flowNodes) {
  const nodes = Array.isArray(flowNodes) ? flowNodes.filter(Boolean) : []
  if (!nodes.length) return null

  const stages = {}
  const globalKeys = new Set()
  let exteriorPhotoWaived = false
  let exteriorMissingPhoto = false

  STAGE_DEFS.forEach((def) => {
    const stageNodes = nodesOfKind(nodes, def.kinds)
    const keys = new Set()
    let sealed = false
    stageNodes.forEach((node) => {
      const payload = payloadOf(node)
      const draft = photoDraftOf(node)
      if (def.sealed(payload, draft)) sealed = true
      stageNodeImages(node).forEach((key) => {
        keys.add(key)
        globalKeys.add(key)
      })
      if (def.id === 'finish') {
        if (payload.exteriorPhotoWaived === true) exteriorPhotoWaived = true
        ;(Array.isArray(payload.acceptanceItems) ? payload.acceptanceItems : []).forEach((row) => {
          const obj = row && typeof row === 'object' ? row : {}
          const photos = Array.isArray(obj.images) ? obj.images.length : 0
          if (obj.kind === 'exterior' && photos === 0) exteriorMissingPhoto = true
        })
      }
    })
    stages[def.id] = {
      label: def.label,
      sealed,
      photoCount: keys.size,
    }
  })

  const sealedStages = STAGE_DEFS.filter((def) => stages[def.id].sealed).length
  const photoStages = STAGE_DEFS.filter((def) => stages[def.id].photoCount > 0).length
  const annotations = []
  if (exteriorMissingPhoto) annotations.push('商家未留外观照')

  return {
    stages,
    sealedStages,
    photoStages,
    totalPhotos: globalKeys.size,
    exteriorPhotoWaived,
    exteriorMissingPhoto,
    annotations,
  }
}

module.exports = {
  assessCaseEvidenceProfile,
}
