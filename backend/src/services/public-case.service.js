const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { resolvePublicCaseMediaUrl } = require('../lib/media-url')
const { getTaskById } = require('./desensitize.service')
const { buildAlbumView } = require('./service-album.service')
const { buildPublicCasePrice, buildPublicCaseDbPriceColumns } = require('../utils/album-price')
const { buildPreMaskTaskId, buildMerchantColdStartTaskId, BIZ_TYPE } = require('./desensitize.constants')
const { mergeContentJsonGeo } = require('../schemas/case-geo-content.schema')
const { assertGeoPublishable } = require('../utils/case-geo-quality')
const { buildAlbumGeoPreview } = require('./album-geo-preview.service')

function buildVehicleTitle(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return '该车辆'
  const parts = [vehicle.brand, vehicle.series].filter(Boolean)
  return parts.join(' ') || '该车辆'
}

function buildCaseTitle({ city = '杭州', vehicle, serviceName = '维修服务' }) {
  const vehicleTitle = buildVehicleTitle(vehicle)
  return `${city}${vehicleTitle} · ${serviceName}`.trim()
}

function buildCaseSummary({ vehicle, serviceName = '维修服务', authorizationTier, coldStart = false }) {
  const vehicleTitle = buildVehicleTitle(vehicle)
  if (coldStart) {
    return `该案例为门店服务留档，记录了${vehicleTitle}进行${serviceName}的维修过程摘要。图片已脱敏，展示价格为系统参考区间。`
  }
  if (authorizationTier === 'anonymous') {
    return `该案例经车主匿名授权，记录了${vehicleTitle}进行${serviceName}的维修过程摘要。`
  }
  return `该案例经车主授权，记录了${vehicleTitle}进行${serviceName}的维修过程。图片已脱敏并通过平台审核。`
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

function buildNodesFromTask(nodes, task) {
  const assets = taskAssets(task)
  if (!assets.length) {
    return (nodes || []).map((node) => ({
      ...node,
      images: [],
    }))
  }

  const assetMap = {}
  assets.forEach((asset) => {
    const idx = asset.idx != null ? asset.idx : asset.index
    const nodeId = asset.nodeId || ''
    const key = `${nodeId}_${idx}`
    assetMap[key] = asset.maskedUrl || asset.preMaskedUrl || ''
  })

  return (nodes || []).map((node) => {
    const nodeId = node.id || node.nodeId || ''
    return {
      ...node,
      images: (node.images || [])
        .map((url, idx) => {
          const fromTask = assetMap[`${nodeId}_${idx}`]
          const safe = resolvePublicCaseMediaUrl(fromTask)
          if (safe) return safe
          return resolvePublicCaseMediaUrl(typeof url === 'string' ? url : '')
        })
        .filter(Boolean),
    }
  })
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
        vehicleText: `${buildVehicleTitle(vehicle)}（已脱敏）`,
        tags: coldStart ? ['desensitized'] : ['authorized', 'desensitized', 'audited'],
        coldStart,
      },
      geoPack.geo
    ),
  }
}

function canAccessMerchantAlbum(album, storeId, merchantId) {
  if (!album) return false
  if (merchantId && album.merchantId === merchantId) return true
  if (storeId && album.storeId === storeId) return true
  return false
}

async function resolvePublishTask(albumId, payload = {}) {
  if (payload.taskId) {
    const task = await getTaskById(payload.taskId)
    if (task && taskAssets(task).length) return task
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

  const authorizationTier = album.authorization.tier || album.authorizationTier || 'named'
  const albumView = buildAlbumView(album)
  assertGeoPublishable(albumView, { coldStart: false })
  const task = await resolvePublishTask(albumId, payload)
  const draft = buildCaseDraft(albumView, task, authorizationTier, {
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
      authorizationTier,
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
      authorizationTier,
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
    },
  })

  const { scheduleCaseGeoLlmOptimization } = require('./case-geo-llm.service')
  scheduleCaseGeoLlmOptimization(caseId)

  return {
    caseItem: {
      id: caseId,
      albumId,
      title: draft.title,
      authorizationTier,
      status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
    },
    status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
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
  if (!album || !canAccessMerchantAlbum(album, storeId, merchantId)) {
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
  pickCover,
  resolvePublishTask,
}
