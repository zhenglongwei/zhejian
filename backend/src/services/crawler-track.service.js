const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { CRAWLER_UA_PATTERNS, CRAWLER_EVENT_NAME } = require('../constants/crawler-bots')

function classifyCrawlerUserAgent(userAgent) {
  const ua = String(userAgent || '').trim()
  if (!ua) return ''
  for (const item of CRAWLER_UA_PATTERNS) {
    if (item.pattern.test(ua)) return item.type
  }
  return ''
}

function parseRequestUri(rawUri) {
  const value = String(rawUri || '').trim()
  if (!value) return { path: '', query: {} }
  try {
    const url = value.startsWith('http') ? new URL(value) : new URL(value, 'https://geo.example')
    const query = {}
    url.searchParams.forEach((v, k) => {
      query[k] = v
    })
    return { path: url.pathname || '/', query }
  } catch {
    const [path, qs] = value.split('?')
    const query = {}
    if (qs) {
      for (const part of qs.split('&')) {
        const [k, v] = part.split('=')
        if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '')
      }
    }
    return { path: path || '/', query }
  }
}

function inferPageType(path) {
  const p = String(path || '')
  if (p.startsWith('/case')) return 'case'
  if (p.startsWith('/store')) return 'store'
  if (p.startsWith('/service')) return 'service'
  if (p.startsWith('/album')) return 'album'
  if (p === '/' || p === '/index.html') return 'home'
  return 'other'
}

async function resolveStoreContext({ path, query }) {
  const pageType = inferPageType(path)
  const ctx = {
    pageType,
    storeId: '',
    caseId: '',
    serviceItemId: '',
    planId: '',
  }

  if (pageType === 'case') {
    const caseId =
      query.id ||
      query.caseId ||
      (path.match(/\/case\/([a-zA-Z0-9_-]+)\.html$/) || [])[1] ||
      ''
    if (caseId && caseId !== 'view' && caseId !== 'index') {
      ctx.caseId = caseId
      const row = await prisma.publicCase.findUnique({
        where: { id: caseId },
        select: { storeId: true },
      })
      if (row) ctx.storeId = row.storeId || ''
    }
    return ctx
  }

  if (pageType === 'store') {
    const storeId =
      (path.match(/\/store\/([a-zA-Z0-9_-]+)\.html$/) || [])[1] ||
      query.id ||
      query.storeId ||
      ''
    if (storeId && storeId !== 'view' && storeId !== 'index') {
      ctx.storeId = storeId
    }
    return ctx
  }

  if (pageType === 'service') {
    const planId =
      (path.match(/\/service\/([a-zA-Z0-9_-]+)\.html$/) || [])[1] ||
      query.id ||
      ''
    if (planId && planId !== 'view') {
      ctx.planId = planId
      const row = await prisma.merchantServicePlan.findUnique({
        where: { id: planId },
        select: { storeId: true, serviceItemId: true },
      })
      if (row) {
        ctx.storeId = row.storeId || ''
        ctx.serviceItemId = row.serviceItemId || ''
      }
    }
    return ctx
  }

  return ctx
}

function buildEventId({ timestamp, path, botType, ip }) {
  const raw = `${timestamp}|${path}|${botType}|${ip}`
  return `crw_${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 24)}`
}

async function recordCrawlerView(entry) {
  const botType = entry.botType || classifyCrawlerUserAgent(entry.userAgent)
  if (!botType) return { skipped: true, reason: 'not_crawler' }

  const { path, query } = parseRequestUri(entry.path || entry.requestUri || entry.uri)
  const ctx = await resolveStoreContext({ path, query })
  const pagePath = `${path}${query.id ? `?id=${query.id}` : ''}`.slice(0, 512)
  const eventId = buildEventId({
    timestamp: entry.timestamp || entry.time || Date.now(),
    path: pagePath,
    botType,
    ip: entry.ip || entry.remoteAddr || '',
  })

  const existing = await prisma.eventTrackingLog.findUnique({
    where: { eventId },
    select: { eventId: true },
  })
  if (existing) return { skipped: true, reason: 'duplicate', eventId }

  await prisma.eventTrackingLog.create({
    data: {
      id: newId('trk'),
      eventId,
      eventName: CRAWLER_EVENT_NAME,
      userId: '',
      role: 'crawler',
      sessionId: '',
      pagePath,
      referrer: String(entry.referrer || '').slice(0, 512),
      source: botType,
      channel: 'crawler',
      city: '',
      eventParams: {
        botType,
        pageType: ctx.pageType,
        storeId: ctx.storeId,
        caseId: ctx.caseId,
        serviceItemId: ctx.serviceItemId,
        planId: ctx.planId,
        userAgent: String(entry.userAgent || '').slice(0, 256),
      },
      createdAt: entry.timestamp ? new Date(entry.timestamp) : undefined,
    },
  })

  return { accepted: true, eventId, storeId: ctx.storeId, botType }
}

function parseNginxCrawlerLogLine(line) {
  const text = String(line || '').trim()
  if (!text || text.startsWith('#')) return null
  const parts = text.split('|')
  if (parts.length < 4) return null
  const [timestamp, requestUri, userAgent, botType, remoteAddr] = parts
  const resolvedBot = botType || classifyCrawlerUserAgent(userAgent)
  if (!resolvedBot) return null
  return {
    timestamp,
    path: requestUri,
    userAgent,
    botType: resolvedBot,
    ip: remoteAddr || '',
  }
}

async function ingestCrawlerEntries(entries = []) {
  let accepted = 0
  let duplicated = 0
  let skipped = 0

  for (const entry of entries) {
    const parsed =
      typeof entry === 'string' ? parseNginxCrawlerLogLine(entry) : entry
    if (!parsed) {
      skipped += 1
      continue
    }
    const result = await recordCrawlerView(parsed)
    if (result.accepted) accepted += 1
    else if (result.reason === 'duplicate') duplicated += 1
    else skipped += 1
  }

  return { accepted, duplicated, skipped, total: entries.length }
}

module.exports = {
  classifyCrawlerUserAgent,
  parseNginxCrawlerLogLine,
  resolveStoreContext,
  recordCrawlerView,
  ingestCrawlerEntries,
  CRAWLER_EVENT_NAME,
}
