/**
 * DOC-FLOW · 服务相册事件节点链
 */
const { prisma } = require('../lib/prisma')
const {
  FLOW_VERSION,
  buildStandardFlowNodes,
  getFlowKindMeta,
  isPhotoFlowNode,
  isDocumentFlowNode,
  resolveLegacyStageIdForFlowNode,
  requiresOwnerConfirm,
} = require('../../vendor/shared/constants/service-flow-nodes')

function readRawContentPackage(album) {
  if (!album || !album.contentPackageJson || typeof album.contentPackageJson !== 'object') {
    return {}
  }
  return { ...album.contentPackageJson }
}

function readFlowVersion(album) {
  const pkg = readRawContentPackage(album)
  const v = Number(pkg.flowVersion)
  return Number.isFinite(v) ? v : 0
}

function readFlowNodesRaw(album) {
  const pkg = readRawContentPackage(album)
  return Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
}

function sortFlowNodes(nodes = []) {
  return nodes.slice().sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
}

function resolveDocumentStatusLabel(doc = {}) {
  if (!doc) return '待填写'
  const status = String(doc.status || 'draft')
  if (status === 'confirmed') {
    if (doc.confirmedBy === 'owner') return '车主已确认'
    if (doc.confirmedBy === 'merchant_proxy') return '商家代确认'
    return '已确认'
  }
  if (status === 'pending_confirm') return '待车主确认'
  return '草稿'
}

function countPhotosForFlowNode(node, albumNodes = []) {
  const stageId = resolveLegacyStageIdForFlowNode(node)
  if (!stageId) return 0
  const stage = (albumNodes || []).find((n) => n.id === stageId)
  return stage && Array.isArray(stage.images) ? stage.images.length : 0
}

function mapFlowNodeForView(node, albumNodes = []) {
  const meta = getFlowKindMeta(node.kind) || {}
  const photo = isPhotoFlowNode(node)
  const document = isDocumentFlowNode(node)
  const stageId = resolveLegacyStageIdForFlowNode(node)
  const stage = stageId ? (albumNodes || []).find((n) => n.id === stageId) : null
  return {
    id: node.id,
    kind: node.kind,
    nodeCategory: node.nodeCategory,
    sortOrder: node.sortOrder,
    title: node.title || meta.title || '',
    status: node.status || 'pending',
    legacyStageId: stageId,
    photoTips: meta.photoTips || '',
    captionPlaceholder: meta.captionPlaceholder || '',
    photoCount: photo ? countPhotosForFlowNode(node, albumNodes) : 0,
    previewImages: photo && stage && Array.isArray(stage.images)
      ? stage.images.slice(0, 3).map((img) => ({
          url: img.url || '',
          caption: img.caption || '',
        }))
      : [],
    document: document && node.document
      ? {
          ...node.document,
          statusLabel: resolveDocumentStatusLabel(node.document),
          requiresConfirm: requiresOwnerConfirm(node),
        }
      : null,
    segmentLabel: node.segmentLabel || '',
    insertedReason: node.insertedReason || '',
    parentNodeId: node.parentNodeId || '',
  }
}

async function writeFlowPackage(albumId, mutator) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  const pkg = readRawContentPackage(album)
  const next = mutator(pkg) || pkg
  next.flowVersion = next.flowVersion || FLOW_VERSION
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: next },
  })
  return next
}

async function initFlowOnAlbum(albumId) {
  return writeFlowPackage(albumId, (pkg) => ({
    ...pkg,
    flowVersion: FLOW_VERSION,
    flowNodes: buildStandardFlowNodes(),
  }))
}

function buildFlowView(album, albumNodes = []) {
  const flowVersion = readFlowVersion(album)
  const flowNodes = sortFlowNodes(readFlowNodesRaw(album)).map((node) =>
    mapFlowNodeForView(node, albumNodes),
  )
  return {
    flowVersion,
    flowNodes,
    usesFlowTimeline: flowVersion >= 1 && flowNodes.length > 0,
  }
}

async function getMerchantAlbumFlow(albumId, storeId, merchantId = '') {
  const { loadAlbum, assertMerchantAlbum, mapNodesForView } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  let flowVersion = readFlowVersion(album)
  if (flowVersion < 1) {
    await initFlowOnAlbum(albumId)
    const refreshed = await loadAlbum(albumId)
    flowVersion = readFlowVersion(refreshed)
    Object.assign(album, { contentPackageJson: refreshed.contentPackageJson })
  }
  const nodes = mapNodesForView(album)
  return {
    albumId,
    ...buildFlowView(album, nodes),
    editable: !album.completedAt,
  }
}

async function updateFlowNode(albumId, storeId, nodeId, payload = {}, merchantId = '') {
  const { loadAlbum, assertMerchantAlbum, assertAlbumContentEditable, mapNodesForView } =
    require('./service-album.service')
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  assertAlbumContentEditable(album)

  const id = String(nodeId || '').trim()
  if (!id) {
    const err = new Error('缺少节点 ID')
    err.status = 400
    throw err
  }

  await writeFlowPackage(albumId, (pkg) => {
    const nodes = sortFlowNodes(Array.isArray(pkg.flowNodes) ? pkg.flowNodes : [])
    const index = nodes.findIndex((n) => n.id === id)
    if (index < 0) {
      const err = new Error('节点不存在')
      err.status = 404
      throw err
    }
    const prev = nodes[index]
    const nextNode = { ...prev }

    if (payload.status != null) {
      nextNode.status = String(payload.status || '').trim() || prev.status
    }
    if (payload.document != null && prev.document) {
      nextNode.document = {
        ...prev.document,
        ...payload.document,
        payload: {
          ...(prev.document.payload || {}),
          ...((payload.document && payload.document.payload) || {}),
        },
      }
    }
    if (payload.markComplete) {
      nextNode.status = 'completed'
    }

    nodes[index] = nextNode
    return { ...pkg, flowVersion: FLOW_VERSION, flowNodes: nodes }
  })

  const refreshed = await loadAlbum(albumId)
  const nodes = mapNodesForView(refreshed)
  const flowNodes = sortFlowNodes(readFlowNodesRaw(refreshed))
  const node = flowNodes.find((n) => n.id === id)
  return {
    node: node ? mapFlowNodeForView(node, nodes) : null,
  }
}

async function proxyConfirmFlowDocument(
  albumId,
  storeId,
  nodeId,
  payload = {},
  merchantId = '',
) {
  const { loadAlbum, assertMerchantAlbum, assertAlbumContentEditable } =
    require('./service-album.service')
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  assertAlbumContentEditable(album)

  const proofImages = Array.isArray(payload.proxyProofImages)
    ? payload.proxyProofImages.filter(Boolean).slice(0, 3)
    : []

  return updateFlowNode(
    albumId,
    storeId,
    nodeId,
    {
      document: {
        status: 'confirmed',
        confirmedAt: new Date().toISOString(),
        confirmedBy: 'merchant_proxy',
        proxyProofImages: proofImages,
      },
      markComplete: true,
    },
    merchantId,
  )
}

module.exports = {
  FLOW_VERSION,
  readFlowVersion,
  readFlowNodesRaw,
  buildFlowView,
  initFlowOnAlbum,
  getMerchantAlbumFlow,
  updateFlowNode,
  proxyConfirmFlowDocument,
  mapFlowNodeForView,
}
