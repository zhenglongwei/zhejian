const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  RECEIVER,
  listNotifications,
  getUnreadCount,
  markNotificationsRead,
  saveSubscribeResults,
  listSubscribeTemplateIds,
  getSubscribeStatus,
} = require('../services/notification.service')

const router = express.Router()

router.get('/notifications', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await listNotifications(RECEIVER.USER, req.auth.userId, req.query || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/notifications/unread-count', requireAuth(['user']), async (req, res, next) => {
  try {
    const count = await getUnreadCount(RECEIVER.USER, req.auth.userId)
    return ok(res, { count })
  } catch (e) {
    next(e)
  }
})

router.post('/notifications/read', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await markNotificationsRead(
      RECEIVER.USER,
      req.auth.userId,
      req.body?.ids || []
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/notifications/subscribe-templates', requireAuth(['user']), async (req, res, next) => {
  try {
    const scene = req.query?.scene || 'default'
    return ok(res, { templates: listSubscribeTemplateIds(scene) })
  } catch (e) {
    next(e)
  }
})

router.get('/notifications/subscribe-status', requireAuth(['user']), async (req, res, next) => {
  try {
    const scene = req.query?.scene || 'default'
    const data = await getSubscribeStatus(req.auth.userId, scene)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/notifications/subscribe', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await saveSubscribeResults(req.auth.userId, req.body?.results || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
