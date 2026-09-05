/**
 * DOC-FLOW · 服务相册事件节点链
 */
const { prisma } = require('../lib/prisma')
const { resolveShared } = require('../utils/resolve-shared')
const {
  FLOW_VERSION,
  buildStandardFlowNodes,
  getFlowKindMeta,
  isPhotoFlowNode,
  isDocumentFlowNode,
  resolveLegacyStageIdsForFlowNode,
  requiresOwnerConfirm,
  emptyDocument,
} = require('../../vendor/shared/constants/service-flow-nodes')

const {
  buildInspectionReportPayload,
  buildWorkOrderPayloadFromQuote,
  buildRepairReportPayload,
  buildQuoteLinesFromFindings,
  collectInspectionReportGaps,
  collectDeliveryPhotoDraftGaps,
  normalizePhotoDraft,
  mergePhotoDraft,
} = resolveShared('utils/service-flow-docs.js')

const { buildFlowProgressView, isFlowNodeDone } = resolveShared(
  'utils/service-flow-progress.js',
)

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
  if (status === 'sent') return '已发送车主'
  return '草稿'
}

function countPhotosForFlowNode(node, albumNodes = []) {
  const stageIds = resolveLegacyStageIdsForFlowNode(node)
  if (!stageIds.length) return 0
  return stageIds.reduce((sum, stageId) => {
    const stage = (albumNodes || []).find((n) => n.id === stageId)
    const count = stage && Array.isArray(stage.images) ? stage.images.length : 0
    return sum + count
  }, 0)
}

function collectPreviewImages(node, albumNodes = [], limit = 4) {
  const stageIds = resolveLegacyStageIdsForFlowNode(node)
  const out = []
  stageIds.forEach((stageId) => {
    const stage = (albumNodes || []).find((n) => n.id === stageId)
    ;(stage && stage.images ? stage.images : []).forEach((img) => {
      if (out.length >= limit) return
      out.push({
        url: typeof img === 'object' ? img.url || '' : img,
        caption: typeof img === 'object' ? img.caption || '' : '',
      })
    })
  })
  return out.filter((row) => row.url)
}

function mapFlowNodeForView(node, albumNodes = []) {
  const meta = getFlowKindMeta(node.kind) || {}
  const photo = isPhotoFlowNode(node)
  const document = isDocumentFlowNode(node)
  const legacyStageIds = resolveLegacyStageIdsForFlowNode(node)
  const needConfirm =
    requiresOwnerConfirm(node) || (meta && meta.requiresConfirm) || node.kind === 'inspection_report'

  return {
    id: node.id,
    kind: node.kind,
    nodeCategory: node.nodeCategory,
    sortOrder: node.sortOrder,
    title: node.title || meta.title || '',
    status: node.status || 'pending',
    note: node.note || '',
    photoDraft: normalizePhotoDraft(node.photoDraft || {}),
    legacyStageId: legacyStageIds[0] || '',
    legacyStageIds,
    photoTips: meta.photoTips || '',
    captionPlaceholder: meta.captionPlaceholder || '',
    description: meta.description || '',
    photoCount: photo ? countPhotosForFlowNode(node, albumNodes) : 0,
    previewImages: photo ? collectPreviewImages(node, albumNodes) : [],
    summary: photo
      ? countPhotosForFlowNode(node, albumNodes) > 0
        ? `已拍 ${countPhotosForFlowNode(node, albumNodes)} 张`
        : '待上传照片'
      : resolveDocumentStatusLabel(node.document),
    document: document && node.document
      ? {
          ...node.document,
          statusLabel: resolveDocumentStatusLabel(node.document),
          requiresConfirm: needConfirm,
        }
      : null,
    segmentLabel: node.segmentLabel || '',
    insertedReason: node.insertedReason || '',
    parentNodeId: node.parentNodeId || '',
    isDone: isFlowNodeDone({
      ...node,
      document: node.document
        ? { ...node.document, requiresConfirm: needConfirm }
        : null,
    }),
  }
}

function unlockNextNode(nodes, index) {
  const next = nodes[index + 1]
  if (next && (next.status === 'locked' || next.status === 'pending')) {
    next.status = 'in_progress'
  }
  return nodes
}

