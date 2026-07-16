const { prisma } = require('../lib/prisma')
const { newId, toIso } = require('../lib/ids')
const { PUBLIC_CASE_STATUS, RISK_LEVEL_ORDER } = require('../constants/v2')
const { resolveDisplayMediaUrl, resolvePublicCaseMediaUrl } = require('../lib/media-url')
const {
  buildPublicCasePrice,
  formatPlanAmountLabel,
  buildPublicCaseDbPriceColumns,
} = require('../utils/album-price')
const { getTaskById, retryAsset } = require('./desensitize.service')
const { ASSET_STATUS } = require('./desensitize.constants')
const { getMediaById } = require('./media.service')
const { buildPreMaskTaskId } = require('./desensitize.constants')
const { listPrivacyDetectionsByImageId } = require('./privacy-detection.service')
const { ensureMediaRecordFromUrl } = require('./media.service')
const { buildCaseDraft, resolvePublishTask } = require('./public-case.service')
const { buildAlbumView } = require('./service-album.service')
const { buildCaseArticlePayload } = require('./case-article-generator.service')
const { stampPublishedH5OnPayload } = require('./case-article-publish.service')
const { ensureUniqueCaseSlug, resolveCaseCanonicalPath } = require('../utils/case-slug')
const {
  mapCaseArticleForApi,
  mapCaseSeoForApi,
  resolveGeoReadableFields,
  mergeContentJsonGeo,
} = require('../schemas/case-geo-content.schema')
const { extractSnapshotFromContentJson, resolveSnapshotVersion } = require('../schemas/case-snapshot.schema')
const { resolveCaseGeoEditPolicy } = require('../constants/case-enrichment')
const { CASE_ARTICLE_GENERATION_SOURCE } = require('../constants/case-article-status')
const {
  partitionCaseFaq,
  mergeCaseFaqForStorage,
  hasCaseFaqContent,
} = require('../utils/case-faq-links')
const { buildAlbumGeoPreview } = require('./album-geo-preview.service')
const { applyManualGeoOverrides } = require('./admin-case-article.service')
const {
  GATE_B_SCOPE_LABEL,
  normalizeGateBRejectType,
  resolveGateBRejectMeta,
  listGateBRejectReasonOptions,
  buildGateBUserPayload,
} = require('../constants/case-gate-b')

function resolveCaseSource(album) {
  if (!album) return 'user_authorized'
  if (album.authorization?.status === 'authorized') return 'user_authorized'
  const hasOwner =
    Boolean(String(album.userId || '').trim()) || Boolean(String(album.userPhone || '').trim())
  if (!hasOwner) return 'cold_start'
  return 'merchant_history'
}

function sourceLabel(source) {
  const map = {
    cold_start: '冷启动',
    user_authorized: '用户授权案例',
    merchant_history: '商家历史案例',
  }
  return map[source] || source
}

function maxRiskLevel(levels) {
  let best = ''
  let bestRank = 0
  ;(levels || []).forEach((level) => {
    const key = String(level || '').toLowerCase()
    const rank = RISK_LEVEL_ORDER[key] || 0
    if (rank > bestRank) {
      bestRank = rank
      best = key
    }
  })
  return best || 'low'
}

function isHighRisk(level) {
  const rank = RISK_LEVEL_ORDER[String(level || '').toLowerCase()] || 0
  return rank >= RISK_LEVEL_ORDER.medium
}

async function loadPreMaskTask(albumId) {
  const taskId = buildPreMaskTaskId(albumId)
  return getTaskById(taskId, { includeDetections: true, roles: ['system'] })
}

function aggregateTaskRisk(task) {
  const assets = task?.rawAssets || []
  const levels = assets.map((a) => a.riskLevel).filter(Boolean)
  const tags = new Set()
  assets.forEach((a) => {
    ;(a.riskTags || []).forEach((t) => tags.add(t))
  })
  return {
    riskLevel: maxRiskLevel(levels),
    riskTags: [...tags],
    imageCount: assets.length,
  }
}

