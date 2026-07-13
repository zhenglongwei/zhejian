/**
 * GEO-IGAIN-G04 · 无案例服务页 noindex 审计冒烟
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const { auditServicePagesIndexability } = require('../src/services/geo-topic-health.service')

async function main() {
  const audit = await auditServicePagesIndexability()
  if (!audit.passed) {
    const sample = audit.violations.slice(0, 5).map((row) => row.slug).join(', ')
    throw new Error(`服务页 noindex 审计未通过：${audit.violationCount} 条违规（${sample}）`)
  }
  console.log('[geo-service-noindex-smoke] ok', {
    serviceCount: audit.serviceCount,
    indexableCount: audit.indexableCount,
    noindexCount: audit.noindexCount,
  })
}

main()
  .catch((error) => {
    console.error('[geo-service-noindex-smoke] ❌', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
