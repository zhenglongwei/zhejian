/**
 * 托管预览独立缓存（host_preview_caches）
 *
 * 三块分区，各自按自己的键失效，互不牵连：
 * - copyJson   大模型文案产物 → 按单据事实指纹 copyFingerprint 失效
 * - photosJson 交车补传图归属判定 → 按交车图集合指纹失效；空数组也是有效判定，判过就不再看图
 * - editsJson  商家人工覆盖稿 → 永不过期，展示时优先于 copyJson
 *
 * 打码图不在这张表里：结论只住 flowNodes 图槽，读侧现建索引（hosted-public-mask.service.js）。
 * 取消托管 / 改回仅私密都不清本表 —— 预览缓存的生命周期独立于托管开关。
 * 真源：docs/01_项目总览与业务架构/15_案例档案与托管状态机.md §6.1
 */

const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { stripUrlQuery } = require('../lib/media-signed-url')

function text(value) {
  return String(value == null ? '' : value).trim()
}

function fingerprintOf(parts) {
  return crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 16)
}

/** 交车补传图集合指纹：只有这批图本身变了才重判归属 */
function buildDeliveryPhotoFingerprint(flowNodes) {
  const { collectDeliveryEntryPhotos } = require('../utils/host-delivery-photo-roles')
  const urls = collectDeliveryEntryPhotos(Array.isArray(flowNodes) ? flowNodes : [])
    .map((photo) => stripUrlQuery(text(photo && (photo.url || photo.rawUrl))))
    .filter(Boolean)
    .sort()
  if (!urls.length) return ''
  return fingerprintOf(urls)
}

async function readHostPreviewCache(albumId) {
  const id = text(albumId)
  if (!id) return null
  try {
    return await prisma.hostPreviewCache.findUnique({ where: { albumId: id } })
  } catch (e) {
    console.warn('[host-preview-cache] read failed', { albumId: id, error: String(e && e.message || e) })
    return null
  }
}

/** 只写指定分区，绝不整包覆盖，避免并发写互相冲掉 */
async function patchHostPreviewCache(albumId, patch = {}) {
  const id = text(albumId)
  if (!id) return null
  const data = {}
  if (patch.storeId != null) data.storeId = text(patch.storeId)
  if (patch.merchantId != null) data.merchantId = text(patch.merchantId)
  if (patch.copy !== undefined) data.copyJson = patch.copy
  if (patch.photos !== undefined) data.photosJson = patch.photos
  if (patch.edits !== undefined) data.editsJson = patch.edits
  if (patch.copyFingerprint != null) data.copyFingerprint = text(patch.copyFingerprint)
  if (patch.photoFingerprint != null) data.photoFingerprint = text(patch.photoFingerprint)
  if (!Object.keys(data).length) return null
  try {
    return await prisma.hostPreviewCache.upsert({
      where: { albumId: id },
      create: { albumId: id, ...data },
      update: data,
    })
  } catch (e) {
    console.warn('[host-preview-cache] write failed', { albumId: id, error: String(e && e.message || e) })
    return null
  }
}

function normalizeFaqRows(faq) {
  return (Array.isArray(faq) ? faq : [])
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const q = text(row.q || row.question)
      const a = text(row.a || row.answer)
      if (!q && !a) return null
      return { q, a, needsAnswer: !a }
    })
    .filter(Boolean)
}

/**
 * 人工覆盖稿：摘要要有内容才算数，否则会把模型稿遮成空。
 * faqEdited 认「商家动过问答区」，全删光也是有效编辑，不能把模型问答又放回去。
 */
function buildHostPreviewEdits({ summary, faq } = {}) {
  const hasSummary = Boolean(text(summary))
  const rows = normalizeFaqRows(faq)
  const faqEdited = Array.isArray(faq)
  if (!hasSummary && !rows.length) return null
  return {
    summary: hasSummary ? text(summary) : '',
    faq: rows,
    faqEdited,
    editedAt: new Date().toISOString(),
  }
}

/**
 * 冷启动回填的纯映射：老单据产物只存在 hostMeta 里，搬进缓存而不是重跑模型。
 * 已公开的 geoLayer 是商家确认过的稿子，按人工覆盖处理（永不过期）。
 * @returns {object|null} patch；null = hostMeta 里没有可搬的稿子
 */
