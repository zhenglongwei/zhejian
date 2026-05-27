/** V1 订单列表 → V2 我的咨询（R8） */
const { redirectToConsultList } = require('../../utils/legacy-redirect')

Page({
  onLoad() {
    redirectToConsultList()
  },
})
