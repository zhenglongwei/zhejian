const express = require('express')
const { ok } = require('../lib/response')
const {
  verifyOwnerRightsToken,
  blockPublicCaseByOwner,
  takedownPublicCaseByOwner,
} = require('../services/case-publish-window.service')

const router = express.Router()

router.post('/case-rights/block', async (req, res, next) => {
  try {
    const token = (req.body && req.body.token) || (req.body && req.body.rightsToken) || ''
    const parsed = verifyOwnerRightsToken(token)
    if (!parsed) {
      const err = new Error('链接无效或已过期')
      err.status = 403
      throw err
    }
    const data = await blockPublicCaseByOwner(parsed.albumId, { rightsToken: token })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/case-rights/takedown', async (req, res, next) => {
  try {
    const token = (req.body && req.body.token) || (req.body && req.body.rightsToken) || ''
    const parsed = verifyOwnerRightsToken(token)
    if (!parsed) {
      const err = new Error('链接无效或已过期')
      err.status = 403
      throw err
    }
    const data = await takedownPublicCaseByOwner(parsed.albumId, { rightsToken: token })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