function buildListWhere(query = {}) {
  const tab = String(query.tab || 'pending').toLowerCase()
  const where = {}

  if (tab === 'pending') {
    where.status = PUBLIC_CASE_STATUS.PENDING_REVIEW
  } else if (tab === 'approved') {
    where.status = PUBLIC_CASE_STATUS.PUBLIC_APPROVED
  } else if (tab === 'rejected') {
    where.status = {
      in: [
        PUBLIC_CASE_STATUS.REJECTED,
        PUBLIC_CASE_STATUS.USER_REJECTED,
        PUBLIC_CASE_STATUS.NEED_MODIFY,
      ],
    }
  } else if (tab === 'need_modify') {
    where.status = PUBLIC_CASE_STATUS.NEED_MODIFY
  } else if (tab === 'high_risk') {
    where.status = PUBLIC_CASE_STATUS.PENDING_REVIEW
  } else {
    where.status = PUBLIC_CASE_STATUS.PENDING_REVIEW
  }

  if (query.storeId) where.storeId = String(query.storeId)
  if (query.keyword) {
    const kw = String(query.keyword)
    where.OR = [
      { title: { contains: kw } },
      { serviceName: { contains: kw } },
      { city: { contains: kw } },
      { storeName: { contains: kw } },
      { summary: { contains: kw } },
    ]
  }

  return { tab, where }
}

async function listAdminCases(query = {}) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20))
  const { tab, where } = buildListWhere(query)

  const rows = await prisma.publicCase.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      album: {
        include: { authorization: true },
      },
    },
  })

  const items = []
  for (const row of rows) {
    const album = row.album
    const source = album ? resolveCaseSource(album) : 'user_authorized'
    let riskLevel = 'low'
    let imageCount = 0
    if (album) {
      const task = await loadPreMaskTask(album.id)
      const agg = aggregateTaskRisk(task)
      riskLevel = agg.riskLevel
      imageCount = album.imageCount || agg.imageCount
    }
    if (query.source && query.source !== source) continue
    if (tab === 'high_risk' && !isHighRisk(riskLevel)) continue
    if (query.riskLevel && query.riskLevel !== riskLevel) continue

    items.push({
      caseId: row.id,
      albumId: row.albumId,
      title: row.title,
      source,
      sourceLabel: sourceLabel(source),
      storeId: row.storeId,
      storeName: row.storeName,
      serviceName: row.serviceName,
      city: row.city || '',
      status: row.status,
      riskLevel,
      imageCount,
      authorizationStatus: album?.authorization?.status || '',
      submittedAt: toIso(row.updatedAt),
      createdAt: toIso(row.createdAt),
    })
  }

  let total = await prisma.publicCase.count({ where })
  if (tab === 'high_risk' || query.source || query.riskLevel) {
    total = items.length
  }

  return {
    list: items,
    page,
    pageSize,
    total,
    tab,
  }
}

function resolveDesensitizeDisplayStatus(assetStatus, mediaDesensitizeStatus) {
  if (assetStatus === ASSET_STATUS.MASKED_READY || assetStatus === ASSET_STATUS.MANUAL_MASKED) {
    return { key: 'ready', label: '已脱敏' }
  }
  if (mediaDesensitizeStatus === 'need_manual') {
    return { key: 'need_manual', label: '需人工' }
  }
  if (assetStatus === ASSET_STATUS.MASK_FAILED || mediaDesensitizeStatus === 'failed') {
    return { key: 'failed', label: '脱敏失败' }
  }
  if (assetStatus === ASSET_STATUS.MASKING) {
    return { key: 'processing', label: '处理中' }
  }
  return { key: 'pending', label: '待脱敏' }
}

function buildDesensitizeSummary(mediaAssets) {
  const summary = {
    total: mediaAssets.length,
    readyCount: 0,
    failedCount: 0,
    needManualCount: 0,
    pendingCount: 0,
    hasBlockingIssues: false,
  }
  mediaAssets.forEach((asset) => {
    const key = asset.desensitizeDisplay?.key || ''
    if (key === 'ready') summary.readyCount += 1
    else if (key === 'need_manual') summary.needManualCount += 1
    else if (key === 'failed') summary.failedCount += 1
    else summary.pendingCount += 1
  })
  summary.hasBlockingIssues = summary.failedCount + summary.needManualCount + summary.pendingCount > 0
  return summary
}

