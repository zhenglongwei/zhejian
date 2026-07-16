/**
 * 专题 ↔ 案例双向挂载：geo_pages.relatedCaseIds ↔ enrichment.topicMountIds
 */
const { prisma } = require('../lib/prisma')
const {
  resolveCaseEnrichment,
  mergeCaseEnrichmentPatch,
} = require('../schemas/case-enrichment.schema')

function uniqueIds(list) {
  return [...new Set((list || []).map((id) => String(id || '').trim()).filter(Boolean))]
}

async function patchCaseTopicMount(caseId, geoPageId, action) {
  const row = await prisma.publicCase.findUnique({ where: { id: caseId } })
  if (!row) return false
  const current = resolveCaseEnrichment(row) || { version: 1, topicMountIds: [] }
  const set = new Set(uniqueIds(current.topicMountIds))
  if (action === 'add') set.add(geoPageId)
  if (action === 'remove') set.delete(geoPageId)
  const nextIds = [...set]
  const prevIds = uniqueIds(current.topicMountIds)
  if (nextIds.join(',') === prevIds.join(',')) return false

  const nextEnrichment = mergeCaseEnrichmentPatch(
    current,
    { topicMountIds: nextIds },
    {
      bumpVersion: true,
      previousVersion: row.enrichmentVersion ?? current.version ?? 0,
    },
  )
  await prisma.publicCase.update({
    where: { id: caseId },
    data: {
      enrichmentJson: nextEnrichment,
      enrichmentVersion: nextEnrichment.version,
    },
  })
  return true
}

async function syncGeoPageCaseMounts(geoPageId, previousCaseIds, nextCaseIds) {
  const prev = new Set(uniqueIds(previousCaseIds))
  const next = new Set(uniqueIds(nextCaseIds))
  const added = [...next].filter((id) => !prev.has(id))
  const removed = [...prev].filter((id) => !next.has(id))
  for (const caseId of added) {
    await patchCaseTopicMount(caseId, geoPageId, 'add')
  }
  for (const caseId of removed) {
    await patchCaseTopicMount(caseId, geoPageId, 'remove')
  }
  return { added: added.length, removed: removed.length }
}

module.exports = {
  syncGeoPageCaseMounts,
  patchCaseTopicMount,
}
