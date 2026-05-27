/** V1 下单确认 → V2 咨询表单（R8） */
const { redirectOrderConfirm } = require('../../utils/legacy-redirect')

Page({
  onLoad(options) {
    redirectOrderConfirm(options || {})
  },
})
