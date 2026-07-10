const express = require('express')
const { handleWechatPayNotify } = require('../services/merchant-payment.service')
const { verifyWechatPayNotifySignature } = require('../lib/wechat-pay')

const router = express.Router()

router.post('/wechat/notify', express.raw({ type: '*/*' }), async (req, res) => {
  const rawBody = req.body ? req.body.toString('utf8') : ''
  try {
    verifyWechatPayNotifySignature(req.headers, rawBody)
    const body = JSON.parse(rawBody)
    await handleWechatPayNotify(body)
    res.status(200).json({ code: 'SUCCESS', message: '成功' })
  } catch (e) {
    console.error('[wechat-pay-notify]', e && e.message)
    const status = e.status === 401 ? 401 : 500
    res.status(status).json({ code: 'FAIL', message: e.message || '失败' })
  }
})

module.exports = router
