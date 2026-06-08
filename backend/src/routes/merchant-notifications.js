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
  resolveMerchantNotificationUserId,
  getSubscribeStatus,
} = require('../services/notification.service')

const router = express.Router()

async function merchantReceiverId(auth = {}) {
  return resolveMerchantNotificationUserId(auth.userId, auth.merchantId)
}

router.get('/notifications', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const receiverId = await merchantReceiverId(req.auth)
    const data = await listNotifications(RECEIVER.MERCHANT, receiverId, req.query || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/notifications/unread-count', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const receiverId = await merchantReceiverId(req.auth)
    const count = await getUnreadCount(RECEIVER.MERCHANT, receiverId)
    return ok(res, { count })
  } catch (e) {
    next(e)
  }
})

router.post('/notifications/read', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const receiverId = await merchantReceiverId(req.auth)
    const data = await markNotificationsRead(
      RECEIVER.MERCHANT,
      receiverId,
      req.body?.ids || []
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/notifications/subscribe-templates', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const scene = req.query?.scene || 'merchant'
    return ok(res, { templates: listSubscribeTemplateIds(scene) })
  } catch (e) {
    next(e)
  }
})

router.get('/notifications/subscribe-status', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const scene = req.query?.scene || 'merchant'
    const userId = await merchantReceiverId(req.auth)
    const data = await getSubscribeStatus(userId, scene)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/notifications/subscribe', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const userId = await merchantReceiverId(req.auth)
    const data = await saveSubscribeResults(userId, req.body?.results || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
