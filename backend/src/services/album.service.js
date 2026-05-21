const { prisma } = require('../lib/prisma')
const { albumToNodeView } = require('./desensitize.constants')

async function getUserOrderAlbum(orderId, userId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
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
  if (!order) {
    const err = new Error('订单不存在或已被删除。')
    err.status = 404
    throw err
  }
  if (userId && order.userId !== userId) {
    const err = new Error('你无权查看该维修相册。')
    err.status = 403
    throw err
  }
  if (!order.album) {
    const err = new Error('该订单暂无维修相册。')
    err.status = 404
    throw err
  }

  const album = order.album
  const nodes = albumToNodeView(album).map((node) => ({
    id: node.id,
    title: node.title,
    status: node.status,
    note: node.note,
    images: node.images,
    updatedAt: '',
  }))

  return {
    albumId: album.id,
    orderId: order.id,
    serviceName: order.serviceName,
    store: {
      id: order.storeId,
      name: order.storeName,
      phone: '',
      address: '—',
    },
    orderStatus: order.status,
    vehicleDisplay: formatVehicle(order.vehicleJson),
    imageCount: album.imageCount,
    albumStatus: album.status,
    publicCaseStatus: album.publicCaseStatus,
    aftersaleBlocked: false,
    storeNote: album.storeNote || '',
    nodes,
    summaryRows: [],
  }
}

function formatVehicle(vehicleJson) {
  if (!vehicleJson || typeof vehicleJson !== 'object') return '—'
  const brand = vehicleJson.brand || ''
  const series = vehicleJson.series || ''
  const plate = vehicleJson.plateDisplay || ''
  const model = [brand, series].filter(Boolean).join(' ')
  if (model && plate) return `${model} / ${plate}`
  return model || plate || '—'
}

async function submitAlbumAuthorization(albumId, payload = {}) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  const agreed = payload.agreed !== false
  const status = agreed ? 'authorized' : 'user_rejected'
  await prisma.albumAuthorization.upsert({
    where: { albumId },
    create: { albumId, agreed, status },
    update: { agreed, status },
  })
  await prisma.album.update({
    where: { id: albumId },
    data: { publicCaseStatus: status },
  })
  return { publicCaseStatus: status }
}

async function completeMerchantAlbum(albumId) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  await prisma.album.update({
    where: { id: albumId },
    data: { status: 'completed' },
  })
  return album
}

module.exports = {
  getUserOrderAlbum,
  submitAlbumAuthorization,
  completeMerchantAlbum,
}
