const express = require('express')
const { ok } = require('../lib/response')
const { getHomePayload } = require('../services/home.service')

const router = express.Router()

router.get('/home', async (req, res, next) => {
  try {
    const data = await getHomePayload()
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

module.exports = router
