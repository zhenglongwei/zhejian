const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { resolvePublicCaseMediaUrl } = require('../lib/media-url')
const { getTaskById } = require('./desensitize.service')
const { buildAlbumView } = require('./service-album.service')
const { buildPublicCasePrice, buildPublicCaseDbPriceColumns } = require('../utils/album-price')
const { buildPreMaskTaskId, buildMerchantColdStartTaskId, BIZ_TYPE } = require('./desensitize.constants')
const { mergeContentJsonGeo } = require('../schemas/case-geo-content.schema')
const { resolveSnapshotVersion } = require('../schemas/case-snapshot.schema')
const { assertGeoPublishable } = require('../utils/case-geo-quality')
const { buildAlbumGeoPreview } = require('./album-geo-preview.service')
const { buildCaseArticlePayload, applyConfirmedMerchantCaseDraft } = require('./case-article-generator.service')
const { buildCaseSnapshot } = require('./case-snapshot.service')
const {
  extractAlbumContentOptimizeDraft,
} = require('../schemas/album-content-optimize.schema')
const { mergeOptimizeDraftIntoCaseDraft } = require('./album-content-optimize.service')
const {
  buildEnrichmentFromPublicCaseRow,
  mergeCaseEnrichmentPatch,
} = require('../schemas/case-enrichment.schema')
const { assertPublicCaseQualityReady } = require('./public-case-quality.service')
const { config } = require('../config')
const {
  buildPublicView,
  pickPublicViewCover,
} = require('./build-public-view.service')
const {
  GATE_B_RISK,
  SPOT_CHECK_STATUS,
  evaluateGateBRisk,
  shouldSpotCheckGateB,
} = require('./gate-b-risk.service')

function buildVehicleTitle(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return '该车辆'
  const parts = [vehicle.brand, vehicle.series].filter(Boolean)
  return parts.join(' ') || '该车辆'
}

function buildCaseTitle({ city = '杭州', vehicle, serviceName = '维修服务' }) {
  const vehicleTitle = buildVehicleTitle(vehicle)
  return `${city}${vehicleTitle} · ${serviceName}`.trim()
}

function buildCaseSummary({ vehicle, serviceName = '维修服务', coldStart = false }) {
  const vehicleTitle = buildVehicleTitle(vehicle)
  if (coldStart) {
    return `记录了${vehicleTitle}进行${serviceName}的维修过程摘要。展示价格为系统参考区间。`
  }
  return `记录了${vehicleTitle}进行${serviceName}的维修过程摘要。`
}

function pickCover(nodes) {
  for (const node of nodes || []) {
    for (const img of node.images || []) {
      const safe = resolvePublicCaseMediaUrl(typeof img === 'string' ? img : '')
      if (safe) return safe
    }
  }
  return ''
}

function taskAssets(task) {
  if (!task) return []
  return task.rawAssets || task.assets || []
}

function dedupeUrls(urls) {
  const seen = new Set()
  const out = []
  ;(urls || []).forEach((url) => {
    const key = String(url || '').trim()
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(key)
  })
  return out
}

function resolveMaskedUrl(asset) {
  return resolvePublicCaseMediaUrl(asset.maskedUrl || asset.preMaskedUrl || '')
}

function buildNodesFromTask(nodes, task) {
  const assets = taskAssets(task)
  if (!assets.length) {
    return (nodes || []).map((node) => ({
      ...node,
      images: [],
    }))
  }

  const assetsByNode = {}
  assets.forEach((asset) => {
    const nodeId = asset.nodeId || ''
    if (!assetsByNode[nodeId]) assetsByNode[nodeId] = []
    assetsByNode[nodeId].push(asset)
  })

  return (nodes || []).map((node) => {
    const nodeId = node.id || node.nodeId || ''
    const nodeAssets = (assetsByNode[nodeId] || []).sort((a, b) => {
      const ai = a.idx != null ? a.idx : a.index ?? 0
      const bi = b.idx != null ? b.idx : b.index ?? 0
      return ai - bi
    })
    const images = dedupeUrls(nodeAssets.map(resolveMaskedUrl).filter(Boolean))
    return {
      ...node,
      images,
    }
  })
}