function migrateFlowPackage(pkg = {}, albumNodes = []) {
  const version = Number(pkg.flowVersion) || 0
  if (version >= FLOW_VERSION && Array.isArray(pkg.flowNodes) && pkg.flowNodes.length) {
    // 去掉独立质保节点（并入维修报告）
    const cleaned = pkg.flowNodes.filter((n) => n.kind !== 'warranty')
    return { ...pkg, flowVersion: FLOW_VERSION, flowNodes: cleaned }
  }

  const fresh = buildStandardFlowNodes()
  return { ...pkg, flowVersion: FLOW_VERSION, flowNodes: fresh }
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
  next.flowVersion = FLOW_VERSION
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: next },
  })
  return next
}

async function initFlowOnAlbum(albumId) {
  return writeFlowPackage(albumId, (pkg) => migrateFlowPackage(pkg, []))
}

function buildFlowView(album, albumNodes = []) {
  const flowVersion = readFlowVersion(album)
  const rawNodes = sortFlowNodes(readFlowNodesRaw(album))
  const flowNodes = rawNodes.map((node) => mapFlowNodeForView(node, albumNodes))
  const progress = buildFlowProgressView(flowNodes)
  const active = progress.activeNode
    ? {
        ...progress.activeNode,
        ctaText:
          progress.activeNode.nodeCategory === 'photo' ||
          (progress.activeNode.legacyStageIds && progress.activeNode.legacyStageIds.length)
            ? '上传照片并确认'
            : progress.activeNode.document?.requiresConfirm
              ? '填写并发送车主确认'
              : '查看并填写',
      }
    : null

  return {
    flowVersion,
    flowNodes,
    progress: {
      ...progress,
      activeNode: active,
    },
    usesFlowTimeline: flowVersion >= 1 && flowNodes.length > 0,
  }
}

async function ensureFlowPackage(albumId, album, albumNodes) {
  const flowVersion = readFlowVersion(album)
  if (flowVersion >= FLOW_VERSION) return album
  await writeFlowPackage(albumId, (pkg) => migrateFlowPackage(pkg, albumNodes))
  return prisma.album.findUnique({ where: { id: albumId } })
}

async function getMerchantAlbumFlow(albumId, storeId, merchantId = '') {
  const { loadAlbum, assertMerchantAlbum, mapNodesForView } = require('./service-album.service')
  let album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  let nodes = mapNodesForView(album)
  if (readFlowVersion(album) < 1) {
    await initFlowOnAlbum(albumId)
  } else if (readFlowVersion(album) < FLOW_VERSION) {
    album = await ensureFlowPackage(albumId, album, nodes)
    nodes = mapNodesForView(album)
  }
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

  let unlockedNext = false

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

    if (payload.note != null) {
      nextNode.note = String(payload.note || '').trim()
    }
    if (payload.photoDraft != null) {
      nextNode.photoDraft = mergePhotoDraft(prev.photoDraft || {}, payload.photoDraft || {})
    }
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
      unlockNextNode(nodes, index)
      unlockedNext = true
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
    unlockedNext,
  }
}

