const { PART_TYPE } = require('../constants/part-type')

const PART_TYPE_LIST = Object.values(PART_TYPE)

function resolvePartTypeIndex(partType) {
  const index = PART_TYPE_LIST.indexOf(partType)
  return index >= 0 ? index : 0
}

function buildPartWizardRows(planParts = [], parts = []) {
  const linked = new Map()
  const extras = []
  ;(parts || []).forEach((part) => {
    const linkKey = String(part.planPartId || part.linkKey || '').trim()
    if (linkKey) {
      linked.set(linkKey, part)
      return
    }
    if (part.source === 'extra' || !linkKey) {
      extras.push(part)
    }
  })

  const rows = (planParts || []).map((plan) => {
    const existing = linked.get(plan.planPartId)
    const photos = Array.isArray(existing?.photos) ? existing.photos : []
    const partType = existing?.partType || plan.partType || PART_TYPE.BRAND
    return {
      planPartId: plan.planPartId,
      planName: plan.name,
      planType: plan.partType,
      qty: plan.qty || 1,
      partId: existing?.partId || existing?.id || '',
      partName: existing?.partName || existing?.name || plan.name,
      partBrand: existing?.partBrand || plan.partBrand || '',
      partCode: existing?.partCode || plan.partCode || '',
      partType,
      partTypeIndex: resolvePartTypeIndex(partType),
      photos,
      source: 'plan_linked',
      done: Boolean(existing && photos.length && partType),
    }
  })

  const doneCount = rows.filter((row) => row.done).length
  return {
    rows,
    extras,
    progressLabel: planParts.length ? `${doneCount}/${planParts.length}` : '',
    doneCount,
    totalCount: planParts.length,
  }
}

function mergeWizardRowIntoParts(parts = [], row = {}) {
  const list = Array.isArray(parts) ? parts.slice() : []
  const partId = row.partId || `part_${row.planPartId || Date.now()}`
  const payload = {
    partId,
    planPartId: row.planPartId,
    linkKey: row.planPartId,
    partName: String(row.partName || row.planName || '').trim(),
    partBrand: String(row.partBrand || '').trim(),
    partCode: String(row.partCode || '').trim(),
    partType: row.partType || PART_TYPE.BRAND,
    photos: Array.isArray(row.photos) ? row.photos : [],
    source: row.source || 'plan_linked',
  }
  const index = list.findIndex(
    (item) =>
      String(item.planPartId || item.linkKey || '') === String(row.planPartId || ''),
  )
  if (index >= 0) {
    list[index] = { ...list[index], ...payload }
  } else {
    list.push(payload)
  }
  return list
}

function appendExtraPart(parts = [], form = {}) {
  const list = Array.isArray(parts) ? parts.slice() : []
  list.push({
    partId: `part_extra_${Date.now()}`,
    partName: String(form.partName || '').trim(),
    partBrand: String(form.partBrand || '').trim(),
    partCode: String(form.partCode || '').trim(),
    partType: form.partType || PART_TYPE.BRAND,
    photos: Array.isArray(form.photos) ? form.photos : [],
    source: 'extra',
    extraReason: String(form.extraReason || '').trim(),
  })
  return list
}

module.exports = {
  PART_TYPE_LIST,
  buildPartWizardRows,
  mergeWizardRowIntoParts,
  appendExtraPart,
  resolvePartTypeIndex,
}
