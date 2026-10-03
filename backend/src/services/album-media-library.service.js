/**
 * 本单图库：这本服务相册里已上传的图（不跨单）
 * 真源：docs/04_维修过程相册/26_ 接车页 · 本单图库
 */
const { prisma } = require('../lib/prisma')
const { resolveClientReadableMediaUrl } = require('../lib/media-storage')
const { resolveShared } = require('../utils/resolve-shared')
const { mediaKey } = resolveShared('utils/service-flow-docs.js')
const {
  INTAKE_RECORD_CATEGORIES,
} = require('../../vendor/shared/constants/service-flow-nodes')
const { FLOW_ORGANIZE_PROMPT_VERSION } = require('./node-photo-organize.service')

const KIND_TITLE = {
  intake: '接车',
  inspection: '检测',
  work: '工单',
  delivery_photos: '交车',
}

function isStoredUrl(url) {
  const value = String(url || '').trim()
  if (!value) return false
  if (/^wxfile:|^file:|^http:\/\/tmp|^https:\/\/tmp/i.test(value)) return false
  return /^(https?:)?\/\//i.test(value) || value.includes('/uploads/') || value.includes('/media/files/')
}

function pushLibraryUrl(bucket, seen, raw, extra = {}) {
  const url = resolveClientReadableMediaUrl(typeof raw === 'string' ? raw : (raw && (raw.url || raw.rawUrl)) || '')
  if (!isStoredUrl(url)) return
  const key = mediaKey(url)
  if (!key || seen.has(key)) return
  seen.add(key)
  bucket.push({
    imageId: (raw && typeof raw === 'object' && (raw.imageId || raw.id)) || '',
    url,
    createdAt: extra.createdAt || '',
    timeLabel: extra.timeLabel || '',
    stageId: extra.stageId || '',
    stageTitle: extra.stageTitle || '',
    category: extra.category || '',
    reading: extra.reading || '',
    note: extra.note || '',
  })
}

function collectDraftLibraryItems(album, seen) {
  const { readFlowNodesRaw } = require('./service-flow.service')
  const extra = []
  readFlowNodesRaw(album).forEach((node) => {
    const draft = (node && node.photoDraft) || {}
    const stageTitle = KIND_TITLE[node.kind] || node.title || ''
    const meta = { stageId: '', stageTitle }
    const walk = (img) => pushLibraryUrl(extra, seen, img, meta)
    ;(draft.pendingImages || []).forEach(walk)
    ;(draft.findings || []).forEach((row) => {
      if (Array.isArray(row && row.images) && row.images.length) row.images.forEach(walk)
      else if (row && row.url) walk(row)
    })
    ;(draft.intakeResults || []).forEach((row) => {
      ;(row && row.images ? row.images : []).forEach(walk)
    })
    if (draft.odometerUrl) walk({ url: draft.odometerUrl, imageId: draft.odometerImageId || '' })
  })
  return extra
}

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
  const seen = new Set()
  const items = images
    .map((img) => {
      const cache = pickCache(byImage[img.id] || [])
      const json = (cache && cache.resultJson) || {}
      const url = resolveClientReadableMediaUrl(img.rawUrl)
      if (!isStoredUrl(url)) return null
      const key = mediaKey(url)
      if (key) seen.add(key)
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
    .concat(collectDraftLibraryItems(album, seen))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return { items }
}

module.exports = {
  listAlbumMediaLibrary,
  libraryNote,
  formatLibraryTime,
  pickCache,
}
