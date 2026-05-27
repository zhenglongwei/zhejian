/** V1 支付结果 → V2 我的咨询（R8） */
const { redirectToConsultList } = require('../../utils/legacy-redirect')

Page({
  onLoad() {
    redirectToConsultList()
  },
})
