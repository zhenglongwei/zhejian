const { prisma } = require('../lib/prisma')
const { newId, formatVehicle, toIso } = require('../lib/ids')
const { isServiceAlbumRepairDone } = require('../constants/v2')
const { resolvePublicCaseMediaUrl } = require('../lib/media-url')
const { albumToNodeView, BIZ_TYPE, buildDesensitizedUrl } = require('./desensitize.constants')
const { getTaskById } = require('./desensitize.service')

const VALID_MODES = new Set(['desensitized'])
const VALID_CHANNELS = new Set(['wechat', 'link', ''])

function getShareTokenModel() {
  return prisma && prisma.albumShareToken ? prisma.albumShareToken : null
}

async function loadAlbum(albumId) {
  return prisma.album.findUnique({
    where: { id: albumId },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
    },
  })
}

function buildStoreBlock(album) {
  return {
    id: album.storeId || '',
    name: album.storeName || '—',
    city: '杭州',
  }
}

async function findPreMaskTask(albumId) {
  return prisma.desensitizeTask.findFirst({
    where: {
      bizId: albumId,
      bizType: BIZ_TYPE.SERVICE_PRE_MASK,
    },
    orderBy: { updatedAt: 'desc' },
  })
}

function taskAssets(task) {
  if (!task) return []
  return task.rawAssets || task.assets || []
}

function buildNodesFromTask(nodes, task) {
  const assets = taskAssets(task)
  if (!assets.length) {
    return (nodes || []).map((node) => ({ ...node, images: [] }))
  }

  const assetMap = {}
  assets.forEach((asset) => {
    const idx = asset.idx != null ? asset.idx : asset.index
    const nodeId = asset.nodeId || ''
    assetMap[`${nodeId}_${idx}`] = asset.maskedUrl || asset.preMaskedUrl || ''
  })

  return (nodes || []).map((node) => {
    const nodeId = node.id || node.nodeId || ''
    return {
      ...node,
      images: (node.images || [])
        .map((url, idx) => {
          const fromTask = assetMap[`${nodeId}_${idx}`]
          const candidate = fromTask || (typeof url === 'string' ? url : '')
          return resolvePublicCaseMediaUrl(candidate) || candidate
        })
        .filter(Boolean),
    }
  })
}

function mapNodesForShare(album, mode) {
  const baseNodes = albumToNodeView(album).map((node) => ({
    id: node.id || node.nodeId,
    title: node.title,
    note: node.note || '',
    images: node.images || [],
    updatedAt: '',
  }))

  if (mode === 'original') {
    return baseNodes.map((node) => ({
      ...node,
      images: (node.images || []).filter(Boolean),
    }))
  }

  return baseNodes.map((node) => ({
    ...node,
    images: (node.images || [])
      .map((url, idx) => {
        const desensitized = resolvePublicCaseMediaUrl(url)
        if (desensitized) return desensitized
        return buildDesensitizedUrl(url, album.id, node.id, idx)
      })
      .filter(Boolean),
  }))
}

async function resolveDesensitizedNodes(album) {
  const baseNodes = albumToNodeView(album).map((node) => ({
    id: node.id || node.nodeId,
    title: node.title,
    note: node.note || '',
    images: node.images || [],
    updatedAt: '',
  }))

  const preMaskTask = await findPreMaskTask(album.id)
  if (preMaskTask) {
    const mapped = await getTaskById(preMaskTask.taskId)
    if (mapped && taskAssets(mapped).length) {
      return buildNodesFromTask(baseNodes, mapped)
    }
  }

  return mapNodesForShare(album, 'desensitized')
}

async function assertOwnerAccess(album, userId) {
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
    const err = new Error('无权分享该相册')
    err.status = 403
    throw err
  }
  if (!isServiceAlbumRepairDone(album.status)) {
    const err = new Error('相册尚未完工，暂不可分享')
    err.status = 400
    throw err
  }
}

async function buildSharedAlbumView(album) {
  const nodes = await resolveDesensitizedNodes(album)
  const store = buildStoreBlock(album)
  const vehicle = album.vehicleJson || {}

  return {
    albumId: album.id,
    shareMode: 'desensitized',
    serviceName: album.serviceName || '—',
    store: {
      name: store.name,
      city: store.city,
    },
    vehicleDisplay: formatVehicle(vehicle),
    storeNote: album.storeNote || '',
    nodes,
    sharedAt: toIso(new Date()),
    disclaimer: '本页为车主分享的脱敏服务过程，不含完整车牌、手机号等隐私信息。',
  }
}

async function createAlbumShareToken(albumId, userId, payload = {}) {
  const album = await loadAlbum(albumId)
  await assertOwnerAccess(album, userId)

  const mode = 'desensitized'
  const channel = VALID_CHANNELS.has(payload.channel) ? payload.channel : ''
  const tokenId = newId('sh_alb')
  const model = getShareTokenModel()

  if (model) {
    await model.create({
      data: {
        id: tokenId,
        albumId,
        userId,
        mode,
        channel,
      },
    })
  } else {
    console.warn('[album-share] prisma.albumShareToken 不可用，跳过留痕（请执行 db:setup:prod）')
  }

  return {
    shareToken: tokenId,
    mode,
    channel,
    miniPath: `/pages/album/share/index?token=${encodeURIComponent(tokenId)}`,
  }
}

async function getSharedAlbumByToken(token) {
  const model = getShareTokenModel()
  if (!model) {
    const err = new Error('分享服务暂不可用')
    err.status = 503
    throw err
  }

  const record = await model.findUnique({
    where: { id: token },
    include: {
      album: {
        include: {
          nodes: { orderBy: { sortOrder: 'asc' } },
          images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
        },
      },
    },
  })

  if (!record || !record.album) {
    const err = new Error('分享链接无效或已失效')
    err.status = 404
    throw err
  }

  if (!isServiceAlbumRepairDone(record.album.status)) {
    const err = new Error('相册暂不可查看')
    err.status = 404
    throw err
  }

  return buildSharedAlbumView(record.album)
}

module.exports = {
  createAlbumShareToken,
  getSharedAlbumByToken,
}