/** 公开案例节点以相册真源为准，脱敏图以 pre-mask 任务为准 */
function resolvePublicCaseNodes(album, task, fallbackNodes = []) {
  const nodes = album ? buildAlbumView(album).nodes : fallbackNodes
  if (!nodes.length) return fallbackNodes
  return buildNodesFromTask(nodes, task)
}

function buildCaseDraft(albumView, task, authorizationTier, options = {}) {
  const coldStart = Boolean(options.coldStart)
  const hasUserAuthorization =
    options.hasUserAuthorization != null ? options.hasUserAuthorization : !coldStart
  const caseId = `case_${albumView.albumId.replace(/^alb_/, '')}`
  const vehicle = albumView.vehicle || {}
  const serviceName = albumView.serviceName || '维修服务'
  const city = albumView.store?.city || '杭州'
  const nodesWithMask = buildNodesFromTask(albumView.nodes, task)
  const tier = coldStart ? 'private' : authorizationTier
  const publicPrice = buildPublicCasePrice(
    {
      ...albumView,
      authorizationTier: tier,
      userPhone: albumView.userPhone,
    },
    { hasUserAuthorization }
  )

  const summary = buildCaseSummary({
    vehicle,
    serviceName,
    authorizationTier: tier,
    coldStart,
  })

  const geoPack = buildAlbumGeoPreview(
    { ...albumView, nodes: nodesWithMask },
    { coldStart }
  )

  return {
    id: caseId,
    albumId: albumView.albumId,
    authorizationTier: tier,
    title: buildCaseTitle({ city, vehicle, serviceName }),
    summary,
    coverImage: pickCover(nodesWithMask),
    storeId: albumView.store?.id || '',
    storeName: albumView.store?.name || '',
    serviceName,
    city,
    priceMode: publicPrice.priceMode,
    amount: publicPrice.amount,
    minAmount: publicPrice.minAmount,
    maxAmount: publicPrice.maxAmount,
    planAmount: publicPrice.planAmount,
    contentJson: mergeContentJsonGeo(
      {
        nodes: nodesWithMask,
        vehicleText: buildVehicleTitle(vehicle),
        tags: coldStart ? ['desensitized'] : ['authorized', 'desensitized', 'audited'],
        coldStart,
      },
      geoPack.geo
    ),
  }
}

const { canAccessMerchantAlbum } = require('../lib/merchant-album-access')

function assertPublicCasePublishable(publicCase) {
  if (!publicCase) return
  const status = publicCase.status
  if (status === PUBLIC_CASE_STATUS.OFFLINE) return
  if (status === PUBLIC_CASE_STATUS.NEED_MODIFY) return
  if (status === PUBLIC_CASE_STATUS.REJECTED) return
  if (status === PUBLIC_CASE_STATUS.PENDING_REVIEW) {
    const err = new Error('公示审核中，请耐心等待')
    err.status = 409
    throw err
  }
  if (status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    const err = new Error('案例已公开展示，如需修改请先撤回公示')
    err.status = 409
    throw err
  }
  const err = new Error('请先撤回当前公示后再重新提交')
  err.status = 409
  throw err
}

async function resolvePublishTask(albumId, payload = {}) {
  if (payload.taskId) {
    const task = await getTaskById(payload.taskId)
    if (task) return task
  }
  const mchTask = await getTaskById(buildMerchantColdStartTaskId(albumId))
  if (mchTask && taskAssets(mchTask).length && mchTask.maskingConfirmed) {
    return mchTask
  }
  const preMask = await getTaskById(buildPreMaskTaskId(albumId))
  if (preMask && taskAssets(preMask).length) return preMask
  return null
}

