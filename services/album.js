/**
 * 商家维修相册（非平台）— V0.1
 * MOCK: storage merchant_albums_v1；提交后 mock 自动审核通过并发布案例
 */
const { ALBUM_STATUS, ALBUM_TEMPLATES } = require('../constants/album')
const { PRICE_MODE } = require('../constants/price-mode')
const { publishCaseFromAlbum } = require('./case')
const { pickRawCover, pickDesensitizedCover } = require('../utils/desensitize-mock')
const { normalizeVehicleText } = require('../utils/album-card')

const STORAGE_KEY = 'merchant_albums_v1'

function delay(ms = 300) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadAlbums() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || []
  } catch (e) {
    return []
  }
}

function saveAlbums(list) {
  wx.setStorageSync(STORAGE_KEY, list)
}

async function fetchAlbumList(status) {
  await delay()
  let list = loadAlbums()
  if (status) {
    list = list.filter((a) => a.status === status)
  }
  return {
    list: list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    total: list.length,
  }
}

async function fetchAlbumDetail(id) {
  await delay()
  const item = loadAlbums().find((a) => a.id === id)
  if (!item) {
    const err = new Error('相册不存在')
    err.code = 404
    throw err
  }
  return item
}

/**
 * 创建或更新相册草稿/提交
 * @param {object} payload
 * @param {boolean} [submitReview]
 */
async function saveAlbum(payload, submitReview = false) {
  await delay(submitReview ? 500 : 280)
  const list = loadAlbums()
  const id = payload.id || `album_${Date.now()}`
  const template =
    ALBUM_TEMPLATES[payload.templateId] || ALBUM_TEMPLATES.brake
  const now = Date.now()
  const existing = list.find((a) => a.id === id)
  const base = existing || {
    id,
    createdAt: now,
    storeId: 'store_demo_1',
    storeName: payload.storeName || '透明维修示范店（杭州滨江）',
    city: '杭州',
  }

  let status = ALBUM_STATUS.DRAFT
  const draftNodes = payload.nodes || []
  let nodes = draftNodes
  let coverImageRaw = pickRawCover(draftNodes)
  let coverImageDesensitized = ''

  if (submitReview) {
    const confirmed =
      payload.maskingConfirmed === true || base.maskingConfirmed === true
    if (!confirmed) {
      const err = new Error('请先完成图片脱敏确认')
      err.code = 403
      throw err
    }
    nodes = draftNodes
    coverImageDesensitized = pickDesensitizedCover(nodes)
    if (!coverImageDesensitized) {
      const err = new Error('缺少脱敏图，无法提交审核')
      err.code = 400
      throw err
    }
  }

  const album = {
    ...base,
    ...payload,
    id,
    templateId: payload.templateId || template.id,
    serviceName: payload.serviceName || template.serviceName,
    nodes,
    coverImageRaw,
    coverImageDesensitized,
    maskingTaskId: payload.maskingTaskId || base.maskingTaskId || '',
    maskingConfirmed: submitReview
      ? true
      : payload.maskingConfirmed !== undefined
        ? payload.maskingConfirmed
        : base.maskingConfirmed || false,
    maskingConfirmedAt: submitReview
      ? payload.maskingConfirmedAt || base.maskingConfirmedAt || now
      : payload.maskingConfirmedAt || base.maskingConfirmedAt || null,
    vehicleText: payload.vehicleText || base.vehicleText || '',
    title:
      payload.title ||
      `${normalizeVehicleText(payload.vehicleText || base.vehicleText)} · ${payload.serviceName || template.serviceName}`,
    priceMode: payload.priceMode || PRICE_MODE.RANGE,
    updatedAt: now,
    status,
  }

  const next = list.filter((a) => a.id !== id)
  next.unshift(album)
  saveAlbums(next)

  if (submitReview) {
    album.status = ALBUM_STATUS.PENDING_REVIEW
    album.submittedAt = now
    next[0] = album
    saveAlbums(next)
    return mockApproveAlbum(id)
  }

  return album
}

/** MOCK — 模拟平台审核通过后发布（联调后由审核回调触发） */
async function mockApproveAlbum(albumId) {
  await delay(400)
  const list = loadAlbums()
  const idx = list.findIndex((a) => a.id === albumId)
  if (idx < 0) {
    const err = new Error('相册不存在')
    err.code = 404
    throw err
  }
  const now = Date.now()
  const album = {
    ...list[idx],
    status: ALBUM_STATUS.APPROVED,
    reviewedAt: now,
    updatedAt: now,
  }
  list[idx] = album
  saveAlbums(list)
  publishCaseFromAlbum(album)
  return album
}

module.exports = {
  fetchAlbumList,
  fetchAlbumDetail,
  saveAlbum,
  ALBUM_STATUS,
}
