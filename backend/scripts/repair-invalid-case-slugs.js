/**
 * 修复误用中文标题作为 slug 的公开案例（Nginx 无法路由 → H5 404）
 *
 * 用法（读 backend/.env DATABASE_URL）：
 *   node scripts/repair-invalid-case-slugs.js
 *   node scripts/repair-invalid-case-slugs.js --dry-run
 *   node scripts/repair-invalid-case-slugs.js --case-id=case_svc_mrvw2nuh_aaa607
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const { extractSnapshotFromContentJson } = require('../src/schemas/case-snapshot.schema')
const {
  isH5RoutableCaseSlug,
  resolveRoutableCaseSlug,
  resolveCaseCanonicalPath,
} = require('../src/utils/case-slug')
const {
  buildEnrichmentFromPublicCaseRow,
  mergeCaseEnrichmentPatch,
} = require('../src/schemas/case-enrichment.schema')

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function parseArg(name) {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length).trim() : ''
}

function slugLooksInvalid(slug) {
  const value = String(slug || '').trim()
  if (!value) return false
  return !isH5RoutableCaseSlug(value)
}

async function main() {
  const dryRun = hasFlag('dry-run')
  const caseId = parseArg('case-id') || parseArg('caseId')
  const where = caseId ? { id: caseId } : { slug: { not: null } }
  const rows = await prisma.publicCase.findMany({
    where,
    select: {
      id: true,
      slug: true,
      canonicalPath: true,
      city: true,
      serviceName: true,
      contentJson: true,
      enrichmentJson: true,
      enrichmentVersion: true,
    },
  })

  const targets = rows.filter((row) => slugLooksInvalid(row.slug))
  console.log(
    `[repair-invalid-case-slugs] scanned=${rows.length} invalid=${targets.length} dryRun=${dryRun}`
  )

  let updated = 0
  for (const row of targets) {
    const snapshot = extractSnapshotFromContentJson(row.contentJson) || {}
    const slug = await resolveRoutableCaseSlug(prisma, {
      existingSlug: '',
      city: row.city || snapshot.city,
      vehicle: snapshot.vehicle || {},
      serviceName: row.serviceName || snapshot.serviceName,
      caseId: row.id,
    })
    const canonicalPath = resolveCaseCanonicalPath({ slug, caseId: row.id })
    console.log(`  ${row.id}: ${JSON.stringify(row.slug)} -> ${slug}`)

    if (dryRun) continue

    const enrichment = mergeCaseEnrichmentPatch(
      buildEnrichmentFromPublicCaseRow(row),
      { slug, canonicalPath },
      { bumpVersion: false, previousVersion: row.enrichmentVersion ?? 0 }
    )
    await prisma.publicCase.update({
      where: { id: row.id },
      data: {
        slug,
        canonicalPath,
        enrichmentJson: enrichment,
        enrichmentVersion: enrichment.version,
      },
    })
    updated += 1
  }

  console.log(`[repair-invalid-case-slugs] done updated=${updated}`)
}

main()
  .catch((e) => {
    console.error('[repair-invalid-case-slugs] failed', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
