const express = require('express')
const { fail } = require('../lib/response')

const router = express.Router()

/** V2.0 已冻结：订单相册 API 不再对 C 端暴露 */
router.get('/orders/:orderId/album', (req, res) => {
  return fail(res, 100410, '订单相册 API 已下线，请使用服务相册（albumId）', 410)
})

router.post('/orders/:orderId/album/authorize-preview', (req, res) => {
  return fail(res, 100410, '订单相册授权 API 已下线，请使用 /user/albums/:albumId/authorize-preview', 410)
})

module.exports = router
