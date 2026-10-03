/**
 * 本单图库：这本服务相册里已上传的图（不跨单）
 * 真源：docs/04_维修过程相册/26_ 接车页 · 本单图库
 */
const { prisma } = require('../lib/prisma')
const { resolveClientReadableMediaUrl } = require('../lib/media-storage')
const {
  INTAKE_RECORD_CATEGORIES,
} = require('../../vendor/shared/constants/service-flow-nodes')
const { FLOW_ORGANIZE_PROMPT_VERSION } = require('./node-photo-organize.service')

const STAGE_TITLE = {
  stage_1: '接车',
  stage_2: '检测',
  stage_5: '工单',
  stage_6: '交车',
}

function pickCache(rows = []) {
  const flow = rows.find((row) => row.promptVersion === FLOW_ORGANIZE_PROMPT_VERSION)
  return flow || rows[0] || null
}

function libraryNote(cache, caption) {
  const json = (cache && cache.resultJson) || {}
  const observation = String(json.observation || json.description || json.advice || json.caption || '').trim()
  const reading = String(json.reading || '').trim()
  const categoryId = String(json.category || '').trim()
  const meta = INTAKE_RECORD_CATEGORIES.find((row) => row.id === categoryId)
  const parts = []
  if (meta) parts.push(meta.label)
  else if (json.partName) parts.push(String(json.partName).trim())
  if (reading) parts.push(reading)
  if (observation) parts.push(observation)
  if (caption) parts.push(String(caption).trim())
  return parts.filter(Boolean).join(' · ')
}

function formatLibraryTime(value) {
  const date = value instanceof Date ? value : new Date(value || '')
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const pick = (type) => String((parts.find((row) => row.type === type) || {}).value || '')
  return `${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`
}

async function listAlbumMediaLibrary(albumId, storeId, merchantId = '') {
  const { loadAlbum, assertMerchantAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  const images = Array.isArray(album.images) ? album.images : []
  const caches = images.length
    ? await prisma.albumImageVisionCache.findMany({
        where: { albumId, albumImageId: { in: images.map((img) => img.id) } },
      })
    : []
  const byImage = {}
  caches.forEach((row) => {
    const id = String(row.albumImageId || '')
    if (!id) return
    if (!byImage[id]) byImage[id] = []
    byImage[id].push(row)
  })
  const nodeTitle = {}
  ;(album.nodes || []).forEach((node) => {
    if (node && node.nodeId) {
      nodeTitle[node.nodeId] = node.title || STAGE_TITLE[node.nodeId] || ''
    }
  })
  return {
    items: images
      .map((img) => {
        const cache = pickCache(byImage[img.id] || [])
        const json = (cache && cache.resultJson) || {}
        const url = resolveClientReadableMediaUrl(img.rawUrl)
        if (!url) return null
        return {
          imageId: img.id,
          url,
          createdAt: img.createdAt ? img.createdAt.toISOString() : '',
          timeLabel: formatLibraryTime(img.createdAt),
          stageId: img.nodeId || '',
          stageTitle: nodeTitle[img.nodeId] || STAGE_TITLE[img.nodeId] || '',
          category: String(json.category || ''),
          reading: String(json.reading || ''),
          note: libraryNote(cache, img.caption),
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  }
}

module.exports = {
  listAlbumMediaLibrary,
  libraryNote,
  formatLibraryTime,
  pickCache,
}
