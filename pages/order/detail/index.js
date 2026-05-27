/** V1 订单详情 → V2 我的咨询（R8） */
const { redirectLegacyOrderDetail } = require('../../../utils/legacy-redirect')

Page({
  onLoad() {
    redirectLegacyOrderDetail()
  },
})
