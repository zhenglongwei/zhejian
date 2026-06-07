/**
 * B-TRACK-04 冒烟：爬虫 UA 识别 + 入库 + 日聚合字段
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const {
  classifyCrawlerUserAgent,
  recordCrawlerView,
} = require('../src/services/crawler-track.service')
const { runDailyAggregation } = require('../src/services/merchant-daily-stats.service')
const { formatShanghaiDate } = require('../src/lib/shanghai-date')

const prisma = new PrismaClient()

async function main() {
  const bot = classifyCrawlerUserAgent('Mozilla/5.0 AppleWebKit/537.36 GPTBot/1.0')
  if (bot !== 'gptbot') throw new Error(`classify failed: ${bot}`)

  const sampleCase = await prisma.publicCase.findFirst({
    where: { status: 'public_approved' },
    select: { id: true, storeId: true },
  })
  if (!sampleCase) {
    console.log('[crawler-smoke] skip ingest: no public case')
    return
  }

  const ts = new Date().toISOString()
  const path = `/case/view.html?id=${sampleCase.id}`
  const r1 = await recordCrawlerView({
    timestamp: ts,
    path,
    userAgent: 'GPTBot/1.0',
    botType: 'gptbot',
    ip: '127.0.0.1',
  })
  const r2 = await recordCrawlerView({
    timestamp: ts,
    path,
    userAgent: 'GPTBot/1.0',
    botType: 'gptbot',
    ip: '127.0.0.1',
  })
  if (!r1.accepted) throw new Error('first ingest failed')
  if (!r2.duplicated && r2.reason !== 'duplicate') {
    throw new Error('expected duplicate on second ingest')
  }

  const today = formatShanghaiDate(new Date())
  const agg = await runDailyAggregation({ date: today, storeId: sampleCase.storeId })
  console.log('[crawler-smoke] ok', { storeId: sampleCase.storeId, agg, ingest: r1 })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
