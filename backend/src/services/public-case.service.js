const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { getTaskById } = require('./desensitize.service')
const { buildAlbumView } = require('./service-album.service')
const { buildPublicCasePrice } = require('../utils/album-price')

function buildVehicleTitle(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return '该车辆'
  const parts = [vehicle.brand, vehicle.series].filter(Boolean)
  return parts.join(' ') || '该车辆'
}

function buildCaseTitle({ city = '杭州', vehicle, serviceName = '维修服务' }) {
  const vehicleTitle = buildVehicleTitle(vehicle)
  return `${city}${vehicleTitle} · ${serviceName}`.trim()
}

function buildCaseSummary({ vehicle, serviceName = '维修服务', authorizationTier }) {
  const vehicleTitle = buildVehicleTitle(vehicle)
  if (authorizationTier === 'anonymous') {
    return `该案例经车主匿名授权，记录了${vehicleTitle}进行${serviceName}的维修过程摘要。`
  }
  return `该案例经车主授权，记录了${vehicleTitle}进行${serviceName}的维修过程。图片已脱敏并通过平台审核。`
}

function pickCover(nodes) {
  for (const node of nodes || []) {
    for (const img of node.images || []) {
      const url = typeof img === 'string' ? img : img.maskedUrl || img.url
      if (url) return url
    }
  }
  return ''
}

function buildNodesFromTask(nodes, task) {
  if (!task || !task.assets) return nodes
  const assetMap = {}
  task.assets.forEach((asset) => {
    const key = `${asset.nodeId}_${asset.index}`
    assetMap[key] = asset.maskedUrl || asset.preMaskedUrl || asset.url
  })
  return (nodes || []).map((node) => ({
    ...node,
    images: (node.images || []).map((url, idx) => {
      const masked = assetMap[`${node.id}_${idx}`]
      return masked || url
    }),
  }))
}

function buildCaseDraft(albumView, task, authorizationTier) {
  const caseId = `case_${albumView.albumId.replace(/^alb_/, '')}`
  const vehicle = albumView.vehicle || {}
  const serviceName = albumView.serviceName || '维修服务'
  const city = albumView.store?.city || '杭州'
  const nodesWithMask = buildNodesFromTask(albumView.nodes, task)
  const publicPrice = buildPublicCasePrice(
    {
      ...albumView,
      authorizationTier,
      userPhone: albumView.userPhone,
    },
    { hasUserAuthorization: true }
  )

  return {
    id: caseId,
    albumId: albumView.albumId,
    authorizationTier,
    title: buildCaseTitle({ city, vehicle, serviceName }),
    summary: albumView.storeNote || buildCaseSummary({ vehicle, serviceName, authorizationTier }),
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
    contentJson: {
      nodes: nodesWithMask,
      vehicleText: `${buildVehicleTitle(vehicle)}（已脱敏）`,
      tags: ['authorized', 'desensitized', 'audited'],
    },
  }
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
  let task = null
  if (payload.taskId) {
    task = await getTaskById(payload.taskId)
  }

  const draft = buildCaseDraft(albumView, task, authorizationTier)
  const caseId = draft.id

  await prisma.publicCase.upsert({
    where: { albumId },
    create: {
      id: caseId,
      albumId,
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      authorizationTier,
      title: draft.title,
      summary: draft.summary,
      coverImage: draft.coverImage,
      contentJson: draft.contentJson,
      storeId: draft.storeId,
      storeName: draft.storeName,
      serviceName: draft.serviceName,
      city: draft.city,
      minAmount: draft.minAmount,
      maxAmount: draft.maxAmount,
      priceMode: draft.priceMode,
      publishedAt: new Date(),
    },
    update: {
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      authorizationTier,
      title: draft.title,
      summary: draft.summary,
      coverImage: draft.coverImage,
      contentJson: draft.contentJson,
      publishedAt: new Date(),
    },
  })

  await prisma.album.update({
    where: { id: albumId },
    data: {
      publicCaseStatus: 'public_approved',
      status: 'published',
    },
  })

  return {
    caseItem: {
      id: caseId,
      albumId,
      title: draft.title,
      authorizationTier,
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
    },
    status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
  }
}

module.exports = {
  publishServicePublicCase,
  buildCaseDraft,
}
