/**
 * 打码产物写回流程节点上的图对象（展示真源）。
 * 口径：docs/01_项目总览与业务架构/15_案例档案与托管状态机.md §6.1
 *
 * - 有敏感 → 写 maskedUrl
 * - 无敏感 → 写 maskOutcome=ok_no_privacy，不写/清空冒充产物的 maskedUrl
 * - 必须写 node.content（真源）；兼容旧 photoDraft / document.payload
 */

const { rawUrlLookupKeys } = require('../services/desensitize.constants')

function text(value) {
  return String(value || '').trim()
}

function keySetFor(url) {
  return new Set(rawUrlLookupKeys(url))
}

function urlsMatch(a, bKeys) {
  return rawUrlLookupKeys(a).some((k) => bKeys.has(k))
}

function normalizeRegions(list) {
  return (Array.isArray(list) ? list : [])
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const kind = text(row.kind || row.type)
      const left = Number(row.left)
      const top = Number(row.top)
      const width = Number(row.width)
      const height = Number(row.height)
      if (!kind) return null
      return {
        kind,
        left: Number.isFinite(left) ? left : 0,
        top: Number.isFinite(top) ? top : 0,
        width: Number.isFinite(width) ? width : 0,
        height: Number.isFinite(height) ? height : 0,
      }
    })
    .filter(Boolean)
}

/**
 * @param {{ maskedUrl?: string, maskOutcome?: string, maskRegions?: array }} meta
 */
function applyMaskResultToSlot(slot, rawKeys, meta = {}) {
  const product = text(meta.maskedUrl)
  const outcome = text(meta.maskOutcome)
  const source = text(meta.maskSource)
  const regions = meta.maskRegions !== undefined ? normalizeRegions(meta.maskRegions) : null
  if (!product && !outcome && regions == null) return { next: slot, changed: false }

  if (typeof slot === 'string') {
    if (!urlsMatch(slot, rawKeys)) return { next: slot, changed: false }
    const next = { url: slot }
    if (product) next.maskedUrl = product
    if (outcome) next.maskOutcome = outcome
    if (source) next.maskSource = source
    if (regions) next.maskRegions = regions
    return { next, changed: true }
  }
  if (!slot || typeof slot !== 'object') return { next: slot, changed: false }

  const raw = text(slot.url || slot.src || slot.rawUrl)
  if (!raw || !urlsMatch(raw, rawKeys)) return { next: slot, changed: false }

  let next = { ...slot }
  let changed = false
  if (product) {
    if (text(next.maskedUrl) !== product) {
      next.maskedUrl = product
      next.preMaskedUrl = text(next.preMaskedUrl) || product
      changed = true
    }
  } else if (outcome === 'ok_no_privacy') {
    // 无敏感：禁止留着复制原图当 maskedUrl
    if (text(next.maskedUrl) || text(next.preMaskedUrl)) {
      next = { ...next, maskedUrl: '', preMaskedUrl: '' }
      changed = true
    }
  } else if (
    outcome === 'pending' ||
    outcome === 'not_analyzed' ||
    outcome === 'mask_failed' ||
    outcome === 'ok_detect_mask_failed' ||
    outcome === 'call_failed' ||
    outcome === 'llm_failed'
  ) {
    // 失败/未分析：清掉冒充产物；贴码失败保留 regions 供重贴
    const keepRegions =
      outcome === 'mask_failed' || outcome === 'ok_detect_mask_failed'
    if (
      text(next.maskedUrl) ||
      text(next.preMaskedUrl) ||
      text(next.maskOutcome) === 'ok_no_privacy' ||
      text(next.maskOutcome) !== outcome
    ) {
      next = {
        ...next,
        maskedUrl: '',
        preMaskedUrl: '',
        maskOutcome: outcome,
      }
      // llm_failed 不带区域时保留节点原区域，避免以后只能重跑模型
      if (!keepRegions && Array.isArray(regions)) next.maskRegions = regions
      changed = true
    }
  }
  if (outcome && text(next.maskOutcome) !== outcome) {
    next.maskOutcome = outcome
    changed = true
  }
  // 打码来源：有产物才记 auto/manual；无产物或失败态不保留
  if (source && product) {
    if (text(next.maskSource) !== source) {
      next.maskSource = source
      changed = true
    }
  } else if (text(next.maskSource)) {
    next = { ...next, maskSource: '' }
    changed = true
  }
  if (regions) {
    const prev = JSON.stringify(Array.isArray(next.maskRegions) ? next.maskRegions : [])
    const now = JSON.stringify(regions)
    if (prev !== now) {
      next.maskRegions = regions
      changed = true
    }
  }
  return { next, changed }
}

