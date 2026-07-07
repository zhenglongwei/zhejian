const DIFF_FIELDS = ['name', 'partType', 'partBrand', 'partCode', 'qty']

function normStr(value) {
  return String(value || '').trim().toLowerCase()
}

function normQty(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 1
}

function computeFieldDiffs(planPart, albumPart) {
  if (!planPart || !albumPart) return []
  const diffs = []
  if (normStr(planPart.name) !== normStr(albumPart.name)) diffs.push('name')
  if (normStr(planPart.partType) !== normStr(albumPart.partType)) diffs.push('partType')
  if (normStr(planPart.partBrand) !== normStr(albumPart.partBrand)) diffs.push('partBrand')
  if (normStr(planPart.partCode) !== normStr(albumPart.partCode)) diffs.push('partCode')
  if (normQty(planPart.qty) !== normQty(albumPart.qty)) diffs.push('qty')
  return diffs
}

function normalizePlanParts(planPartsJson) {
  const list = Array.isArray(planPartsJson) ? planPartsJson : []
  return list
    .filter((part) => part && String(part.name || part.partName || '').trim())
    .filter((part) => part.status !== 'draft')
    .map((part, index) => ({
      planPartId: String(part.planPartId || part.id || `plan_${index + 1}`),
      name: String(part.name || part.partName || '').trim(),
      partType: part.partType || part.type || '',
      partBrand: part.partBrand || part.brand || '',
      partCode: part.partCode || part.code || '',
      qty: normQty(part.qty || part.quantity),
    }))
}

function normalizeAlbumParts(partsJson) {
  const list = Array.isArray(partsJson) ? partsJson : []
  return list.map((part, index) => {
    const photos = Array.isArray(part.photos) ? part.photos : []
    const planPartId = String(part.planPartId || part.linkKey || '').trim()
    const source = part.source || (planPartId ? 'plan_linked' : 'extra')
    return {
      partKey: String(part.partId || part.id || index),
      planPartId,
      name: String(part.name || part.partName || `配件 ${index + 1}`).trim(),
      partType: part.partType || part.type || '',
      partBrand: part.partBrand || part.brand || '',
      partCode: part.partCode || part.code || '',
      qty: normQty(part.qty || part.quantity),
      thumbUrl: part.thumbUrl || part.imageUrl || photos[0] || '',
      source,
    }
  })
}

function resolvePairPartKey(planPart, albumPart) {
  if (albumPart && albumPart.partKey) return albumPart.partKey
  if (planPart && planPart.planPartId) return `plan:${planPart.planPartId}`
  return ''
}

function buildPartVerifyPairs(planParts, albumParts) {
  const albumByPlanId = new Map()
  const usedAlbumKeys = new Set()

  albumParts.forEach((albumPart) => {
    const linkId = albumPart.planPartId
    if (linkId) albumByPlanId.set(linkId, albumPart)
  })

  const pairs = []
  const extras = []

  planParts.forEach((planPart) => {
    const albumPart = albumByPlanId.get(planPart.planPartId)
    if (albumPart) {
      usedAlbumKeys.add(albumPart.partKey)
      const fieldDiffs = computeFieldDiffs(planPart, albumPart)
      pairs.push({
        partKey: albumPart.partKey,
        linkStatus: fieldDiffs.length ? 'field_diff' : 'linked',
        fieldDiffs,
        planPart,
        albumPart,
      })
      return
    }
    pairs.push({
      partKey: resolvePairPartKey(planPart, null),
      linkStatus: 'plan_only',
      fieldDiffs: [],
      planPart,
      albumPart: null,
    })
  })

  albumParts.forEach((albumPart) => {
    if (usedAlbumKeys.has(albumPart.partKey)) return
    extras.push({
      partKey: albumPart.partKey,
      linkStatus: 'album_only',
      fieldDiffs: [],
      planPart: null,
      albumPart,
    })
  })

  return { pairs, extras }
}

function hasStructuredPlanParts(planPartsJson, planPartsLockedAt) {
  const planParts = normalizePlanParts(planPartsJson)
  if (!planParts.length) return false
  if (planPartsLockedAt) return true
  const raw = Array.isArray(planPartsJson) ? planPartsJson : []
  return raw.some((part) => part && part.status === 'confirmed')
}

module.exports = {
  DIFF_FIELDS,
  computeFieldDiffs,
  normalizePlanParts,
  normalizeAlbumParts,
  buildPartVerifyPairs,
  hasStructuredPlanParts,
  resolvePairPartKey,
}
