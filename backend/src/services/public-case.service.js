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
const { SPOT_CHECK_STATUS } = require('./gate-b-risk.service')

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

/**
 * H5 / 案例发布规则（与质量分独立）：公开包须有可公示脱敏图，且标题摘要齐全。
 * 防止「质量分误判放行 → 网站空白案例」再次发生。
 */
function assertPublicViewPublishable(publicView, merchantCaseDraft = null) {
  const media = (publicView && Array.isArray(publicView.media) && publicView.media) || []
  if (media.length < 1) {
    const err = new Error(
      '当前无可公示脱敏配图（接车/报价单仅留档）。请补充检测、施工、配件或交付过程图后再发布',
    )
    err.status = 409
    err.code = 'PUBLIC_VIEW_MEDIA_REQUIRED'
    throw err
  }
  const title = String(
    (merchantCaseDraft && merchantCaseDraft.title) || (publicView && publicView.serviceName) || '',
  ).trim()
  const summary = String((merchantCaseDraft && merchantCaseDraft.caseSummary) || '').trim()
  if (!title) {
    const err = new Error('案例缺少标题，暂不可发布到公开网站')
    err.status = 409
    err.code = 'PUBLIC_CASE_TITLE_REQUIRED'
    throw err
  }
  if (!summary) {
    const err = new Error('案例缺少摘要，暂不可发布到公开网站')
    err.status = 409
    err.code = 'PUBLIC_CASE_SUMMARY_REQUIRED'
    throw err
  }
}

function assertPublicCasePublishable(publicCase) {
  if (!publicCase) {
    const err = new Error('须先由门店确认完工并通过平台案例审核')
    err.status = 409
    err.code = 'CASE_REVIEW_REQUIRED'
    throw err
  }
  const status = publicCase.status
  if (status === PUBLIC_CASE_STATUS.REVIEW_PASSED) return
  if (status === PUBLIC_CASE_STATUS.AUDIT_PASSED) return
  if (status === PUBLIC_CASE_STATUS.OFFLINE) return
  if (status === PUBLIC_CASE_STATUS.NEED_MODIFY || status === PUBLIC_CASE_STATUS.REJECTED) {
    const err = new Error('案例未通过审核，请等待门店修改后重新送审')
    err.status = 409
    err.code = 'CASE_REVIEW_REJECTED'
    throw err
  }
  if (status === PUBLIC_CASE_STATUS.PENDING_REVIEW) {
    const err = new Error('案例审核中，请耐心等待')
    err.status = 409
    throw err
  }
  if (status === PUBLIC_CASE_STATUS.PENDING_DESENSITIZE) {
    const err = new Error('案例配图脱敏处理中，请稍后再试')
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

/**
 * 商家确认完工后写入案例：先 pending_desensitize，脱敏结束后再升为 pending_review
 * @param {string} albumId
 * @param {object|null} draftOverride 确认瞬间的案例稿（优先于相册 contentPackage，避免异步包覆盖）
 */
async function enqueueAlbumCaseForReview(albumId, draftOverride = null) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: { publicCase: true },
  })
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  const { readPackageFromAlbum } = require('./album-content-package.service')
  const { normalizeMerchantCaseDraft } = require('./merchant-case-draft.service')
  const pkg = readPackageFromAlbum(album)
  const fromPkg = pkg && pkg.merchantCaseDraft
  const merchantCaseDraft = normalizeMerchantCaseDraft(draftOverride || fromPkg)
  if (!merchantCaseDraft || !merchantCaseDraft.confirmedAt) {
    const err = new Error('请先确认案例稿后再送审')
    err.status = 409
    err.code = 'CASE_DRAFT_REQUIRED'
    throw err
  }
  const { canMerchantGenerateCase } = require('./case-publish-window.service')
  const gate = canMerchantGenerateCase(album)
  if (!gate.ok && gate.code !== 'NOTIFY_PHONE_REQUIRED') {
    // 送审时手机号仍要拦；此处允许调用方先改号
    if (gate.code === 'OWNER_BLOCKED' || gate.code === 'TAKEN_DOWN' || gate.code === 'ALREADY_PUBLIC' || gate.code === 'NOTIFY_WINDOW' || gate.code === 'IN_REVIEW') {
      const err = new Error(gate.message)
      err.status = 409
      err.code = gate.code
      throw err
    }
  }

  const caseId = (album.publicCase && album.publicCase.id) || newId('case')
  const title = String(merchantCaseDraft.title || album.serviceName || '服务案例').trim()
  const summary = String(merchantCaseDraft.caseSummary || '').trim()
  const contentJson = { merchantCaseDraft }
  const status = PUBLIC_CASE_STATUS.PENDING_DESENSITIZE

  await prisma.publicCase.upsert({
    where: { albumId },
    create: {
      id: caseId,
      albumId,
      status,
      authorizationTier: 'named',
      title,
      summary,
      coverImage: '',
      contentJson,
      storeId: album.storeId || '',
      storeName: album.storeName || '',
      serviceName: album.serviceName || '',
      city: album.city || '',
      publishedAt: null,
      gateBRejectType: '',
      gateBRejectReason: '',
      gateBRisk: '',
      spotCheckStatus: '',
    },
    update: {
      status,
      title,
      summary,
      contentJson,
      storeId: album.storeId || '',
      storeName: album.storeName || '',
      serviceName: album.serviceName || '',
      city: album.city || '',
      publishedAt: null,
      gateBRejectType: '',
      gateBRejectReason: '',
      gateBRisk: '',
      spotCheckStatus: '',
    },
  })

  await prisma.album.update({
    where: { id: albumId },
    data: { publicCaseStatus: status },
  })

  return { caseId, status }
}