/** @deprecated 兼容旧调用：只写 maskedUrl */
function applyMaskedToSlot(slot, rawKeys, maskedUrl) {
  return applyMaskResultToSlot(slot, rawKeys, { maskedUrl })
}

function patchUrlList(list, rawKeys, meta) {
  if (!Array.isArray(list)) return { next: list, changed: false }
  let changed = false
  const next = list.map((slot) => {
    const r = applyMaskResultToSlot(slot, rawKeys, meta)
    if (r.changed) changed = true
    return r.next
  })
  return { next, changed }
}

function patchFindingLike(row, rawKeys, meta) {
  if (!row || typeof row !== 'object') return { next: row, changed: false }
  let changed = false
  let next = row

  const images = patchUrlList(row.images, rawKeys, meta)
  if (images.changed) {
    next = { ...next, images: images.next }
    changed = true
  }

  if (text(row.url) && urlsMatch(row.url, rawKeys)) {
    const r = applyMaskResultToSlot(row, rawKeys, meta)
    if (r.changed) {
      next = r.next
      changed = true
    }
  }

  if (text(row.evidenceUrl) && urlsMatch(row.evidenceUrl, rawKeys)) {
    const product = text(meta.maskedUrl)
    if (product && text(row.evidenceMaskedUrl) !== product) {
      next = { ...next, evidenceMaskedUrl: product }
      changed = true
    }
  }

  return { next, changed }
}

function patchPayloadOrDraft(bag, rawKeys, meta) {
  if (!bag || typeof bag !== 'object') return { next: bag, changed: false }
  let changed = false
  let next = bag

  const patchArr = (key) => {
    const r = patchUrlList(next[key], rawKeys, meta)
    if (r.changed) {
      next = { ...next, [key]: r.next }
      changed = true
    }
  }

  ;['photos', 'deliveryPhotos', 'discoveryImages', 'pendingImages'].forEach(patchArr)

  if (text(next.deliveryExteriorUrl) && urlsMatch(next.deliveryExteriorUrl, rawKeys)) {
    const product = text(meta.maskedUrl)
    if (product && text(next.deliveryExteriorMaskedUrl) !== product) {
      next = { ...next, deliveryExteriorMaskedUrl: product }
      changed = true
    } else if (text(meta.maskOutcome) === 'ok_no_privacy' && text(next.deliveryExteriorMaskedUrl)) {
      next = { ...next, deliveryExteriorMaskedUrl: '' }
      changed = true
    }
  }

  ;['findings', 'workItems', 'items', 'lines'].forEach((key) => {
    if (!Array.isArray(next[key])) return
    let rowChanged = false
    const rows = next[key].map((row) => {
      const r = patchFindingLike(row, rawKeys, meta)
      if (r.changed) rowChanged = true
      return r.next
    })
    if (rowChanged) {
      next = { ...next, [key]: rows }
      changed = true
    }
  })

  return { next, changed }
}

