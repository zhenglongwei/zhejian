const { PART_TYPE } = require('../constants/part-type')

const PART_TYPE_LIST = Object.values(PART_TYPE)

function resolvePartTypeIndex(partType) {
  const index = PART_TYPE_LIST.indexOf(partType)
  return index >= 0 ? index : 0
}

function rowFromPart(part = {}, plan = null) {
  const photos = Array.isArray(part.photos) ? part.photos : []
  const quotedType = String(plan?.partType || '').trim()
  const partType = quotedType || String(part.partType || '').trim()
  const typeLocked = Boolean(quotedType)
  const displayName = String(part.partName || part.name || plan?.name || '').trim()
  const planPartId = String(part.planPartId || part.linkKey || plan?.planPartId || '').trim()
  return {
    planPartId: planPartId || `part_${part.partId || part.id || Date.now()}`,
    planName: plan?.name || part.partName || part.name || '',
    planType: plan?.partType || '',
    qty: plan?.qty || part.qty || 1,
    partId: part.partId || part.id || '',
    partName: displayName,
    partBrand: part.partBrand || plan?.partBrand || '',
    partCode: part.partCode || plan?.partCode || '',
    partType,
    typeLocked,
    partTypeIndex: partType ? resolvePartTypeIndex(partType) : 0,
    photos,
    source: part.source || (planPartId ? 'plan_linked' : 'extra'),
    done: Boolean(photos.length && partType),
  }
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

  let rows = []
  if ((planParts || []).length) {
    rows = (planParts || []).map((plan) => {
      const existing = linked.get(plan.planPartId)
      return rowFromPart(existing || {}, plan)
    })
  } else if ((parts || []).length) {
    rows = (parts || [])
      .filter((part) => part.source !== 'extra')
      .map((part) => rowFromPart(part, null))
  }

  const extraRows = extras.map((part) => rowFromPart(part, null))
  const allRows = rows.concat(extraRows)
  const doneCount = allRows.filter((row) => row.done).length
  return {
    rows: allRows,
    extras,
    progressLabel: allRows.length ? `${doneCount}/${allRows.length}` : '',
    doneCount,
    totalCount: allRows.length,
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
    partType:
      row.typeLocked && row.planType
        ? row.planType
        : String(row.partType || '').trim(),
    photos: Array.isArray(row.photos) ? row.photos : [],
    source: row.source || 'plan_linked',
    qty: row.qty || 1,
  }
  const index = list.findIndex(
    (item) =>
      String(item.partId || item.id || '') === String(partId) ||
      (row.planPartId &&
        String(item.planPartId || item.linkKey || '') === String(row.planPartId)),
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

function appendManualPartRow(planParts = [], parts = [], form = {}) {
  const planPartId = `plan_${Date.now()}`
  const name = String(form.partName || '').trim()
  const quotedType = String(form.partType || '').trim()
  const nextPlan = (planParts || []).concat([
    {
      planPartId,
      name,
      ...(quotedType ? { partType: quotedType } : {}),
      partBrand: String(form.partBrand || '').trim(),
      partCode: String(form.partCode || '').trim(),
      qty: 1,
      status: 'confirmed',
    },
  ])
  const nextParts = mergeWizardRowIntoParts(parts, {
    planPartId,
    planName: name,
    partName: name,
    ...(quotedType ? { partType: quotedType } : {}),
    partBrand: form.partBrand,
    partCode: form.partCode,
    photos: [],
    source: 'plan_linked',
    qty: 1,
  })
  return { planParts: nextPlan, parts: nextParts }
}

function removeWorkspaceRow(parts = [], planParts = [], row = {}) {
  const planPartId = String(row.planPartId || '').trim()
  const partId = String(row.partId || '').trim()
  const nextParts = (parts || []).filter((part) => {
    if (partId && String(part.partId || part.id || '') === partId) return false
    if (planPartId && String(part.planPartId || part.linkKey || '') === planPartId) {
      return false
    }
    return true
  })
  const nextPlan = planPartId
    ? (planParts || []).filter((plan) => String(plan.planPartId || '') !== planPartId)
    : planParts || []
  return { planParts: nextPlan, parts: nextParts }
}

module.exports = {
  PART_TYPE_LIST,
  buildPartWizardRows,
  mergeWizardRowIntoParts,
  appendExtraPart,
  appendManualPartRow,
  removeWorkspaceRow,
  resolvePartTypeIndex,
}
