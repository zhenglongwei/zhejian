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
  collectQuoteConfirmGaps,
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
  if (status === 'delivered') return '已送达'
  if (status === 'pending_confirm') return '待车主确认'
  if (status === 'in_progress') return '施工中'
  if (status === 'sent') return '已发送车主'
  return '草稿'
}

function countPhotosForFlowNode(node, albumNodes = []) {
  let stageIds = resolveLegacyStageIdsForFlowNode(node)
  // 接车与检测：计数含存量 stage_1（统一入口迁移前）
  if (node && node.kind === 'intake_inspection') {
    stageIds = ['stage_1', 'stage_2']
  }
  if (!stageIds.length) return 0
  return stageIds.reduce((sum, stageId) => {
    const stage = (albumNodes || []).find((n) => n.id === stageId)
    const count = stage && Array.isArray(stage.images) ? stage.images.length : 0
    return sum + count
  }, 0)
}

function collectPreviewImages(node, albumNodes = [], limit = 4) {
  let stageIds = resolveLegacyStageIdsForFlowNode(node)
  if (node && node.kind === 'intake_inspection') {
    stageIds = ['stage_1', 'stage_2']
  }
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
  const needConfirm = requiresOwnerConfirm(node)

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
    const cleaned = pkg.flowNodes
      .filter((n) => n.kind !== 'warranty')
      .map((n) => {
        const meta = getFlowKindMeta(n.kind)
        if (!meta) return n
        return {
          ...n,
          title: meta.title || n.title,
        }
      })
    return { ...pkg, flowVersion: FLOW_VERSION, flowNodes: cleaned }
  }

  if (version >= 3 && Array.isArray(pkg.flowNodes) && pkg.flowNodes.length) {
    const cleaned = pkg.flowNodes
      .filter((n) => n.kind !== 'warranty')
      .map((n) => {
        const meta = getFlowKindMeta(n.kind)
        return {
          ...n,
          title: (meta && meta.title) || n.title,
        }
      })
    return { ...pkg, flowVersion: FLOW_VERSION, flowNodes: cleaned }
  }

  const fresh = buildStandardFlowNodes()
  return { ...pkg, flowVersion: FLOW_VERSION, flowNodes: fresh }
}

function collectAllWorkOrderItems(nodes = []) {
  return (nodes || [])
    .filter((n) => n.kind === 'work_order')
    .flatMap((n) => {
      const items =
        (n.document && n.document.payload && n.document.payload.items) || []
      return Array.isArray(items) ? items : []
    })
}

function renumberSortOrders(nodes = []) {
  nodes.forEach((n, i) => {
    n.sortOrder = i
  })
  return nodes
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
      if (prev.kind === 'work_order' && prev.document) {
        nextNode.document = {
          ...prev.document,
          ...(nextNode.document || {}),
          status: 'in_progress',
          payload: {
            ...((prev.document && prev.document.payload) || {}),
            ...((nextNode.document && nextNode.document.payload) || {}),
            startedAt: new Date().toISOString(),
          },
        }
      }
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
            status: 'draft',
            payload: draft,
          },
        }
      }
    }

    if (list[idx].kind === 'delivery_photos') {
      const repairIdx = list.findIndex((n) => n.kind === 'repair_report')
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
          workItems: collectAllWorkOrderItems(list),
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
    intake_inspection: '请核对检测报告',
    delivery_photos: '请核对完工确认',
    work: '施工记录已确认',
  }
  return {
    node: updated ? mapFlowNodeForView(updated, viewNodes) : null,
    message: messages[node.kind] || '本步已完成',
  }
}