async function buildMediaAssetsForDetail(album, task) {
  const assetByKey = {}
  ;(task?.rawAssets || []).forEach((asset) => {
    const key = `${asset.nodeId}_${asset.idx != null ? asset.idx : asset.index}`
    assetByKey[key] = asset
  })

  const nodeTitleMap = {}
  ;(album.nodes || []).forEach((n) => {
    nodeTitleMap[n.nodeId] = n.title
  })

  const items = []
  for (const img of album.images || []) {
    const key = `${img.nodeId}_${img.idx}`
    const matched = assetByKey[key] || {}
    const maskedUrl =
      resolvePublicCaseMediaUrl(matched.maskedUrl || matched.preMaskedUrl || '') ||
      resolveDisplayMediaUrl(matched.maskedUrl || matched.preMaskedUrl || '')
    let privacyDetections = matched.privacyDetections || []
    if (!privacyDetections.length && matched.mediaId) {
      privacyDetections = await listPrivacyDetectionsByImageId(matched.mediaId, {
        caseId: '',
        includeResultJson: true,
      })
    }
    if (!matched.mediaId && img.rawUrl) {
      const media = await ensureMediaRecordFromUrl(img.rawUrl)
      if (media?.id) {
        privacyDetections = await listPrivacyDetectionsByImageId(media.id, {
          includeResultJson: true,
        })
      }
    }

    let mediaId = matched.mediaId || ''
    let mediaDesensitizeStatus = ''
    if (!mediaId && img.rawUrl) {
      const media = await ensureMediaRecordFromUrl(img.rawUrl)
      if (media?.id) {
        mediaId = media.id
        mediaDesensitizeStatus = media.desensitizeStatus || ''
      }
    } else if (mediaId) {
      const media = await getMediaById(mediaId)
      mediaDesensitizeStatus = media?.desensitizeStatus || ''
    }
    const assetStatus = matched.status || ''
    const desensitizeDisplay = resolveDesensitizeDisplayStatus(
      assetStatus,
      mediaDesensitizeStatus
    )

    items.push({
      imageId: img.id,
      assetId: matched.id || key,
      mediaId,
      nodeId: img.nodeId,
      nodeTitle: nodeTitleMap[img.nodeId] || img.nodeId,
      idx: img.idx,
      maskedUrl,
      riskLevel: matched.riskLevel || '',
      riskTags: matched.riskTags || [],
      privacyDetections,
      assetStatus,
      mediaDesensitizeStatus,
      desensitizeDisplay,
      canRetry: desensitizeDisplay.key === 'failed' || desensitizeDisplay.key === 'need_manual',
    })
  }

  return items
}