/**
 * 脱敏结束后升入运营待审。
 * D14 / PUB-GEO-CASE-09：上网主路径为机审+商家确认，不再自动入人审队列。
 * 遗留 pending_desensitize 单保持原态，由事后抽检/投诉处理。
 */
async function promoteAlbumCaseToPendingReview(albumId) {
  const id = String(albumId || '').trim()
  if (!id) return null
  const row = await prisma.publicCase.findUnique({ where: { albumId: id } })
  if (!row) return null
  return {
    caseId: row.id,
    status: row.status,
    promoted: false,
    skipped: true,
    reason: 'human_review_enqueue_disabled',
  }
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

async function commitPublicCaseGoLive(albumId, options = {}) {
  const payload = options.payload || {}
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

  if (album.status !== 'completed' && album.status !== 'published') {
    const err = new Error('相册尚未完工，暂无法提交公示')
    err.status = 409
    throw err
  }

  const pcRow = album.publicCase
  if (pcRow && pcRow.ownerBlockedAt) {
    const err = new Error('车主已阻止公开')
    err.status = 409
    err.code = 'OWNER_BLOCKED'
    throw err
  }
  const liveStatus = pcRow && pcRow.status
  if (liveStatus === PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    const err = new Error('案例已公开展示')
    err.status = 409
    throw err
  }
  const readyToGoLive =
    liveStatus === PUBLIC_CASE_STATUS.NOTIFY_WINDOW ||
    liveStatus === PUBLIC_CASE_STATUS.REVIEW_PASSED ||
    liveStatus === PUBLIC_CASE_STATUS.AUDIT_PASSED
  if (!readyToGoLive) {
    const err = new Error('当前状态不可公开')
    err.status = 409
    throw err
  }
  if (liveStatus === PUBLIC_CASE_STATUS.REVIEW_PASSED) {
    assertPublicCasePublishable(pcRow)
    const { assertCaseReviewPassed } = require('./case-review-gate.service')
    assertCaseReviewPassed(album)
  }
  if (liveStatus === PUBLIC_CASE_STATUS.AUDIT_PASSED) {
    assertPublicCasePublishable(pcRow)
  }

  const { readPackageFromAlbum } = require('./album-content-package.service')
  const { normalizeMerchantCaseDraft } = require('./merchant-case-draft.service')
  const { pickConfirmedDraftRaw } = require('../utils/confirmed-case-draft-view')
  const contentPkg = readPackageFromAlbum(album)
  const fromPkg = contentPkg && contentPkg.merchantCaseDraft
  const pc = album.publicCase
  const existingContentJson =
    pc && pc.contentJson && typeof pc.contentJson === 'object' ? pc.contentJson : {}
  let merchantCaseDraft = pickConfirmedDraftRaw(existingContentJson, {
    merchantCaseDraft: fromPkg,
  })
  if (!merchantCaseDraft && fromPkg && fromPkg.confirmedAt) {
    merchantCaseDraft = fromPkg
  }
  merchantCaseDraft = merchantCaseDraft
    ? normalizeMerchantCaseDraft(merchantCaseDraft)
    : null
  if (!merchantCaseDraft || !merchantCaseDraft.confirmedAt) {
    const err = new Error('门店尚未确认案例稿，暂无法发布到公开网站')
    err.status = 409
    err.code = 'CASE_DRAFT_REQUIRED'
    throw err
  }

  const albumView = buildAlbumView(album)
  // 第一层：仅隐私/合规硬门槛；旧质量分不挡上网（CASE-10）
  assertPublicCaseQualityReady(albumView)

  const authorizationTier =
    options.authorizationTier ||
    (album.authorization && album.authorization.tier) ||
    album.authorizationTier ||
    'merchant_published'
  const tier = authorizationTier === 'anonymous' ? 'named' : authorizationTier
  const wasOffline = album.publicCase?.status === PUBLIC_CASE_STATUS.OFFLINE
  const task = await resolvePublishTask(albumId, payload)
  const previousSnapshotVersion = resolveSnapshotVersion(album.publicCase?.contentJson)
  const nodesWithMask = buildNodesFromTask(albumView.nodes, task)
  const publicView = config.publicViewV2
    ? buildPublicView(albumView, task, { authorizationTier: tier })
    : null
  // 第二层：案例发布规则（公开包须有脱敏图等，与质量分独立）
  if (config.publicViewV2) {
    assertPublicViewPublishable(publicView, merchantCaseDraft)
  } else if (!(nodesWithMask || []).some((n) => (n.images || []).length > 0)) {
    assertPublicViewPublishable({ media: [] }, merchantCaseDraft)
  }
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
    hasUserAuthorization: Boolean(options.hasUserAuthorization),
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
  const { shouldIndexPublicCase } = require('./case-index-gate.service')
  const indexable = shouldIndexPublicCase(
    {
      ...pc,
      publishedAt: new Date(),
      summary: snapshot.summary,
      serviceName: snapshot.serviceName || album.serviceName,
      title: snapshot.title,
      storefrontHidden: Boolean(pc && pc.storefrontHidden),
    },
    snapshot,
  )
  if (!indexable) {
    articlePayload.seoNoindex = true
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

  // 2026-07-26：废止发布后闸门 B——一审已通过即可直接上线
  const contentJsonWithPublish = {
    ...contentJson,
    gateB: {
      risk: 'skipped',
      reasons: ['publish_after_compliance_passed'],
      evaluatedAt: new Date().toISOString(),
    },
  }

  await prisma.publicCase.upsert({
    where: { albumId },
    create: {
      id: caseId,
      albumId,
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      authorizationTier: tier,
      title: snapshot.title,
      summary: snapshot.summary,
      coverImage: snapshot.coverImage,
      contentJson: contentJsonWithPublish,
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
      publishedAt: new Date(),
      gateBRisk: 'skipped',
      spotCheckStatus: SPOT_CHECK_STATUS.NONE,
      enrichmentJson: enrichmentFinal,
      enrichmentVersion: enrichmentFinal.version,
    },
    update: {
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      gateBRejectType: '',
      gateBRejectReason: '',
      gateBRisk: 'skipped',
      spotCheckStatus: SPOT_CHECK_STATUS.NONE,
      authorizationTier: tier,
      title: snapshot.title,
      summary: snapshot.summary,
      coverImage: snapshot.coverImage,
      contentJson: contentJsonWithPublish,
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
      publishedAt: new Date(),
      enrichmentJson: enrichmentFinal,
      enrichmentVersion: enrichmentFinal.version,
      ...(wasOffline ? { slug: null } : {}),
    },
  })

  await prisma.album.update({
    where: { id: albumId },
    data: {
      publicCaseStatus: 'public_approved',
      status: 'published',
    },
  })

  const { scheduleCaseGeoLlmOptimization } = require('./case-geo-llm.service')
  scheduleCaseGeoLlmOptimization(caseId)

  const { finalizePublishedCaseSideEffects } = require('./admin-case.service')
  await finalizePublishedCaseSideEffects(caseId, {
    reviewerId: options.reviewerId || 'system',
    comment: options.comment || 'notify_window_elapsed',
    reviewAction: options.reviewAction || 'notify_window_elapsed',
  })

  return {
    caseItem: {
      id: caseId,
      albumId,
      title: snapshot.title,
      authorizationTier: tier,
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      snapshotVersion: snapshot.version,
      frozenAt: snapshot.frozenAt,
      gateBRisk: 'skipped',
      spotCheckStatus: SPOT_CHECK_STATUS.NONE,
    },
    status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
    gateBRisk: 'skipped',
    spotCheckStatus: SPOT_CHECK_STATUS.NONE,
    autoApproved: true,
    message: options.message || '已出现在门店公开页（已脱敏）',
  }
}

async function publishServicePublicCase(albumId, userId, payload = {}) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: { authorization: true, publicCase: true },
  })
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const phone = user?.phone || ''
  const allowed = album.userId === userId || (phone && album.userPhone === phone)
  if (!allowed) {
    const err = new Error('无权操作该相册')
    err.status = 403
    throw err
  }
  const isLegacy =
    album.authorization?.status === 'authorized' &&
    album.publicCase?.status === PUBLIC_CASE_STATUS.REVIEW_PASSED &&
    !album.publicCase?.notifyWindowEndsAt
  if (!isLegacy) {
    const err = new Error('公开记录由门店放到店页。不合适可从店页撤下。')
    err.status = 409
    err.code = 'MERCHANT_PUBLISHES'
    throw err
  }
  return commitPublicCaseGoLive(albumId, {
    allowLegacyOwnerPublish: true,
    authorizationTier: album.authorization.tier || album.authorizationTier || 'named',
    hasUserAuthorization: true,
    reviewAction: 'user_publish',
    comment: 'user_publish_after_case_review',
    payload,
    message: '已发布到公开网站，同城车友可参考（已脱敏）',
  })
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

