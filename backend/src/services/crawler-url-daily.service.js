/**
 * GEO-OBS-A01/A03 · 爬虫 URL 日聚合
 */
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { CRAWLER_EVENT_NAME } = require('../constants/crawler-bots')
const { inferPageType } = require('./crawler-track.service')

function formatStatDate(date) {
  const d = date instanceof Date ? date : new Date(date)
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

function buildRowId(statDate, url, botType) {
  const day = statDate.toISOString().slice(0, 10)
  const raw = `${day}|${url}|${botType}`
  return `cud_${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 24)}`
}

function normalizeCrawlerUrl(pagePath) {
  const value = String(pagePath || '').trim()
  if (!value) return '/'
  try {
    const url = value.startsWith('http') ? new URL(value) : new URL(value, 'https://geo.example')
    return (url.pathname || '/').slice(0, 512)
  } catch {
    return value.split('?')[0].slice(0, 512) || '/'
  }
}

function resolveDayRange(dateInput) {
  const base = dateInput ? new Date(dateInput) : new Date()
  const statDate = formatStatDate(base)
  const start = new Date(statDate)
  const end = new Date(statDate)
  end.setUTCDate(end.getUTCDate() + 1)
  return { statDate, start, end }
}

/**
 * @param {{ date?: string|Date, merchantId?: string }} [options]
 */
async function aggregateCrawlerUrlDaily(options = {}) {
  const { statDate, start, end } = resolveDayRange(options.date)
  const rows = await prisma.eventTrackingLog.findMany({
    where: {
      eventName: CRAWLER_EVENT_NAME,
      createdAt: { gte: start, lt: end },
    },
    select: {
      pagePath: true,
      source: true,
      eventParams: true,
    },
  })

  const buckets = new Map()
  for (const row of rows) {
    const params =
      row.eventParams && typeof row.eventParams === 'object' ? row.eventParams : {}
    const url = normalizeCrawlerUrl(row.pagePath)
    const botType = String(params.botType || row.source || 'unknown').slice(0, 64)
    const pageType = String(params.pageType || inferPageType(url)).slice(0, 32)
    const key = `${url}|${botType}`
    const existing = buckets.get(key) || { url, botType, pageType, hitCount: 0 }
    existing.hitCount += 1
    buckets.set(key, existing)
  }

  let upserted = 0
  for (const bucket of buckets.values()) {
    const id = buildRowId(statDate, bucket.url, bucket.botType)
    await prisma.crawlerUrlDaily.upsert({
      where: { id },
      create: {
        id,
        statDate,
        url: bucket.url,
        pageType: bucket.pageType,
        botType: bucket.botType,
        hitCount: bucket.hitCount,
      },
      update: {
        pageType: bucket.pageType,
        hitCount: bucket.hitCount,
      },
    })
    upserted += 1
  }

  return {
    statDate: statDate.toISOString().slice(0, 10),
    eventCount: rows.length,
    bucketCount: upserted,
  }
}

function sinceDays(days) {
  const value = Math.min(Math.max(Number(days) || 7, 1), 90)
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - value)
  since.setUTCHours(0, 0, 0, 0)
  return since
}

/**
 * @param {{ days?: number, limit?: number }} [query]
 */
async function queryCrawlerUrlStats(query = {}) {
  const days = Math.min(Math.max(Number(query.days) || 7, 1), 90)
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  const since = sinceDays(days)

  const rows = await prisma.crawlerUrlDaily.findMany({
    where: { statDate: { gte: since } },
    orderBy: [{ statDate: 'desc' }],
  })

  const botMap = new Map()
  const urlMap = new Map()
  const dayMap = new Map()
  const pageTypeMap = new Map()
  const urlSet = new Set()

  rows.forEach((row) => {
    botMap.set(row.botType, (botMap.get(row.botType) || 0) + row.hitCount)
    urlMap.set(row.url, (urlMap.get(row.url) || 0) + row.hitCount)
    const day = row.statDate.toISOString().slice(0, 10)
    dayMap.set(day, (dayMap.get(day) || 0) + row.hitCount)
    pageTypeMap.set(row.pageType, (pageTypeMap.get(row.pageType) || 0) + row.hitCount)
    urlSet.add(row.url)
  })

  const botDistribution = [...botMap.entries()]
    .map(([botType, hitCount]) => ({ botType, hitCount }))
    .sort((a, b) => b.hitCount - a.hitCount)

  const topUrls = [...urlMap.entries()]
    .map(([url, hitCount]) => ({ url, hitCount }))
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, limit)

  const dailyTrend = [...dayMap.entries()]
    .map(([date, hitCount]) => ({ date, hitCount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const pageTypeDistribution = [...pageTypeMap.entries()]
    .map(([pageType, hitCount]) => ({ pageType, hitCount }))
    .sort((a, b) => b.hitCount - a.hitCount)

  return {
    days,
    totalHits: rows.reduce((sum, row) => sum + row.hitCount, 0),
    uniqueUrlCount: urlSet.size,
    botDistribution,
    topUrls,
    dailyTrend,
    pageTypeDistribution,
  }
}

module.exports = {
  aggregateCrawlerUrlDaily,
  queryCrawlerUrlStats,
  normalizeCrawlerUrl,
}
