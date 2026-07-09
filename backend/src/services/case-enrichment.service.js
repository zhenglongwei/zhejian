/**
 * CASE-ENR-01 · enrichment_json 持久化与 backfill
 */
const { prisma } = require('../lib/prisma')
const {
  buildEnrichmentFromPublicCaseRow,
  mergeCaseEnrichmentPatch,
  mirrorEnrichmentGeoToContentJson,
} = require('../schemas/case-enrichment.schema')
const { extractSnapshotFromContentJson } = require('../schemas/case-snapshot.schema')

function snapshotFingerprint(contentJson) {
  const snap = extractSnapshotFromContentJson(contentJson)
  return snap ? JSON.stringify(snap) : ''
}

function assertSnapshotPreserved(beforeContentJson, afterContentJson) {
  const before = snapshotFingerprint(beforeContentJson)
  if (!before) return
  const after = snapshotFingerprint(afterContentJson)
  if (before !== after) {
    const err = new Error('提炼层持久化不可修改案例快照')
    err.status = 409
    err.code = 'ENRICHMENT_SNAPSHOT_MUTATION'
    throw err
  }
}

/**
 * @param {object} row
 * @param {object} patch
 * @param {{ bumpVersion?: boolean, syncContentJsonGeo?: boolean, db?: object }} options
 */
async function persistCaseEnrichmentForRow(row, patch = {}, options = {}) {
  const db = options.db || prisma
  if (!row?.id) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }

  const current = buildEnrichmentFromPublicCaseRow(row)
  const next = mergeCaseEnrichmentPatch(current, patch, {
    bumpVersion: options.bumpVersion !== false,
    previousVersion: row.enrichmentVersion ?? current.version ?? 0,
  })

  const data = {
    enrichmentJson: next,
    enrichmentVersion: next.version,
  }

  let nextContentJson = row.contentJson
  if (options.syncContentJsonGeo !== false) {
    nextContentJson = mirrorEnrichmentGeoToContentJson(row.contentJson, next)
    data.contentJson = nextContentJson
    if (patch.aiSummary != null) {
      data.aiSummary = next.aiSummary
      data.summary = next.aiSummary.slice(0, 200)
    }
    if (patch.seoTitle != null) data.seoTitle = next.seoTitle
    if (patch.seoDescription != null) data.seoDescription = next.seoDescription
  }

  assertSnapshotPreserved(row.contentJson, nextContentJson)

  await db.publicCase.update({
    where: { id: row.id },
    data,
  })

  return next
}

/**
 * @param {object} row public_cases 行（含 contentJson）
 * @param {{ bumpVersion?: boolean }} [options]
 */
function buildPersistedEnrichment(row, options = {}) {
  const current = buildEnrichmentFromPublicCaseRow(row)
  if (!options.bumpVersion) return current
  return mergeCaseEnrichmentPatch(current, {}, {
    bumpVersion: true,
    previousVersion: row.enrichmentVersion ?? current.version ?? 0,
  })
}

/**
 * @param {string} caseId
 * @param {object} patch enrichment patch
 * @param {{ bumpVersion?: boolean, syncContentJsonGeo?: boolean, db?: object, row?: object }} [options]
 */
async function persistCaseEnrichment(caseId, patch = {}, options = {}) {
  const db = options.db || prisma
  const row =
    options.row ||
    (await db.publicCase.findUnique({
      where: { id: caseId },
    }))
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  return persistCaseEnrichmentForRow(row, patch, options)
}

/**
 * 单条 backfill（幂等：已有 enrichment_json 且 version>=1 则跳过，除非 force）
 * @param {object} row
 * @param {{ force?: boolean }} [options]
 */
async function backfillCaseEnrichmentRow(row, options = {}) {
  if (!row?.id) return { skipped: true, reason: 'no_id' }
  const hasColumn =
    row.enrichmentJson &&
    typeof row.enrichmentJson === 'object' &&
    Number(row.enrichmentJson.version) >= 1
  if (hasColumn && !options.force) {
    return { skipped: true, caseId: row.id, reason: 'already_backfilled' }
  }

  const enrichment = buildEnrichmentFromPublicCaseRow(row)
  await prisma.publicCase.update({
    where: { id: row.id },
    data: {
      enrichmentJson: enrichment,
      enrichmentVersion: enrichment.version,
    },
  })
  return { skipped: false, caseId: row.id, version: enrichment.version }
}

/**
 * @param {{ limit?: number, force?: boolean }} [options]
 */
async function backfillAllCaseEnrichment(options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : 500
  const rows = await prisma.publicCase.findMany({
    take: limit,
    orderBy: { updatedAt: 'desc' },
  })

  let updated = 0
  let skipped = 0
  for (const row of rows) {
    const result = await backfillCaseEnrichmentRow(row, { force: options.force })
    if (result.skipped) skipped += 1
    else updated += 1
  }
  return { total: rows.length, updated, skipped }
}

module.exports = {
  buildPersistedEnrichment,
  persistCaseEnrichment,
  persistCaseEnrichmentForRow,
  assertSnapshotPreserved,
  backfillCaseEnrichmentRow,
  backfillAllCaseEnrichment,
}
