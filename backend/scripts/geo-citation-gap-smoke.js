/**
 * GEO-OBS-C · Citation gap 冒烟
 */
require('dotenv').config()
const { buildAdminCitationGaps } = require('../src/services/admin-geo-citation-gap.service')
const { prisma } = require('../src/lib/prisma')

async function main() {
  const report = await buildAdminCitationGaps({ days: 14, limit: 5 })
  console.log('[geo-citation-gap-smoke] ok', {
    intentCount: report.metrics.intent_count,
    topGaps: (report.topGaps || []).length,
    topicTodos: (report.topicTodos || []).length,
    topicRecommendations: (report.topicRecommendations || []).length,
  })
}

main()
  .catch((error) => {
    console.error('[geo-citation-gap-smoke] failed', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
