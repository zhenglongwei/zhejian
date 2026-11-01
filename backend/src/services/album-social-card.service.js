/**
 * 短图文读侧：按相册 / 案例事实现算，只带打码图。
 * 挑图用每张图已有的分析；已分析过的不再把图送进模型。
 */
const { createHash, randomUUID } = require('crypto')
const { SERVICE_ALBUM_STATUS } = require('../constants/v2')
const { buildSocialCardSet, sanitizeFacts } = require('../../../utils/album-social-card')
const { writePlatformCards } = require('./album-social-card-llm.service')
const { resolveShared } = require('../utils/resolve-shared')
const { mediaKey } = resolveShared('utils/service-flow-docs.js')

const SOCIAL_LOOK_VERSION = 'social-look-v1'

function noteText(value) {
  return String(value || '').trim()
}

function summarizeLook(json) {
  if (!json || typeof json !== 'object') return ''
  const bits = ['partName', 'category', 'observation', 'advice', 'caption', 'reading', 'result', 'note']
    .map((key) => noteText(json[key]))
    .filter(Boolean)
  return [...new Set(bits)].join('。').slice(0, 240)
}

function mergeNote(current, next) {
  const left = noteText(current)
  const right = noteText(next)
  if (!left) return right
  if (!right || left.includes(right)) return left
  return `${left}。${right}`.slice(0, 300)
}

function priorsFromAlbum(album, cacheRows) {
  const byId = {}
  const put = (id, note) => {
    const key = noteText(id)
    const text = noteText(note)
    if (!key || !text) return
    byId[key] = mergeNote(byId[key], text)
  }
  ;(Array.isArray(cacheRows) ? cacheRows : []).forEach((row) => {
    put(row && row.albumImageId, summarizeLook(row && row.resultJson))
  })
  const notesByMedia = {}
  const { readFlowNodesRaw } = require('./service-flow.service')
  readFlowNodesRaw(album).forEach((node) => {
    const bags = [node && node.content, node && node.photoDraft]
    bags.forEach((bag) => {
      const notes = bag && bag.imageNotes
      if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return
      Object.keys(notes).forEach((key) => {
        const media = mediaKey(key)
        const note = noteText(notes[key])
        if (media && note && !notesByMedia[media]) notesByMedia[media] = note
      })
    })
  })
  ;(Array.isArray(album && album.images) ? album.images : []).forEach((img) => {
    const note = notesByMedia[mediaKey(img && img.rawUrl)]
    if (!note) return
    put(img.id, note)
    put(`${img.nodeId}:${Number(img.idx || 0)}`, note)
  })
  ;(Array.isArray(cacheRows) ? cacheRows : []).forEach((row) => {
    const id = noteText(row && row.albumImageId)
    const img = (album.images || []).find((item) => item && item.id === id)
    if (!img) return
    put(`${img.nodeId}:${Number(img.idx || 0)}`, summarizeLook(row.resultJson))
  })
  return byId
}

async function loadPriorMap(album) {
  if (!album || !album.id) return {}
  let rows = []
  try {
    const { prisma } = require('../lib/prisma')
    rows = await prisma.albumImageVisionCache.findMany({
      where: { albumId: album.id },
      orderBy: { updatedAt: 'desc' },
    })
  } catch (err) {
    console.warn('[social-card] prior looks skipped', err && err.message)
  }
  return priorsFromAlbum(album, rows)
}

function withPriors(images, priorMap) {
  return (images || []).map((item) => ({
    ...item,
    prior: noteText(priorMap && priorMap[item.id]),
  }))
}