async function deliverFlowDocument(albumId, storeId, nodeId, payload = {}, merchantId = '') {
  const { loadAlbum, assertMerchantAlbum, assertAlbumContentEditable, mapNodesForView } =
    require('./service-album.service')
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  assertAlbumContentEditable(album)

  const id = String(nodeId || '').trim()
  await writeFlowPackage(albumId, (pkg) => {
    const nodes = sortFlowNodes(Array.isArray(pkg.flowNodes) ? pkg.flowNodes : [])
    const index = nodes.findIndex((n) => n.id === id)
    if (index < 0) {
      const err = new Error('节点不存在')
      err.status = 404
      throw err
    }
    if (nodes[index].kind !== 'inspection_report') {
      const err = new Error('仅检测报告可送达')
      err.status = 400
      throw err
    }
    const prevDoc = nodes[index].document || emptyDocument('inspection_report')
    const mergedPayload = {
      ...(prevDoc.payload || {}),
      ...((payload.document && payload.document.payload) || {}),
    }
    const gaps = collectInspectionReportGaps(mergedPayload)
    if (gaps.length) {
      const err = new Error(gaps[0] || '检测报告未填完整')
      err.status = 400
      throw err
    }
    nodes[index] = {
      ...nodes[index],
      status: 'completed',
      document: {
        ...prevDoc,
        status: 'delivered',
        deliveredAt: new Date().toISOString(),
        payload: mergedPayload,
      },
    }
    unlockNextNode(nodes, index)

    const quoteIdx = nodes.findIndex((n) => n.kind === 'quote_confirm' && !n.insertedReason)
    if (quoteIdx >= 0 && (nodes[quoteIdx].status === 'locked' || nodes[quoteIdx].status === 'pending')) {
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
            lines: lines.length ? lines : [{ name: '', amount: '', note: '' }],
            confirmCopy:
              (prevQuoteDoc.payload && prevQuoteDoc.payload.confirmCopy) ||
              '本人同意按上述项目施工，费用以本单为准。',
            evidenceRef: id,
          },
        },
      }
    }

    return { ...pkg, flowVersion: FLOW_VERSION, flowNodes: nodes }
  })

  const refreshed = await loadAlbum(albumId)
  const viewNodes = mapNodesForView(refreshed)
  const node = sortFlowNodes(readFlowNodesRaw(refreshed)).find((n) => n.id === id)
  return {
    node: node ? mapFlowNodeForView(node, viewNodes) : null,
    message: '检测报告已送达',
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
    const kind = nodes[index].kind
    if (kind !== 'quote_confirm' && kind !== 'repair_report' && kind !== 'addon_quote_confirm') {
      const err = new Error('该单据无需车主确认')
      err.status = 400
      throw err
    }

    const prevDoc = nodes[index].document || emptyDocument('')
    const mergedPayload = {
      ...(prevDoc.payload || {}),
      ...((payload.document && payload.document.payload) || {}),
    }

    if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
      const gaps = collectQuoteConfirmGaps(mergedPayload)
      if (gaps.length) {
        const err = new Error(gaps[0] || '方案未填完整')
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

    if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
      applyQuoteConfirmedSideEffects(nodes, index, id, mergedPayload)
    } else {
      unlockNextNode(nodes, index)
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

/** 施工中插入增项方案确认 + 工单 */
async function insertAddonPlan(albumId, storeId, merchantId = '') {
  const { loadAlbum, assertMerchantAlbum, assertAlbumContentEditable, mapNodesForView } =
    require('./service-album.service')
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  assertAlbumContentEditable(album)

  await writeFlowPackage(albumId, (pkg) => {
    const nodes = sortFlowNodes(Array.isArray(pkg.flowNodes) ? pkg.flowNodes : [])
    let workIdx = nodes.findIndex((n) => n.kind === 'work' && n.status === 'in_progress')
    if (workIdx < 0) {
      workIdx = nodes.findIndex((n) => n.kind === 'work' && n.status !== 'locked')
    }
    if (workIdx < 0) {
      workIdx = nodes.findIndex((n) => n.kind === 'work')
    }
    if (workIdx < 0) {
      const err = new Error('未找到施工步骤')
      err.status = 400
      throw err
    }
    // 打断施工：先完成当前施工节点，插入增项方案
    if (nodes[workIdx].status === 'in_progress') {
      nodes[workIdx] = { ...nodes[workIdx], status: 'completed' }
    }
    const deliveryIdx = nodes.findIndex((n) => n.kind === 'delivery_photos')
    const insertAt = deliveryIdx >= 0 ? deliveryIdx : nodes.length
    const ts = Date.now()
    const quoteNode = {
      id: `fn_addon_q_${ts}`,
      kind: 'quote_confirm',
      nodeCategory: 'document',
      sortOrder: insertAt,
      title: '方案确认',
      status: 'in_progress',
      photos: [],
      note: '',
      document: {
        ...emptyDocument('quote_confirm'),
        status: 'draft',
        payload: {
          lines: [{ name: '', amount: '', note: '' }],
          confirmCopy: '本人同意按上述增项项目施工，费用以本单为准。',
        },
      },
      legacyStageId: '',
      legacyStageIds: [],
      insertedReason: 'addon',
      parentNodeId: nodes[workIdx].id,
      segmentLabel: '增项',
    }
    const orderNode = {
      id: `fn_addon_w_${ts}`,
      kind: 'work_order',
      nodeCategory: 'document',
      sortOrder: insertAt + 1,
      title: '工单',
      status: 'locked',
      photos: [],
      note: '',
      document: emptyDocument('work_order'),
      legacyStageId: '',
      legacyStageIds: [],
      insertedReason: 'addon',
      parentNodeId: quoteNode.id,
      segmentLabel: '增项',
    }
    // 增项工单确认后还需回到施工：在增项工单后插入新的施工拍照节点（若尚无未完成施工）
    const extraWork = {
      id: `fn_addon_work_${ts}`,
      kind: 'work',
      nodeCategory: 'photo',
      sortOrder: insertAt + 2,
      title: '施工',
      status: 'locked',
      photos: [],
      note: '',
      document: null,
      legacyStageId: 'stage_5',
      legacyStageIds: ['stage_5'],
      insertedReason: 'addon',
      parentNodeId: orderNode.id,
      segmentLabel: '增项',
      photoDraft: {},
    }
    nodes.splice(insertAt, 0, quoteNode, orderNode, extraWork)
    renumberSortOrders(nodes)
    return { ...pkg, flowVersion: FLOW_VERSION, flowNodes: nodes }
  })

  const refreshed = await loadAlbum(albumId)
  const viewNodes = mapNodesForView(refreshed)
  return buildFlowView(refreshed, viewNodes)
}

function isOwnerVisibleFlowNode(node = {}) {
  const status = String(node.status || '')
  if (status === 'locked' || status === 'pending') return false
  const doc = node.document || {}
  const docStatus = String(doc.status || '')
  switch (node.kind) {
    case 'inspection_report':
      return docStatus === 'delivered' || docStatus === 'confirmed'
    case 'quote_confirm':
    case 'addon_quote_confirm':
    case 'repair_report':
      return docStatus === 'pending_confirm' || docStatus === 'confirmed'
    case 'work_order':
      return (
        status === 'in_progress' ||
        status === 'completed' ||
        Boolean(doc.payload && Array.isArray(doc.payload.items) && doc.payload.items.length)
      )
    case 'work':
      return status === 'in_progress' || status === 'completed'
    default:
      return false
  }
}

function mapOwnerFlowDocCard(node = {}) {
  const doc = node.document || {}
  const payload = doc.payload || {}
  const needsConfirm =
    requiresOwnerConfirm(node) &&
    String(doc.status || '') === 'pending_confirm'
  const kind = node.kind
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const items = Array.isArray(payload.items) ? payload.items : []
  const findings = Array.isArray(payload.findings) ? payload.findings : []
  const workItems = Array.isArray(payload.workItems) ? payload.workItems : items
  const totalAmount =
    payload.totalAmount != null
      ? payload.totalAmount
      : lines.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  return {
    id: node.id,
    kind,
    title: node.title || '',
    segmentLabel: node.segmentLabel || '',
    statusLabel: doc.statusLabel || node.summary || '',
    needsConfirm,
    confirmCopy: String(payload.confirmCopy || ''),
    styleVariant: kind === 'inspection_report' ? 'evidence' : 'document',
    chiefComplaint: String(payload.chiefComplaint || ''),
    vehicleBrand: String(payload.vehicleBrand || ''),
    vehicleSeries: String(payload.vehicleSeries || ''),
    mileageText: String(payload.mileageText || ''),
    reportDate: String(payload.reportDate || ''),
    disclaimer: String(payload.disclaimer || ''),
    conclusion: String(payload.conclusion || ''),
    findings,
    lines,
    items: items.length ? items : workItems,
    workItems,
    totalAmount,
    totalAmountLabel: `合计 ¥${Number(totalAmount || 0).toFixed(2)}`,
    deliveryPhotos: Array.isArray(payload.deliveryPhotos) ? payload.deliveryPhotos : [],
    warrantyPeriod: String(payload.warrantyPeriod || ''),
    warrantyScope: String(payload.warrantyScope || ''),
    warrantyExclusions: String(payload.warrantyExclusions || ''),
    previewImages: node.previewImages || [],
    photoCount: node.photoCount || 0,
  }
}

/** 车主端：逐步可见的单据 / 施工过程 */
function buildOwnerFlowView(album, albumNodes = []) {
  const flowVersion = readFlowVersion(album)
  const rawNodes = sortFlowNodes(readFlowNodesRaw(album))
  if (!rawNodes.length) {
    return {
      flowVersion,
      usesFlowTimeline: false,
      docs: [],
      pendingConfirmCount: 0,
    }
  }
  const mapped = rawNodes.map((node) => mapFlowNodeForView(node, albumNodes))
  const progressive = buildVisibleFlowNodes(mapped)
  const docs = progressive.filter(isOwnerVisibleFlowNode).map(mapOwnerFlowDocCard)
  return {
    flowVersion,
    usesFlowTimeline: true,
    docs,
    pendingConfirmCount: docs.filter((row) => row.needsConfirm).length,
  }
}

function applyQuoteConfirmedSideEffects(nodes, index, quoteNodeId, mergedPayload) {
  unlockNextNode(nodes, index)
  let orderIdx = nodes.findIndex(
    (n, i) => i > index && n.kind === 'work_order' && n.status !== 'completed',
  )
  if (orderIdx < 0) {
    orderIdx = nodes.findIndex((n, i) => i > index && n.kind === 'work_order')
  }
  if (orderIdx < 0) {
    orderIdx = nodes.findIndex((n) => n.kind === 'work_order')
  }
  if (orderIdx >= 0) {
    nodes[orderIdx] = {
      ...nodes[orderIdx],
      status: 'in_progress',
      document: {
        ...(nodes[orderIdx].document || emptyDocument('work_order')),
        status: 'draft',
        payload: buildWorkOrderPayloadFromQuote(mergedPayload, quoteNodeId),
      },
    }
  }
}

/** 车主确认方案 / 完工 */
async function ownerConfirmFlowDocument(albumId, userId, nodeId, payload = {}) {
  const { loadAlbum, mapNodesForView } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在或已被删除')
    err.status = 404
    throw err
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const phone = (user && user.phone) || ''
  const allowed =
    album.userId === userId || (phone && album.userPhone === phone)
  if (!allowed) {
    const err = new Error('你无权确认该单据')
    err.status = 403
    throw err
  }

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
      const err = new Error('单据不存在')
      err.status = 404
      throw err
    }
    const kind = nodes[index].kind
    if (kind !== 'quote_confirm' && kind !== 'repair_report' && kind !== 'addon_quote_confirm') {
      const err = new Error('该单据无需确认')
      err.status = 400
      throw err
    }
    const prevDoc = nodes[index].document || emptyDocument('')
    const docStatus = String(prevDoc.status || '')
    if (docStatus === 'confirmed') {
      const err = new Error('该单据已确认')
      err.status = 400
      throw err
    }
    if (docStatus !== 'pending_confirm') {
      const err = new Error('门店尚未发送确认')
      err.status = 400
      throw err
    }
    const mergedPayload = {
      ...(prevDoc.payload || {}),
      ...((payload.document && payload.document.payload) || {}),
    }
    if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
      const gaps = collectQuoteConfirmGaps(mergedPayload)
      if (gaps.length) {
        const err = new Error(gaps[0] || '方案内容不完整')
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
        confirmedBy: 'owner',
        payload: mergedPayload,
      },
    }
    if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
      applyQuoteConfirmedSideEffects(nodes, index, id, mergedPayload)
    } else {
      unlockNextNode(nodes, index)
    }
    return { ...pkg, flowVersion: FLOW_VERSION, flowNodes: nodes }
  })

  const refreshed = await loadAlbum(albumId)
  const viewNodes = mapNodesForView(refreshed)
  return {
    node: mapFlowNodeForView(
      sortFlowNodes(readFlowNodesRaw(refreshed)).find((n) => n.id === id) || {},
      viewNodes,
    ),
    ownerFlow: buildOwnerFlowView(refreshed, viewNodes),
  }
}

module.exports = {
  FLOW_VERSION,
  readFlowVersion,
  readFlowNodesRaw,
  buildFlowView,
  buildOwnerFlowView,
  initFlowOnAlbum,
  getMerchantAlbumFlow,
  updateFlowNode,
  completeFlowNode,
  deliverFlowDocument,
  proxyConfirmFlowDocument,
  ownerConfirmFlowDocument,
  insertAddonPlan,
  mapFlowNodeForView,
}