async function publishServicePublicCase(albumId, userId, payload = {}) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
      authorization: true,
      publicCase: true,
    },
  })
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  const phone = user?.phone || ''
  const allowed =
    album.userId === userId || (phone && album.userPhone === phone)
  if (!allowed) {
    const err = new Error('无权发布该案例')
    err.status = 403
    throw err
  }

  if (album.authorization?.status !== 'authorized') {
    const err = new Error('请先完成公开授权')
    err.status = 409
    throw err
  }

  if (album.status !== 'completed' && album.status !== 'published') {
    const err = new Error('相册尚未完工，暂无法提交公示')
    err.status = 409
    throw err
  }

  assertPublicCasePublishable(album.publicCase)

  const { assertAlbumCompliancePassed } = require('./album-compliance.service')
  assertAlbumCompliancePassed(album)

  const { readPackageFromAlbum } = require('./album-content-package.service')
  const contentPkg = readPackageFromAlbum(album)
  const merchantCaseDraft =
    contentPkg && contentPkg.merchantCaseDraft ? contentPkg.merchantCaseDraft : null
  if (!merchantCaseDraft || !merchantCaseDraft.confirmedAt) {
    const err = new Error('门店尚未确认案例稿，暂无法发布到公开网站')
    err.status = 409
    err.code = 'CASE_DRAFT_REQUIRED'
    throw err
  }

  const albumView = buildAlbumView(album)
  assertPublicCaseQualityReady(albumView)

  const authorizationTier = album.authorization.tier || album.authorizationTier || 'named'
  const tier = authorizationTier === 'anonymous' ? 'named' : authorizationTier
  const wasOffline = album.publicCase?.status === PUBLIC_CASE_STATUS.OFFLINE
  const task = await resolvePublishTask(albumId, payload)
  const previousSnapshotVersion = resolveSnapshotVersion(album.publicCase?.contentJson)
  const nodesWithMask = buildNodesFromTask(albumView.nodes, task)
  const publicView = config.publicViewV2
    ? buildPublicView(albumView, task, { authorizationTier: tier })
    : null
  const draft = mergeOptimizeDraftIntoCaseDraft(
    buildCaseDraft(albumView, task, tier, {
      serviceItemId: album.serviceItemId || '',
      templateId: album.templateId || '',
    }),
    extractAlbumContentOptimizeDraft(album)
  )
  if (publicView) {
    const cover = pickPublicViewCover(publicView)
    if (cover) draft.coverImage = cover
  }
  const caseId = draft.id
  let articlePayload = buildCaseArticlePayload({
    caseId,
    draft: {
      ...draft,
      contentJson: {
        ...(draft.contentJson || {}),
        nodes: nodesWithMask,
      },
    },
    albumView: { ...albumView, nodes: nodesWithMask },
    coldStart: false,
    hasUserAuthorization: true,
    serviceItemId: album.serviceItemId || '',
    templateId: album.templateId || '',
    previousArticleVersion: previousSnapshotVersion,
  })
  articlePayload = applyConfirmedMerchantCaseDraft(articlePayload, merchantCaseDraft)
  const { snapshot, contentJson } = buildCaseSnapshot({
    albumView,
    draft,
    articlePayload,
    nodesWithMask,
    task,
    authorizationTier: tier,
    previousSnapshotVersion,
    parts: Array.isArray(album.partsJson) ? album.partsJson : [],
    serviceItemId: album.serviceItemId || '',
    templateId: album.templateId || '',
    publicView,
  })
  if (contentJson && typeof contentJson === 'object') {
    contentJson.merchantCaseDraft = merchantCaseDraft
  }
  const priceColumns = buildPublicCaseDbPriceColumns(draft)

  const enrichmentSeedRow = {
    contentJson,
    aiSummary: articlePayload.aiSummary,
    seoTitle: articlePayload.seoTitle,
    seoDescription: articlePayload.seoDescription,
    seoNoindex: articlePayload.seoNoindex,
    canonicalPath: articlePayload.canonicalPath,
    slug: wasOffline ? null : album.publicCase?.slug,
    articleVersion: snapshot.version,
    enrichmentVersion: album.publicCase?.enrichmentVersion || 0,
    updatedAt: new Date(),
  }
  const enrichment = buildEnrichmentFromPublicCaseRow(enrichmentSeedRow, {
    version: wasOffline
      ? (album.publicCase?.enrichmentVersion || 0) + 1
      : Math.max(album.publicCase?.enrichmentVersion || 0, 1) || 1,
  })
  const enrichmentFinal = enrichment

  const riskEval = await evaluateGateBRisk({
    album,
    albumView,
    task,
    caseId,
  })
  const gateBRisk = riskEval.risk
  const contentJsonWithGateB = {
    ...contentJson,
    gateB: {
      risk: gateBRisk,
      reasons: riskEval.reasons,
      evaluatedAt: new Date().toISOString(),
    },
  }

  await prisma.publicCase.upsert({
    where: { albumId },
    create: {
      id: caseId,
      albumId,
      status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
      authorizationTier: tier,
      title: snapshot.title,
      summary: snapshot.summary,
      coverImage: snapshot.coverImage,
      contentJson: contentJsonWithGateB,
      articleBody: snapshot.articleBody,
      aiSummary: articlePayload.aiSummary,
      seoTitle: articlePayload.seoTitle,
      seoDescription: articlePayload.seoDescription,
      articleVersion: snapshot.version,
      articleStatus: articlePayload.articleStatus,
      articleGeneratedAt: articlePayload.articleGeneratedAt,
      storeId: draft.storeId,
      storeName: draft.storeName,
      serviceName: draft.serviceName,
      city: draft.city,
      minAmount: priceColumns.minAmount,
      maxAmount: priceColumns.maxAmount,
      priceMode: priceColumns.priceMode,
      publishedAt: null,
      gateBRisk,
      spotCheckStatus: SPOT_CHECK_STATUS.NONE,
      enrichmentJson: enrichmentFinal,
      enrichmentVersion: enrichmentFinal.version,
    },
    update: {
      status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
      gateBRejectType: '',
      gateBRejectReason: '',
      gateBRisk,
      spotCheckStatus: SPOT_CHECK_STATUS.NONE,
      authorizationTier: tier,
      title: snapshot.title,
      summary: snapshot.summary,
      coverImage: snapshot.coverImage,
      contentJson: contentJsonWithGateB,
      articleBody: snapshot.articleBody,
      aiSummary: articlePayload.aiSummary,
      seoTitle: articlePayload.seoTitle,
      seoDescription: articlePayload.seoDescription,
      articleVersion: snapshot.version,
      articleStatus: articlePayload.articleStatus,
      articleGeneratedAt: articlePayload.articleGeneratedAt,
      storeId: draft.storeId,
      storeName: draft.storeName,
      serviceName: draft.serviceName,
      city: draft.city,
      minAmount: priceColumns.minAmount,
      maxAmount: priceColumns.maxAmount,
      priceMode: priceColumns.priceMode,
      publishedAt: null,
      enrichmentJson: enrichmentFinal,
      enrichmentVersion: enrichmentFinal.version,
      ...(wasOffline ? { slug: null } : {}),
    },
  })

  await prisma.album.update({
    where: { id: albumId },
    data: {
      publicCaseStatus: 'pending_review',
    },
  })

  const { scheduleCaseGeoLlmOptimization } = require('./case-geo-llm.service')
  scheduleCaseGeoLlmOptimization(caseId)

  if (gateBRisk === GATE_B_RISK.LOW) {
    const { approveAdminCase } = require('./admin-case.service')
    await approveAdminCase(caseId, {
      reviewerId: 'system',
      comment: 'gate_b_auto_low_risk',
      reviewAction: 'auto_approve',
    })

    let spotCheckStatus = SPOT_CHECK_STATUS.NONE
    if (shouldSpotCheckGateB(caseId)) {
      spotCheckStatus = SPOT_CHECK_STATUS.PENDING
      await prisma.publicCase.update({
        where: { id: caseId },
        data: { spotCheckStatus },
      })
    }

    return {
      caseItem: {
        id: caseId,
        albumId,
        title: snapshot.title,
        authorizationTier: tier,
        status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
        snapshotVersion: snapshot.version,
        frozenAt: snapshot.frozenAt,
        gateBRisk,
        spotCheckStatus,
      },
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      gateBRisk,
      spotCheckStatus,
      autoApproved: true,
      message: '已发布到公开网站，同城车友可参考（已脱敏）',
    }
  }

  return {
    caseItem: {
      id: caseId,
      albumId,
      title: snapshot.title,
      authorizationTier: tier,
      status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
      snapshotVersion: snapshot.version,
      frozenAt: snapshot.frozenAt,
      gateBRisk,
      spotCheckStatus: SPOT_CHECK_STATUS.NONE,
    },
    status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
    gateBRisk,
    spotCheckStatus: SPOT_CHECK_STATUS.NONE,
    autoApproved: false,
    message: '已提交平台审核，通过后将公开展示',
  }
}