function writeMaskResultIntoFlowNodes(flowNodes, rawUrl, meta = {}) {
  const rawKeys = keySetFor(rawUrl)
  const outcome = text(meta.maskOutcome)
  const product = text(meta.maskedUrl)
  if (!rawKeys.size || !Array.isArray(flowNodes)) {
    return { nodes: flowNodes, changed: false }
  }
  if (!product && !outcome && meta.maskRegions === undefined && !text(meta.maskSource)) {
    return { nodes: flowNodes, changed: false }
  }

  let changed = false
  const nodes = flowNodes.map((node) => {
    if (!node || typeof node !== 'object') return node
    let nextNode = node
    let nodeChanged = false

    // 真源：content
    if (node.content && typeof node.content === 'object') {
      const r = patchPayloadOrDraft(node.content, rawKeys, meta)
      if (r.changed) {
        nextNode = { ...nextNode, content: r.next }
        nodeChanged = true
      }
    }

    if (node.photoDraft && typeof node.photoDraft === 'object') {
      const r = patchPayloadOrDraft(node.photoDraft, rawKeys, meta)
      if (r.changed) {
        nextNode = { ...nextNode, photoDraft: r.next }
        nodeChanged = true
      }
    }

    if (node.document && typeof node.document === 'object') {
      const doc = node.document
      const payload = doc.payload && typeof doc.payload === 'object' ? doc.payload : null
      if (payload) {
        const r = patchPayloadOrDraft(payload, rawKeys, meta)
        if (r.changed) {
          nextNode = {
            ...nextNode,
            document: { ...doc, payload: r.next },
          }
          nodeChanged = true
        }
      }
    }

    if (nodeChanged) changed = true
    return nextNode
  })

  return { nodes, changed }
}

/** @deprecated 兼容：只写 maskedUrl */
function writeMaskedUrlIntoFlowNodes(flowNodes, rawUrl, maskedUrl) {
  return writeMaskResultIntoFlowNodes(flowNodes, rawUrl, { maskedUrl })
}

function writeMaskedPairsIntoFlowNodes(flowNodes, pairs = []) {
  let nodes = flowNodes
  let changed = false
  ;(pairs || []).forEach((pair) => {
    if (!pair) return
    const r = writeMaskResultIntoFlowNodes(nodes, pair.rawUrl, {
      maskedUrl: pair.maskedUrl,
      maskOutcome: pair.maskOutcome,
      maskSource: pair.maskSource,
      maskRegions: pair.maskRegions,
    })
    nodes = r.nodes
    if (r.changed) changed = true
  })
  return { nodes, changed }
}

function pushImageRef(list, raw) {
  if (typeof raw === 'string') {
    const url = text(raw)
    if (url) list.push({ url, maskedUrl: '', maskOutcome: '' })
    return
  }
  if (!raw || typeof raw !== 'object') return
  const url = text(raw.url || raw.rawUrl || raw.src)
  if (url) {
    list.push({
      url,
      maskedUrl: text(raw.maskedUrl || raw.preMaskedUrl),
      maskOutcome: text(raw.maskOutcome),
    })
  }
  const evidenceUrl = text(raw.evidenceUrl)
  if (evidenceUrl) {
    list.push({
      url: evidenceUrl,
      maskedUrl: text(raw.evidenceMaskedUrl),
      maskOutcome: '',
    })
  }
}

function collectBagImageRefs(bag, list) {
  if (!bag || typeof bag !== 'object') return
  ;['photos', 'deliveryPhotos', 'discoveryImages', 'pendingImages', 'images'].forEach((key) => {
    ;(Array.isArray(bag[key]) ? bag[key] : []).forEach((slot) => pushImageRef(list, slot))
  })
  if (text(bag.deliveryExteriorUrl)) {
    list.push({
      url: text(bag.deliveryExteriorUrl),
      maskedUrl: text(bag.deliveryExteriorMaskedUrl),
      maskOutcome: '',
    })
  }
  ;['findings', 'workItems', 'items', 'lines'].forEach((key) => {
    ;(Array.isArray(bag[key]) ? bag[key] : []).forEach((row) => {
      if (!row) return
      pushImageRef(list, row)
      ;(Array.isArray(row.images) ? row.images : []).forEach((img) => pushImageRef(list, img))
    })
  })
}

function collectFlowImageRefs(flowNodes) {
  const list = []
  ;(Array.isArray(flowNodes) ? flowNodes : []).forEach((node) => {
    if (!node || typeof node !== 'object') return
    collectBagImageRefs(node.content, list)
    collectBagImageRefs(node.photoDraft, list)
    const payload = node.document && node.document.payload
    collectBagImageRefs(payload, list)
  })
  return list
}

module.exports = {
  applyMaskedToSlot,
  applyMaskResultToSlot,
  writeMaskedUrlIntoFlowNodes,
  writeMaskResultIntoFlowNodes,
  writeMaskedPairsIntoFlowNodes,
  collectFlowImageRefs,
  collectBagImageRefs,
}