async function getAdminCaseDetail(caseId) {
  const row = await prisma.publicCase.findUnique({
    where: { id: caseId },
    include: {
      album: {
        include: {
          nodes: { orderBy: { sortOrder: 'asc' } },
          images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
          authorization: true,
        },
      },
    },
  })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  const album = row.album
  if (!album) {
    const err = new Error('关联相册不存在')
    err.status = 404
    throw err
  }

  const task = await loadPreMaskTask(album.id)
  const riskAgg = aggregateTaskRisk(task)
  const source = resolveCaseSource(album)
  const albumView = buildAlbumView(album)
  const publicPrice = buildPublicCasePrice(
    { ...albumView, authorizationTier: row.authorizationTier },
    { hasUserAuthorization: source === 'user_authorized' }
  )

  const reviewLogs = await fetchCaseReviewLogs(caseId)
  const mediaAssets = await buildMediaAssetsForDetail(album, task)
  const desensitizeSummary = buildDesensitizeSummary(mediaAssets)
  const contentJson = row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  const { inline, links } = partitionCaseFaq(contentJson.faq)
  const faq = links
  const faqInline = inline
  const geoPack = buildAlbumGeoPreview(
    { ...albumView, authorizationTier: row.authorizationTier },
    { coldStart: source === 'cold_start' }
  )
  const geoReadable = resolveGeoReadableFields(row)
  const snapshot = extractSnapshotFromContentJson(contentJson)
  const geoEditPolicy = resolveCaseGeoEditPolicy(contentJson)

  return {
    caseId: row.id,
    albumId: row.albumId,
    title: row.title,
    summary: row.summary,
    status: row.status,
    source,
    sourceLabel: sourceLabel(source),
    storeId: row.storeId,
    storeName: row.storeName,
    serviceName: row.serviceName,
    city: row.city,
    authorizationTier: row.authorizationTier,
    riskLevel: riskAgg.riskLevel,
    riskTags: riskAgg.riskTags,
    imageCount: album.imageCount || riskAgg.imageCount,
    price: {
      priceMode: row.priceMode || publicPrice.priceMode,
      minAmount: row.minAmount,
      maxAmount: row.maxAmount,
      planAmount: publicPrice.planAmount,
      label: formatPlanAmountLabel(publicPrice.planAmount),
    },
    authorization: album.authorization
      ? {
          agreed: album.authorization.agreed,
          status: album.authorization.status,
          tier: album.authorization.tier,
          updatedAt: toIso(album.authorization.updatedAt),
        }
      : null,
    vehicle: album.vehicleJson || {},
    contentJson,
    faq,
    faqInline,
    preMaskTaskId: task?.taskId || buildPreMaskTaskId(album.id),
    preMaskStatus: task?.preMaskStatus || '',
    desensitizeSummary,
    mediaAssets,
    reviewLogs: reviewLogs.map((log) => ({
      id: log.id,
      reviewAction: log.reviewAction,
      reviewComment: log.reviewComment,
      beforeStatus: log.beforeStatus,
      afterStatus: log.afterStatus,
      riskLevel: log.riskLevel,
      reviewerId: log.reviewerId,
      createdAt: toIso(log.createdAt),
    })),
    submittedAt: toIso(row.updatedAt),
    publishedAt: row.publishedAt ? toIso(row.publishedAt) : '',
    articleStatus: row.articleStatus || '',
    slug: row.slug || '',
    canonicalPath: row.canonicalPath || '',
    geoQuality: geoPack.geoQuality,
    geoPreview: geoPack.geoPreview,
    aiSummary: row.aiSummary || geoReadable.aiSummary || '',
    articleBody: row.articleBody || geoReadable.articleBody || '',
    seo: mapCaseSeoForApi(row),
    article: mapCaseArticleForApi(row),
    geo: geoReadable.geo || {},
    geoLlm: {
      status: geoReadable.geo?.llmStatus || '',
      generatedAt: geoReadable.geo?.llmGeneratedAt || '',
      error: geoReadable.geo?.llmError || '',
      adoptedAt: geoReadable.geo?.llmAdoptedAt || '',
    },
    gateScope: GATE_B_SCOPE_LABEL,
    gateBRejectReasonOptions: listGateBRejectReasonOptions(),
    gateBReject: buildGateBUserPayload(row),
    snapshotVersion: resolveSnapshotVersion(contentJson),
    snapshotFrozen: geoEditPolicy.frozen,
    enrichmentVersion: row.enrichmentVersion || geoReadable.enrichment?.version || 0,
    enrichmentEditableFields: {
      top: geoEditPolicy.topFields,
      block: geoEditPolicy.blockFields,
    },
    snapshotPreview: snapshot
      ? {
          title: snapshot.title || row.title,
          summary: snapshot.summary || row.summary,
          articleBodyLength: String(snapshot.articleBody || row.articleBody || '').length,
          nodeCount: Array.isArray(snapshot.nodes) ? snapshot.nodes.length : 0,
          frozenAt: snapshot.frozenAt || '',
        }
      : null,
    trustMeta: geoReadable.trustMeta || geoReadable.enrichment?.trustMeta || null,
  }
}

