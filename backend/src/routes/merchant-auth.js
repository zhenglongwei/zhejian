const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { buildAuthSession } = require('../services/auth.service')
const {
  resolveMerchantContext,
  userOwnsMerchantStore,
} = require('../services/merchant-context.service')
const { prisma } = require('../lib/prisma')
const { config } = require('../config')

const router = express.Router()

/** 登录后刷新会话（入驻审核通过后重新拉取 merchant 角色；保留 JWT 当前门店） */
router.post('/auth/refresh-session', requireAuth(['user']), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth.userId } })
    if (!user) {
      const err = new Error('用户不存在')
      err.status = 404
      throw err
    }
    const data = await buildAuthSession(user, {
      merchantId: req.auth.merchantId || '',
      storeId: req.auth.storeId || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

/** 主账号切换当前工作台门店（刷新 JWT merchantId + storeId） */
router.post('/auth/switch-store', requireAuth(['user']), async (req, res, next) => {
  try {
    const storeId = String((req.body && req.body.storeId) || '').trim()
    if (!storeId) {
      const err = new Error('请选择门店')
      err.status = 400
      throw err
    }
    const user = await prisma.user.findUnique({ where: { id: req.auth.userId } })
    if (!user) {
      const err = new Error('用户不存在')
      err.status = 404
      throw err
    }

    const owned = await userOwnsMerchantStore(user.id, storeId)
    if (!owned) {
      const err = new Error('门店不存在或不可用')
      err.status = 404
      throw err
    }
    if (owned.merchant.status !== 'ACTIVE' || owned.store.status !== 'ACTIVE') {
      const err = new Error('该门店尚未通过审核')
      err.status = 409
      throw err
    }

    const ctx = await resolveMerchantContext(user.id, {
      merchantId: owned.merchant.id,
      storeId,
    })
    if (!ctx || ctx.staffRole !== 'owner') {
      const err = new Error('仅店铺管理员可切换门店')
      err.status = 403
      throw err
    }

    const data = await buildAuthSession(user, {
      merchantId: owned.merchant.id,
      storeId,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

/** 联调期：单独签发仅 merchant 角色 token（不推荐；正常走用户登录双角色 JWT） */
router.post('/auth/dev-login', async (req, res, next) => {
  try {
    if (!config.devAuthEnabled) {
      const err = new Error('商家登录暂未开放')
      err.status = 503
      throw err
    }
    const user = await prisma.user.findUnique({ where: { id: 'user_demo_1' } })
    if (!user) {
      const err = new Error('演示用户不存在')
      err.status = 500
      throw err
    }
    const data = await buildAuthSession(user)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
