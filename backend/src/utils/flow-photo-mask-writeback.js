/**
 * 打码产物写回流程节点上的图对象（展示真源）。
 * 口径：docs/01_项目总览与业务架构/15_案例档案与托管状态机.md §6.1
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

/**
 * 将槽位写成带 maskedUrl 的对象；字符串升为 { url, maskedUrl }。
 * @returns {{ next: any, changed: boolean }}
 */
function applyMaskedToSlot(slot, rawKeys, maskedUrl) {
  const product = text(maskedUrl)
  if (!product) return { next: slot, changed: false }

  if (typeof slot === 'string') {
    if (!urlsMatch(slot, rawKeys)) return { next: slot, changed: false }
    return { next: { url: slot, maskedUrl: product }, changed: true }
  }
  if (!slot || typeof slot !== 'object') return { next: slot, changed: false }

  const raw = text(slot.url || slot.src || slot.rawUrl)
  if (!raw || !urlsMatch(raw, rawKeys)) return { next: slot, changed: false }
  if (text(slot.maskedUrl) === product || text(slot.preMaskedUrl) === product) {
    if (text(slot.maskedUrl) === product) return { next: slot, changed: false }
    return {
      next: { ...slot, maskedUrl: product, preMaskedUrl: text(slot.preMaskedUrl) || product },
      changed: true,
    }
  }
  return {
    next: { ...slot, maskedUrl: product, preMaskedUrl: text(slot.preMaskedUrl) || product },
    changed: true,
  }
}

function patchUrlList(list, rawKeys, maskedUrl) {
  if (!Array.isArray(list)) return { next: list, changed: false }
  let changed = false
  const next = list.map((slot) => {
    const r = applyMaskedToSlot(slot, rawKeys, maskedUrl)
    if (r.changed) changed = true
    return r.next
  })
  return { next, changed }
}

function patchFindingLike(row, rawKeys, maskedUrl) {
  if (!row || typeof row !== 'object') return { next: row, changed: false }
  let changed = false
  let next = row

  const images = patchUrlList(row.images, rawKeys, maskedUrl)
  if (images.changed) {
    next = { ...next, images: images.next }
    changed = true
  }

  if (text(row.url) && urlsMatch(row.url, rawKeys)) {
    if (text(row.maskedUrl) !== text(maskedUrl)) {
      next = {
        ...next,
        url: row.url,
        maskedUrl: text(maskedUrl),
        preMaskedUrl: text(row.preMaskedUrl) || text(maskedUrl),
      }
      changed = true
    }
  }

  if (text(row.evidenceUrl) && urlsMatch(row.evidenceUrl, rawKeys)) {
    if (text(row.evidenceMaskedUrl) !== text(maskedUrl)) {
      next = { ...next, evidenceMaskedUrl: text(maskedUrl) }
      changed = true
    }
  }

  return { next, changed }
}

function patchPayloadOrDraft(bag, rawKeys, maskedUrl) {
  if (!bag || typeof bag !== 'object') return { next: bag, changed: false }
  let changed = false
  let next = bag

  const patchArr = (key) => {
    const r = patchUrlList(next[key], rawKeys, maskedUrl)
    if (r.changed) {
      next = { ...next, [key]: r.next }
      changed = true
    }
  }

  ;['photos', 'deliveryPhotos', 'discoveryImages', 'pendingImages', 'selectedDeliveryUrls'].forEach(
    patchArr,
  )

  if (text(next.deliveryExteriorUrl) && urlsMatch(next.deliveryExteriorUrl, rawKeys)) {
    // 草稿单字段：升到并列 masked，避免丢原址
    if (text(next.deliveryExteriorMaskedUrl) !== text(maskedUrl)) {
      next = { ...next, deliveryExteriorMaskedUrl: text(maskedUrl) }
      changed = true
    }
  }

  ;['findings', 'workItems', 'items', 'lines'].forEach((key) => {
    if (!Array.isArray(next[key])) return
    let rowChanged = false
    const rows = next[key].map((row) => {
      const r = patchFindingLike(row, rawKeys, maskedUrl)
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

/**
 * 在 flowNodes 上按原图地址写回 maskedUrl。
 * @returns {{ nodes: array, changed: boolean }}
 */
function writeMaskedUrlIntoFlowNodes(flowNodes, rawUrl, maskedUrl) {
  const product = text(maskedUrl)
  const rawKeys = keySetFor(rawUrl)
  if (!product || !rawKeys.size || !Array.isArray(flowNodes)) {
    return { nodes: flowNodes, changed: false }
  }

  let changed = false
  const nodes = flowNodes.map((node) => {
    if (!node || typeof node !== 'object') return node
    let nextNode = node
    let nodeChanged = false

    if (node.photoDraft && typeof node.photoDraft === 'object') {
      const r = patchPayloadOrDraft(node.photoDraft, rawKeys, product)
      if (r.changed) {
        nextNode = { ...nextNode, photoDraft: r.next }
        nodeChanged = true
      }
    }

    if (node.document && typeof node.document === 'object') {
      const doc = node.document
      const payload =
        doc.payload && typeof doc.payload === 'object' ? doc.payload : null
      if (payload) {
        const r = patchPayloadOrDraft(payload, rawKeys, product)
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

/**
 * 批量写回多对 raw→masked。
 */
function writeMaskedPairsIntoFlowNodes(flowNodes, pairs = []) {
  let nodes = flowNodes
  let changed = false
  ;(pairs || []).forEach((pair) => {
    if (!pair) return
    const r = writeMaskedUrlIntoFlowNodes(nodes, pair.rawUrl, pair.maskedUrl)
    nodes = r.nodes
    if (r.changed) changed = true
  })
  return { nodes, changed }
}

module.exports = {
  applyMaskedToSlot,
  writeMaskedUrlIntoFlowNodes,
  writeMaskedPairsIntoFlowNodes,
}