async function generateMerchantPublicCase(albumId, { storeId, merchantId, draft, notifyPhone } = {}) {
  const {
    assertMerchantAlbum,
    saveMerchantCaseDraft,
    loadAlbum,
    buildMerchantView,
  } = require('./service-album.service')
  const {
    canMerchantGenerateCase,
    updateAlbumNotifyPhone,
  } = require('./case-publish-window.service')
  const { ensureAlbumImageVisionCache } = require('./album-vision-ondemand.service')
  const { auditMerchantCaseDraft } = require('./case-llm-audit.service')
  const {
    computeCaseSkeletonHash,
    draftCopyFingerprint,
  } = require('../utils/case-skeleton-hash')
  const { buildMerchantChecklistView } = require('./album-checklist.service')
  const { CASE_GEO_PIPELINE_STATUS } = require('../constants/case-geo-audit')
  const { normalizeMerchantCaseDraft } = require('./merchant-case-draft.service')
  const { readPackageFromAlbum } = require('./album-content-package.service')

  let album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)

  if (notifyPhone) {
    await updateAlbumNotifyPhone(albumId, { storeId, merchantId, phone: notifyPhone })
    album = await loadAlbum(albumId)
  }

  const gate = canMerchantGenerateCase(album)
  if (!gate.ok) {
    const err = new Error(gate.message)
    err.status = 409
    err.code = gate.code
    throw err
  }

  const imageIds = (album.images || []).map((img) => img.id).filter(Boolean)
  const vision = await ensureAlbumImageVisionCache(albumId, imageIds)
  if (vision && vision.status === 'pre_mask_pending') {
    return {
      status: 'pre_mask_pending',
      message: '脱敏图尚未就绪，已开始准备。请稍后再点「生成案例」。',
      pipelineStatus: CASE_GEO_PIPELINE_STATUS.GENERATING,
    }
  }

  const saved = await saveMerchantCaseDraft(albumId, storeId, merchantId, {
    confirm: true,
    draft: draft || {},
  })
  const merchantCaseDraft = normalizeMerchantCaseDraft(saved.draft)
  album = await loadAlbum(albumId)
  const view = buildMerchantView(album)
  const checklist = buildMerchantChecklistView(album, album.images || [])
  const skeletonHash = computeCaseSkeletonHash({
    album,
    checklistItems: checklist.items || [],
    images: album.images || [],
  })
  const copyFingerprint = draftCopyFingerprint(merchantCaseDraft)

  const audit = await auditMerchantCaseDraft({
    album,
    albumView: view,
    draft: merchantCaseDraft,
  })

  const hardBlocks = Array.isArray(audit.hardBlocks) ? audit.hardBlocks : []
  const blockedByHard = hardBlocks.length > 0
  // 2026-09-03：真实性分不挡发；仅系统硬拦挡发
  const canPublish = !blockedByHard
  const pipelineStatus = canPublish
    ? CASE_GEO_PIPELINE_STATUS.AUDIT_PASSED
    : CASE_GEO_PIPELINE_STATUS.AUDIT_FAILED
  const caseGeoMeta = {
    pipelineStatus,
    skeletonHash,
    copyFingerprint,
    generatedAt: new Date().toISOString(),
    authenticityAdvisoryOnly: true,
    visionStats: {
      imageCount: imageIds.length,
      described: Array.isArray(vision.results)
        ? vision.results.filter((r) => r && r.description).length
        : 0,
    },
  }
  const caseGeoAudit = {
    ...audit,
    passed: canPublish,
    authenticityGateRemoved: true,
  }

  const pkg = readPackageFromAlbum(album) || {}
  const nextPkg = {
    ...pkg,
    merchantCaseDraft,
    caseGeoAudit,
    caseGeoMeta,
    generatedAt: pkg.generatedAt || new Date().toISOString(),
  }
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: nextPkg },
  })

  const title = String(merchantCaseDraft.title || album.serviceName || '服务案例').trim()
  const summary = String(merchantCaseDraft.caseSummary || '').trim()
  const contentJson = {
    merchantCaseDraft,
    caseGeoAudit,
    caseGeoMeta,
  }

  try {
    const { emitCaseGeoObs } = require('../utils/case-geo-obs')
    emitCaseGeoObs('case.generate', {
      albumId,
      pipelineStatus,
      authenticityScore: audit.authenticityScore,
      passed: canPublish,
      authenticityAdvisoryOnly: true,
    })
  } catch (_) {
    /* ignore */
  }

  if (canPublish) {
    const caseId = (album.publicCase && album.publicCase.id) || newId('case')
    const status = PUBLIC_CASE_STATUS.AUDIT_PASSED
    await prisma.publicCase.upsert({
      where: { albumId },
      create: {
        id: caseId,
        albumId,
        status,
        authorizationTier: 'merchant_published',
        title,
        summary,
        coverImage: '',
        contentJson,
        storeId: album.storeId || '',
        storeName: album.storeName || '',
        serviceName: album.serviceName || '',
        city: album.city || '',
        publishedAt: null,
        merchantAttestedAt: new Date(),
        gateBRejectType: '',
        gateBRejectReason: '',
        gateBRisk: '',
        spotCheckStatus: '',
      },
      update: {
        status,
        title,
        summary,
        contentJson,
        storeId: album.storeId || '',
        storeName: album.storeName || '',
        serviceName: album.serviceName || '',
        city: album.city || '',
        publishedAt: null,
        merchantAttestedAt: new Date(),
        gateBRejectType: '',
        gateBRejectReason: '',
        gateBRisk: '',
        spotCheckStatus: '',
      },
    })
    await prisma.album.update({
      where: { id: albumId },
      data: { publicCaseStatus: status },
    })

    return {
      status,
      pipelineStatus,
      caseId,
      draft: merchantCaseDraft,
      audit: caseGeoAudit,
      meta: caseGeoMeta,
      message: '案例稿已生成。请预览脱敏内容、勾选真实性承诺后发布到店页。',
      canPublish: true,
    }
  }

  if (album.publicCase && album.publicCase.status === PUBLIC_CASE_STATUS.AUDIT_PASSED) {
    await prisma.publicCase.update({
      where: { albumId },
      data: {
        status: PUBLIC_CASE_STATUS.NEED_MODIFY,
        contentJson,
      },
    })
    await prisma.album.update({
      where: { id: albumId },
      data: { publicCaseStatus: PUBLIC_CASE_STATUS.NEED_MODIFY },
    })
  } else if (!album.publicCaseStatus || album.publicCaseStatus === 'private') {
    await prisma.album.update({
      where: { id: albumId },
      data: { publicCaseStatus: 'private' },
    })
  }

  return {
    status: 'audit_failed',
    pipelineStatus,
    draft: merchantCaseDraft,
    audit: caseGeoAudit,
    meta: caseGeoMeta,
    message: '存在系统硬拦项，请处理后再发布。',
    canPublish: false,
  }
}

