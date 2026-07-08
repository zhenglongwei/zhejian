/**
 * CASE-GATE-A-04 · 运营相册完工合规抽检
 */
const { prisma } = require('../lib/prisma')
const { loadAlbum, buildAlbumView } = require('./service-album.service')
const {
  ALBUM_COMPLIANCE_STATUS,
  ALBUM_COMPLIANCE_REVIEW_MODE,
} = require('../constants/album-compliance')
const { evaluateAlbumComplianceRules } = require('./album-compliance.service')

function buildListWhere(query = {}) {
  const tab = String(query.tab || 'spot_check').toLowerCase()
  const where = {}
  if (tab === 'spot_check') {
    where.complianceStatus = ALBUM_COMPLIANCE_STATUS.SPOT_CHECK
  } else if (tab === 'rejected') {
    where.complianceStatus = ALBUM_COMPLIANCE_STATUS.REJECTED
  } else if (tab === 'passed') {
    where.complianceStatus = ALBUM_COMPLIANCE_STATUS.PASSED
  } else {
    where.complianceStatus = ALBUM_COMPLIANCE_STATUS.SPOT_CHECK
  }
  if (query.storeId) where.storeId = String(query.storeId)
  if (query.keyword) {
    where.OR = [
      { serviceName: { contains: String(query.keyword) } },
      { storeName: { contains: String(query.keyword) } },
      { id: { contains: String(query.keyword) } },
    ]
  }
  return { tab, where }
}

async function listAdminAlbumCompliance(query = {}) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20))
  const { tab, where } = buildListWhere(query)
  const [total, rows] = await Promise.all([
    prisma.album.count({ where }),
    prisma.album.findMany({
      where,
      orderBy: { complianceCheckedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        nodes: { orderBy: { sortOrder: 'asc' } },
        images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
      },
    }),
  ])
  return {
    tab,
    list: rows.map((row) => ({
      albumId: row.id,
      storeId: row.storeId,
      storeName: row.storeName,
      serviceName: row.serviceName,
      status: row.status,
      complianceStatus: row.complianceStatus,
      complianceReviewMode: row.complianceReviewMode,
      complianceRejectReason: row.complianceRejectReason || '',
      complianceCheckedAt: row.complianceCheckedAt,
      compliancePassedAt: row.compliancePassedAt,
      imageCount: row.imageCount,
    })),
    pagination: { page, pageSize, total },
  }
}

async function getAdminAlbumComplianceDetail(albumId) {
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  const evaluation = evaluateAlbumComplianceRules(album)
  return {
    album: buildAlbumView(album),
    compliance: {
      status: album.complianceStatus || '',
      reviewMode: album.complianceReviewMode || '',
      rejectReason: album.complianceRejectReason || '',
      checkedAt: album.complianceCheckedAt,
      passedAt: album.compliancePassedAt,
      autoEvaluation: evaluation,
    },
  }
}

async function approveAdminAlbumCompliance(albumId, reviewerId = 'admin') {
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  if (album.complianceStatus !== ALBUM_COMPLIANCE_STATUS.SPOT_CHECK) {
    const err = new Error('当前相册不在抽检待审状态')
    err.status = 409
    throw err
  }
  const now = new Date()
  await prisma.album.update({
    where: { id: albumId },
    data: {
      complianceStatus: ALBUM_COMPLIANCE_STATUS.PASSED,
      compliancePassedAt: now,
      complianceRejectReason: '',
      complianceReviewMode: ALBUM_COMPLIANCE_REVIEW_MODE.MANUAL,
      complianceCheckedAt: now,
    },
  })
  return { albumId, complianceStatus: ALBUM_COMPLIANCE_STATUS.PASSED, reviewerId }
}

async function rejectAdminAlbumCompliance(albumId, payload = {}, reviewerId = 'admin') {
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  if (album.complianceStatus !== ALBUM_COMPLIANCE_STATUS.SPOT_CHECK) {
    const err = new Error('当前相册不在抽检待审状态')
    err.status = 409
    throw err
  }
  const reason = String(payload.reason || payload.comment || '').trim() || '留档内容未通过合规审查'
  const now = new Date()
  await prisma.album.update({
    where: { id: albumId },
    data: {
      complianceStatus: ALBUM_COMPLIANCE_STATUS.REJECTED,
      compliancePassedAt: null,
      complianceRejectReason: reason,
      complianceReviewMode: ALBUM_COMPLIANCE_REVIEW_MODE.MANUAL,
      complianceCheckedAt: now,
    },
  })
  return { albumId, complianceStatus: ALBUM_COMPLIANCE_STATUS.REJECTED, reviewerId, reason }
}

module.exports = {
  listAdminAlbumCompliance,
  getAdminAlbumComplianceDetail,
  approveAdminAlbumCompliance,
  rejectAdminAlbumCompliance,
}
