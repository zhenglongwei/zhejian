const { prisma } = require('../lib/prisma')
const { newId, toIso } = require('../lib/ids')
const { assertPersistentImageUrl } = require('../lib/media-storage')
const {
  VALID_FEEDBACK_TYPES,
  FEEDBACK_STATUS,
  FEEDBACK_RATE_LIMIT_MS,
} = require('../constants/album-feedback')
const { getUserServiceAlbum } = require('./service-album.service')

function mapFeedbackRecord(row) {
  return {
    id: row.id,
    albumId: row.albumId,
    nodeId: row.nodeId || '',
    nodeTitle: row.nodeTitle || '',
    feedbackType: row.feedbackType,
    description: row.description,
    images: row.imagesJson || [],
    contactPhone: row.contactPhone,
    status: row.status,
    createdAt: toIso(row.createdAt),
  }
}

function sanitizeFeedbackImages(images) {
  if (!Array.isArray(images)) return []
  return images.slice(0, 3).map((url) => assertPersistentImageUrl(url)).filter(Boolean)
}

function assertFeedbackNode(album, nodeId) {
  const id = String(nodeId || '').trim()
  if (!id) return { nodeId: '', nodeTitle: '' }
  const node = (album.nodes || []).find((n) => n.id === id || n.nodeId === id)
  if (!node) {
    const err = new Error('节点不存在')
    err.status = 400
    throw err
  }
  return {
    nodeId: node.id || node.nodeId || id,
    nodeTitle: node.title || '',
  }
}

async function submitServiceAlbumFeedback(albumId, userId, payload = {}) {
  const album = await getUserServiceAlbum(albumId, userId)
  const feedbackType = String(payload.feedbackType || '').trim()
  const description = String(payload.description || '').trim()
  const contactPhone = String(payload.contactPhone || '').replace(/\D/g, '')
  const nodeMeta = assertFeedbackNode(album, payload.nodeId)

  if (!payload.consent) {
    const err = new Error('请先阅读并勾选反馈声明')
    err.status = 400
    throw err
  }
  if (!VALID_FEEDBACK_TYPES.has(feedbackType)) {
    const err = new Error('请选择反馈类型')
    err.status = 400
    throw err
  }
  if (description.length < 10 || description.length > 500) {
    const err = new Error('问题说明需 10–500 字')
    err.status = 400
    throw err
  }
  if (contactPhone && contactPhone.length !== 11) {
    const err = new Error('联系手机号格式不正确')
    err.status = 400
    throw err
  }

  const since = new Date(Date.now() - FEEDBACK_RATE_LIMIT_MS)
  const recent = await prisma.serviceAlbumFeedback.findFirst({
    where: {
      userId,
      albumId,
      nodeId: nodeMeta.nodeId,
      createdAt: { gte: since },
    },
  })
  if (recent) {
    const err = new Error('你已提交过同类反馈，请 24 小时后再试')
    err.status = 429
    throw err
  }

  const row = await prisma.serviceAlbumFeedback.create({
    data: {
      id: newId('afb'),
      userId,
      albumId,
      storeId: album.store?.id || '',
      nodeId: nodeMeta.nodeId,
      nodeTitle: payload.nodeTitle || nodeMeta.nodeTitle || '',
      feedbackType,
      description,
      imagesJson: sanitizeFeedbackImages(payload.images),
      contactPhone,
      status: FEEDBACK_STATUS.PENDING,
    },
  })

  return mapFeedbackRecord(row)
}

module.exports = {
  submitServiceAlbumFeedback,
  mapFeedbackRecord,
}
