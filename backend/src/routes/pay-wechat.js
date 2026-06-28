const express = require('express')
const { handleWechatPayNotify } = require('../services/merchant-payment.service')

const router = express.Router()

router.post('/wechat/notify', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const body = JSON.parse(req.body.toString('utf8'))
    await handleWechatPayNotify(body)
    res.status(200).json({ code: 'SUCCESS', message: '成功' })
  } catch (e) {
    console.error('[wechat-pay-notify]', e && e.message)
    res.status(500).json({ code: 'FAIL', message: e.message || '失败' })
  }
})

module.exports = router
