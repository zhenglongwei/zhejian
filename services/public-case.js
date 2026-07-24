/**
 * 服务相册授权 → 公开案例发布
 * MOCK: 本地 storage；联调后接 POST /api/user/service-albums/:albumId/public-case
 */
const { ENV } = require('./config')
const { post } = require('./request')
const { PUBLIC_AUTH_TIER } = require('../constants/case-authorization')
const { PUBLIC_CASE_STATUS } = require('../constants/public-case-status')
const { publishFromServiceAlbum } = require('./case')
const { fetchTask } = require('./desensitize')
const { buildCaseDraftFromServiceAlbum } = require('../utils/case-content')

const STORAGE_META = 'public_case_meta_v1'

function delay(ms = 320) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadMetaMap() {
  try {
    return wx.getStorageSync(STORAGE_META) || {}
  } catch (e) {
    return {}
  }
}

function saveMetaMap(map) {
  wx.setStorageSync(STORAGE_META, map)
}

function setPublicCaseMeta(albumId, patch) {
  const map = loadMetaMap()
  map[albumId] = {
    ...(map[albumId] || {}),
    ...patch,
    albumId,
    updatedAt: new Date().toISOString(),
  }
  saveMetaMap(map)
  return map[albumId]
}

function getPublicCaseMeta(albumId) {
  return loadMetaMap()[albumId] || null
}

function readServiceAlbumAuth(albumId) {
  try {
    const serviceAuth = wx.getStorageSync('service_album_auth_v1') || {}
    return serviceAuth[albumId] || null
  } catch (e) {
    return null
  }
}

function resolveAuthorizationTier(albumId) {
  const meta = getPublicCaseMeta(albumId)
  if (meta && meta.authorizationTier) {
    return meta.authorizationTier
  }
  const auth = readServiceAlbumAuth(albumId)
  if (auth && typeof auth === 'object' && auth.tier) {
    return auth.tier
  }
  if (auth === 'authorized') {
    return PUBLIC_AUTH_TIER.NAMED
  }
  return PUBLIC_AUTH_TIER.PRIVATE
}

function resolvePublicCaseUiStatus(albumId) {
  const meta = getPublicCaseMeta(albumId)
  if (meta && meta.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    return 'public_approved'
  }
  if (meta && meta.status === PUBLIC_CASE_STATUS.PENDING_REVIEW) {
    return 'pending_review'
  }
  if (meta && meta.status === PUBLIC_CASE_STATUS.USER_REJECTED) {
    return 'user_rejected'
  }
  const auth = readServiceAlbumAuth(albumId)
  if (auth === 'rejected' || (auth && auth.status === 'rejected')) {
    return 'user_rejected'
  }
  if (
    auth === 'authorized' ||
    (auth && (auth.status === 'authorized' || auth.agreed))
  ) {
    return 'pending_review'
  }
  return 'private'
}

/**
 * 服务相册用户确认脱敏后提交公开案例（mock 自动审核通过）
 */
async function submitServicePublicCaseReview(payload) {
  const { albumId, taskId } = payload || {}
  if (!albumId) {
    const err = new Error('缺少相册信息')
    err.code = 400
    throw err
  }

  if (ENV.mode !== 'mock') {
    return post(`/user/service-albums/${albumId}/public-case`, { taskId })
  }

  const { mockFetchServiceAlbum } = require('../mock/service-albums')
  const albumView = await mockFetchServiceAlbum(albumId)
  const authorizationTier = resolveAuthorizationTier(albumId)
  const album = {
    albumId: albumView.albumId,
    serviceName: albumView.serviceName,
    store: albumView.store,
    storeId: albumView.store?.id,
    storeName: albumView.store?.name,
    city: albumView.store?.city || '杭州',
    vehicle: albumView.vehicle,
    nodes: albumView.nodes,
    storeNote: albumView.storeNote,
    priceMode: albumView.priceMode,
    minAmount: albumView.minAmount,
    maxAmount: albumView.maxAmount,
  }

  let task = null
  if (taskId) {
    try {
      task = await fetchTask(taskId)
    } catch (e) {
      task = null
    }
  }

  setPublicCaseMeta(albumId, {
    status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
    authorizationTier,
    caseId: '',
  })

  await delay(420)

  const draft = buildCaseDraftFromServiceAlbum({
    album,
    task,
    authorizationTier,
  })
  const caseItem = publishFromServiceAlbum(draft)

  setPublicCaseMeta(albumId, {
    status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
    authorizationTier,
    caseId: caseItem.id,
  })

  return {
    caseItem,
    status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
    autoApproved: true,
    gateBRisk: 'low',
    message: '已发布到公开网站，同城车友可参考（已脱敏）',
  }
}

/** @deprecated V1 订单链路，R8 移除 */
async function submitOrderPublicCaseReview(payload) {
  return submitServicePublicCaseReview({
    albumId: payload && payload.albumId,
    taskId: payload && payload.taskId,
  })
}

module.exports = {
  getPublicCaseMeta,
  setPublicCaseMeta,
  resolvePublicCaseUiStatus,
  resolveAuthorizationTier,
  submitServicePublicCaseReview,
  submitOrderPublicCaseReview,
}