async function fetchCaseReviewLogs(caseId) {
  if (!prisma.caseReviewLog) {
    console.warn(
      '[admin-case] prisma.caseReviewLog 不可用，请执行 npm run db:generate && npm run db:migrate'
    )
    return []
  }
  return prisma.caseReviewLog.findMany({
    where: { caseId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

async function appendReviewLog({
  caseId,
  reviewerId,
  reviewAction,
  reviewComment,
  beforeStatus,
  afterStatus,
  riskLevel = '',
}) {
  if (!prisma.caseReviewLog) {
    console.warn('[admin-case] 跳过审核留痕：case_review_log 表未就绪')
    return
  }
  await prisma.caseReviewLog.create({
    data: {
      id: newId('crl'),
      caseId,
      reviewerId: reviewerId || 'admin_system',
      reviewAction,
      reviewComment: reviewComment || '',
      beforeStatus,
      afterStatus,
      riskLevel,
    },
  })
}

function shouldSkipUserAuthorizedQualityGates(source) {
  return source === 'user_authorized'
}

async function assertCaseDesensitizeReady(caseId, options = {}) {
  const detail = await getAdminCaseDetail(caseId)
  if (options.skipQualityGates || shouldSkipUserAuthorizedQualityGates(detail.source)) {
    return detail
  }
  if (detail.desensitizeSummary?.hasBlockingIssues) {
    const { failedCount = 0, needManualCount = 0, pendingCount = 0 } = detail.desensitizeSummary
    const err = new Error(
      `仍有 ${failedCount + needManualCount + pendingCount} 张图片未完成脱敏，请驳回并告知车主在小程序重试脱敏或手工打码`
    )
    err.status = 409
    err.code = 'DESENSITIZE_INCOMPLETE'
    throw err
  }
  return detail
}

async function approveAdminCase(caseId, { reviewerId, comment = '' } = {}) {
  const row = await prisma.publicCase.findUnique({ where: { id: caseId } })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  if (row.status !== PUBLIC_CASE_STATUS.PENDING_REVIEW) {
    const err = new Error('当前状态不可通过')
    err.status = 409
    throw err
  }

  const album = await prisma.album.findUnique({
    where: { id: row.albumId },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
      authorization: true,
      publicCase: true,
    },
  })
  const caseSource = resolveCaseSource(album)
  await assertCaseDesensitizeReady(caseId, {
    skipQualityGates: shouldSkipUserAuthorizedQualityGates(caseSource),
  })

  const contentJson =
    row.contentJson && typeof row.contentJson === 'object' ? { ...row.contentJson } : {}
  const snapshot = extractSnapshotFromContentJson(contentJson)
  const now = new Date()

  if (snapshot) {
    const { resolveCaseSeoNoindexForStore } = require('./merchant-subscription.service')
    let slug = row.slug || ''
    if (!slug) {
      slug = await ensureUniqueCaseSlug(
        prisma,
        row.title || snapshot.title || caseId,
        caseId
      )
    }
    const canonicalPath =
      row.canonicalPath ||
      resolveCaseCanonicalPath({
        slug,
        caseId,
      })
    const seoNoindexBase = await resolveCaseSeoNoindexForStore(row.storeId, {
      city: row.city || snapshot.city,
      serviceName: row.serviceName || snapshot.serviceName,
      imageCount: (snapshot.nodes || []).reduce(
        (sum, n) => sum + (n.images || []).length,
        0
      ),
    })
    const seoNoindex = seoNoindexBase
    const publishPayload = { contentJson }
    stampPublishedH5OnPayload(publishPayload)
    const { CASE_ARTICLE_STATUS: ARTICLE_STATUS } = require('../constants/case-article-status')
    const {
      buildEnrichmentFromPublicCaseRow,
      mergeCaseEnrichmentPatch,
    } = require('../schemas/case-enrichment.schema')
    const publishedAtIso = now.toISOString()
    const enrichment = mergeCaseEnrichmentPatch(
      buildEnrichmentFromPublicCaseRow(row),
      {
        publishedH5At: publishedAtIso,
        seoNoindex,
        slug,
        canonicalPath,
        geo: { publishedH5At: publishedAtIso },
      },
      { bumpVersion: false, previousVersion: row.enrichmentVersion ?? 0 }
    )
    await prisma.publicCase.update({
      where: { id: caseId },
      data: {
        status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
        coverImage: row.coverImage || snapshot.coverImage || '',
        contentJson: publishPayload.contentJson,
        publishedAt: now,
        seoNoindex,
        slug,
        canonicalPath,
        articleStatus: publishPayload.articleStatus || ARTICLE_STATUS.PUBLISHED_H5,
        enrichmentJson: enrichment,
        enrichmentVersion: enrichment.version,
        gateBRejectType: '',
        gateBRejectReason: '',
      },
    })
  } else {
    const hasUserAuth = album.authorization?.status === 'authorized'
    const task = await resolvePublishTask(row.albumId, {})
    const hasOwner =
      Boolean(String(album.userId || '').trim()) ||
      Boolean(String(album.userPhone || '').trim())
    const coldStart = !hasUserAuth && !hasOwner
    const albumView = buildAlbumView(album)
    const draft = buildCaseDraft(albumView, task, row.authorizationTier, {
      coldStart,
      hasUserAuthorization: hasUserAuth,
      serviceItemId: album.serviceItemId || '',
      templateId: album.templateId || '',
    })
    const priceColumns = buildPublicCaseDbPriceColumns(draft)
    let articlePayload = buildCaseArticlePayload({
      caseId,
      draft,
      albumView,
      coldStart,
      hasUserAuthorization: hasUserAuth,
      serviceItemId: album.serviceItemId || '',
      templateId: album.templateId || '',
      previousArticleVersion: row.articleVersion || 0,
    })
    articlePayload = applyManualGeoOverrides(row, articlePayload)
    const prevGeo =
      row.contentJson && typeof row.contentJson === 'object' && row.contentJson.geo
        ? row.contentJson.geo
        : {}
    if (prevGeo.generationSource === CASE_ARTICLE_GENERATION_SOURCE.LLM_V1) {
      articlePayload.contentJson = mergeContentJsonGeo(articlePayload.contentJson, {
        generationSource: prevGeo.generationSource,
        generationVersion: prevGeo.generationVersion || 'llm_v1',
        riskChecked: true,
        llmStatus: prevGeo.llmStatus,
        llmAdoptedAt: prevGeo.llmAdoptedAt,
      })
    }
    articlePayload.slug = await ensureUniqueCaseSlug(prisma, articlePayload.slug, caseId)
    articlePayload.canonicalPath = resolveCaseCanonicalPath({
      slug: articlePayload.slug,
      caseId,
    })
    const { resolveCaseSeoNoindexForStore } = require('./merchant-subscription.service')
    articlePayload.seoNoindex = await resolveCaseSeoNoindexForStore(row.storeId, {
      city: row.city,
      serviceName: row.serviceName,
      imageCount: (album.images || []).length,
    })
    stampPublishedH5OnPayload(articlePayload)

    await prisma.publicCase.update({
      where: { id: caseId },
      data: {
        status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
        title: articlePayload.title,
        summary: articlePayload.summary,
        coverImage: draft.coverImage,
        contentJson: articlePayload.contentJson,
        minAmount: priceColumns.minAmount,
        maxAmount: priceColumns.maxAmount,
        priceMode: priceColumns.priceMode,
        publishedAt: now,
        seoTitle: articlePayload.seoTitle,
        seoDescription: articlePayload.seoDescription,
        aiSummary: articlePayload.aiSummary,
        articleBody: articlePayload.articleBody,
        articleStatus: articlePayload.articleStatus,
        articleVersion: articlePayload.articleVersion,
        articleGeneratedAt: articlePayload.articleGeneratedAt,
        seoNoindex: articlePayload.seoNoindex,
        slug: articlePayload.slug,
        canonicalPath: articlePayload.canonicalPath,
        gateBRejectType: '',
        gateBRejectReason: '',
      },
    })
  }

  await prisma.album.update({
    where: { id: row.albumId },
    data: {
      publicCaseStatus: 'public_approved',
      status: 'published',
    },
  })

  await appendReviewLog({
    caseId,
    reviewerId,
    reviewAction: 'approve',
    reviewComment: comment,
    beforeStatus: row.status,
    afterStatus: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
  })

  try {
    const { refreshCaseTrustMeta } = require('./case-trust-meta.service')
    await refreshCaseTrustMeta(caseId, {
      album,
      reviewedAt: now,
      reviewComment: comment,
    })
  } catch (e) {
    console.warn('[trust-meta] approve refresh', e && e.message)
  }

  try {
    const { mountCaseOnGeoPages } = require('./case-article-publish.service')
    await mountCaseOnGeoPages(caseId, prisma, { bumpVersion: true })
  } catch (e) {
    console.warn('[geo-mount] approve case', e && e.message)
  }

  const { notifyCaseAuditResult } = require('./notification.service')
  notifyCaseAuditResult({ album, approved: true, comment }).catch((e) => {
    console.warn('[notification] case approve', e && e.message)
  })

  return getAdminCaseDetail(caseId)
}

async function applyGateBReject(
  caseId,
  { reviewerId, comment = '', reasonType = '', reviewAction = 'reject' } = {}
) {
  const row = await prisma.publicCase.findUnique({
    where: { id: caseId },
    include: {
      album: { include: { authorization: true } },
    },
  })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  if (row.status !== PUBLIC_CASE_STATUS.PENDING_REVIEW) {
    const err = new Error('当前状态不可驳回')
    err.status = 409
    throw err
  }

  const normalized = normalizeGateBRejectType(reasonType)
  if (normalized.error === 'GATE_A_ONLY') {
    const err = new Error('商家留档合规类问题请在「相册完工合规（闸门 A）」处理，不在案例公示审核驳回')
    err.status = 400
    err.code = 'GATE_A_ONLY'
    throw err
  }
  const rejectType = normalized.type
  const meta = resolveGateBRejectMeta(rejectType)
  const rejectReason = String(comment || '').trim() || meta.label
  const afterStatus = PUBLIC_CASE_STATUS.NEED_MODIFY

  await prisma.publicCase.update({
    where: { id: caseId },
    data: {
      status: afterStatus,
      gateBRejectType: rejectType,
      gateBRejectReason: rejectReason,
    },
  })

  await prisma.album.update({
    where: { id: row.albumId },
    data: {
      publicCaseStatus: 'need_modify',
    },
  })

  await appendReviewLog({
    caseId,
    reviewerId,
    reviewAction,
    reviewComment: `${meta.label}：${rejectReason}`,
    beforeStatus: row.status,
    afterStatus,
  })

  const album = row.album
  const { notifyCaseAuditResult } = require('./notification.service')
  notifyCaseAuditResult({
    album,
    approved: false,
    comment: meta.userHint,
    rejectType,
  }).catch((e) => {
    console.warn('[notification] case gate-b reject', e && e.message)
  })

  return getAdminCaseDetail(caseId)
}

async function rejectAdminCase(caseId, { reviewerId, comment = '', reasonType = '' } = {}) {
  return applyGateBReject(caseId, {
    reviewerId,
    comment,
    reasonType,
    reviewAction: 'reject',
  })
}

async function requestModifyAdminCase(caseId, { reviewerId, comment = '', reasonType = '' } = {}) {
  return applyGateBReject(caseId, {
    reviewerId,
    comment,
    reasonType,
    reviewAction: 'request_modify',
  })
}

async function retryAdminCaseAsset(caseId, assetId, options = {}) {
  const row = await prisma.publicCase.findUnique({
    where: { id: caseId },
    select: { albumId: true },
  })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  const taskId = buildPreMaskTaskId(row.albumId)
  await retryAsset(taskId, assetId, {
    force: true,
    includeDetections: true,
    roles: ['system'],
  })
  if (options.skipDetail) return null
  return getAdminCaseDetail(caseId)
}

async function retryAllAdminCaseAssets(caseId) {
  const detail = await getAdminCaseDetail(caseId)
  const retryable = (detail.mediaAssets || []).filter((a) => a.canRetry)
  for (const asset of retryable) {
    await retryAdminCaseAsset(caseId, asset.assetId, { skipDetail: true })
  }
  return getAdminCaseDetail(caseId)
}

async function updateAdminCaseFaqLinks(caseId, payload = {}) {
  const row = await prisma.publicCase.findUnique({ where: { id: caseId } })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }

  const inlineInput = payload.faqInline != null ? payload.faqInline : payload.faq
  const linksInput = payload.faqLinks != null ? payload.faqLinks : payload.faq
  const hasSplitPayload = payload.faqInline != null || payload.faqLinks != null

  let faq = []
  if (hasSplitPayload) {
    faq = mergeCaseFaqForStorage(inlineInput || [], linksInput || [], { strict: true })
  } else if (Array.isArray(payload.faq)) {
    const parts = partitionCaseFaq(payload.faq)
    faq = mergeCaseFaqForStorage(parts.inline, parts.links, { strict: true })
  } else {
    faq = mergeCaseFaqForStorage([], [], { strict: true })
  }

  const content =
    row.contentJson && typeof row.contentJson === 'object' ? { ...row.contentJson } : {}
  if (faq.length) {
    content.faq = faq
  } else {
    delete content.faq
  }

  await prisma.publicCase.update({
    where: { id: caseId },
    data: { contentJson: content },
  })

  return getAdminCaseDetail(caseId)
}

module.exports = {
  listAdminCases,
  getAdminCaseDetail,
  approveAdminCase,
  rejectAdminCase,
  requestModifyAdminCase,
  applyGateBReject,
  retryAdminCaseAsset,
  retryAllAdminCaseAssets,
  updateAdminCaseFaqLinks,
  appendReviewLog,
  resolveCaseSource,
  sourceLabel,
}
