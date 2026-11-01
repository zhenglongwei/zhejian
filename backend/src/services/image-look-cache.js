/**
 * 一张图的观察摘要。谁先看过都写在这里，后面的步骤只读文字。
 */
const { createHash } = require('crypto')
const { stripUrlQuery } = require('../lib/media-signed-url')
const { resolveShared } = require('../utils/resolve-shared')
const { mediaKey } = resolveShared('utils/service-flow-docs.js')

function bare(url) {
  return String(url || '').trim().split('?')[0].split('#')[0]
}

function lookText(json) {
  if (!json || typeof json !== 'object') return ''
  const keys = ['observation', 'description', 'note', 'advice', 'caption']
  for (let i = 0; i < keys.length; i += 1) {
    const value = String(json[keys[i]] || '').trim()
    if (value) return value.slice(0, 240)
  }
  return ''
}

function fingerprintOfUrl(url) {
  return createHash('sha256').update(stripUrlQuery(bare(url))).digest('hex').slice(0, 40)
}

/**
 * 同一张图已经有观察摘要就复用。
 * 本步骤自己的记录若指纹对不上，说明图换过，允许再看一次。
 */
function reuseExistingLook(rows, { version = '', fingerprint = '' } = {}) {
  const list = Array.isArray(rows) ? rows : []
  const own = version ? list.find((row) => row && row.promptVersion === version) : null
  if (own && fingerprint && own.contentFingerprint && own.contentFingerprint !== fingerprint) {
    return { reuse: false, stale: true, row: own }
  }
  if (own && lookText(own.resultJson) && (!fingerprint || !own.contentFingerprint || own.contentFingerprint === fingerprint)) {
    return { reuse: true, stale: false, row: own }
  }
  const any = list.find((row) => lookText(row && row.resultJson))
  if (any) return { reuse: true, stale: false, row: any }
  return { reuse: false, stale: false, row: null }
}

function noteForUrl(url, notesMap) {
  if (!notesMap) return ''
  const full = bare(url)
  const short = mediaKey(url)
  return String((full && notesMap[full]) || (short && notesMap[short]) || '').trim()
}

async function notesForAlbumImages(album) {
  if (!album || !album.id) return {}
  let rows = []
  try {
    const { prisma } = require('../lib/prisma')
    rows = await prisma.albumImageVisionCache.findMany({ where: { albumId: album.id } })
  } catch (_) {
    return {}
  }
  const byId = {}
  ;(rows || []).forEach((row) => {
    const text = lookText(row && row.resultJson)
    const id = String((row && row.albumImageId) || '')
    if (!text || !id) return
    if (!byId[id] || text.length > byId[id].length) byId[id] = text
  })
  const notes = {}
  ;(Array.isArray(album.images) ? album.images : []).forEach((img) => {
    const text = byId[img && img.id]
    if (!text) return
    const full = bare(img.rawUrl)
    const short = mediaKey(img.rawUrl)
    if (full && !notes[full]) notes[full] = text
    if (short && !notes[short]) notes[short] = text
  })
  return notes
}

async function lookTextByUrl(url) {
  const fingerprint = fingerprintOfUrl(url)
  if (!fingerprint) return ''
  try {
    const { prisma } = require('../lib/prisma')
    const rows = await prisma.albumImageVisionCache.findMany({
      where: { contentFingerprint: fingerprint },
      take: 8,
    })
    const hit = (rows || []).find((row) => lookText(row && row.resultJson))
    return hit ? lookText(hit.resultJson) : ''
  } catch (_) {
    return ''
  }
}

module.exports = {
  lookText,
  fingerprintOfUrl,
  reuseExistingLook,
  noteForUrl,
  notesForAlbumImages,
  lookTextByUrl,
}
