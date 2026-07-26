const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const { prisma } = require('../lib/prisma')
const { buildZipStore } = require('../lib/zip-store')
const {
  resolveMediaFilePathFromPublicUrl,
  rewriteMediaUrlForCurrentBase,
} = require('../lib/media-storage')
const { stripUrlQuery } = require('../lib/media-signed-url')
const { resolveShared } = require('../utils/resolve-shared')

const { getStageMeta } = resolveShared('constants/service-album-stages.js')

const MAX_ARCHIVE_IMAGES = 200
const FETCH_TIMEOUT_MS = 20000

function sanitizeArchiveBaseName(name, fallback = '照片') {
  const raw = String(name || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const cleaned = raw.replace(/^\.+/, '').slice(0, 40)
  return cleaned || fallback
}

function extFromUrl(url) {
  const bare = stripUrlQuery(String(url || ''))
  const ext = path.extname(bare).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext
  return '.jpg'
}

/**
 * 按节点分组命名：单张用节点名；多张用 节点名-1、节点名-2…
 * @param {Array<{ nodeId: string, title: string, rawUrl: string, idx: number }>} images
 * @returns {Array<{ name: string, rawUrl: string }>}
 */
function buildArchiveFileEntries(images = []) {
  const byNode = new Map()
  ;(images || []).forEach((img) => {
    const nodeId = String((img && img.nodeId) || 'unknown')
    if (!byNode.has(nodeId)) byNode.set(nodeId, [])
    byNode.get(nodeId).push(img)
  })

  const usedNames = new Set()
  const entries = []

  byNode.forEach((list) => {
    const sorted = [...list].sort((a, b) => Number(a.idx || 0) - Number(b.idx || 0))
    const title =
      sanitizeArchiveBaseName(
        (sorted[0] && sorted[0].title) || '',
        '照片',
      ) || '照片'
    const multi = sorted.length > 1

    sorted.forEach((img, i) => {
      const ext = extFromUrl(img.rawUrl)
      let base = multi ? `${title}-${i + 1}` : title
      let name = `${base}${ext}`
      let n = 2
      while (usedNames.has(name.toLowerCase())) {
        base = multi ? `${title}-${i + 1}-${n}` : `${title}-${n}`
        name = `${base}${ext}`
        n += 1
      }
      usedNames.add(name.toLowerCase())
      entries.push({ name, rawUrl: img.rawUrl })
    })
  })

  return entries
}

function fetchUrlBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = String(url).startsWith('https') ? https : http
    const req = lib.get(url, { timeout: FETCH_TIMEOUT_MS }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        fetchUrlBuffer(res.headers.location).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`下载原图失败(${res.statusCode})`))
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('下载原图超时'))
    })
    req.on('error', reject)
  })
}

async function readImageBuffer(rawUrl) {
  const rewritten = rewriteMediaUrlForCurrentBase(rawUrl)
  const local = resolveMediaFilePathFromPublicUrl(rewritten || rawUrl)
  if (local && fs.existsSync(local)) {
    return fs.promises.readFile(local)
  }
  const url = rewritten || rawUrl
  if (!/^https?:\/\//i.test(url)) {
    const err = new Error('原图文件不存在')
    err.status = 404
    throw err
  }
  return fetchUrlBuffer(url)
}

function resolveNodeTitle(nodesById, nodeId) {
  const node = nodesById.get(nodeId)
  if (node && node.title) return String(node.title).trim()
  const meta = getStageMeta(nodeId)
  return (meta && meta.title) || nodeId || '照片'
}

async function assertOwnerAlbumAccess(albumId, userId) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
    },
  })
  if (!album) {
    const err = new Error('相册不存在或已被删除')
    err.status = 404
    throw err
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const phone = user?.phone || ''
  const allowed = album.userId === userId || (phone && album.userPhone === phone)
  if (!allowed) {
    const err = new Error('仅关联车主可下载档案')
    err.status = 403
    throw err
  }
  return album
}

/**
 * 车主下载服务相册原图压缩包
 * @returns {Promise<{ buffer: Buffer, fileName: string, imageCount: number }>}
 */
async function buildOwnerAlbumArchive(albumId, userId) {
  const album = await assertOwnerAlbumAccess(albumId, userId)
  if (!(album.images || []).length) {
    const err = new Error('该相册暂无照片可下载')
    err.status = 400
    throw err
  }
  if (album.images.length > MAX_ARCHIVE_IMAGES) {
    const err = new Error(`照片过多（超过 ${MAX_ARCHIVE_IMAGES} 张），请联系客服协助导出`)
    err.status = 400
    throw err
  }

  const nodesById = new Map((album.nodes || []).map((n) => [n.nodeId, n]))
  const imageRows = (album.images || []).map((img) => ({
    nodeId: img.nodeId,
    title: resolveNodeTitle(nodesById, img.nodeId),
    rawUrl: img.rawUrl,
    idx: img.idx,
  }))

  const plan = buildArchiveFileEntries(imageRows)
  const zipEntries = []
  for (const item of plan) {
    const data = await readImageBuffer(item.rawUrl)
    zipEntries.push({ name: item.name, data })
  }

  const buffer = buildZipStore(zipEntries)
  const serviceName = sanitizeArchiveBaseName(album.serviceName || '', '服务相册')
  const fileName = `${serviceName}-原图档案.zip`

  return {
    buffer,
    fileName,
    imageCount: zipEntries.length,
  }
}

module.exports = {
  sanitizeArchiveBaseName,
  buildArchiveFileEntries,
  buildOwnerAlbumArchive,
  MAX_ARCHIVE_IMAGES,
}