async function rememberSocialLooks(albumId, rows) {
  const { prisma } = require('../lib/prisma')
  const { stripUrlQuery } = require('../lib/media-signed-url')
  for (const row of rows || []) {
    const id = noteText(row && row.id)
    const note = noteText(row && row.note)
    if (!id || id.includes(':') || !note) continue
    const fingerprint = createHash('sha256')
      .update(stripUrlQuery(noteText(row.url)))
      .digest('hex')
      .slice(0, 40)
    const resultJson = { note, observation: note, imageKey: mediaKey(row.url) }
    await prisma.albumImageVisionCache.upsert({
      where: {
        albumImageId_promptVersion: {
          albumImageId: id,
          promptVersion: SOCIAL_LOOK_VERSION,
        },
      },
      create: {
        id: randomUUID(),
        albumImageId: id,
        albumId,
        contentFingerprint: fingerprint,
        promptVersion: SOCIAL_LOOK_VERSION,
        model: '',
        resultJson,
        hitCount: 0,
        lastHitAt: new Date(),
      },
      update: {
        contentFingerprint: fingerprint,
        resultJson,
        lastHitAt: new Date(),
      },
    })
  }
}

async function withModelCards(pack, audience, facts, images, album) {
  try {
    const priorMap = await loadPriorMap(album)
    const written = await writePlatformCards({
      audience,
      facts: sanitizeFacts(facts),
      images: withPriors(images, priorMap),
      rememberLook: (rows) => rememberSocialLooks(album && album.id, rows),
    })
    if (written && written.cards) {
      const picked = written.images && written.images.length ? written.images : pack.images
      return { ...pack, cards: written.cards, images: picked, source: written.source }
    }
  } catch (err) {
    console.warn('[social-card] model skipped', err && err.message)
  }
  return { ...pack, source: 'rule' }
}

function assertAlbumCompleted(albumView) {
  const status = albumView && albumView.status
  const ok =
    status === SERVICE_ALBUM_STATUS.COMPLETED ||
    status === SERVICE_ALBUM_STATUS.PUBLISHED ||
    status === 'published' ||
    status === 'completed'
  if (!ok) {
    const err = new Error('完工后可以下载图文')
    err.status = 409
    throw err
  }
}

function attachImageIds(media, imageMeta) {
  const byKey = new Map()
  ;(imageMeta || []).forEach((row) => {
    if (!row) return
    byKey.set(`${row.nodeId}:${Number(row.idx || 0)}`, String(row.id || '').trim())
  })
  return (media || [])
    .map((item) => {
      const key = `${item.nodeId}:${Number(item.idx || 0)}`
      return {
        id: byKey.get(key) || key,
        url: String((item && item.maskedUrl) || '').trim(),
      }
    })
    .filter((item) => item.id && item.url)
}

function factsFromView(view = {}, extra = {}) {
  const store = view.store || {}
  const notes = (view.nodes || [])
    .map((node) => String((node && node.note) || '').trim())
    .filter(Boolean)
  return {
    serviceName: view.serviceName || '',
    storeName: store.name || view.storeName || '',
    city: store.city || store.cityName || view.cityName || '',
    vehicleLabel: view.vehicleDisplay || '',
    notes,
    title: extra.title || '',
    summary: extra.summary || '',
  }
}

async function loadMaskedMedia(albumId, view) {
  let preMaskTask = null
  try {
    const { findPreMaskTask } = require('./desensitize.service')
    preMaskTask = await findPreMaskTask(albumId)
  } catch (_) {
    preMaskTask = null
  }
  const { pickDraftMedia } = require('./merchant-case-draft.service')
  const media = pickDraftMedia(view, preMaskTask, { requireMasked: true, softCap: 9 })
  return attachImageIds(media, view.imageMeta)
}

const writingSocial = new Map()

function readStoredSocial(album, audience) {
  const pkg = album && album.contentPackageJson
  const bag = pkg && typeof pkg === 'object' ? pkg.socialCards : null
  const row = bag && bag[audience]
  if (!row || typeof row !== 'object' || !Array.isArray(row.cards) || !row.cards.length) return null
  return row
}