async function completeFlowNode(albumId, storeId, nodeId, payload = {}, merchantId = '') {
  const { loadAlbum, assertMerchantAlbum, assertAlbumContentEditable, mapNodesForView } =
    require('./service-album.service')
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  assertAlbumContentEditable(album)

  const id = String(nodeId || '').trim()
  const nodes = mapNodesForView(album)
  const rawNodes = sortFlowNodes(readFlowNodesRaw(album))
  const index = rawNodes.findIndex((n) => n.id === id)
  if (index < 0) {
    const err = new Error('节点不存在')
    err.status = 404
    throw err
  }

  const node = rawNodes[index]
  if (!isPhotoFlowNode(node)) {
    const err = new Error('仅拍照节点可确认完成')
    err.status = 400
    throw err
  }

  const photoCount = countPhotosForFlowNode(node, nodes)
  if (photoCount < 1) {
    const err = new Error('请至少上传 1 张过程照片')
    err.status = 400
    throw err
  }

  const vehicle = album.vehicleJson || {}
  const incomingDraft = mergePhotoDraft(node.photoDraft || {}, {
    ...(payload.photoDraft || {}),
    ...(payload.chiefComplaint != null ? { chiefComplaint: payload.chiefComplaint } : {}),
    ...(payload.findings != null ? { findings: payload.findings } : {}),
    ...(payload.conclusion != null ? { conclusion: payload.conclusion } : {}),
    ...(payload.warrantyPeriod != null ? { warrantyPeriod: payload.warrantyPeriod } : {}),
    ...(payload.warrantyScope != null ? { warrantyScope: payload.warrantyScope } : {}),
    ...(payload.warrantyExclusions != null
      ? { warrantyExclusions: payload.warrantyExclusions }
      : {}),
    ...(payload.confirmCopy != null ? { confirmCopy: payload.confirmCopy } : {}),
  })

  if (node.kind === 'intake_inspection') {
    const draftReport = buildInspectionReportPayload({
      vehicle,
      albumNodes: nodes,
      photoDraft: incomingDraft,
      chiefComplaint: incomingDraft.chiefComplaint,
      findings: incomingDraft.findings,
      conclusion: incomingDraft.conclusion,
    })
    const gaps = collectInspectionReportGaps(draftReport)
    if (gaps.length) {
      const err = new Error(gaps[0] || '请先补全主诉与检测发现项')
      err.status = 400
      throw err
    }
  }

  if (node.kind === 'delivery_photos') {
    const gaps = collectDeliveryPhotoDraftGaps(incomingDraft)
    if (gaps.length) {
      const err = new Error(gaps[0] || '请先补全质保信息')
      err.status = 400
      throw err
    }
  }

  await writeFlowPackage(albumId, (pkg) => {
    const list = sortFlowNodes(Array.isArray(pkg.flowNodes) ? pkg.flowNodes : [])
    const idx = list.findIndex((n) => n.id === id)
    if (idx < 0) return pkg

    list[idx] = {
      ...list[idx],
      status: 'completed',
      photoDraft: incomingDraft,
    }
    unlockNextNode(list, idx)

    if (list[idx].kind === 'intake_inspection') {
      const reportIdx = list.findIndex((n) => n.kind === 'inspection_report')
      if (reportIdx >= 0) {
        const draft = buildInspectionReportPayload({
          vehicle,
          albumNodes: nodes,
          photoDraft: incomingDraft,
          chiefComplaint: incomingDraft.chiefComplaint,
          findings: incomingDraft.findings,
          conclusion: incomingDraft.conclusion,
        })
        list[reportIdx] = {
          ...list[reportIdx],
          status: 'in_progress',
          document: {
            ...(list[reportIdx].document || emptyDocument('inspection_report')),
            status: 'pending_confirm',
            payload: draft,
          },
        }
      }
    }

    if (list[idx].kind === 'delivery_photos') {
      const repairIdx = list.findIndex((n) => n.kind === 'repair_report')
      const workOrder = list.find((n) => n.kind === 'work_order')
      const inspectionReport = list.find((n) => n.kind === 'inspection_report')
      const delivery = nodes.find((n) => n.id === 'stage_6')
      if (repairIdx >= 0) {
        const draft = buildRepairReportPayload({
          chiefComplaint:
            (inspectionReport &&
              inspectionReport.document &&
              inspectionReport.document.payload &&
              inspectionReport.document.payload.chiefComplaint) ||
            '',
          workItems:
            (workOrder &&
              workOrder.document &&
              workOrder.document.payload &&
              workOrder.document.payload.items) ||
            [],
          deliveryImages: (delivery && delivery.images) || [],
          photoDraft: incomingDraft,
          confirmCopy: incomingDraft.confirmCopy,
        })
        list[repairIdx] = {
          ...list[repairIdx],
          status: 'in_progress',
          document: {
            ...(list[repairIdx].document || emptyDocument('repair_report')),
            status: 'pending_confirm',
            payload: draft,
          },
        }
      }
    }

    return { ...pkg, flowVersion: FLOW_VERSION, flowNodes: list }
  })

  const refreshed = await loadAlbum(albumId)
  const viewNodes = mapNodesForView(refreshed)
  const updated = sortFlowNodes(readFlowNodesRaw(refreshed)).find((n) => n.id === id)
  const messages = {
    intake_inspection: '已生成检测报告，请确认后发送车主',
    delivery_photos: '已生成维修报告（含质保），请确认',
    work: '施工记录已确认',
  }
  return {
    node: updated ? mapFlowNodeForView(updated, viewNodes) : null,
    message: messages[node.kind] || '本步已完成',
  }
}

