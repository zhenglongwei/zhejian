/** V1 评价提交 → V2 我的咨询（R8） */
const { redirectLegacyReviewPage } = require('../../../utils/legacy-redirect')

Page({
  onLoad() {
    redirectLegacyReviewPage()
  },
})