async function publishMerchantColdStartPublicCase(albumId, { storeId, merchantId, taskId } = {}) {
  const err = new Error('未关联车主的相册不再支持商家单方提交公开，请由车主扫码关联后授权公示')
  err.status = 409
  throw err

  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
      authorization: true,
      publicCase: true,
    },
  })
  if (!album || !canAccessMerchantAlbum(album, merchantId)) {
    const err = new Error('档案不存在或已被删除')
    err.status = 404
    throw err
  }

  const hasOwner =
    Boolean(String(album.userId || '').trim()) ||
    Boolean(String(album.userPhone || '').trim())
  if (hasOwner) {
    const err = new Error('已关联车主，请由车主完成授权公示')
    err.status = 409
    throw err
  }

  if (album.authorization?.status === 'authorized') {
    const err = new Error('该相册已有车主授权，请走用户授权公示流程')
    err.status = 409
    throw err
  }

  if (album.status !== 'completed' && album.status !== 'published') {
    const err = new Error('请先标记服务相册已完工')
    err.status = 409
    throw err
  }

  const imageCount = album.imageCount || (album.images || []).length
  if (imageCount < 1) {
    const err = new Error('请至少上传一张过程图')
    err.status = 409
    throw err
  }

  if (album.publicCase?.status === PUBLIC_CASE_STATUS.PENDING_REVIEW) {
    const err = new Error('公开案例审核中，请耐心等待')
    err.status = 409
    throw err
  }

  if (album.publicCase?.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    const err = new Error('该案例已公开展示')
    err.status = 409
    throw err
  }

  const resolvedTaskId = taskId || buildMerchantColdStartTaskId(albumId)
  const task = await getTaskById(resolvedTaskId)
  if (!task || task.bizType !== BIZ_TYPE.MERCHANT_HISTORY || task.bizId !== albumId) {
    const err = new Error('请先完成脱敏确认')
    err.status = 409
    throw err
  }
  if (!task.maskingConfirmed) {
    const err = new Error('请先完成脱敏确认')
    err.status = 409
    throw err
  }
  if (!taskAssets(task).length) {
    const err = new Error('脱敏任务无有效图片')
    err.status = 409
    throw err
  }

  const albumView = buildAlbumView(album)
  assertGeoPublishable(albumView, { coldStart: true })
  const draft = buildCaseDraft(albumView, task, 'private', {
    coldStart: true,
    hasUserAuthorization: false,
    serviceItemId: album.serviceItemId || '',
    templateId: album.templateId || '',
  })
  const caseId = draft.id
  const priceColumns = buildPublicCaseDbPriceColumns(draft)

  await prisma.publicCase.upsert({
    where: { albumId },
    create: {
      id: caseId,
      albumId,
      status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
      authorizationTier: 'private',
      title: draft.title,
      summary: draft.summary,
      coverImage: draft.coverImage,
      contentJson: draft.contentJson,
      storeId: draft.storeId,
      storeName: draft.storeName,
      serviceName: draft.serviceName,
      city: draft.city,
      minAmount: priceColumns.minAmount,
      maxAmount: priceColumns.maxAmount,
      priceMode: priceColumns.priceMode,
      publishedAt: null,
    },
    update: {
      status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
      authorizationTier: 'private',
      title: draft.title,
      summary: draft.summary,
      coverImage: draft.coverImage,
      contentJson: draft.contentJson,
      storeId: draft.storeId,
      storeName: draft.storeName,
      serviceName: draft.serviceName,
      city: draft.city,
      minAmount: priceColumns.minAmount,
      maxAmount: priceColumns.maxAmount,
      priceMode: priceColumns.priceMode,
      publishedAt: null,
    },
  })

  await prisma.album.update({
    where: { id: albumId },
    data: {
      publicCaseStatus: 'pending_review',
      authorizationTier: 'private',
    },
  })

  const { scheduleCaseGeoLlmOptimization } = require('./case-geo-llm.service')
  scheduleCaseGeoLlmOptimization(caseId)

  return {
    caseItem: {
      id: caseId,
      albumId,
      title: draft.title,
      authorizationTier: 'private',
      status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
    },
    status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
    message: '已提交平台审核，通过后将公开展示',
  }
}

module.exports = {
  publishServicePublicCase,
  publishMerchantColdStartPublicCase,
  buildCaseDraft,
  buildNodesFromTask,
  resolvePublicCaseNodes,
  pickCover,
  resolvePublishTask,
  assertPublicCasePublishable,
}