function buildHostPreviewBackfillPatch(hostMeta, { copyFingerprint, photoFingerprint } = {}) {
  const meta = hostMeta && typeof hostMeta === 'object' ? hostMeta : {}
  const layer = meta.geoLayer && typeof meta.geoLayer === 'object' ? meta.geoLayer : null
  const draft = meta.geoDraft && typeof meta.geoDraft === 'object' ? meta.geoDraft : null
  const layerConfirmed = Boolean(layer && text(layer.summary))
  // 模型层认草稿；只有已公开没有草稿时，才拿公开内容当模型层
  const modelSource = draft && text(draft.summary) ? draft : layerConfirmed ? layer : null
  if (!modelSource) return null
  const roles = Array.isArray(modelSource.deliveryPhotoRoles)
    ? modelSource.deliveryPhotoRoles
    : (draft && Array.isArray(draft.deliveryPhotoRoles) ? draft.deliveryPhotoRoles : null)
  return {
    copy: modelSource,
    // 指纹认稿子自己带来的，不把上一份事实的产物记成新事实（诚实失效，下次重跑）
    copyFingerprint: text(modelSource.factFingerprint) || text(copyFingerprint),
    ...(layer && layerConfirmed
      ? {
          edits: {
            summary: text(layer.summary),
            faq: normalizeFaqRows(layer.faq),
            faqEdited: true,
            editedAt: String(layer.confirmedAt || new Date().toISOString()),
          },
        }
      : {}),
    ...(roles ? { photos: { deliveryPhotoRoles: roles }, photoFingerprint: text(photoFingerprint) } : {}),
  }
}

/** 回填落库；无 hostMeta 产物时返回 null，让调用方走模型 */
async function backfillHostPreviewCache(albumId, { hostMeta, storeId, merchantId, copyFingerprint, photoFingerprint } = {}) {
  const patch = buildHostPreviewBackfillPatch(hostMeta, { copyFingerprint, photoFingerprint })
  if (!patch) return null
  const row = await patchHostPreviewCache(albumId, {
    storeId: text(storeId),
    merchantId: text(merchantId),
    ...patch,
  })
  return row || readHostPreviewCache(albumId)
}

/**
 * 缓存视图：copy 按事实指纹判活，人工稿永远优先。
 * @returns {{ copy: object|null, edits: object|null, deliveryPhotoRoles: array, photoJudged: boolean, effective: object|null }}
 */
function readHostPreviewView(row, { copyFingerprint, photoFingerprint } = {}) {
  const copy = row && row.copyJson && typeof row.copyJson === 'object' ? row.copyJson : null
  const edits = row && row.editsJson && typeof row.editsJson === 'object' ? row.editsJson : null
  const photos = row && row.photosJson && typeof row.photosJson === 'object' ? row.photosJson : null
  const rowCopyFingerprint = text(row && row.copyFingerprint)
  const copyAlive =
    Boolean(copy && text(copy.summary)) &&
    (!rowCopyFingerprint || !text(copyFingerprint) || rowCopyFingerprint === text(copyFingerprint))
  const photoJudged =
    Boolean(text(row && row.photoFingerprint)) &&
    text(row && row.photoFingerprint) === text(photoFingerprint)
  const deliveryPhotoRoles = photoJudged && Array.isArray(photos && photos.deliveryPhotoRoles)
    ? photos.deliveryPhotoRoles
    : []
  const base = copyAlive ? copy : null
  const effective =
    base || edits
      ? {
          ...(base || {}),
          ...(text(edits && edits.summary) ? { summary: text(edits.summary) } : {}),
          ...(edits && edits.faqEdited ? { faq: normalizeFaqRows(edits.faq) } : {}),
          humanEdited: Boolean(edits && (text(edits.summary) || edits.faqEdited)),
        }
      : null
  return {
    copy: copyAlive ? copy : null,
    edits,
    deliveryPhotoRoles,
    photoJudged,
    effective,
  }
}

module.exports = {
  readHostPreviewCache,
  patchHostPreviewCache,
  buildHostPreviewBackfillPatch,
  backfillHostPreviewCache,
  buildHostPreviewEdits,
  buildDeliveryPhotoFingerprint,
  readHostPreviewView,
  normalizeFaqRows,
}
