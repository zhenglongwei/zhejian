/**
 * GEO-OBS-A08 · 爬虫统计冒烟
 */
require('dotenv').config()
const { ingestCrawlerEntries } = require('../src/services/crawler-track.service')
const { aggregateCrawlerUrlDaily, queryCrawlerUrlStats } = require('../src/services/crawler-url-daily.service')
const { getAdminCrawlerStats } = require('../src/services/admin-crawler-stats.service')
const { prisma } = require('../src/lib/prisma')

async function main() {
  const sampleCase = await prisma.publicCase.findFirst({
    where: { status: 'public_approved' },
    select: { id: true, storeId: true },
  })
  if (!sampleCase) {
    console.log('[crawler-stats-smoke] skip ingest: no public case')
  } else {
    const uri = `/case/view.html?id=${sampleCase.id}`
    const now = new Date().toISOString()
    await ingestCrawlerEntries([
      `${now}|${uri}|Mozilla/5.0 GPTBot|GPTBot|127.0.0.1`,
    ])
  }

  const agg = await aggregateCrawlerUrlDaily({ date: new Date() })
  const stats = await queryCrawlerUrlStats({ days: 7, limit: 5 })
  const admin = await getAdminCrawlerStats({ days: 7, limit: 5 })
  console.log('[crawler-stats-smoke] ok', {
    agg,
    totalHits: stats.totalHits,
    topUrls: stats.topUrls.length,
    disclaimer: Boolean(admin.disclaimer),
  })
}

main()
  .catch((error) => {
    console.error('[crawler-stats-smoke] failed', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
