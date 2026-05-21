const express = require('express')
const { ok } = require('../lib/response')
const { prisma } = require('../lib/prisma')

const router = express.Router()

router.get('/health', async (req, res) => {
  let db = 'down'
  try {
    await prisma.$queryRaw`SELECT 1`
    db = 'up'
  } catch (e) {
    db = 'down'
  }
  return ok(res, {
    ok: db === 'up',
    service: 'zhejian-api',
    version: '0.1.0',
    db,
    time: new Date().toISOString(),
  })
})

module.exports = router
