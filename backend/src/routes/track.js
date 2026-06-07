const express = require('express')
const { ok } = require('../lib/response')
const { ingestTrackingEvents } = require('../services/track.service')
const { ingestCrawlerEntries } = require('../services/crawler-track.service')

const router = express.Router()

function assertCrawlerIngestAuth(req) {
  const token = String(process.env.CRAWLER_INGEST_TOKEN || '').trim()
  if (!token) return true
  const header = String(req.headers['x-crawler-ingest-token'] || '').trim()
  if (header !== token) {
    const err = new Error('无权写入爬虫日志')
    err.status = 403
    throw err
  }
  return true
}

/** 匿名 H5/站外可上报；若带 Bearer 则写入 userId */
router.post('/events', async (req, res, next) => {
  try {
    const data = await ingestTrackingEvents(req.body || {}, req.auth || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

/** B-TRACK-04：Nginx 日志解析脚本 / 运维批量入库 */
router.post('/crawler-ingest', async (req, res, next) => {
  try {
    assertCrawlerIngestAuth(req)
    const lines = Array.isArray(req.body?.lines)
      ? req.body.lines
      : Array.isArray(req.body?.entries)
        ? req.body.entries
        : []
    if (!lines.length) {
      const err = new Error('缺少 lines 或 entries')
      err.status = 400
      throw err
    }
    const data = await ingestCrawlerEntries(lines)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