async function proxyConfirmFlowDocument(
  albumId,
  storeId,
  nodeId,
  payload = {},
  merchantId = '',
) {
  const { loadAlbum, assertMerchantAlbum, assertAlbumContentEditable, mapNodesForView } =
    require('./service-album.service')
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  assertAlbumContentEditable(album)

  const proofImages = Array.isArray(payload.proxyProofImages)
    ? payload.proxyProofImages.filter(Boolean).slice(0, 3)
    : []

  const id = String(nodeId || '').trim()
  await writeFlowPackage(albumId, (pkg) => {
    const nodes = sortFlowNodes(Array.isArray(pkg.flowNodes) ? pkg.flowNodes : [])
    const index = nodes.findIndex((n) => n.id === id)
    if (index < 0) {
      const err = new Error('节点不存在')
      err.status = 404
      throw err
    }
    const prevDoc = nodes[index].document || emptyDocument('')
    const mergedPayload = {
      ...(prevDoc.payload || {}),
      ...((payload.document && payload.document.payload) || {}),
    }

    if (nodes[index].kind === 'inspection_report') {
      const gaps = collectInspectionReportGaps(mergedPayload)
      if (gaps.length) {
        const err = new Error(gaps[0] || '检测报告未填完整')
        err.status = 400
        throw err
      }
    }

    nodes[index] = {
      ...nodes[index],
      status: 'completed',
      document: {
        ...prevDoc,
        status: 'confirmed',
        confirmedAt: new Date().toISOString(),
        confirmedBy: 'merchant_proxy',
        proxyProofImages: proofImages,
        payload: mergedPayload,
      },
    }
    unlockNextNode(nodes, index)

    if (nodes[index].kind === 'inspection_report') {
      const quoteIdx = nodes.findIndex((n) => n.kind === 'quote_confirm')
      if (quoteIdx >= 0) {
        const lines = buildQuoteLinesFromFindings(mergedPayload.findings)
        const prevQuoteDoc = nodes[quoteIdx].document || emptyDocument('quote_confirm')
        nodes[quoteIdx] = {
          ...nodes[quoteIdx],
          status: 'in_progress',
          document: {
            ...prevQuoteDoc,
            status: 'draft',
            payload: {
              ...(prevQuoteDoc.payload || {}),
              lines: lines.length ? lines : [{ name: '', note: '', priceHint: '' }],
              confirmCopy:
                (prevQuoteDoc.payload && prevQuoteDoc.payload.confirmCopy) ||
                '确认按上述方案施工；费用以到店实际结算为准；配件说明以门店告知为准。',
              evidenceRef: id,
            },
          },
        }
      }
    }

    if (nodes[index].kind === 'quote_confirm') {
      const orderIdx = nodes.findIndex((n) => n.kind === 'work_order')
      if (orderIdx >= 0) {
        nodes[orderIdx] = {
          ...nodes[orderIdx],
          status: 'in_progress',
          document: {
            ...(nodes[orderIdx].document || emptyDocument('work_order')),
            status: 'draft',
            payload: buildWorkOrderPayloadFromQuote(mergedPayload, id),
          },
        }
      }
    }

    return { ...pkg, flowVersion: FLOW_VERSION, flowNodes: nodes }
  })

  const refreshed = await loadAlbum(albumId)
  const viewNodes = mapNodesForView(refreshed)
  const node = sortFlowNodes(readFlowNodesRaw(refreshed)).find((n) => n.id === id)
  return {
    node: node ? mapFlowNodeForView(node, viewNodes) : null,
  }
}

module.exports = {
  FLOW_VERSION,
  readFlowVersion,
  readFlowNodesRaw,
  buildFlowView,
  initFlowOnAlbum,
  getMerchantAlbumFlow,
  updateFlowNode,
  completeFlowNode,
  proxyConfirmFlowDocument,
  mapFlowNodeForView,
}
