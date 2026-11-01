/**
 * 短图文读侧：按相册 / 案例事实现算，只带打码图。
 */
const { SERVICE_ALBUM_STATUS } = require('../constants/v2')
const { buildSocialCardSet, sanitizeFacts } = require('../../../utils/album-social-card')
const { writePlatformCards } = require('./album-social-card-llm.service')

async function withModelCards(pack, audience, facts, images) {
  try {
    const written = await writePlatformCards({
      audience,
      facts: sanitizeFacts(facts),
      images,
    })
    if (written && written.cards) {
      return { ...pack, cards: written.cards, source: written.source }
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

async function getOwnerSocialCards(albumId, userId) {
  const { getUserServiceAlbum } = require('./service-album.service')
  const view = await getUserServiceAlbum(albumId, userId)
  assertAlbumCompleted(view)
  const images = await loadMaskedMedia(albumId, view)
  const facts = factsFromView(view)
  const pack = buildSocialCardSet({ audience: 'owner', facts, images })
  return withModelCards(pack, 'owner', facts, images)
}

async function getMerchantSocialCards(albumId, storeId, merchantId = '') {
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
  return withModelCards(pack, 'merchant', facts, images)
}

module.exports = {
  getOwnerSocialCards,
  getMerchantSocialCards,
  attachImageIds,
}