/** 用当前打码图把上次成稿按图片 id 接回来。图已经不在相册里的丢掉。一张都接不上就当没有成稿。 */
function rehydrateSocialPack(stored, images, audience) {
  if (!stored || !Array.isArray(stored.cards) || !stored.cards.length) return null
  const byId = new Map(
    (images || []).filter((item) => item && item.id && item.url).map((item) => [String(item.id), item]),
  )
  let ids = Array.isArray(stored.imageIds)
    ? stored.imageIds.map((id) => String(id)).filter((id) => byId.has(id))
    : []
  if (!ids.length) {
    const slides = (stored.cards[0] && stored.cards[0].slides) || []
    ids = slides.map((slide) => slide && slide.id).filter((id) => byId.has(String(id))).map((id) => String(id))
  }
  if (!ids.length) return null
  const keep = new Set(ids)
  return {
    audience,
    cards: stored.cards.map((card) => ({
      ...card,
      slides: ((card && card.slides) || []).filter((slide) => slide && keep.has(String(slide.id))),
    })),
    images: ids.map((id) => ({ id, url: byId.get(id).url })),
    source: stored.source || 'stored',
  }
}

async function saveSocialPack(albumId, audience, pack) {
  const { prisma } = require('../lib/prisma')
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { contentPackageJson: true },
  })
  const pkg = album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
    ? { ...album.contentPackageJson }
    : {}
  const socialCards = { ...(pkg.socialCards && typeof pkg.socialCards === 'object' ? pkg.socialCards : {}) }
  socialCards[audience] = {
    cards: pack.cards || [],
    imageIds: (pack.images || []).map((item) => item && item.id).filter(Boolean),
    source: pack.source || '',
    updatedAt: new Date().toISOString(),
  }
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: { ...pkg, socialCards } },
  })
}

async function resolveSocialPack({ album, audience, images, facts, basePack, refresh }) {
  if (!refresh) {
    const stored = rehydrateSocialPack(readStoredSocial(album, audience), images, audience)
    if (stored) return stored
  }
  const key = `${album.id}:${audience}`
  if (writingSocial.has(key)) return writingSocial.get(key)
  const job = (async () => {
    const written = await withModelCards(basePack, audience, facts, images, album)
    try {
      await saveSocialPack(album.id, audience, written)
    } catch (_) {
      /* 这一次先给出去；没存上时下次打开会再写一次 */
    }
    return written
  })()
  writingSocial.set(key, job)
  try {
    return await job
  } finally {
    writingSocial.delete(key)
  }
}

async function getOwnerSocialCards(albumId, userId, options = {}) {
  const { getUserServiceAlbum } = require('./service-album.service')
  const view = await getUserServiceAlbum(albumId, userId)
  assertAlbumCompleted(view)
  const { loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  const images = await loadMaskedMedia(albumId, view)
  const facts = factsFromView(view)
  const pack = buildSocialCardSet({ audience: 'owner', facts, images })
  return resolveSocialPack({
    album,
    audience: 'owner',
    images,
    facts,
    basePack: pack,
    refresh: Boolean(options && options.refresh),
  })
}

async function getMerchantSocialCards(albumId, storeId, merchantId = '', options = {}) {
  const {
    getMerchantCaseDraft,
    loadAlbum,
    buildMerchantView,
  } = require('./service-album.service')
  const data = await getMerchantCaseDraft(albumId, storeId, merchantId)
  const draft = data && data.draft
  if (!draft) {
    const err = new Error('还没有可复制的案例')
    err.status = 404
    throw err
  }
  const album = await loadAlbum(albumId)
  const view = buildMerchantView(album)
  const sectionNotes = (draft.sections || [])
    .map((section) => String((section && section.body) || '').trim())
    .filter(Boolean)
  const images = attachImageIds(draft.media || [], view.imageMeta)
  const facts = {
    ...factsFromView(view, {
      title: draft.title || '',
      summary: draft.caseSummary || '',
    }),
    notes: sectionNotes.length ? sectionNotes : factsFromView(view).notes,
  }
  const pack = buildSocialCardSet({ audience: 'merchant', facts, images })
  return resolveSocialPack({
    album,
    audience: 'merchant',
    images,
    facts,
    basePack: pack,
    refresh: Boolean(options && options.refresh),
  })
}

module.exports = {
  getOwnerSocialCards,
  getMerchantSocialCards,
  attachImageIds,
  priorsFromAlbum,
  rehydrateSocialPack,
}
