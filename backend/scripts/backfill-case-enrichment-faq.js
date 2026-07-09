/**
 * CASE-ENR-04 · 存量案例 enrichment 聚合 FAQ backfill
 */
const { backfillCaseEnrichmentAggregateFaq } = require('../src/services/case-enrichment-aggregate.service')

async function main() {
  const limit = Number(process.argv[2]) || 200
  const caseId = process.env.CASE_ID || ''
  const result = await backfillCaseEnrichmentAggregateFaq({
    limit,
    caseId: caseId || undefined,
  })
  console.log('[case-enrichment-faq-backfill]', result)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
