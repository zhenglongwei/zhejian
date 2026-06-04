const express = require('express')
const { ok } = require('../lib/response')
const { ingestTrackingEvents } = require('../services/track.service')

const router = express.Router()

/** 匿名 H5/站外可上报；若带 Bearer 则写入 userId */
router.post('/events', async (req, res, next) => {
  try {
    const data = await ingestTrackingEvents(req.body || {}, req.auth || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