/**
 * 商家确认发布 → 直接上店页（2026-09-03：不挡真实性机审；须承诺 + 公开强制脱敏）
 */
async function confirmMerchantPublicCasePublish(
  albumId,
  {
    storeId,
    merchantId,
    draft,
    authenticityCommitment = false,
    useDesensitizeTool = true,
  } = {},
) {
  const {
    assertMerchantAlbum,
    saveMerchantCaseDraft,
    loadAlbum,
  } = require('./service-album.service')
  const { readPackageFromAlbum } = require('./album-content-package.service')
  const { normalizeMerchantCaseDraft } = require('./merchant-case-draft.service')
  const { auditMerchantCaseDraft } = require('./case-llm-audit.service')
  const {
    computeCaseSkeletonHash,
    draftCopyFingerprint,
  } = require('../utils/case-skeleton-hash')
  const { buildMerchantChecklistView } = require('./album-checklist.service')
  const { buildMerchantView } = require('./service-album.service')
  const { CASE_GEO_PIPELINE_STATUS } = require('../constants/case-geo-audit')

  if (!authenticityCommitment) {
    const err = new Error('请先勾选真实性承诺后再公开')
    err.status = 400
    err.code = 'AUTHENTICITY_COMMITMENT_REQUIRED'
    throw err
  }
  if (!useDesensitizeTool) {
    const err = new Error('公开案例须使用脱敏工具并完成预览确认')
    err.status = 400
    err.code = 'DESENSITIZE_REQUIRED'
    throw err
  }

  let album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)

  const pc = album.publicCase
  const readyStatuses = [
    PUBLIC_CASE_STATUS.AUDIT_PASSED,
    PUBLIC_CASE_STATUS.NEED_MODIFY,
  ]
  if (!pc || !readyStatuses.includes(pc.status)) {
    // 允许仅有草稿时：须已生成过 contentJson
    const pkg0 = readPackageFromAlbum(album) || {}
    if (!pkg0.merchantCaseDraft && !(pc && pc.contentJson && pc.contentJson.merchantCaseDraft)) {
      const err = new Error('请先生成案例稿后再发布')
      err.status = 409
      err.code = 'DRAFT_REQUIRED'
      throw err
    }
  }

  let merchantCaseDraft = null
  if (draft && typeof draft === 'object') {
    const saved = await saveMerchantCaseDraft(albumId, storeId, merchantId, {
      confirm: true,
      draft,
    })
    merchantCaseDraft = normalizeMerchantCaseDraft(saved.draft)
    album = await loadAlbum(albumId)
  } else {
    const pkg = readPackageFromAlbum(album)
    merchantCaseDraft = normalizeMerchantCaseDraft(
      (pc && pc.contentJson && pc.contentJson.merchantCaseDraft) ||
        (pkg && pkg.merchantCaseDraft),
    )
  }

  if (!merchantCaseDraft || !merchantCaseDraft.confirmedAt) {
    const err = new Error('请先确认案例稿')
    err.status = 409
    err.code = 'CASE_DRAFT_REQUIRED'
    throw err
  }

  const pkg = readPackageFromAlbum(album) || {}
  const prevMeta = pkg.caseGeoMeta || (pc && pc.contentJson && pc.contentJson.caseGeoMeta) || {}
  const checklist = buildMerchantChecklistView(album, album.images || [])
  const skeletonHash = computeCaseSkeletonHash({
    album,
    checklistItems: checklist.items || [],
    images: album.images || [],
  })
  if (prevMeta.skeletonHash && prevMeta.skeletonHash !== skeletonHash) {
    const err = new Error('相册素材已变，请重新生成案例后再发布')
    err.status = 409
    err.code = 'SKELETON_CHANGED'
    throw err
  }

  const copyFingerprint = draftCopyFingerprint(merchantCaseDraft)
  let audit = pkg.caseGeoAudit || (pc && pc.contentJson && pc.contentJson.caseGeoAudit) || null

  const needReaudit =
    !audit ||
    (prevMeta.copyFingerprint && prevMeta.copyFingerprint !== copyFingerprint)

  if (needReaudit) {
    const view = buildMerchantView(album)
    audit = await auditMerchantCaseDraft({
      album,
      albumView: view,
      draft: merchantCaseDraft,
    })
    const hardBlocks = Array.isArray(audit.hardBlocks) ? audit.hardBlocks : []
    const canPublish = hardBlocks.length === 0
    const caseGeoMeta = {
      ...prevMeta,
      pipelineStatus: canPublish
        ? CASE_GEO_PIPELINE_STATUS.AUDIT_PASSED
        : CASE_GEO_PIPELINE_STATUS.AUDIT_FAILED,
      skeletonHash,
      copyFingerprint,
      reauditedAt: new Date().toISOString(),
      authenticityAdvisoryOnly: true,
    }
    const nextPkg = {
      ...pkg,
      merchantCaseDraft,
      caseGeoAudit: { ...audit, passed: canPublish, authenticityGateRemoved: true },
      caseGeoMeta,
    }
    await prisma.album.update({
      where: { id: albumId },
      data: { contentPackageJson: nextPkg },
    })
    if (pc) {
      await prisma.publicCase.update({
        where: { albumId },
        data: {
          status: canPublish
            ? PUBLIC_CASE_STATUS.AUDIT_PASSED
            : PUBLIC_CASE_STATUS.NEED_MODIFY,
          title: merchantCaseDraft.title || pc.title,
          summary: merchantCaseDraft.caseSummary || pc.summary,
          contentJson: {
            merchantCaseDraft,
            caseGeoAudit: nextPkg.caseGeoAudit,
            caseGeoMeta,
          },
        },
      })
    }
    if (!canPublish) {
      await prisma.album.update({
        where: { id: albumId },
        data: { publicCaseStatus: PUBLIC_CASE_STATUS.NEED_MODIFY },
      })
      const err = new Error(
        (hardBlocks[0] && hardBlocks[0].message) || '存在系统硬拦项，暂不可发布',
      )
      err.status = 409
      err.code = 'HARD_BLOCK'
      err.audit = audit
      throw err
    }
  }

  const hardBlocks = Array.isArray(audit && audit.hardBlocks) ? audit.hardBlocks : []
  if (hardBlocks.length) {
    const err = new Error((hardBlocks[0] && hardBlocks[0].message) || '存在系统硬拦项')
    err.status = 409
    err.code = 'HARD_BLOCK'
    throw err
  }

  const commitmentAt = new Date().toISOString()
  const afterAlbum = await loadAlbum(albumId)
  const afterPkg = readPackageFromAlbum(afterAlbum) || pkg
  await prisma.album.update({
    where: { id: albumId },
    data: {
      contentPackageJson: {
        ...afterPkg,
        hostMeta: {
          ...(afterPkg.hostMeta || {}),
          hosted: true,
          visibility: 'public',
          authenticityCommitmentAt: commitmentAt,
          useDesensitizeTool: true,
          sourceLabel: '商家上传',
          updatedAt: commitmentAt,
        },
        caseGeoMeta: {
          ...(afterPkg.caseGeoMeta || prevMeta),
          pipelineStatus: CASE_GEO_PIPELINE_STATUS.PUBLISHED,
          publishedAt: commitmentAt,
        },
      },
    },
  })

  const published = await commitPublicCaseGoLive(albumId, {
    authorizationTier: 'merchant_published',
  })

  try {
    const { emitCaseGeoObs } = require('../utils/case-geo-obs')
    emitCaseGeoObs('case.publish', {
      albumId,
      authenticityScore: audit && audit.authenticityScore,
      authenticityCommitmentAt: commitmentAt,
    })
  } catch (_) {
    /* ignore */
  }

  return {
    ...published,
    audit,
    message: '已发布到店页',
  }
}

module.exports = {
  publishServicePublicCase,
  commitPublicCaseGoLive,
  generateMerchantPublicCase,
  confirmMerchantPublicCasePublish,
  publishMerchantColdStartPublicCase,
  enqueueAlbumCaseForReview,
  promoteAlbumCaseToPendingReview,
  buildCaseDraft,
  buildNodesFromTask,
  resolvePublicCaseNodes,
  pickCover,
  resolvePublishTask,
  assertPublicCasePublishable,
  assertPublicViewPublishable,
}
